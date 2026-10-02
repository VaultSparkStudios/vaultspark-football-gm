/**
 * teamLabel.js — the code a player sees for a club (S114).
 *
 * Team ids ("CAR") are save keys and never change; generated leagues give each
 * club a fictional `abbrev` built from its displayed city and mascot. Text the
 * engine writes for players (headlines, news) uses the abbrev so it matches the
 * name beside it. Leagues without an abbrev fall back to the id, as before.
 */
export function teamLabel(league, teamId) {
  if (!teamId) return "";
  const team = (league?.teams || []).find((row) => row.id === teamId);
  return team?.abbrev || teamId;
}
