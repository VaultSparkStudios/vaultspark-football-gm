/**
 * spreadPredictions.js — local-only, non-canon "predict the spread" mini-game (S78).
 *
 * Every function here is pure with respect to the engine: it never reads or
 * writes any `league`/`game`/`schedule` object passed in, and never calls the
 * simulation or any authority-guarded command. All state this module owns
 * (predictions, streak stats) lives entirely in localStorage, scoped per
 * league by `leagueId` so switching franchises never bleeds predictions
 * across saves. This mirrors the existing counterfactual-feature decision
 * pattern (DECISIONS.md 2026-07-02: "Counterfactual features must be
 * explicitly non-canon and side-effect free").
 */

const STORAGE_PREFIX = "fa:predictions";
export const MAX_PREDICTION_RECEIPTS = 48;

const EMPTY_STATS = Object.freeze({
  seasonStreak: 0,
  bestStreak: 0,
  correctCount: 0,
  totalCount: 0,
  marginErrorTotal: 0,
  marginCount: 0
});

function storageKey(leagueId, part) {
  return `${STORAGE_PREFIX}:${leagueId || "default"}:${part}`;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable — predictions simply don't persist this session.
  }
}

/** Stable per-game key, independent of any engine-assigned id. */
export function predictionGameId(game) {
  return `${game?.awayTeamId || "?"}@${game?.homeTeamId || "?"}`;
}

export function loadWeekPredictions(leagueId, year, week) {
  return readJSON(storageKey(leagueId, `${year}-${week}`), {});
}

/**
 * Submit (or overwrite) a prediction for one game. Refuses to record a
 * prediction against a game that has already been played — predictions must
 * be made before the outcome is known.
 */
export function submitPrediction(leagueId, year, week, game, { winnerId, margin } = {}) {
  if (!game || game.played) return null;
  if (winnerId !== game.awayTeamId && winnerId !== game.homeTeamId) return null;
  const numericMargin = margin == null || margin === "" ? Number.NaN : Number(margin);
  const clean = {
    winnerId,
    margin: Number.isFinite(numericMargin) && numericMargin >= 0 ? Math.round(numericMargin) : null,
    submittedAt: Date.now(),
    resolved: false
  };
  const key = storageKey(leagueId, `${year}-${week}`);
  const all = readJSON(key, {});
  all[predictionGameId(game)] = clean;
  writeJSON(key, all);
  return clean;
}

export function getPredictionStats(leagueId) {
  const stored = readJSON(storageKey(leagueId, "stats"), EMPTY_STATS);
  return {
    seasonStreak: Number(stored?.seasonStreak || 0),
    bestStreak: Number(stored?.bestStreak || 0),
    correctCount: Number(stored?.correctCount || 0),
    totalCount: Number(stored?.totalCount || 0),
    marginErrorTotal: Number(stored?.marginErrorTotal || 0),
    marginCount: Number(stored?.marginCount || 0)
  };
}

export function hitRatePct(stats) {
  if (!stats?.totalCount) return 0;
  return Math.round((stats.correctCount / stats.totalCount) * 1000) / 10;
}

export function meanAbsoluteMarginError(stats) {
  if (!stats?.marginCount) return null;
  return Math.round((stats.marginErrorTotal / stats.marginCount) * 10) / 10;
}

export function gradeMargin(predictedMargin, actualMargin) {
  if (predictedMargin == null || predictedMargin === "" || !Number.isFinite(Number(predictedMargin))) {
    return { marginError: null, marginBand: "ungraded" };
  }
  const marginError = Math.abs(Math.round(Number(predictedMargin)) - Math.round(Number(actualMargin)));
  const marginBand = marginError === 0
    ? "exact"
    : marginError <= 3
      ? "within3"
      : marginError <= 7
        ? "within7"
        : "miss";
  return { marginError, marginBand };
}

export function getRecentPredictionReceipts(leagueId, limit = MAX_PREDICTION_RECEIPTS) {
  const bounded = Math.max(0, Math.min(MAX_PREDICTION_RECEIPTS, Math.floor(Number(limit) || 0)));
  const receipts = readJSON(storageKey(leagueId, "receipts"), []);
  return Array.isArray(receipts) ? receipts.slice(0, bounded) : [];
}

/**
 * Pure: score a single prediction against a resolved game. Reads only —
 * never mutates `prediction` or `game`.
 */
export function scorePrediction(prediction, game) {
  if (!prediction || !game || !game.played) return null;
  const actualWinnerId = game.isTie ? null : game.winnerId || null;
  const actualMargin = Math.abs(Number(game.awayScore || 0) - Number(game.homeScore || 0));
  const winnerCorrect = !game.isTie && prediction.winnerId === actualWinnerId;
  const marginGrade = gradeMargin(prediction.margin, actualMargin);
  return {
    gameId: predictionGameId(game),
    predictedWinnerId: prediction.winnerId,
    predictedMargin: prediction.margin,
    actualWinnerId,
    actualMargin,
    isTie: Boolean(game.isTie),
    winnerCorrect,
    // Backward-compatible alias for the S78 render/storage contract.
    correct: winnerCorrect,
    ...marginGrade
  };
}

/**
 * Resolve every not-yet-resolved prediction for a week against now-played
 * games, updating persisted streak/hit-rate stats. Idempotent: already-
 * resolved predictions are skipped, so calling this on every render is safe.
 * Only ever reads `games`; never writes to it or to any engine/league state.
 */
export function resolveWeekPredictions(leagueId, year, week, games) {
  const predKey = storageKey(leagueId, `${year}-${week}`);
  const predictions = readJSON(predKey, {});
  let stats = getPredictionStats(leagueId);
  const receipts = [];
  let changed = false;

  for (const game of games || []) {
    if (!game.played) continue;
    const gameId = predictionGameId(game);
    const prediction = predictions[gameId];
    if (!prediction || prediction.resolved) continue;

    const receipt = scorePrediction(prediction, game);
    if (!receipt) continue;

    const journalReceipt = {
      ...receipt,
      receiptId: `${year}-${week}-${receipt.gameId}`,
      year: Number(year),
      week: Number(week),
      resolvedAt: Date.now()
    };
    receipts.push(journalReceipt);
    predictions[gameId] = { ...prediction, resolved: true, ...receipt };
    changed = true;

    const seasonStreak = receipt.winnerCorrect ? stats.seasonStreak + 1 : 0;
    stats = {
      correctCount: stats.correctCount + (receipt.winnerCorrect ? 1 : 0),
      totalCount: stats.totalCount + 1,
      seasonStreak,
      bestStreak: Math.max(stats.bestStreak, seasonStreak),
      marginErrorTotal: stats.marginErrorTotal + (receipt.marginError ?? 0),
      marginCount: stats.marginCount + (receipt.marginError == null ? 0 : 1)
    };
  }

  if (changed) {
    const priorReceipts = getRecentPredictionReceipts(leagueId);
    const receiptIds = new Set(receipts.map((entry) => entry.receiptId));
    const journal = [
      ...receipts.slice().reverse(),
      ...priorReceipts.filter((entry) => !receiptIds.has(entry.receiptId))
    ].slice(0, MAX_PREDICTION_RECEIPTS);
    writeJSON(predKey, predictions);
    writeJSON(storageKey(leagueId, "stats"), stats);
    writeJSON(storageKey(leagueId, "receipts"), journal);
  }
  return { receipts, stats };
}

/**
 * Settle the latest completed week carried by dashboard state. The dashboard
 * retains this lean week result across save/reload, so normal week advances
 * and cold reloads close the prediction loop without browsing backward.
 */
export function resolveDashboardPredictions(dashboard = {}) {
  const completed = dashboard?.latestWeekResults;
  const games = (Array.isArray(completed?.games) ? completed.games : [])
    .filter((game) => game && game.awayTeamId && game.homeTeamId)
    .map((game) => ({
      ...game,
      // Lean persisted week results intentionally omit `played`; a retained
      // scoreline is sufficient completion authority and copying preserves the
      // frozen engine object passed by the dashboard.
      played: game.played === true || (
        Object.hasOwn(game, "awayScore") &&
        Object.hasOwn(game, "homeScore") &&
        (Boolean(game.winnerId) || game.isTie === true)
      )
    }));
  if (!games.some((game) => game.played)) {
    return { receipts: [], stats: getPredictionStats(dashboard?.franchiseId) };
  }
  return resolveWeekPredictions(
    dashboard?.franchiseId,
    completed?.year ?? dashboard?.currentYear,
    completed?.week,
    games
  );
}

export function getPredictionStorySnapshot(leagueId, recentLimit = 3) {
  const stats = getPredictionStats(leagueId);
  return {
    stats,
    winnerAccuracyPct: hitRatePct(stats),
    meanAbsoluteMarginError: meanAbsoluteMarginError(stats),
    recent: getRecentPredictionReceipts(leagueId, recentLimit)
  };
}
