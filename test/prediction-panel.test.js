import assert from "node:assert/strict";
import test from "node:test";

import { buildPredictionPanelMarkup } from "../public/lib/predictionPanel.js";
import { predictionGameId } from "../public/lib/spreadPredictions.js";

// buildPredictionPanelMarkup is the pure render contract behind
// predictionPanel.js (the DOM-binding half is a thin, standard
// click-select-then-submit wrapper matching this codebase's established
// panel pattern, e.g. dynastyTimeline.js / coachingMarketPanel.js). This
// repo has no jsdom, so — matching test/dynasty-timeline.test.js and
// test/marquee-badge.test.js — the render contract is asserted directly
// against the generated markup string.

function emptyStats() {
  return { seasonStreak: 0, bestStreak: 0, correctCount: 0, totalCount: 0 };
}

function game(overrides = {}) {
  return {
    awayTeamId: "NYJ",
    homeTeamId: "BUF",
    played: false,
    awayScore: 0,
    homeScore: 0,
    isTie: false,
    winnerId: null,
    ...overrides
  };
}

test("no games this week renders a clean empty state, no forced interaction", () => {
  const html = buildPredictionPanelMarkup([], {}, emptyStats());
  assert.match(html, /No games this week to predict/);
  assert.doesNotMatch(html, /wp-pick-form/);
});

test("games missing team ids are filtered out of the empty-state check", () => {
  const html = buildPredictionPanelMarkup([{ awayTeamId: null, homeTeamId: "BUF" }], {}, emptyStats());
  assert.match(html, /No games this week to predict/);
});

test("an unplayed game with no prediction shows a pick form for both teams", () => {
  const g = game();
  const html = buildPredictionPanelMarkup([g], {}, emptyStats());
  assert.match(html, /data-predict-winner="NYJ"/);
  assert.match(html, /data-predict-winner="BUF"/);
  assert.match(html, /required class="wp-margin-input" data-margin-input/);
  assert.match(html, /data-predict-submit/);
});

test("an unplayed game with an already-submitted (unresolved) prediction shows the pending pick", () => {
  const g = game();
  const predictions = { [predictionGameId(g)]: { winnerId: "BUF", margin: 7, resolved: false } };
  const html = buildPredictionPanelMarkup([g], predictions, emptyStats());
  assert.match(html, /Your pick:/);
  assert.match(html, /by 7/);
});

test("a played game with a correct resolved prediction shows a correct receipt", () => {
  const g = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });
  const predictions = { [predictionGameId(g)]: { winnerId: "BUF", margin: 10, resolved: true, correct: true } };
  const html = buildPredictionPanelMarkup([g], predictions, emptyStats());
  assert.match(html, /wp-correct/);
  assert.match(html, /✓/);
  assert.doesNotMatch(html, /wp-pick-form/);
});

test("a played game with an incorrect resolved prediction shows an incorrect receipt", () => {
  const g = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });
  const predictions = { [predictionGameId(g)]: { winnerId: "NYJ", margin: 3, resolved: true, correct: false } };
  const html = buildPredictionPanelMarkup([g], predictions, emptyStats());
  assert.match(html, /wp-incorrect/);
  assert.match(html, /✗/);
});

test("a played game with no submitted prediction shows the no-pick state, not a stale form", () => {
  const g = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });
  const html = buildPredictionPanelMarkup([g], {}, emptyStats());
  assert.match(html, /No prediction submitted/);
  assert.doesNotMatch(html, /wp-pick-form/);
});

test("the stats bar surfaces winner accuracy separately from mean absolute margin error", () => {
  const g = game();
  const html = buildPredictionPanelMarkup([g], {}, {
    seasonStreak: 3,
    bestStreak: 7,
    correctCount: 6,
    totalCount: 10,
    marginErrorTotal: 42,
    marginCount: 10
  });
  assert.match(html, />3<\/strong> current streak/);
  assert.match(html, />7<\/strong> best streak/);
  assert.match(html, />60%<\/strong> winner accuracy \(6\/10\)/);
  assert.match(html, />4\.2<\/strong> margin MAE/);
});

test("the current panel carries a bounded recent receipt journal with truthful winner and margin grades", () => {
  const g = game();
  const html = buildPredictionPanelMarkup([g], {}, emptyStats(), [{
    year: 2026,
    week: 4,
    gameId: "NYJ@BUF",
    winnerCorrect: true,
    marginBand: "within3",
    marginError: 2
  }]);
  assert.match(html, /Recent receipts/);
  assert.match(html, /Y2026 W4/);
  assert.match(html, /winner hit/);
  assert.match(html, /within 3 \(2 off\)/);
});

test("markup escapes team ids so a malicious/odd team id cannot inject markup", () => {
  const g = game({ awayTeamId: "<script>alert(1)</script>", homeTeamId: "BUF" });
  const html = buildPredictionPanelMarkup([g], {}, emptyStats());
  assert.doesNotMatch(html, /<script>alert/);
});
