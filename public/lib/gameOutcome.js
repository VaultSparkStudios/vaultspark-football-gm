/**
 * One transport-neutral authority for a completed game's result.
 *
 * `won === false` is not enough information: it represents both a loss and a
 * tie in several legacy browser/runtime shapes. Score comparison is therefore
 * authoritative whenever scores exist, with explicit result/isTie fields as
 * migration fallbacks for older call sites.
 */

export const GAME_RESULTS = Object.freeze({
  WIN: "win",
  LOSS: "loss",
  TIE: "tie",
  UNKNOWN: "unknown"
});

const KNOWN_RESULTS = new Set(Object.values(GAME_RESULTS));

export function gameResultFromScores(teamScore, opponentScore) {
  const mine = Number(teamScore);
  const theirs = Number(opponentScore);
  if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return GAME_RESULTS.UNKNOWN;
  if (mine === theirs) return GAME_RESULTS.TIE;
  return mine > theirs ? GAME_RESULTS.WIN : GAME_RESULTS.LOSS;
}

export function normalizeGameResult(value = {}) {
  if (typeof value === "string" && KNOWN_RESULTS.has(value)) return value;
  const direct = String(value?.result || "").toLowerCase();
  if (KNOWN_RESULTS.has(direct)) return direct;
  const fromScores = gameResultFromScores(
    value?.teamScore ?? value?.myScore,
    value?.oppScore ?? value?.opponentScore ?? value?.theirScore
  );
  if (fromScores !== GAME_RESULTS.UNKNOWN) return fromScores;
  if (value?.isTie === true || value?.tied === true) return GAME_RESULTS.TIE;
  if (value?.won === true || value?.isWin === true) return GAME_RESULTS.WIN;
  if (value?.won === false || value?.isWin === false) return GAME_RESULTS.LOSS;
  return GAME_RESULTS.UNKNOWN;
}

export function gameResultLabel(result) {
  const normalized = normalizeGameResult(result);
  if (normalized === GAME_RESULTS.WIN) return "Win";
  if (normalized === GAME_RESULTS.LOSS) return "Loss";
  if (normalized === GAME_RESULTS.TIE) return "Tie";
  return "Result";
}

export function gameResultTone(result) {
  const normalized = normalizeGameResult(result);
  if (normalized === GAME_RESULTS.WIN) return "win";
  if (normalized === GAME_RESULTS.LOSS) return "loss";
  return "neutral";
}
