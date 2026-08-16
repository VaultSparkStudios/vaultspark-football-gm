/**
 * Session 86 — snapshot parity and client-runtime safety regressions.
 *
 * The defects guarded here all shared one property: the existing suite could
 * not observe them. The owner tests never round-tripped a snapshot, the payload
 * budget tests structurally never entered the postseason, and the sim-job tests
 * proved that a repeat launch was ACCEPTED without asserting anything about it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

// ── [audit #8] the owner rebuild must not drop state on restore ──────────────

function roundTrip(session) {
  return createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
}

test("owner confidence log survives a snapshot round trip", () => {
  const session = createSession({ seed: 620051, startYear: 2026, controlledTeamId: "BUF" });
  for (let week = 0; week < 5; week += 1) session.advanceWeek();

  const before = session.league.teams.map((t) => (t.owner?.confidenceLog || []).length);
  assert.ok(before.some((n) => n > 0), "expected at least one team to have accrued owner confidence receipts");

  const restored = roundTrip(session);
  const after = restored.league.teams.map((t) => (t.owner?.confidenceLog || []).length);
  assert.deepEqual(after, before, "owner confidenceLog was dropped by the restore-path owner rebuild");
});

test("owner patience is bit-identical after restore", () => {
  const session = createSession({ seed: 900, startYear: 2026, controlledTeamId: "BUF" });
  for (let week = 0; week < 5; week += 1) session.advanceWeek();

  const before = session.league.teams.map((t) => t.owner?.patience);
  const after = roundTrip(session).league.teams.map((t) => t.owner?.patience);
  // The confidence bands are exact-boundary comparisons, so re-rounding on
  // restore could move an owner from "steady" to "strained" with no in-game event.
  assert.deepEqual(after, before, "owner patience was re-rounded on restore");
});

test("an owner key added outside the rebuild whitelist still survives a restore", () => {
  // Guards the PATTERN, not just confidenceLog: buildOwnerProfile returns a
  // fixed key literal, so any future owner field would silently vanish.
  const session = createSession({ seed: 771, startYear: 2026, controlledTeamId: "BUF" });
  const team = session.league.teams[0];
  team.owner.futureOwnerField = { marker: "s86" };

  const restored = roundTrip(session);
  const restoredTeam = restored.league.teams.find((t) => t.id === team.id);
  assert.deepEqual(
    restoredTeam.owner.futureOwnerField,
    { marker: "s86" },
    "an owner field outside the whitelist was dropped by the rebuild"
  );
});

// ── [audit #6] postseason box scores must not be persisted twice ─────────────

function countPlayByPlay(value, seen = new Set()) {
  if (!value || typeof value !== "object") return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  let count = 0;
  if (Array.isArray(value)) {
    for (const entry of value) count += countPlayByPlay(entry, seen);
    return count;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "playByPlay" && entry !== undefined) count += 1;
    else count += countPlayByPlay(entry, seen);
  }
  return count;
}

test("the persisted postseason carries no duplicate play-by-play", () => {
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });

  const snapshot = session.toSnapshot();
  assert.ok(snapshot.latestPostseason, "expected a postseason on the snapshot");
  assert.equal(
    snapshot.latestPostseason.gameArchiveEntries,
    undefined,
    "latestPostseason still carries gameArchiveEntries — a second untrimmed copy of every playoff box score"
  );
  assert.equal(
    countPlayByPlay(snapshot.latestPostseason),
    0,
    "playoff play-by-play is still duplicated into the persisted postseason"
  );
});

test("a restored session still resolves the Super Bowl and bracket", () => {
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });

  const restored = roundTrip(session);
  assert.ok(
    restored.latestPostseason?.superBowl || restored.latestPostseason?.bracket,
    "the restore-path readers of latestPostseason must keep working"
  );
});

test("the postseason snapshot is materially smaller than the unlean one", () => {
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });

  const lean = JSON.stringify(session.toSnapshot().latestPostseason || {}).length;
  const fat = JSON.stringify(session.latestPostseason || {}).length;
  assert.ok(
    lean < fat,
    `expected the persisted postseason (${lean} bytes) to be smaller than the live one (${fat} bytes)`
  );
});

// ── [audit #7] client simulation jobs must be exclusive and prunable ─────────

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    clear() { data.clear(); }
  };
}

// A manual scheduler holds the job in "queued"/"running" so a concurrent launch
// can actually be attempted — the real double-click window.
async function runtimeWithManualScheduler(seed = 1_720_000_000_000) {
  const queue = [];
  let tick = 0;
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: () => seed + tick++,
    scheduler: (fn) => queue.push(fn)
  });
  await runtime.request("/api/setup/init");
  return { runtime, drain: () => { while (queue.length) queue.shift()(); } };
}

test("a second simulation job is rejected while one is already running", async () => {
  const { runtime } = await runtimeWithManualScheduler();
  const first = await runtime.request("/api/jobs/simulate", { method: "POST", body: { seasons: 3 } });
  assert.equal(first.status, 202);

  const second = await runtime.request("/api/jobs/simulate", { method: "POST", body: { seasons: 3 } });
  assert.equal(second.status, 409, "a concurrent simulation job must be rejected, not silently accepted");
  assert.equal(second.payload.reasonCode, "SIM_JOB_ALREADY_RUNNING");
});

test("a new simulation job is accepted once the previous one finishes", async () => {
  const { runtime, drain } = await runtimeWithManualScheduler();
  const first = await runtime.request("/api/jobs/simulate", { method: "POST", body: { seasons: 1 } });
  assert.equal(first.status, 202);
  drain();

  const status = await runtime.request(`/api/jobs/simulate?id=${first.payload.job.id}`);
  assert.equal(status.payload.job.status, "completed");

  const second = await runtime.request("/api/jobs/simulate", { method: "POST", body: { seasons: 1 } });
  assert.equal(second.status, 202, "a new job should be accepted once no job is queued or running");
});

test("client simulation jobs carry the server's TTL fields", async () => {
  const { runtime } = await runtimeWithManualScheduler();
  const created = await runtime.request("/api/jobs/simulate", { method: "POST", body: { seasons: 2 } });
  // Runtime parity: without expiresAt/fetchedAt the client map could never be swept.
  assert.ok(Number.isFinite(created.payload.job.expiresAt), "client job records must carry expiresAt");
  assert.equal(created.payload.job.fetchedAt, null, "client job records must carry fetchedAt");
});
