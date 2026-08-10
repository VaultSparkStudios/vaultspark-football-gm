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
  const numericMargin = Number(margin);
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
  return readJSON(storageKey(leagueId, "stats"), {
    seasonStreak: 0,
    bestStreak: 0,
    correctCount: 0,
    totalCount: 0
  });
}

export function hitRatePct(stats) {
  if (!stats?.totalCount) return 0;
  return Math.round((stats.correctCount / stats.totalCount) * 1000) / 10;
}

/**
 * Pure: score a single prediction against a resolved game. Reads only —
 * never mutates `prediction` or `game`.
 */
export function scorePrediction(prediction, game) {
  if (!prediction || !game || !game.played) return null;
  const actualWinnerId = game.isTie ? null : game.winnerId || null;
  const actualMargin = Math.abs(Number(game.awayScore || 0) - Number(game.homeScore || 0));
  const correct = !game.isTie && prediction.winnerId === actualWinnerId;
  return {
    gameId: predictionGameId(game),
    predictedWinnerId: prediction.winnerId,
    predictedMargin: prediction.margin,
    actualWinnerId,
    actualMargin,
    correct
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

    receipts.push(receipt);
    predictions[gameId] = { ...prediction, resolved: true, correct: receipt.correct };
    changed = true;

    const seasonStreak = receipt.correct ? stats.seasonStreak + 1 : 0;
    stats = {
      correctCount: stats.correctCount + (receipt.correct ? 1 : 0),
      totalCount: stats.totalCount + 1,
      seasonStreak,
      bestStreak: Math.max(stats.bestStreak, seasonStreak)
    };
  }

  if (changed) {
    writeJSON(predKey, predictions);
    writeJSON(storageKey(leagueId, "stats"), stats);
  }
  return { receipts, stats };
}
