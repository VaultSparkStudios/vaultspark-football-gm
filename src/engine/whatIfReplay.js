import { clamp } from "../utils/rng.js";

function hashString(value) {
  let hash = 2166136261;
  for (const ch of String(value || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sideFor(boxScore, teamId) {
  if (boxScore?.homeTeam?.teamId === teamId) return { mine: boxScore.homeTeam, opp: boxScore.awayTeam, home: true };
  if (boxScore?.awayTeam?.teamId === teamId) return { mine: boxScore.awayTeam, opp: boxScore.homeTeam, home: false };
  return null;
}

function chooseLever(boxScore, teamId) {
  const side = sideFor(boxScore, teamId);
  if (!side) return { key: "tempo", label: "Change the tempo", delta: 3 };
  const turnoverGap = Number(side.mine.turnovers || 0) - Number(side.opp.turnovers || 0);
  const thirdDowns = Math.max(1, Number(side.mine.thirdDowns || 0));
  const thirdRate = Number(side.mine.thirdDownConversions || 0) / thirdDowns;
  const passLean = Number(side.mine.passPlays || 0) / Math.max(1, Number(side.mine.passPlays || 0) + Number(side.mine.rushPlays || 0));

  if (turnoverGap > 0) return { key: "protect-ball", label: "Protect the ball", delta: clamp(turnoverGap * 4, 3, 10) };
  if (thirdRate < 0.38) return { key: "third-down-script", label: "Rewrite the third-down script", delta: 5 };
  if (passLean > 0.68) return { key: "run-balance", label: "Bleed the clock with a balanced plan", delta: 4 };
  return { key: "fourth-down-edge", label: "Trust the fourth-down edge", delta: 3 };
}

function painScore(game, boxScore, teamId) {
  const side = sideFor(boxScore, teamId);
  if (!side) return -1;
  const margin = Math.abs(Number(side.mine.score || 0) - Number(side.opp.score || 0));
  if (Number(side.mine.score || 0) >= Number(side.opp.score || 0)) return -1;
  const turnoverGap = Math.max(0, Number(side.mine.turnovers || 0) - Number(side.opp.turnovers || 0));
  const lateScore = (boxScore.scoringSummary || []).slice(-1)[0]?.teamId === side.opp.teamId ? 2 : 0;
  const closePain = Math.max(0, 12 - margin);
  return closePain + turnoverGap * 4 + lateScore + (game.seasonType === "playoffs" ? 8 : 0);
}

export function buildWhatIfReplay({ teamId, games = [], getBoxScore, seasonKey = "" } = {}) {
  const candidates = [];
  for (const game of games || []) {
    const boxScore = getBoxScore?.(game.gameId);
    if (!boxScore) continue;
    const score = painScore(game, boxScore, teamId);
    if (score >= 0) candidates.push({ game, boxScore, pain: score });
  }
  candidates.sort((a, b) => b.pain - a.pain || b.game.week - a.game.week);
  const picked = candidates[0];
  if (!picked) {
    return {
      available: false,
      reason: "No controlled-team loss is archived yet.",
      nonCanon: true
    };
  }

  const side = sideFor(picked.boxScore, teamId);
  const margin = Number(side.opp.score || 0) - Number(side.mine.score || 0);
  const lever = chooseLever(picked.boxScore, teamId);
  const variance = (hashString(`${seasonKey}:${picked.game.gameId}:${lever.key}`) % 5) - 2;
  const swing = clamp(lever.delta + variance, 1, 13);
  const replayScore = Number(side.mine.score || 0) + swing;
  const replayOppScore = Number(side.opp.score || 0) - (swing >= 7 ? 1 : 0);
  const flipped = replayScore > replayOppScore;

  return {
    available: true,
    nonCanon: true,
    gameId: picked.game.gameId,
    year: picked.game.year,
    week: picked.game.week,
    seasonType: picked.game.seasonType,
    opponentTeamId: side.opp.teamId,
    opponentName: side.home ? picked.boxScore.awayTeamName : picked.boxScore.homeTeamName,
    original: {
      teamScore: side.mine.score,
      opponentScore: side.opp.score,
      margin
    },
    lever,
    replay: {
      teamScore: replayScore,
      opponentScore: replayOppScore,
      swing,
      flipped
    },
    headline: flipped
      ? `Monday Morning QB finds a ${replayScore}-${replayOppScore} escape route.`
      : `Even the alternate timeline still lands ${replayScore}-${replayOppScore}.`,
    note: "Non-canon film-room replay. No standings, stats, records, saves, or injuries are changed."
  };
}