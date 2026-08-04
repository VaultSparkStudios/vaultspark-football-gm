/**
 * scoreline.js — one authority for how a decided game's score is written down.
 *
 * S71: the championship scoreline was assembled at four separate sites as
 * `${homeScore}-${awayScore}`. In the Super Bowl `home` is always the AFC
 * champion and `away` always the NFC champion, and the string was then published
 * beside `championTeamId` / `runnerUpTeamId` as though it read champion-first.
 * Whenever an NFC club won, every surface that shows a title — the History tab,
 * the franchise newsletter, the shareable League Story Card, the transaction
 * feed, and the CLI summary — announced the champion losing its own final. Over
 * ten simulated seasons the champion's score was printed second in eight of them
 * ("NO def LAC 10-48").
 *
 * The Super Bowl is played at a neutral site (S62), so home/away carries no
 * meaning a player should ever see. A decided game is written winner-first.
 */

/**
 * The canonical scoreline for a decided game, winner's points first.
 *
 * @param {object} game — anything carrying home/away scores and team ids
 * @param {string|null} winnerTeamId — the club the scoreline should lead with
 * @returns {string} e.g. "48-10"
 */
export function decidedScoreline(game = {}, winnerTeamId = null) {
  const homeScore = Number(game.homeScore);
  const awayScore = Number(game.awayScore);
  const home = Number.isFinite(homeScore) ? homeScore : 0;
  const away = Number.isFinite(awayScore) ? awayScore : 0;

  // Prefer the explicit winner when we have one and can place it.
  if (winnerTeamId) {
    if (game.homeTeamId && winnerTeamId === game.homeTeamId) return `${home}-${away}`;
    if (game.awayTeamId && winnerTeamId === game.awayTeamId) return `${away}-${home}`;
  }
  // No usable identity: a decided game is still winner-first by its own scores.
  return home >= away ? `${home}-${away}` : `${away}-${home}`;
}

/**
 * The scoreline of a completed Super Bowl, champion's points first.
 *
 * @param {object} superBowl — `playoffResult.superBowl`
 * @returns {string}
 */
export function championScoreline(superBowl) {
  if (!superBowl) return "-";
  return decidedScoreline(superBowl, superBowl.championTeamId || superBowl.winnerId || null);
}

/**
 * Repair a stored scoreline that may have been written home-first by a build
 * before S71. A championship is never a draw, so the champion's points are the
 * larger of the two — which makes the orientation recoverable from the string
 * itself without touching save data.
 *
 * @param {string} scoreline — e.g. "10-48"
 * @returns {string} the same scoreline, winner-first
 */
export function orientWinnerFirst(scoreline) {
  if (typeof scoreline !== "string") return "";
  const match = scoreline.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!match) return scoreline;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return first >= second ? `${first}-${second}` : `${second}-${first}`;
}
