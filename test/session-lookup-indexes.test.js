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
  const released = buf[0];

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

test("local simulation job IDs are deterministic for a deterministic clock", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_800_000_000_000 + tick++;
    })(),
    scheduler: () => {}
  });

  const first = runtime.createSimulationJob(1);
  const second = runtime.createSimulationJob(1);

  assert.equal(first.id, "JOB-1800000000001-1");
  assert.equal(second.id, "JOB-1800000000004-2");
  assert.notEqual(first.id, second.id);
});
