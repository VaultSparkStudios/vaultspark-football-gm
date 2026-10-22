/**
 * scoreline.js (browser) — read-side repair for stored championship scorelines.
 *
 * S71: builds before this one wrote the Super Bowl scoreline home-first (AFC
 * first) while publishing it beside champion/runner-up ids, so any title won by
 * an NFC club displayed as the champion losing. New seasons are written
 * winner-first by `src/stats/scoreline.js`; saves already on disk are not
 * rewritten. A championship is never a draw, so the champion's points are the
 * larger of the two and the orientation is recoverable from the stored string
 * itself — no save migration, no lost history.
 *
 * This mirrors `orientWinnerFirst` in `src/stats/scoreline.js`; the two are held
 * identical by `test/scoreline.test.js`, the same way the project holds its two
 * API runtimes to one contract.
 */

/**
 * @param {string} scoreline — a stored scoreline such as "10-48"
 * @returns {string} the same scoreline, winner's points first
 */
export function orientWinnerFirst(scoreline) {
  if (typeof scoreline !== "string") return "";
  const match = scoreline.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!match) return scoreline;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return first >= second ? `${first}-${second}` : `${second}-${first}`;
}
