export const VISUAL_GAME_RECEIPT_SCHEMA_VERSION = "1.0";

function uniqueGameIds(dashboard = {}) {
  const ids = [
    ...(dashboard.recentBoxScores || []).map((row) => row?.gameId),
    dashboard.latestBoxScore?.gameId,
    ...(dashboard.gameArchive || []).slice(-8).reverse().map((row) => row?.gameId)
  ];
  return [...new Set(ids.filter(Boolean).map(String))];
}

function highImpactPlayCount(boxScore = {}) {
  const scoringDescriptions = new Set((boxScore.scoringSummary || []).map((row) => String(row?.description || "")));
  return (boxScore.playByPlay || []).filter((play) => {
    const description = String(play?.description || "");
    const lower = description.toLowerCase();
    return scoringDescriptions.has(description)
      || lower.includes("touchdown")
      || lower.includes("field goal")
      || lower.includes("safety")
      || lower.includes("interception")
      || lower.includes("fumble");
  }).length;
}

export function inspectVisualGameCandidate(gameId, boxScore = null) {
  const playCount = Array.isArray(boxScore?.playByPlay) ? boxScore.playByPlay.length : 0;
  const impactCount = highImpactPlayCount(boxScore || {});
  const accepted = Boolean(gameId && boxScore && playCount > 0 && impactCount > 0);
  return Object.freeze({
    gameId: gameId ? String(gameId) : null,
    accepted,
    playCount,
    impactCount,
    reason: accepted
      ? "play-by-play-and-final-reel-authority"
      : !boxScore
        ? "box-score-missing"
        : playCount === 0
          ? "play-by-play-missing"
          : "high-impact-play-missing"
  });
}

export async function resolveVisualGameReceipt({
  advance,
  loadBoxScore,
  applyDashboard = null,
  maxAttempts = 8
} = {}) {
  if (typeof advance !== "function" || typeof loadBoxScore !== "function") {
    throw new TypeError("Visual game receipt requires advance and loadBoxScore functions.");
  }
  const boundedAttempts = Math.max(1, Math.min(12, Number(maxAttempts) || 8));
  const attempts = [];
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const response = await advance();
    const dashboard = response?.state || response?.dashboard || null;
    if (dashboard && typeof applyDashboard === "function") applyDashboard(dashboard);
    const candidates = uniqueGameIds(dashboard || {});
    const attemptReceipt = {
      attempt,
      year: dashboard?.currentYear ?? null,
      week: dashboard?.currentWeek ?? null,
      phase: dashboard?.phase ?? null,
      blockingReason: dashboard?.blockingReason ?? response?.blockingReason ?? null,
      candidates: []
    };
    for (const gameId of candidates) {
      const payload = await loadBoxScore(gameId);
      const candidate = inspectVisualGameCandidate(gameId, payload?.boxScore || null);
      attemptReceipt.candidates.push(candidate);
      if (candidate.accepted) {
        attempts.push(attemptReceipt);
        return Object.freeze({
          schemaVersion: VISUAL_GAME_RECEIPT_SCHEMA_VERSION,
          kind: "deterministic-visual-game-receipt",
          gameId: candidate.gameId,
          attempts,
          terminal: candidate
        });
      }
    }
    attempts.push(attemptReceipt);
  }
  const error = new Error(`No Sim-Watch receipt after ${boundedAttempts} bounded runtime advances.`);
  error.code = "VISUAL_GAME_RECEIPT_UNAVAILABLE";
  error.receipt = Object.freeze({
    schemaVersion: VISUAL_GAME_RECEIPT_SCHEMA_VERSION,
    kind: "deterministic-visual-game-receipt-failure",
    attempts
  });
  throw error;
}
