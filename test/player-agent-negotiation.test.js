import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { API_CONTRACT } from "../public/lib/apiContract.js";

test("contract-year agent persona and source-derived leverage are stable", () => {
  const left = createSession({ seed: 7901, startYear: 2026, controlledTeamId: "BUF" });
  const right = createSession({ seed: 7901, startYear: 2026, controlledTeamId: "BUF" });
  const leftTarget = left.listNegotiationTargets("BUF")[0];
  const rightTarget = right.listNegotiationTargets("BUF")[0];
  assert.ok(leftTarget?.agent);
  assert.deepEqual(leftTarget.agent, rightTarget.agent);
  assert.match(leftTarget.agent.leverageReason, /market|rival|outside demand/i);
  assert.equal(left.listNegotiationTargets("BUF")[0].agent.personality, leftTarget.agent.personality);
});

test("counter receipts survive save round-trip and acceptance mutates the contract", () => {
  const session = createSession({ seed: 7902, startYear: 2026, controlledTeamId: "BUF" });
  const target = session.listNegotiationTargets("BUF")[0];
  const beforeContract = structuredClone(session.activePlayerOnTeam(target.id, "BUF").contract);
  const counter = session.negotiateAndSign({
    teamId: "BUF",
    playerId: target.id,
    years: 1,
    salary: 850_000
  });
  assert.equal(counter.ok, true);
  assert.equal(counter.countered, true);
  assert.equal(counter.agent.negotiationHistory.at(-1).outcome, "countered");
  assert.deepEqual(session.activePlayerOnTeam(target.id, "BUF").contract, beforeContract);

  const restored = createSessionFromSnapshot(session.toSnapshot());
  const restoredTarget = restored.listNegotiationTargets("BUF").find((row) => row.id === target.id);
  assert.equal(restoredTarget.agent.negotiationHistory.at(-1).outcome, "countered");
  const accepted = restored.negotiateAndSign({
    teamId: "BUF",
    playerId: target.id,
    years: restoredTarget.demand.years,
    salary: restoredTarget.demand.salary
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.countered, undefined);
  assert.equal(accepted.agent.status, "signed");
  assert.equal(accepted.agent.negotiationHistory.at(-1).outcome, "accepted");
  const signed = restored.activePlayerOnTeam(target.id, "BUF").contract;
  assert.ok(signed.yearsRemaining > beforeContract.yearsRemaining);
  assert.equal(signed.salary, accepted.contract.salary);
});

test("the declared browser contract exposes no parallel agent mutation authority", () => {
  const keys = API_CONTRACT.map((entry) => entry.key);
  assert.ok(keys.includes("POST /api/contracts/negotiate"));
  assert.equal(keys.some((key) => key.startsWith("POST /api/agent/")), false);
});
