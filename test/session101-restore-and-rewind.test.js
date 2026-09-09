import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { createTeamSeasonState } from "../src/domain/teamFactory.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { ENCODED_PREFIX, decodeSnapshot } from "../src/adapters/persistence/snapshotCodec.js";

// ── S101 · restore-path shape truth and a rewind lane that fits the quota ─────
//
// Every case below reproduces a defect that was live in the shipped build and
// invisible to the suite: a snapshot the compatibility check called compatible
// and the restore silently broke, and a rewind feature whose every write
// exceeded the storage budget it was supposed to respect.

const REWIND_STATE_PREFIX = "vsfgm:rw-state:";

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; }
  };
}

function baseSnapshot() {
  const session = createSession({ seed: 4242, startYear: 2025, mode: "drive", controlledTeamId: "BUF" });
  return JSON.parse(JSON.stringify(session.toSnapshot()));
}

async function newLeague(runtime) {
  return runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 5151, startYear: 2025, controlledTeamId: "BUF", mode: "drive" }
  });
}

test("a restored team.season carries the whole declared shape, not the two keys the normalizer knew about", () => {
  const declared = Object.keys(createTeamSeasonState(2025)).sort();

  for (const [name, mutate] of [
    ["season absent", (snap) => { delete snap.league.teams[0].season; }],
    ["season empty", (snap) => { snap.league.teams[0].season = {}; }],
    ["season partial", (snap) => { snap.league.teams[0].season = { wins: 3, pointsFor: 77 }; }]
  ]) {
    const snapshot = baseSnapshot();
    mutate(snapshot);
    const restored = createSessionFromSnapshot(snapshot);
    const season = restored.league.teams[0].season;

    assert.deepEqual(Object.keys(season).sort(), declared, `${name}: restored season drifted from the canonical shape`);
    assert.ok(Array.isArray(season.weekResults), `${name}: weekResults must be an array`);
    for (const key of declared) {
      if (key === "weekResults") continue;
      assert.ok(Number.isFinite(season[key]), `${name}: ${key} restored as a non-finite value`);
    }
  }

  // values the snapshot actually carried must survive the backfill
  const partial = baseSnapshot();
  partial.league.teams[0].season = { wins: 3, pointsFor: 77 };
  const restored = createSessionFromSnapshot(partial);
  assert.equal(restored.league.teams[0].season.wins, 3);
  assert.equal(restored.league.teams[0].season.pointsFor, 77);
});

test("a franchise restored without team.season can still advance a week", () => {
  const snapshot = baseSnapshot();
  delete snapshot.league.teams[0].season;
  const session = createSessionFromSnapshot(snapshot);

  // Before S101 this threw "Cannot read properties of undefined" on
  // season.weekResults.push and left wins null behind — a permanently
  // unadvanceable franchise, reported to the player as a transaction failure.
  assert.doesNotThrow(() => session.advanceWeek());

  const season = session.league.teams[0].season;
  assert.ok(Number.isFinite(season.wins), "wins must be a number after a simulated week");
  assert.ok(Number.isFinite(season.losses));
  assert.ok(Array.isArray(season.weekResults));
});

test("league collections the snapshot omitted are restored before anything consumes them", () => {
  for (const key of ["retiredPlayers", "retiredNumbers", "champions", "history"]) {
    const snapshot = baseSnapshot();
    delete snapshot.league[key];
    // new StatBook(league) runs before the old normalizer did, so this threw
    // "retiredPlayers is not iterable" on a payload the validator had approved.
    const restored = createSessionFromSnapshot(snapshot);
    assert.ok(Array.isArray(restored.league[key]), `league.${key} must be restored as an array`);
  }
});

test("onboarding copy names the opponent the weekly plan actually carries", () => {
  const session = createSession({ seed: 77123, startYear: 2025, mode: "drive", controlledTeamId: "BUF" });
  const plan = session.buildWeeklyPlan();

  // The producer emits opponentTeamId; the consumer read opponentId, and the
  // "|| null" laundered that permanent absence into silence.
  assert.ok(plan.opponentTeamId, "weekly plan must carry an opponent");
  assert.equal(plan.opponentId, undefined, "the key the consumer used never existed");
});

test("rewind snapshots are written through the save codec, not as raw JSON", async () => {
  const storage = memoryStorage();
  const runtime = createLocalApiRuntime({ storage, currentYear: 2025, scheduler: (fn) => fn() });
  await newLeague(runtime);

  const snapshot = await runtime.request("/api/rewind/snapshot", { method: "POST", body: { label: "Checkpoint" } });
  assert.equal(snapshot.status, 200);

  const key = [...storage.map.keys()].find((entry) => entry.startsWith(REWIND_STATE_PREFIX));
  assert.ok(key, "a rewind payload must have been written");
  const stored = storage.map.get(key);

  assert.ok(
    stored.startsWith(ENCODED_PREFIX),
    "rewind payloads must go through the gzip+base64 codec — raw JSON measured 12 MB against a 5-10 MB quota"
  );
  const decoded = await decodeSnapshot(stored);
  assert.ok(decoded?.league?.teams?.length, "the encoded rewind payload must decode back to a usable snapshot");

  const restore = await runtime.request("/api/rewind/restore", {
    method: "POST",
    body: { id: snapshot.payload.entry.id }
  });
  assert.equal(restore.status, 200, JSON.stringify(restore.payload));
});

test("a rewind point written as legacy plain JSON still restores", async () => {
  const storage = memoryStorage();
  const runtime = createLocalApiRuntime({ storage, currentYear: 2025, scheduler: (fn) => fn() });
  await newLeague(runtime);
  const snapshot = await runtime.request("/api/rewind/snapshot", { method: "POST", body: { label: "Legacy" } });
  const key = [...storage.map.keys()].find((entry) => entry.startsWith(REWIND_STATE_PREFIX));

  // rewrite it the way builds before S101 stored it
  storage.map.set(key, JSON.stringify(await decodeSnapshot(storage.map.get(key))));
  assert.ok(!storage.map.get(key).startsWith(ENCODED_PREFIX));

  const restore = await runtime.request("/api/rewind/restore", {
    method: "POST",
    body: { id: snapshot.payload.entry.id }
  });
  assert.equal(restore.status, 200, "legacy plain-JSON rewind points must keep loading");
});

test("a restore is refused rather than performed blind when its recovery point cannot be written", async () => {
  const storage = memoryStorage();
  const runtime = createLocalApiRuntime({ storage, currentYear: 2025, scheduler: (fn) => fn() });
  await newLeague(runtime);
  const snapshot = await runtime.request("/api/rewind/snapshot", { method: "POST", body: { label: "Checkpoint A" } });
  await runtime.request("/api/advance-week", { method: "POST", body: { count: 1 } });

  const before = await runtime.request("/api/state", { method: "GET" });
  const weekBefore = before.payload?.currentWeek;
  assert.ok(Number.isFinite(weekBefore), "the probe needs a readable current week");

  // storage is now full for rewind states — exactly the condition the raw-JSON
  // payload size guaranteed in a real browser.
  storage.setItem = (key) => {
    if (String(key).startsWith(REWIND_STATE_PREFIX)) {
      const error = new Error("QuotaExceededError");
      error.name = "QuotaExceededError";
      throw error;
    }
  };

  const restore = await runtime.request("/api/rewind/restore", {
    method: "POST",
    body: { id: snapshot.payload.entry.id }
  });

  assert.equal(restore.status, 409, "a restore whose recovery point failed must not report success");
  assert.equal(restore.payload.ok, false);
  assert.equal(restore.payload.reasonCode, "rewind-checkpoint-failed");

  const after = await runtime.request("/api/state", { method: "GET" });
  assert.equal(
    after.payload?.currentWeek,
    weekBefore,
    "the live session must be untouched when the restore is refused"
  );
});

test("an unparseable rewind index is rebuilt from the payloads present, never committed as empty", async () => {
  const storage = memoryStorage();
  const runtime = createLocalApiRuntime({ storage, currentYear: 2025, scheduler: (fn) => fn() });
  await newLeague(runtime);
  for (const label of ["A", "B", "C"]) {
    await runtime.request("/api/rewind/snapshot", { method: "POST", body: { label } });
  }
  const payloadsBefore = [...storage.map.keys()].filter((key) => key.startsWith(REWIND_STATE_PREFIX));
  assert.equal(payloadsBefore.length, 3);

  storage.map.set("vsfgm-rw-index", "{not json");

  const listed = await runtime.request("/api/rewind", { method: "GET" });
  assert.equal(
    listed.payload.snapshots.length,
    3,
    "a corrupt index must be reconciled against the real payloads, not reset to []"
  );

  // the load-then-rewrite path must not orphan them on the next write
  await runtime.request("/api/rewind/snapshot", { method: "POST", body: { label: "D" } });
  const after = await runtime.request("/api/rewind", { method: "GET" });
  const payloadsAfter = [...storage.map.keys()].filter((key) => key.startsWith(REWIND_STATE_PREFIX));

  assert.equal(
    after.payload.snapshots.length,
    payloadsAfter.length,
    "every stored rewind payload must be reachable from the index — an unreachable payload occupies the quota forever"
  );
  assert.equal(payloadsAfter.length, 4);
});
