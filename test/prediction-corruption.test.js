import assert from "node:assert/strict";
import test from "node:test";
import {
  getPredictionStats, getRecentPredictionReceipts, getPredictionStorySnapshot,
  loadWeekPredictions, resolveDashboardPredictions, submitPrediction
} from "../public/lib/spreadPredictions.js";

const upcoming = Object.freeze({ awayTeamId: "NYJ", homeTeamId: "BUF", played: false });
const completed = Object.freeze({ ...upcoming, played: true, awayScore: 10, homeScore: 24, winnerId: "BUF", isTie: false });
const dashboard = Object.freeze({ franchiseId: "recovery", currentYear: 2026, currentWeek: 5,
  latestWeekResults: Object.freeze({ year: 2026, week: 4, games: Object.freeze([completed]) }) });
const key = "fa:predictions:recovery:2026-4";
const zeroStats = { seasonStreak: 0, bestStreak: 0, correctCount: 0, totalCount: 0, marginErrorTotal: 0, marginCount: 0 };

function withStorage(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try { run(storage); }
  finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

for (const value of [null, false, true, 5, "wrong", [], [null], "{invalid"]) {
  test(`damaged week container ${JSON.stringify(value)} cannot interrupt settlement or a fresh pick`, () => withStorage((storage) => {
    storage.setItem(key, value === "{invalid" ? value : JSON.stringify(value));
    assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {});
    const before = JSON.stringify(dashboard);
    assert.deepEqual(resolveDashboardPredictions(dashboard), { receipts: [], stats: zeroStats });
    assert.equal(JSON.stringify(dashboard), before);
    submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 14 });
    const first = resolveDashboardPredictions(dashboard);
    assert.equal(first.receipts.length, 1);
    assert.equal(first.receipts[0].marginBand, "exact");
    assert.equal(first.stats.totalCount, 1);
    assert.deepEqual(resolveDashboardPredictions(dashboard).receipts, []);
  }));
}

for (const entry of [null, true, 7, "pick", [], {}, { winnerId: "MIA", margin: 14, resolved: false, submittedAt: 1 },
  { winnerId: "BUF", margin: {}, resolved: false, submittedAt: 1 },
  { winnerId: "BUF", margin: -1, resolved: false, submittedAt: 1 },
  { winnerId: "BUF", margin: 14, resolved: "false", submittedAt: 1 },
  { winnerId: "BUF", margin: 14, resolved: false, submittedAt: "yesterday" }]) {
  test(`damaged prediction entry ${JSON.stringify(entry)} creates no grade`, () => withStorage((storage) => {
    storage.setItem(key, JSON.stringify({ "NYJ@BUF": entry }));
    assert.deepEqual(resolveDashboardPredictions(dashboard), { receipts: [], stats: zeroStats });
    assert.deepEqual(getRecentPredictionReceipts("recovery"), []);
  }));
}

test("discarding a damaged neighbor preserves valid predictions and league/year/week boundaries", () => withStorage((storage) => {
  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 12 });
  const stored = JSON.parse(storage.getItem(key));
  stored["MIA@NE"] = "corrupt";
  storage.setItem(key, JSON.stringify(stored));
  assert.deepEqual(Object.keys(loadWeekPredictions("recovery", 2026, 4)), ["NYJ@BUF"]);
  for (const [league, year, week] of [["other", 2026, 4], ["recovery", 2027, 4], ["recovery", 2026, 5]]) {
    assert.deepEqual(loadWeekPredictions(league, year, week), {});
  }
  const result = resolveDashboardPredictions(dashboard);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.receipts[0].marginError, 2);
  assert.equal(result.stats.totalCount, 1);
}));

for (const stats of [null, [], false, "stats", { totalCount: {} }, { totalCount: "Infinity" },
  { totalCount: -1 }, { totalCount: 1.5 }, { totalCount: null },
  { totalCount: 1, correctCount: 2 }, { totalCount: 1, marginCount: 2 },
  { totalCount: 1, correctCount: 1, seasonStreak: 2, bestStreak: 1 }]) {
  test(`damaged aggregates ${JSON.stringify(stats)} never export nonfinite or invented counts`, () => withStorage((storage) => {
    storage.setItem("fa:predictions:recovery:stats", JSON.stringify(stats));
    assert.deepEqual(getPredictionStats("recovery"), zeroStats);
    assert.equal(getPredictionStorySnapshot("recovery").winnerAccuracyPct, 0);
    submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 14 });
    assert.equal(resolveDashboardPredictions(dashboard).stats.totalCount, 1);
  }));
}

test("damaged receipts are discarded before story display and merging new grades", () => withStorage((storage) => {
  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 14 });
  resolveDashboardPredictions(dashboard);
  const valid = getRecentPredictionReceipts("recovery")[0];
  const invalid = [null, false, 2, "receipt", [], {}, { ...valid, winnerCorrect: false },
    { ...valid, marginBand: "miss" }, { ...valid, receiptId: "wrong" }, { ...valid, actualMargin: {} }];
  storage.setItem("fa:predictions:recovery:receipts", JSON.stringify([...invalid, valid]));
  assert.deepEqual(getRecentPredictionReceipts("recovery"), [valid]);
  assert.deepEqual(getPredictionStorySnapshot("recovery").recent, [valid]);
  submitPrediction("recovery", 2026, 5, upcoming, { winnerId: "BUF", margin: 14 });
  resolveDashboardPredictions({ ...dashboard, latestWeekResults: { ...dashboard.latestWeekResults, week: 5 } });
  assert.equal(getRecentPredictionReceipts("recovery").length, 2);
  for (const value of [null, {}, true, "journal"]) {
    storage.setItem("fa:predictions:recovery:receipts", JSON.stringify(value));
    assert.deepEqual(getRecentPredictionReceipts("recovery"), []);
  }
}));

test("legacy statistics without margin counters remain readable", () => withStorage((storage) => {
  storage.setItem("fa:predictions:recovery:stats", JSON.stringify({ seasonStreak: 1, bestStreak: 2, correctCount: 2, totalCount: 4 }));
  assert.deepEqual(getPredictionStats("recovery"), { seasonStreak: 1, bestStreak: 2, correctCount: 2, totalCount: 4, marginErrorTotal: 0, marginCount: 0 });
}));

test("negative fractional margins remain ungraded rather than rounding into a zero prediction", () => withStorage(() => {
  const prediction = submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: -0.4 });
  assert.equal(prediction.margin, null);
  assert.equal(resolveDashboardPredictions(dashboard).receipts[0].marginBand, "ungraded");
}));

test("partial or contradictory resolved grades cannot masquerade as correct/exact picks", () => withStorage((storage) => {
  const corrupt = { winnerId: "NYJ", margin: 14, submittedAt: 1, resolved: true,
    winnerCorrect: "false", correct: true, marginError: 0, marginBand: "exact" };
  storage.setItem(key, JSON.stringify({ "NYJ@BUF": corrupt }));
  assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {});
  assert.deepEqual(resolveDashboardPredictions(dashboard), { receipts: [], stats: zeroStats });
  assert.deepEqual(getRecentPredictionReceipts("recovery"), []);

  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 14 });
  resolveDashboardPredictions(dashboard);
  const valid = loadWeekPredictions("recovery", 2026, 4)["NYJ@BUF"];
  for (const patch of [{ winnerCorrect: "true" }, { correct: false }, { marginBand: "miss" },
    { marginError: 4 }, { predictedWinnerId: "NYJ" }, { predictedMargin: 10 }]) {
    storage.setItem(key, JSON.stringify({ "NYJ@BUF": { ...valid, ...patch } }));
    assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {});
    assert.deepEqual(resolveDashboardPredictions(dashboard).receipts, []);
    assert.equal(getPredictionStats("recovery").totalCount, 1);
  }
}));

test("a self-consistent stored resolution contradicted by the current game is discarded without regrading", () => withStorage((storage) => {
  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "NYJ", margin: 14 });
  const contrary = { ...dashboard, latestWeekResults: { ...dashboard.latestWeekResults,
    games: [{ ...completed, winnerId: "NYJ", awayScore: 24, homeScore: 10 }] } };
  resolveDashboardPredictions(contrary);
  assert.equal(loadWeekPredictions("recovery", 2026, 4)["NYJ@BUF"].correct, true);
  assert.deepEqual(resolveDashboardPredictions(dashboard).receipts, []);
  assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {});
  assert.equal(getPredictionStats("recovery").totalCount, 1);
  assert.equal(getRecentPredictionReceipts("recovery").length, 1, "existing aggregate/journal is not rewritten into a new grade");
}));

test("actual S78 winner-only resolved schema remains readable, ungraded and never double-counted", () => withStorage((storage) => {
  const legacy = { winnerId: "BUF", margin: 14, submittedAt: 1, resolved: true, correct: true };
  storage.setItem(key, JSON.stringify({ "NYJ@BUF": legacy }));
  assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), { "NYJ@BUF": legacy });
  assert.deepEqual(resolveDashboardPredictions(dashboard), { receipts: [], stats: zeroStats });
  assert.equal(loadWeekPredictions("recovery", 2026, 4)["NYJ@BUF"].marginBand, undefined);
  storage.setItem(key, JSON.stringify({ "NYJ@BUF": { ...legacy, correct: false } }));
  assert.deepEqual(resolveDashboardPredictions(dashboard).receipts, []);
  assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {});
  assert.deepEqual(getPredictionStats("recovery"), zeroStats);
}));

test("quota-failed contradiction invalidation remains dropped in this tab and retries on recovery", () => withStorage((storage) => {
  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "NYJ", margin: 14 });
  resolveDashboardPredictions({ ...dashboard, latestWeekResults: { ...dashboard.latestWeekResults,
    games: [{ ...completed, winnerId: "NYJ", awayScore: 24, homeScore: 10 }] } });
  const write = storage.setItem;
  storage.setItem = () => { throw Error("quota"); };
  assert.deepEqual(resolveDashboardPredictions(dashboard).receipts, []);
  assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {});
  assert.deepEqual(resolveDashboardPredictions(dashboard).receipts, []);
  assert.equal(JSON.parse(storage.getItem(key))["NYJ@BUF"].correct, true, "durable write really failed");
  storage.setItem = write;
  assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {});
  assert.deepEqual(JSON.parse(storage.getItem(key)), {}, "recovery retries the pending tombstone");
}));

test("a quota-failed week-map settlement emits one receipt and preserves league/store isolation", () => withStorage((storage) => {
  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 14 });
  const write = storage.setItem;
  storage.setItem = (name, value) => { if (name === key) throw Error("quota"); write(name, value); };
  assert.equal(resolveDashboardPredictions(dashboard).receipts.length, 1);
  assert.equal(JSON.parse(storage.getItem(key))["NYJ@BUF"].resolved, false);
  assert.equal(loadWeekPredictions("recovery", 2026, 4)["NYJ@BUF"].resolved, true);
  assert.deepEqual(resolveDashboardPredictions(dashboard).receipts, []);
  assert.equal(getPredictionStats("recovery").totalCount, 1);
  assert.equal(getRecentPredictionReceipts("recovery").length, 1);
  assert.deepEqual(loadWeekPredictions("other", 2026, 4), {});
  withStorage(() => assert.deepEqual(loadWeekPredictions("recovery", 2026, 4), {}));
  storage.setItem = write;
  assert.equal(loadWeekPredictions("recovery", 2026, 4)["NYJ@BUF"].resolved, true);
  assert.equal(JSON.parse(storage.getItem(key))["NYJ@BUF"].resolved, true);
}));

test("denied reads never overwrite unknown durable picks and recovery merges pending changes", () => withStorage((storage) => {
  const neighbor = { awayTeamId: "MIA", homeTeamId: "NE", played: false };
  submitPrediction("recovery", 2026, 4, neighbor, { winnerId: "NE", margin: 7 });
  const read = storage.getItem, durableBefore = read(key);
  storage.getItem = (name) => { if (name === key) throw Error("read denied"); return read(name); };
  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 14 });
  assert.equal(read(key), durableBefore);
  assert.equal(loadWeekPredictions("recovery", 2026, 4)["NYJ@BUF"].winnerId, "BUF");
  storage.getItem = read;
  assert.deepEqual(Object.keys(loadWeekPredictions("recovery", 2026, 4)).sort(), ["MIA@NE", "NYJ@BUF"]);
  assert.deepEqual(Object.keys(JSON.parse(read(key))).sort(), ["MIA@NE", "NYJ@BUF"]);
}));

test("denied aggregate reads cannot overwrite unknown durable statistics", () => withStorage((storage) => {
  submitPrediction("recovery", 2026, 4, upcoming, { winnerId: "BUF", margin: 14 });
  const statsKey = "fa:predictions:recovery:stats";
  const original = JSON.stringify({ ...zeroStats, totalCount: 3, correctCount: 2, bestStreak: 2 });
  storage.setItem(statsKey, original);
  const read = storage.getItem;
  storage.getItem = (name) => { if (name === statsKey) throw Error("read denied"); return read(name); };
  assert.equal(resolveDashboardPredictions(dashboard).receipts.length, 1);
  assert.equal(read(statsKey), original);
}));
