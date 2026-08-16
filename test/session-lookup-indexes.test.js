import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    }
  };
}

test("GameSession lookup indexes track releases, signings, and trades", () => {
  const session = createSession({ seed: 9100, startYear: 2026, controlledTeamId: "BUF" });
  const buf = session.getRoster("BUF");
  const mia = session.getRoster("MIA");
  // Premium free agents (74+) route through the competing-offer market (S62);
  // the instant release/sign index check uses the depth tier.
  const released = buf.find((player) => (player.overall || 0) < 74) || buf.at(-1);

  assert.equal(session.getPlayerById(released.id)?.teamId, "BUF");
  assert.equal(session.releasePlayer({ teamId: "BUF", playerId: released.id, toWaivers: false }).ok, true);
  assert.equal(session.getPlayerById(released.id)?.teamId, "FA");
  assert.equal(session.getRoster("BUF").some((player) => player.id === released.id), false);

  assert.equal(session.signFreeAgent({ teamId: "BUF", playerId: released.id }).ok, true);
  assert.equal(session.getPlayerById(released.id)?.teamId, "BUF");
  assert.equal(session.getRoster("BUF").some((player) => player.id === released.id), true);

  const outgoing = session.getRoster("BUF").find((player) => player.id !== released.id);
  const incoming = mia[0];
  const result = session.tradePlayers({
    teamA: "BUF",
    teamB: "MIA",
    teamAPlayerIds: [outgoing.id],
    teamBPlayerIds: [incoming.id]
  });
  assert.equal(result.ok, true);
  assert.equal(session.getPlayerById(outgoing.id)?.teamId, "MIA");
  assert.equal(session.getPlayerById(incoming.id)?.teamId, "BUF");
  assert.equal(session.getRoster("BUF").some((player) => player.id === incoming.id), true);
});

// S86 [audit #7] — this assertion previously hard-coded the exact ID strings,
// which encoded how many times the factory happened to read the clock rather
// than the property the test is named for. Adding the server-parity `expiresAt`
// field shifted those literals with no behavioural change. It now asserts the
// real property: identical clocks produce identical ID sequences, and IDs
// within a runtime are distinct and ordered.
test("local simulation job IDs are deterministic for a deterministic clock", async () => {
  const build = () => createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_800_000_000_000 + tick++;
    })(),
    scheduler: () => {}
  });

  const runtime = build();
  const first = runtime.createSimulationJob(1);
  const second = runtime.createSimulationJob(1);

  assert.notEqual(first.id, second.id, "each job must get a distinct id");
  assert.match(first.id, /^JOB-\d+-1$/);
  assert.match(second.id, /^JOB-\d+-2$/);
  assert.ok(second.createdAt > first.createdAt, "job ids must advance with the clock");

  // Same clock, same sequence — the actual determinism guarantee.
  const replay = build();
  assert.equal(replay.createSimulationJob(1).id, first.id);
  assert.equal(replay.createSimulationJob(1).id, second.id);
});
