import test from "node:test";
import assert from "node:assert/strict";
import { buildArchitectMasteryPortfolio } from "../src/engine/architectMasteryPortfolio.js";
import { getGmLegacySummary, initGmLegacy } from "../src/engine/gmLegacyScore.js";

function leagueFixture() {
  const league = { teams: [], champions: [] };
  const legacy = initGmLegacy(league);
  Object.assign(legacy, {
    seasonsServed: 2,
    totalWins: 20,
    totalLosses: 14,
    playoffAppearances: 1,
    superBowlWins: 0,
    capGradeTotal: 150,
    cultureGradeTotal: 160,
    tradeNetAV: 4,
    seasonHistory: [{ year: 2026 }, { year: 2027 }]
  });
  league.gmCommitments = [
    { id: "c1", teamId: "BUF", status: "succeeded" },
    { id: "c2", teamId: "BUF", status: "failed" },
    { id: "c3", teamId: "MIA", status: "succeeded" }
  ];
  league.architectLedger = [
    { teamId: "BUF", intent: { tactic: { id: "run-heavy" } }, outcome: { aligned: true } },
    { teamId: "BUF", intent: { tactic: { id: "pass-heavy" } }, outcome: { aligned: false } },
    { teamId: "MIA", intent: { tactic: { id: "prevent" } }, outcome: { aligned: true } }
  ];
  return league;
}

test("mastery portfolio preserves four independent evidence paths", () => {
  const portfolio = buildArchitectMasteryPortfolio(leagueFixture(), "BUF");
  assert.equal(portfolio.schemaVersion, "1.0");
  assert.deepEqual(portfolio.paths.map((path) => path.id), ["results", "stewardship", "promise", "identity"]);
  assert.equal(portfolio.paths.find((path) => path.id === "promise").evidenceCount, 2);
  assert.equal(portfolio.paths.find((path) => path.id === "identity").evidenceCount, 2);
  assert.equal(portfolio.score, portfolio.paths.reduce((sum, path) => sum + path.score, 0));
  assert.ok(portfolio.paths.some((path) => path.id === portfolio.focus.pathId));
  assert.equal(portfolio.signature.pathId, "stewardship");
  assert.match(portfolio.focus.nextMilestone, /\S/);
  assert.match(portfolio.disclaimer, /not a causal claim/i);
});

test("empty evidence remains visibly empty instead of receiving fabricated progress", () => {
  const league = { teams: [], champions: [] };
  initGmLegacy(league);
  const portfolio = buildArchitectMasteryPortfolio(league, "BUF");
  assert.equal(portfolio.score, 0);
  assert.ok(portfolio.paths.every((path) => path.status === "awaiting-evidence"));
  assert.ok(portfolio.paths.every((path) => path.evidenceCount === 0));
  assert.equal(portfolio.signature, null);
  assert.match(portfolio.focus.reason, /no committed evidence/i);
});

test("legacy summary adds mastery without changing the historical score contract", () => {
  const league = leagueFixture();
  const summary = getGmLegacySummary(league, "BUF");
  assert.equal(typeof summary.score, "number");
  assert.equal(summary.mastery.maxScore, 100);
  assert.equal(summary.mastery.paths.length, 4);
});
