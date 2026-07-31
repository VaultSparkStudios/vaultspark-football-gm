import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

function pickSwap(session) {
  return {
    teamA: "BUF",
    teamB: "MIA",
    teamAPickIds: [session.getDraftPickAssets("BUF")[0].id],
    teamBPickIds: [session.getDraftPickAssets("MIA")[0].id],
    teamAPlayerIds: [],
    teamBPlayerIds: []
  };
}

test("trade evaluation emits a serializable authority-bound plan", () => {
  const session = createSession({ seed: 321, startYear: 2026, controlledTeamId: "BUF" });
  const evaluation = session.evaluateTradePackage(pickSwap(session));
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.plan.schemaVersion, "1.0");
  assert.match(evaluation.plan.fingerprint, /^trade-[a-f0-9]{8}$/);
  assert.equal(evaluation.plan.authority.checkpoint.year, 2026);
  assert.doesNotThrow(() => JSON.stringify(evaluation.plan));
});

test("stale trade plan fails closed before any commit mutation", () => {
  const session = createSession({ seed: 321, startYear: 2026, controlledTeamId: "BUF" });
  const payload = pickSwap(session);
  const evaluation = session.evaluateTradePackage(payload);
  assert.equal(evaluation.ok, true);

  const pickA = session.getDraftPickById(payload.teamAPickIds[0]);
  const pickB = session.getDraftPickById(payload.teamBPickIds[0]);
  pickA.ownerTeamId = "NE";
  const beforeB = pickB.ownerTeamId;
  const commit = session.tradePlayers({
    ...payload,
    expectedPlanFingerprint: evaluation.plan.fingerprint
  });

  assert.equal(commit.ok, false);
  assert.equal(commit.status, 409);
  assert.equal(commit.reasonCode, "stale-trade-plan");
  assert.notEqual(commit.currentPlan.fingerprint, evaluation.plan.fingerprint);
  assert.equal(pickA.ownerTeamId, "NE");
  assert.equal(pickB.ownerTeamId, beforeB);
});
