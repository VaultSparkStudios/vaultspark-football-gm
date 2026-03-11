import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("release then sign free agent obeys roster constraints", () => {
  const session = createSession({ seed: 100, startYear: 2026, controlledTeamId: "BUF" });
  const rosterBefore = session.getRoster("BUF").length;
  const releaseId = session.getRoster("BUF")[0].id;
  const released = session.releasePlayer({ teamId: "BUF", playerId: releaseId, toWaivers: false });
  assert.equal(released.ok, true);
  assert.equal(session.getRoster("BUF").length, rosterBefore - 1);

  const freeAgent = session.getFreeAgents({ limit: 1 })[0];
  assert.ok(freeAgent);
  const signed = session.signFreeAgent({ teamId: "BUF", playerId: freeAgent.id });
  assert.equal(signed.ok, true);
  assert.equal(session.getRoster("BUF").length, rosterBefore);
});

test("contract restructure keeps contract valid", () => {
  const session = createSession({ seed: 101, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.getRoster("BUF").find((entry) => (entry.contract?.yearsRemaining || 0) > 1);
  assert.ok(player);
  const oldCap = player.contract.capHit;
  const result = session.restructurePlayerContract({ teamId: "BUF", playerId: player.id });
  assert.equal(result.ok, true);
  assert.ok(result.contract.capHit > 0);
  assert.ok(result.contract.restructureCount >= 1);
  assert.notEqual(result.contract.capHit, oldCap);
});
