// Local-only, non-canon predictions. League-scoped browser state; never mutate
// engine inputs or call simulation/authority commands (S78 counterfactual rule).

const STORAGE_PREFIX = "fa:predictions";
export const MAX_PREDICTION_RECEIPTS = 48;
const pendingMaps = new WeakMap();
const unavailableStorage = {};
const readableKeys = new WeakMap();
function predictionStorage() {
  try { return globalThis.localStorage || unavailableStorage; } catch { return unavailableStorage; }
}

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
  const storage = predictionStorage();
  let reads = readableKeys.get(storage);
  if (!reads) readableKeys.set(storage, reads = new Map());
  if (!reads.has(key) && reads.size >= 128) reads.delete(reads.keys().next().value);
  reads.set(key, false);
  try {
    const raw = storage.getItem(key);
    reads.set(key, true);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(fallback)
      ? (Array.isArray(parsed) ? parsed : fallback)
      : (isRecord(parsed) ? parsed : fallback);
  } catch {
    return fallback;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function gameTeams(gameId) {
  if (typeof gameId !== "string") return null;
  const teams = gameId.split("@");
  return teams.length === 2 && teams.every((team) => team && team !== "?") && teams[0] !== teams[1] ? teams : null;
}

function validPrediction(value, teams) {
  return isRecord(value) && teams?.includes(value.winnerId)
    && (value.margin == null || isCount(value.margin));
}

const MODERN_GRADE_FIELDS = ["gameId", "predictedWinnerId", "predictedMargin", "actualWinnerId", "actualMargin", "isTie", "winnerCorrect", "marginError", "marginBand"];

function legacyResolvedPrediction(value) {
  // S78 winner-only history stays ungraded and never counts again.
  return typeof value.correct === "boolean" && MODERN_GRADE_FIELDS.every((key) => !Object.hasOwn(value, key));
}

function validStoredResolution(value, id) {
  return legacyResolvedPrediction(value) || (value.gameId === id
    && value.predictedWinnerId === value.winnerId && value.predictedMargin === value.margin
    && validGrade(value));
}

function predictionMapState(key) {
  const storage = predictionStorage();
  let maps = pendingMaps.get(storage);
  if (!maps) pendingMaps.set(storage, maps = new Map());
  let pending = maps.get(key);
  if (!pending) {
    if (maps.size >= 64) maps.delete(maps.keys().next().value);
    maps.set(key, pending = new Map());
  }
  const stored = readJSON(key, {});
  const value = Object.fromEntries(Object.entries(stored).filter(([id, value]) =>
    validPrediction(value, gameTeams(id))
    && typeof value.resolved === "boolean" && isCount(value.submittedAt)
    && (!value.resolved || validStoredResolution(value, id))
  ));
  for (const [id, pick] of pending) {
    if (pick === null) delete value[id];
    else value[id] = pick;
  }
  const state = { storage, key, pending, value, readable: readableKeys.get(storage)?.get(key) === true };
  flushPredictionMap(state);
  return state;
}

function flushPredictionMap({ storage, key, pending, value, readable }) {
  if (!readable || !pending.size) return;
  try { storage.setItem(key, JSON.stringify(value)); pending.clear(); } catch {}
}

function updatePredictionMap(state, id, pick) {
  state.pending.set(id, pick);
  if (pick === null) delete state.value[id];
  else state.value[id] = pick;
}

function readPredictionMap(key) {
  return predictionMapState(key).value;
}

function writeJSON(key, value) {
  const storage = predictionStorage();
  if (readableKeys.get(storage)?.get(key) !== true) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

export function predictionGameId(game) {
  return `${game?.awayTeamId || "?"}@${game?.homeTeamId || "?"}`;
}

export function loadWeekPredictions(leagueId, year, week) {
  return readPredictionMap(storageKey(leagueId, `${year}-${week}`));
}

export function submitPrediction(leagueId, year, week, game, { winnerId, margin } = {}) {
  if (!game || game.played) return null;
  if (winnerId !== game.awayTeamId && winnerId !== game.homeTeamId) return null;
  const numericMargin = margin == null || margin === "" ? Number.NaN : Number(margin);
  const clean = {
    winnerId,
    margin: numericMargin >= 0 && isCount(Math.round(numericMargin)) ? Math.round(numericMargin) : null,
    submittedAt: Date.now(),
    resolved: false
  };
  const key = storageKey(leagueId, `${year}-${week}`);
  const map = predictionMapState(key);
  updatePredictionMap(map, predictionGameId(game), clean);
  flushPredictionMap(map);
  return clean;
}

export function getPredictionStats(leagueId) {
  const stored = readJSON(storageKey(leagueId, "stats"), EMPTY_STATS);
  const stats = Object.fromEntries(Object.keys(EMPTY_STATS).map((key) => [key, stored[key] === undefined ? 0 : stored[key]]));
  if (!Object.values(stats).every(isCount)
    || stats.correctCount > stats.totalCount || stats.marginCount > stats.totalCount
    || stats.seasonStreak > stats.bestStreak || stats.bestStreak > stats.correctCount) return { ...EMPTY_STATS };
  return stats;
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
  return receipts.filter(validReceipt).slice(0, bounded);
}

function validGrade(receipt) {
  if (!isRecord(receipt)) return false;
  const teams = gameTeams(receipt.gameId);
  if (!teams || !teams.includes(receipt.predictedWinnerId)
    || !(receipt.predictedMargin == null || isCount(receipt.predictedMargin))
    || !isCount(receipt.actualMargin) || typeof receipt.isTie !== "boolean"
    || !(receipt.isTie ? receipt.actualWinnerId === null : teams.includes(receipt.actualWinnerId))
    || (receipt.isTie && receipt.actualMargin !== 0)) return false;
  const correct = !receipt.isTie && receipt.predictedWinnerId === receipt.actualWinnerId;
  const margin = gradeMargin(receipt.predictedMargin, receipt.actualMargin);
  return receipt.winnerCorrect === correct && receipt.correct === correct
    && receipt.marginError === margin.marginError && receipt.marginBand === margin.marginBand;
}

function validReceipt(receipt) {
  return validGrade(receipt) && isCount(receipt.year) && isCount(receipt.week) && isCount(receipt.resolvedAt)
    && receipt.receiptId === `${receipt.year}-${receipt.week}-${receipt.gameId}`;
}

export function scorePrediction(prediction, game) {
  if (!game || !game.played || !validPrediction(prediction, gameTeams(predictionGameId(game)))) return null;
  if (!isCount(game.awayScore) || !isCount(game.homeScore)
    || !(game.isTie ? game.awayScore === game.homeScore : [game.awayTeamId, game.homeTeamId].includes(game.winnerId))) return null;
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
    correct: winnerCorrect,
    ...marginGrade
  };
}

export function resolveWeekPredictions(leagueId, year, week, games) {
  const predKey = storageKey(leagueId, `${year}-${week}`);
  const map = predictionMapState(predKey);
  const predictions = map.value;
  let stats = getPredictionStats(leagueId);
  const receipts = [];
  let changed = false;
  let mapChanged = false;

  for (const game of Array.isArray(games) ? games : []) {
    if (!game?.played) continue;
    const gameId = predictionGameId(game);
    const prediction = predictions[gameId];
    if (!prediction) continue;

    if (prediction.resolved) {
      const actual = scorePrediction(prediction, game);
      if (actual && (legacyResolvedPrediction(prediction)
        ? prediction.correct !== actual.correct
        : MODERN_GRADE_FIELDS.some((key) => prediction[key] !== actual[key]) || prediction.correct !== actual.correct)) {
        updatePredictionMap(map, gameId, null);
        mapChanged = true;
      }
      continue;
    }

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
    updatePredictionMap(map, gameId, { ...prediction, resolved: true, ...receipt });
    changed = true;
    mapChanged = true;

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

  if (mapChanged) flushPredictionMap(map);
  if (changed) {
    const priorReceipts = getRecentPredictionReceipts(leagueId);
    const receiptIds = new Set(receipts.map((entry) => entry.receiptId));
    const journal = [
      ...receipts.slice().reverse(),
      ...priorReceipts.filter((entry) => !receiptIds.has(entry.receiptId))
    ].slice(0, MAX_PREDICTION_RECEIPTS);
    writeJSON(storageKey(leagueId, "stats"), stats);
    writeJSON(storageKey(leagueId, "receipts"), journal);
  }
  return { receipts, stats };
}

export function resolveDashboardPredictions(dashboard = {}) {
  const completed = dashboard?.latestWeekResults;
  const games = (Array.isArray(completed?.games) ? completed.games : [])
    .filter((game) => game && game.awayTeamId && game.homeTeamId)
    .map((game) => ({
      ...game,
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
