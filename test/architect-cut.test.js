import assert from "node:assert/strict";
import test from "node:test";

import { buildArchitectCut } from "../public/lib/architectCut.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";

const ledger = [{
  id: "architect-BUF-2027-7", teamId: "BUF", year: 2027, week: 7,
  intent: {
    tactic: { id: "attack", label: "Attack the edges", intent: "Stress the perimeter" },
    gmDecision: { id: "deadline", label: "Buy now", summary: "Spend a future pick" }
  },
  outcome: { result: "win", score: "27-20", observed: "Explosive runs rose", aligned: true },
  nextAdaptation: "Keep the edge package.",
  disclaimer: "No causal claim."
}];

test("Architect's Cut joins four decision sources and ranks three bounded turning points", () => {
  const cut = buildArchitectCut({
    seasonYear: 2027,
    teamId: "BUF",
    architectLedger: ledger,
    transactions: [{
      id: "TX-1", seq: 1, type: "trade", year: 2027, week: 8, teamA: "BUF", teamB: "NYJ",
      details: { fromA: [{ player: "Veteran" }], fromB: [{ player: "Rookie" }], picksFromB: [{ year: 2028, round: 2 }] }
    }],
    draftHistory: [{ year: 2027, selections: [{ pick: 18, round: 1, teamId: "BUF", playerId: "p1", player: "A. Corner", pos: "DB", overall: 76, potential: 91, userSelected: true }] }]
  });
  assert.equal(cut.status, "complete");
  assert.equal(cut.turningPoints.length, 3);
  assert.deepEqual(cut.sources, { weeklyPlans: 1, gmChoices: 2, trades: 1, draftCalls: 1 });
  assert.ok(cut.turningPoints.every((point) => point.causalStatus === "non-causal"));
  assert.match(cut.disclaimer, /not a causal model/);
});

test("missing intent and sources remain explicit rather than receiving invented grades", () => {
  const cut = buildArchitectCut({
    seasonYear: 2027,
    teamId: "BUF",
    transactions: [{ id: "TX-2", type: "trade", year: 2027, teamA: "BUF", teamB: "MIA", details: {} }]
  });
  assert.equal(cut.status, "partial");
  assert.ok(cut.missingSources.includes("weeklyPlans"));
  assert.equal(cut.turningPoints[0].evidenceState, "incomplete");
  assert.match(cut.turningPoints[0].declaredIntent, /no pre-trade intent receipt/i);
});

test("empty seasons produce an honest incomplete cut", () => {
  const cut = buildArchitectCut({ seasonYear: 2027, teamId: "BUF" });
  assert.equal(cut.status, "incomplete");
  assert.deepEqual(cut.turningPoints, []);
});

test("completed draft receipts archive, filter to the controlled team, and survive snapshot restore", () => {
  const session = createSession({ seed: 7304, startYear: 2026, controlledTeamId: "BUF" });
  session.league.pendingDraft = {
    year: 2027,
    completed: true,
    selections: [
      { pick: 12, round: 1, teamId: "BUF", playerId: "rookie-buf", player: "B. Future", pos: "WR", overall: 75, potential: 90, userSelected: true },
      { pick: 13, round: 1, teamId: "MIA", playerId: "rookie-mia", player: "M. Rival", pos: "EDGE", overall: 74, potential: 88, userSelected: false }
    ]
  };

  session.prepareDraft();
  assert.equal(session.league.draftHistory.length, 1);
  assert.equal(session.league.draftHistory[0].selections.length, 2);

  const dashboard = session.getDashboardState();
  assert.equal(dashboard.draftHistory.length, 1);
  assert.deepEqual(dashboard.draftHistory[0].selections.map((selection) => selection.teamId), ["BUF"]);

  const restored = createSessionFromSnapshot(session.toSnapshot());
  assert.equal(restored.getDashboardState().draftHistory[0].selections[0].player, "B. Future");
});