/**
 * Rivalry DNA — Cross-Season Matchup Memory
 *
 * Tracks the competitive history between every team pair in league.rivalries.
 * Heat (0–100) rises with close games and narrative events; falls with blowouts.
 * Chips appear on schedule rows and in the franchise story feed.
 *
 * Rivalry data shape (stored in league.rivalries[key]):
 *   { teams: [teamA, teamB], heat: 0-100, history: GameRecord[] }
 *
 * GameRecord: { year, week, winner, loser, homeTeamId, awayTeamId, homeScore, awayScore, margin }
 */

const MAX_HISTORY_PER_RIVALRY = 20;

function key(teamA, teamB) {
  return [teamA, teamB].sort().join("|");
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initRivalries(league) {
  if (!league.rivalries) league.rivalries = {};
}

// ── Record a game result ──────────────────────────────────────────────────────

export function recordGameResult(league, game, year, week) {
  initRivalries(league);
  const { homeTeamId, awayTeamId, homeScore, awayScore } = game;
  if (!homeTeamId || !awayTeamId) return;

  const rKey = key(homeTeamId, awayTeamId);
  if (!league.rivalries[rKey]) {
    league.rivalries[rKey] = {
      teams: [homeTeamId, awayTeamId].sort(),
      heat: 10,
      history: []
    };
  }

  const rv = league.rivalries[rKey];
  const margin = Math.abs((homeScore || 0) - (awayScore || 0));
  const winner = (homeScore || 0) >= (awayScore || 0) ? homeTeamId : awayTeamId;
  const loser  = winner === homeTeamId ? awayTeamId : homeTeamId;

  // Heat: close games warm rivalry; blowouts cool it
  const heatDelta = margin <= 3 ? 10 : margin <= 7 ? 6 : margin <= 14 ? 3 : margin <= 21 ? 0 : -3;
  rv.heat = Math.min(100, Math.max(0, rv.heat + heatDelta));

  rv.history.unshift({ year, week, winner, loser, homeTeamId, awayTeamId, homeScore: homeScore || 0, awayScore: awayScore || 0, margin });
  if (rv.history.length > MAX_HISTORY_PER_RIVALRY) rv.history.length = MAX_HISTORY_PER_RIVALRY;
}

// ── Boost heat from narrative events ─────────────────────────────────────────

export function boostRivalryHeat(league, teamA, teamB, delta = 15) {
  initRivalries(league);
  const rKey = key(teamA, teamB);
  if (!league.rivalries[rKey]) return;
  league.rivalries[rKey].heat = Math.min(100, Math.max(0, league.rivalries[rKey].heat + delta));
}

// ── Get rivalry context for UI ────────────────────────────────────────────────

export function getRivalryContext(league, teamA, teamB) {
  initRivalries(league);
  const rKey = key(teamA, teamB);
  const rv = league.rivalries?.[rKey];
  if (!rv || !rv.history.length) return null;

  const teamAWins = rv.history.filter((g) => g.winner === teamA).length;
  const teamBWins = rv.history.filter((g) => g.winner === teamB).length;
  const streak = _computeStreak(rv.history, teamA);

  return {
    heat: rv.heat,
    heatLabel:
      rv.heat >= 80 ? "Bitter Rivals" :
      rv.heat >= 60 ? "Heated Rivalry" :
      rv.heat >= 40 ? "Competitive"   : "Mild History",
    teamAWins,
    teamBWins,
    totalMeetings: rv.history.length,
    last5: rv.history.slice(0, 5),
    streak,
    mostRecentGame: rv.history[0] || null
  };
}

function _computeStreak(history, focusTeam) {
  if (!history.length) return { team: null, count: 0 };
  const streakTeam = history[0].winner;
  let count = 0;
  for (const g of history) {
    if (g.winner === streakTeam) count++;
    else break;
  }
  return { team: streakTeam, count };
}

// ── Top rivalries for a team ──────────────────────────────────────────────────

export function getTeamRivalries(league, teamId, limit = 5) {
  initRivalries(league);
  return Object.values(league.rivalries)
    .filter((rv) => rv.teams.includes(teamId) && rv.heat >= 25)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, limit)
    .map((rv) => ({
      opponentId: rv.teams.find((t) => t !== teamId),
      heat: rv.heat,
      heatLabel:
        rv.heat >= 80 ? "Bitter Rivals" :
        rv.heat >= 60 ? "Heated" : "Competitive",
      games: rv.history.length
    }));
}

// ── Batch record all games from a week result ─────────────────────────────────

export function recordWeekRivalries(league, weekResult, year) {
  if (!weekResult?.games) return;
  for (const game of weekResult.games) {
    recordGameResult(league, game, year, weekResult.week);
  }
}
