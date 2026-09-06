const SEASON_PLAY_PHASES = new Set(["regular-season", "postseason"]);
const SEASON_RECKONING_PHASES = new Set(["offseason", "season-awards"]);

export function isSeasonEndTransition(previous, current) {
  if (!previous || !current) return false;
  return SEASON_PLAY_PHASES.has(previous.phase) && SEASON_RECKONING_PHASES.has(current.phase);
}
