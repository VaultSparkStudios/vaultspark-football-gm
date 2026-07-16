import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { applyGmDecisionConsequence, getGmCommitmentState, resolveGmDecisionCommitments } from "../src/engine/gmDecisionConsequences.js";

test("start-backup changes the live QB depth chart and returns a receipt", () => {
  const session = createSession({ seed: 47101, startYear: 2026, controlledTeamId: "BUF" });
  const before = session.getDepthChart("BUF").QB[0];
  const result = applyGmDecisionConsequence(session, { decisionId: "qb-injury", choiceId: "start-backup" });
  assert.equal(result.ok, true);
  assert.equal(result.decision.execution.status, "completed");
  assert.notEqual(session.getDepthChart("BUF").QB[0], before);
  assert.match(result.decision.receipt.summary, /QB1/);
});

test("trade-deadline mandate persists, resolves, and changes owner heat from evidence", () => {
  const session = createSession({ seed: 47102, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "regular-season";
  session.currentWeek = 10;
  const result = applyGmDecisionConsequence(session, { decisionId: "trade-deadline", choiceId: "hold" });
  assert.equal(result.commitment.status, "active");
  const expectation = session.league.teams.find((team) => team.id === "BUF").owner.expectation;
  expectation.heat = 50;
  session.currentWeek = 12;
  const receipts = resolveGmDecisionCommitments(session);
  assert.equal(receipts[0].status, "succeeded");
  assert.equal(getGmCommitmentState(session.league, "BUF").active.length, 0);
  assert.equal(expectation.heat, 47);
  assert.equal(session.league.gmLegacy.commitmentsKept, 1);
  assert.equal(session.league.gmLegacy.lastCommitment.status, "succeeded");
});

test("unfulfilled commitment records an honest failure at its deadline", () => {
  const session = createSession({ seed: 47103, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "regular-season";
  session.currentWeek = 4;
  applyGmDecisionConsequence(session, { decisionId: "qb-injury", choiceId: "trade-qb" });
  session.currentWeek = 6;
  const receipts = resolveGmDecisionCommitments(session);
  assert.equal(receipts[0].status, "failed");
  assert.match(receipts[0].evidence, /not completed/);
});

test("cap restructure executes immediately through the real contract primitive", () => {
  const session = createSession({ seed: 47104, startYear: 2026, controlledTeamId: "BUF" });
  const candidate = session.getRoster("BUF")
    .filter((player) => player.contract.yearsRemaining > 1)
    .sort((a, b) => b.contract.capHit - a.contract.capHit)[0];
  const before = candidate.contract.capHit;
  const result = applyGmDecisionConsequence(session, { decisionId: "cap-crisis", choiceId: "restructure" });
  assert.equal(result.decision.execution.status, "completed");
  assert.equal(result.commitment, null);
  const after = session.getRoster("BUF").find((player) => player.id === candidate.id).contract.capHit;
  assert.ok(after < before);
});

test("buy and sell commitments require directionally honest trade evidence", () => {
  const buyer = createSession({ seed: 47105, startYear: 2026, controlledTeamId: "BUF" });
  buyer.phase = "regular-season";
  buyer.currentWeek = 10;
  applyGmDecisionConsequence(buyer, { decisionId: "trade-deadline", choiceId: "buy" });
  buyer.logTransaction({
    type: "trade", teamA: "BUF", teamB: "MIA",
    details: { fromA: [], fromB: [{ playerId: "MIA-QB" }], picksFromA: [{ id: "BUF-1" }], picksFromB: [] }
  });
  assert.equal(resolveGmDecisionCommitments(buyer)[0].status, "succeeded");

  const seller = createSession({ seed: 47106, startYear: 2026, controlledTeamId: "BUF" });
  seller.phase = "regular-season";
  seller.currentWeek = 10;
  applyGmDecisionConsequence(seller, { decisionId: "trade-deadline", choiceId: "sell" });
  seller.logTransaction({
    type: "trade", teamA: "BUF", teamB: "MIA",
    details: { fromA: [], fromB: [{ playerId: "MIA-QB" }], picksFromA: [], picksFromB: [] }
  });
  assert.equal(resolveGmDecisionCommitments(seller).length, 0, "an incoming player alone is not future-focused evidence");
  seller.logTransaction({
    type: "trade", teamA: "BUF", teamB: "NYJ",
    details: { fromA: [{ playerId: "BUF-WR" }], fromB: [], picksFromA: [], picksFromB: [{ id: "NYJ-2" }] }
  });
  const receipts = resolveGmDecisionCommitments(seller);
  assert.equal(receipts[0].status, "succeeded");
  assert.match(receipts[0].evidence, /draft capital/);
});
