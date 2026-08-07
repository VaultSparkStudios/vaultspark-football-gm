import assert from "node:assert/strict";
import test from "node:test";

import { buildDecisionArchiveModel, renderDecisionArchiveHtml } from "../public/lib/decisionArchive.js";

const dashboard = {
  currentYear: 2028,
  controlledTeamId: "BUF",
  architectLedger: [
    { id: "w27", teamId: "BUF", year: 2027, week: 8, intent: { tactic: { label: "Attack the edge" } }, outcome: { result: "win", score: "24-17" } },
    { id: "w28", teamId: "BUF", year: 2028, week: 2, intent: { gmDecision: { label: "Keep the pick" } }, outcome: { result: "loss", score: "17-20" } }
  ],
  draftHistory: [{ year: 2027, selections: [{ pick: 12, round: 1, teamId: "BUF", player: "A. Corner", pos: "DB", userSelected: true }] }]
};

test("Decision Archive selects a requested prior volume without upgrading sparse evidence", () => {
  const model = buildDecisionArchiveModel({
    dashboard,
    selectedYear: 2027,
    transactions: [{ id: "t27", type: "trade", year: 2027, teamA: "BUF", teamB: "MIA", details: {} }]
  });
  assert.deepEqual(model.years, [2028, 2027]);
  assert.equal(model.activeYear, 2027);
  assert.equal(model.volume.turningPointCount, 3);
  assert.equal(model.volume.status, "complete");
  assert.match(model.disclaimer, /not causal proof/);
});

test("Decision Archive HTML escapes receipts and states the non-causal boundary", () => {
  const model = buildDecisionArchiveModel({
    dashboard: {
      ...dashboard,
      architectLedger: [{ id: "x", teamId: "BUF", year: 2028, week: 1, intent: { tactic: { label: "<script>" } }, outcome: { result: "win" } }]
    }
  });
  const html = renderDecisionArchiveHtml(model);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /non-causal/);
  assert.match(html, /Missing trades/);
});

test("Decision Archive keeps an explicit empty state", () => {
  const model = buildDecisionArchiveModel({ dashboard: { currentYear: 2028, controlledTeamId: "BUF" } });
  assert.equal(model.status, "incomplete");
  assert.match(renderDecisionArchiveHtml(model), /No receipted General Manager decisions/);
});
