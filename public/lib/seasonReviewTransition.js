const SEASON_PLAY_PHASES = new Set(["regular-season", "postseason"]);
const SEASON_RECKONING_PHASES = new Set(["offseason", "season-awards"]);

/**
 * A season review belongs to an observed dashboard transition, never to an
 * initial page load. The caller's previous dashboard is the complete authority:
 * a second sentinel can only suppress a real first transition or double-count
 * state that is already represented here.
 */
export function isSeasonEndTransition(previous, current) {
  if (!previous || !current) return false;
  return SEASON_PLAY_PHASES.has(previous.phase) && SEASON_RECKONING_PHASES.has(current.phase);
}
