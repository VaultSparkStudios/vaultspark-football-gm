/**
 * gameImpact.js — one authority for "who won this game" (S63).
 *
 * The season-wrap MVP selection already scored every box-score row with a fixed
 * set of weights inline in GameSession. The press room needed the same answer for
 * its post-game quotes and had its own, broken attempt at it: it read
 * `game.playerStats[teamId]`, a shape the simulator has never produced (real stats
 * live at `game.boxScore.playerStats.{home,away}`, grouped by category), so its
 * top performer resolved to `null` on every game ever played and six of twelve
 * quote templates silently took their degraded branch.
 *
 * Rather than fix the press room with a second scoring opinion, both callers now
 * share this module. A game has one most-valuable performance; the podium and the
 * MVP ballot should never be able to disagree about who it was.
 */

/**
 * Per-category contribution to a single game's impact score.
 *
 * These are the weights the season MVP selection has always used — extracted
 * verbatim so this refactor changes no existing outcome.
 */
export const GAME_IMPACT_WEIGHTS = Object.freeze({
  passing: (row) => (row.yds || 0) / 25 + (row.td || 0) * 4 - (row.int || 0) * 2,
  rushing: (row) => (row.yds || 0) / 10 + (row.td || 0) * 6,
  receiving: (row) => (row.yds || 0) / 10 + (row.td || 0) * 6,
  defense: (row) =>
    (row.tkl || 0) * 0.45 + (row.sacks || 0) * 2 + (row.int || 0) * 3 + (row.pd || 0) * 0.75,
  kicking: (row) => (row.fgm || 0) * 1.5 + (row.xpm || 0) * 0.25
});

const SIDES = ["home", "away"];

/**
 * Score every player who appeared in a box score.
 *
 * @param {object} boxScore — the `boxScore` field of a simulated game
 * @returns {Map<string, {playerId: string, player: string, team: string, pos: string, score: number}>}
 */
export function scoreGamePerformances(boxScore) {
  const scores = new Map();
  if (!boxScore) return scores;

  const teamIdForSide = {
    home: boxScore.homeTeam?.teamId,
    away: boxScore.awayTeam?.teamId
  };

  for (const side of SIDES) {
    const groups = boxScore.playerStats?.[side];
    if (!groups) continue;
    for (const [category, weigh] of Object.entries(GAME_IMPACT_WEIGHTS)) {
      for (const row of groups[category] || []) {
        const current = scores.get(row.playerId) || {
          playerId: row.playerId,
          player: row.player,
          team: teamIdForSide[side],
          pos: row.pos,
          score: 0
        };
        current.score += weigh(row);
        scores.set(row.playerId, current);
      }
    }
  }
  return scores;
}

/**
 * The single highest-impact performance in a game, optionally restricted to one
 * team. Ties break on player id so replays stay byte-identical.
 *
 * @returns {{playerId: string, player: string, team: string, pos: string, score: number}|null}
 */
export function topGamePerformer(boxScore, { teamId = null } = {}) {
  const rows = [...scoreGamePerformances(boxScore).values()].filter(
    (row) => !teamId || row.team === teamId
  );
  if (!rows.length) return null;
  return rows.sort(
    (a, b) => b.score - a.score || String(a.playerId).localeCompare(String(b.playerId))
  )[0];
}
