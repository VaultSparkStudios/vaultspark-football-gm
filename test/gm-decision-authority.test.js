import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGmDecisionOccurrenceKey,
  generateGmDecisions,
  validatePendingGmDecision
} from "../src/engine/gmDecisionAuthority.js";

function dashboard(overrides = {}) {
  return {
    franchiseId: "fa-50001-BUF",
    startYear: 2026,
    currentYear: 2026,
    currentWeek: 10,
    phase: "regular-season",
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", abbrev: "BUF" },
    latestStandings: [{ team: "BUF", wins: 6, losses: 4 }],
    cap: { salaryCap: 255_000_000, usedCap: 200_000_000, deadCap: 4_000_000, capSpace: 55_000_000 },
    injuryReport: [],
    ...overrides
  };
}

test("decision occurrence keys are scoped by franchise, year, team, and context", () => {
  const base = dashboard();
  const first = buildGmDecisionOccurrenceKey(base, "trade-deadline", "deadline-2026");
  const anotherYear = buildGmDecisionOccurrenceKey({ ...base, currentYear: 2027 }, "trade-deadline", "deadline-2027");
  const anotherFranchise = buildGmDecisionOccurrenceKey({ ...base, franchiseId: "fa-other-BUF" }, "trade-deadline", "deadline-2026");
  assert.notEqual(first, anotherYear);
  assert.notEqual(first, anotherFranchise);
});

test("severe controlled-team quarterback injury outranks deadline pressure", () => {
  const decisions = generateGmDecisions(dashboard({
    injuryReport: [{ playerId: "QB-1", name: "Starter QB", pos: "QB", teamId: "BUF", severity: "severe", weeksRemaining: 6 }]
  }));
  assert.equal(decisions[0].id, "qb-injury");
  assert.equal(decisions[1].id, "trade-deadline");
  assert.ok(decisions.every((decision) => decision.occurrenceKey));
});

test("another team's quarterback injury cannot trigger controlled-team authority", () => {
  const decisions = generateGmDecisions(dashboard({
    injuryReport: [{ playerId: "QB-MIA", name: "Rival QB", pos: "QB", teamId: "MIA", severity: "severe", weeksRemaining: 8 }]
  }));
  assert.equal(decisions.some((decision) => decision.id === "qb-injury"), false);
});

test("a resolved occurrence does not reappear while a new year remains independent", () => {
  const first = generateGmDecisions(dashboard()).find((decision) => decision.id === "trade-deadline");
  assert.ok(first);
  assert.equal(generateGmDecisions(dashboard(), { ledger: [{ occurrenceKey: first.occurrenceKey }] }).some((decision) => decision.id === "trade-deadline"), false);
  assert.equal(generateGmDecisions(dashboard({ currentYear: 2027 }), { ledger: [{ occurrenceKey: first.occurrenceKey }] }).some((decision) => decision.id === "trade-deadline"), true);
});

test("pending decision validation fails closed for missing, stale, and unknown choices", () => {
  const pending = generateGmDecisions(dashboard())[0];
  assert.equal(validatePendingGmDecision(pending).reasonCode, "ADVANCE_WEEK_GM_DECISION_REQUIRED");
  assert.equal(validatePendingGmDecision(pending, {
    decisionId: pending.id,
    occurrenceKey: "stale",
    choiceId: pending.options[0].id
  }).reasonCode, "ADVANCE_WEEK_GM_DECISION_STALE");
  assert.equal(validatePendingGmDecision(pending, {
    decisionId: pending.id,
    occurrenceKey: pending.occurrenceKey,
    choiceId: "invented"
  }).reasonCode, "ADVANCE_WEEK_UNKNOWN_GM_DECISION");
  assert.equal(validatePendingGmDecision(pending, {
    decisionId: pending.id,
    occurrenceKey: pending.occurrenceKey,
    choiceId: pending.options[0].id
  }).ok, true);
});
