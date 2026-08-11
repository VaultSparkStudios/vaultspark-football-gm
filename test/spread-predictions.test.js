import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  MAX_PREDICTION_RECEIPTS,
  getPredictionStorySnapshot,
  getPredictionStats,
  getRecentPredictionReceipts,
  gradeMargin,
  hitRatePct,
  loadWeekPredictions,
  meanAbsoluteMarginError,
  predictionGameId,
  resolveDashboardPredictions,
  resolveWeekPredictions,
  scorePrediction,
  submitPrediction
} from "../public/lib/spreadPredictions.js";

// spreadPredictions.js is a local-only, non-canon pick'em mini-game
// (S78 weekly-spread-prediction-minigame). Per the existing counterfactual-
// feature decision (DECISIONS.md 2026-07-02), it must never mutate engine,
// simulation, or persisted league state — only localStorage. This repo has
// no jsdom, so tests stand up a fake localStorage per the pattern already
// established in test/tablet-decision-deck.test.js and test/audio-feedback.test.js.

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
}

function withStorage(run) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: fakeStorage(), writable: true, configurable: true });
  try {
    return run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "localStorage", prior);
    else delete globalThis.localStorage;
  }
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

// ── empty state ──────────────────────────────────────────────────────────────

test("no predictions submitted: week predictions and stats both render as clean empty state", () => {
  withStorage(() => {
    assert.deepEqual(loadWeekPredictions("league-1", 2026, 4), {});
    assert.deepEqual(getPredictionStats("league-1"), {
      seasonStreak: 0, bestStreak: 0, correctCount: 0, totalCount: 0,
      marginErrorTotal: 0, marginCount: 0
    });
    assert.equal(hitRatePct(getPredictionStats("league-1")), 0);
  });
});

// ── submission ───────────────────────────────────────────────────────────────

test("a prediction can be submitted for an upcoming (unplayed) game", () => {
  withStorage(() => {
    const g = game();
    const saved = submitPrediction("league-1", 2026, 4, g, { winnerId: "BUF", margin: 7 });
    assert.ok(saved);
    assert.equal(saved.winnerId, "BUF");
    assert.equal(saved.margin, 7);
    const loaded = loadWeekPredictions("league-1", 2026, 4);
    assert.equal(loaded[predictionGameId(g)].winnerId, "BUF");
  });
});

test("a prediction is refused for a game that has already been played", () => {
  withStorage(() => {
    const g = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });
    const result = submitPrediction("league-1", 2026, 4, g, { winnerId: "BUF", margin: 14 });
    assert.equal(result, null);
    assert.deepEqual(loadWeekPredictions("league-1", 2026, 4), {});
  });
});

test("a prediction naming a team not in the game is refused", () => {
  withStorage(() => {
    const g = game();
    const result = submitPrediction("league-1", 2026, 4, g, { winnerId: "MIA", margin: 3 });
    assert.equal(result, null);
  });
});

test("an invalid or missing margin is stored as null rather than throwing or coercing to 0", () => {
  withStorage(() => {
    const g = game();
    const saved = submitPrediction("league-1", 2026, 4, g, { winnerId: "BUF", margin: "not-a-number" });
    assert.equal(saved.margin, null);
    const saved2 = submitPrediction("league-1", 2026, 5, g, { winnerId: "BUF" });
    assert.equal(saved2.margin, null);
    const saved3 = submitPrediction("league-1", 2026, 6, g, { winnerId: "BUF", margin: "" });
    assert.equal(saved3.margin, null, "a blank browser input is not a prediction of a zero-point margin");
  });
});

test("submitting twice for the same game overwrites the earlier pick", () => {
  withStorage(() => {
    const g = game();
    submitPrediction("league-1", 2026, 4, g, { winnerId: "NYJ", margin: 3 });
    submitPrediction("league-1", 2026, 4, g, { winnerId: "BUF", margin: 10 });
    const loaded = loadWeekPredictions("league-1", 2026, 4);
    assert.equal(loaded[predictionGameId(g)].winnerId, "BUF");
    assert.equal(loaded[predictionGameId(g)].margin, 10);
  });
});

// ── scoring ──────────────────────────────────────────────────────────────────

test("scorePrediction returns null for an unplayed game", () => {
  assert.equal(scorePrediction({ winnerId: "BUF" }, game()), null);
});

test("scorePrediction grades winner and exact/within-3/within-7/miss margins independently", () => {
  const g = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });
  assert.deepEqual(gradeMargin(14, 14), { marginError: 0, marginBand: "exact" });
  assert.deepEqual(gradeMargin(12, 14), { marginError: 2, marginBand: "within3" });
  assert.deepEqual(gradeMargin(8, 14), { marginError: 6, marginBand: "within7" });
  assert.deepEqual(gradeMargin(1, 14), { marginError: 13, marginBand: "miss" });

  const receipt = scorePrediction({ winnerId: "BUF", margin: 1 }, g);
  assert.equal(receipt.winnerCorrect, true);
  assert.equal(receipt.correct, true);
  assert.equal(receipt.marginBand, "miss");
  assert.equal(receipt.marginError, 13);
});

test("scorePrediction marks a wrong winner pick as incorrect", () => {
  const g = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });
  const receipt = scorePrediction({ winnerId: "NYJ", margin: 5 }, g);
  assert.equal(receipt.correct, false);
});

test("scorePrediction treats a tie as unwinnable for any prediction", () => {
  const g = game({ played: true, isTie: true, winnerId: null, awayScore: 20, homeScore: 20 });
  const receipt = scorePrediction({ winnerId: "BUF", margin: 0 }, g);
  assert.equal(receipt.correct, false);
  assert.equal(receipt.actualWinnerId, null);
  assert.equal(receipt.marginBand, "exact", "tie margin still grades truthfully and separately");
});

// ── resolution + streaks ─────────────────────────────────────────────────────

test("resolving an unplayed week's games produces no receipts and leaves stats untouched", () => {
  withStorage(() => {
    const g = game();
    submitPrediction("league-1", 2026, 4, g, { winnerId: "BUF", margin: 7 });
    const { receipts, stats } = resolveWeekPredictions("league-1", 2026, 4, [g]);
    assert.deepEqual(receipts, []);
    assert.equal(stats.totalCount, 0);
  });
});

test("resolving a correct prediction increments the streak, hit rate, and best streak", () => {
  withStorage(() => {
    const unplayed = game();
    submitPrediction("league-1", 2026, 4, unplayed, { winnerId: "BUF", margin: 7 });
    const played = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });

    const { receipts, stats } = resolveWeekPredictions("league-1", 2026, 4, [played]);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].correct, true);
    assert.equal(stats.seasonStreak, 1);
    assert.equal(stats.bestStreak, 1);
    assert.equal(stats.correctCount, 1);
    assert.equal(stats.totalCount, 1);
    assert.equal(hitRatePct(stats), 100);
    assert.equal(meanAbsoluteMarginError(stats), 7);
  });
});

test("resolving an incorrect prediction resets the season streak but preserves best streak", () => {
  withStorage(() => {
    // Week 1: correct pick, streak -> 1
    const g1Unplayed = game({ awayTeamId: "NYJ", homeTeamId: "BUF" });
    submitPrediction("league-1", 2026, 1, g1Unplayed, { winnerId: "BUF", margin: 7 });
    resolveWeekPredictions("league-1", 2026, 1, [game({ awayTeamId: "NYJ", homeTeamId: "BUF", played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 })]);

    // Week 2: correct pick, streak -> 2, best -> 2
    const g2Unplayed = game({ awayTeamId: "MIA", homeTeamId: "NE" });
    submitPrediction("league-1", 2026, 2, g2Unplayed, { winnerId: "MIA", margin: 3 });
    resolveWeekPredictions("league-1", 2026, 2, [game({ awayTeamId: "MIA", homeTeamId: "NE", played: true, winnerId: "MIA", awayScore: 20, homeScore: 17 })]);

    let stats = getPredictionStats("league-1");
    assert.equal(stats.seasonStreak, 2);
    assert.equal(stats.bestStreak, 2);

    // Week 3: wrong pick, streak resets to 0, best stays 2
    const g3Unplayed = game({ awayTeamId: "DAL", homeTeamId: "PHI" });
    submitPrediction("league-1", 2026, 3, g3Unplayed, { winnerId: "DAL", margin: 3 });
    resolveWeekPredictions("league-1", 2026, 3, [game({ awayTeamId: "DAL", homeTeamId: "PHI", played: true, winnerId: "PHI", awayScore: 10, homeScore: 24 })]);

    stats = getPredictionStats("league-1");
    assert.equal(stats.seasonStreak, 0);
    assert.equal(stats.bestStreak, 2);
    assert.equal(stats.correctCount, 2);
    assert.equal(stats.totalCount, 3);
  });
});

test("resolving the same week twice does not double-count (idempotent)", () => {
  withStorage(() => {
    const unplayed = game();
    submitPrediction("league-1", 2026, 4, unplayed, { winnerId: "BUF", margin: 7 });
    const played = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });

    resolveWeekPredictions("league-1", 2026, 4, [played]);
    const second = resolveWeekPredictions("league-1", 2026, 4, [played]);
    assert.deepEqual(second.receipts, []);
    assert.equal(second.stats.totalCount, 1);
  });
});

test("a game with no submitted prediction is silently skipped during resolution", () => {
  withStorage(() => {
    const played = game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 });
    const { receipts, stats } = resolveWeekPredictions("league-1", 2026, 4, [played]);
    assert.deepEqual(receipts, []);
    assert.equal(stats.totalCount, 0);
  });
});

test("predictions are scoped per league — two leagues never see each other's stats", () => {
  withStorage(() => {
    const g = game();
    submitPrediction("league-A", 2026, 4, g, { winnerId: "BUF", margin: 7 });
    resolveWeekPredictions("league-A", 2026, 4, [game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 })]);

    assert.equal(getPredictionStats("league-A").totalCount, 1);
    assert.equal(getPredictionStats("league-B").totalCount, 0);
  });
});

test("normal dashboard rollover resolves the completed week on advance and remains idempotent after reload", () => {
  withStorage(() => {
    const upcoming = game();
    submitPrediction("fa-seed-BUF", 2026, 4, upcoming, { winnerId: "BUF", margin: 11 });
    const completedDashboard = {
      franchiseId: "fa-seed-BUF",
      currentYear: 2026,
      currentWeek: 5,
      latestWeekResults: {
        year: 2026,
        week: 4,
        games: [{
          awayTeamId: "NYJ",
          homeTeamId: "BUF",
          awayScore: 10,
          homeScore: 24,
          winnerId: "BUF",
          isTie: false
        }]
      }
    };

    const deepFreeze = (value) => {
      if (value && typeof value === "object") {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    };
    const before = JSON.stringify(completedDashboard);
    deepFreeze(completedDashboard);
    let first;
    assert.doesNotThrow(() => {
      first = resolveDashboardPredictions(completedDashboard);
    });
    assert.equal(JSON.stringify(completedDashboard), before, "rollover must not mutate frozen dashboard/week-result inputs");
    assert.equal(first.receipts.length, 1);
    assert.equal(first.receipts[0].marginBand, "within3");
    assert.equal(first.stats.totalCount, 1);

    // A cold reload supplies the same persisted lean week result. No module
    // memory is required and the already-resolved receipt cannot double-count.
    const reload = resolveDashboardPredictions(structuredClone(completedDashboard));
    assert.deepEqual(reload.receipts, []);
    assert.equal(reload.stats.totalCount, 1);
    assert.equal(getRecentPredictionReceipts("fa-seed-BUF").length, 1);

    const gameFlow = fs.readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
    assert.match(gameFlow, /resolveDashboardPredictions\(newState\)/, "applyDashboard must settle rollover before moving to the next schedule");
  });
});

test("receipt journal is newest-first, bounded, and story snapshot reports winner accuracy plus margin MAE", () => {
  withStorage(() => {
    for (let week = 1; week <= MAX_PREDICTION_RECEIPTS + 5; week += 1) {
      const upcoming = game({ awayTeamId: `A${week}`, homeTeamId: `H${week}` });
      submitPrediction("league-journal", 2026, week, upcoming, { winnerId: `H${week}`, margin: 7 });
      resolveWeekPredictions("league-journal", 2026, week, [{
        ...upcoming,
        played: true,
        winnerId: `H${week}`,
        awayScore: 10,
        homeScore: 20
      }]);
    }

    const journal = getRecentPredictionReceipts("league-journal");
    assert.equal(journal.length, MAX_PREDICTION_RECEIPTS);
    assert.equal(journal[0].week, MAX_PREDICTION_RECEIPTS + 5);
    assert.equal(journal.at(-1).week, 6);

    const story = getPredictionStorySnapshot("league-journal", 3);
    assert.equal(story.winnerAccuracyPct, 100);
    assert.equal(story.meanAbsoluteMarginError, 3);
    assert.equal(story.recent.length, 3);
  });
});

// ── zero engine/league mutation ──────────────────────────────────────────────

test("submitting and resolving predictions never mutates the game/schedule objects passed in (byte-identical before/after)", () => {
  withStorage(() => {
    const games = [
      game({ awayTeamId: "NYJ", homeTeamId: "BUF" }),
      game({ awayTeamId: "MIA", homeTeamId: "NE", played: true, winnerId: "MIA", awayScore: 21, homeScore: 14 })
    ];
    // Deep-freeze so any accidental write throws in strict mode instead of
    // silently succeeding, and snapshot for a belt-and-suspenders diff.
    const deepFreeze = (obj) => { Object.values(obj).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(obj); };
    games.forEach(deepFreeze);
    const before = JSON.stringify(games);

    assert.doesNotThrow(() => {
      submitPrediction("league-1", 2026, 4, games[0], { winnerId: "BUF", margin: 6 });
      resolveWeekPredictions("league-1", 2026, 4, games);
    });

    assert.equal(JSON.stringify(games), before, "game/schedule objects must be byte-identical before and after prediction submission + resolution");
  });
});

test("a fully separate 'league state' object is never touched even when passed alongside games", () => {
  withStorage(() => {
    const leagueState = Object.freeze({
      standings: Object.freeze([{ team: "BUF", wins: 3, losses: 1 }]),
      currentYear: 2026,
      currentWeek: 4
    });
    const before = JSON.stringify(leagueState);
    const g = game();
    submitPrediction("league-1", 2026, 4, g, { winnerId: "BUF", margin: 7 });
    resolveWeekPredictions("league-1", 2026, 4, [game({ played: true, winnerId: "BUF", awayScore: 10, homeScore: 24 })]);
    assert.equal(JSON.stringify(leagueState), before);
  });
});
