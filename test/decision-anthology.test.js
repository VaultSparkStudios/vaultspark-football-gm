import assert from "node:assert/strict";
import test from "node:test";

import { buildDecisionAnthology } from "../public/lib/decisionAnthology.js";

test("Decision Anthology groups bounded seasons newest-first without upgrading sparse evidence", () => {
  const anthology = buildDecisionAnthology({
    teamId: "BUF",
    throughYear: 2028,
    architectLedger: [
      { id: "a", teamId: "BUF", year: 2027, week: 4, intent: { tactic: { label: "Wide zone" } }, outcome: { result: "win" } },
      { id: "b", teamId: "BUF", year: 2028, week: 2, intent: { gmDecision: { label: "Hold picks" } }, outcome: { result: "loss" } }
    ],
    transactions: [{ id: "t", type: "trade", year: 2027, teamA: "BUF", teamB: "MIA", details: {} }],
    draftHistory: [{ year: 2027, selections: [{ pick: 9, round: 1, teamId: "BUF", player: "R. One", pos: "QB", userSelected: true }] }]
  });
  assert.deepEqual(anthology.volumes.map((volume) => volume.seasonYear), [2028, 2027]);
  assert.equal(anthology.volumes[0].status, "partial");
  assert.ok(anthology.volumes[0].missingSources.includes("trades"));
  assert.match(anthology.disclaimer, /not causal proof/);
});

test("Decision Anthology stays honestly incomplete when no receipts exist", () => {
  assert.deepEqual(buildDecisionAnthology({ throughYear: 2028 }), {
    schemaVersion: "1.0",
    kind: "decision-anthology",
    status: "incomplete",
    seasonsObserved: 0,
    volumes: [],
    disclaimer: "Volumes preserve the receipt coverage available in each season. Sparse years remain sparse, and editorial rank is not causal proof."
  });
});
