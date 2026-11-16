// S131 [questionable-status-visible] — one reading of player.injury for every
// lineup surface. The engine stores a Questionable tag as weeksRemaining 0: the
// injury does not keep the player out, and the tag clears at the next weekly
// recovery. Before this module the profile called that tag a recovered injury
// and the roster printed a bare "(0)".
//
// This describes the injury only. Suspension, reserve lists and game-day
// inactive are separate facts the caller must still show; the label never
// claims a player will play.
//
// weeksRemaining > 0 is recovery weeks still owed. In the regular season under
// the standard plan that equals the team games the player will miss (recovery
// elapses after each week's games, S131). The postseason clock and staff/rehab
// speed-ups can shorten it, so the label says weeks, not games.
export function injuryStatus(injury) {
  if (injury === null || injury === undefined || typeof injury !== "object") return null;
  const type = typeof injury.type === "string" && injury.type.trim() ? injury.type.trim() : "injury";
  const weeks = injury.weeksRemaining;
  if (typeof weeks === "number" && Number.isFinite(weeks) && weeks > 0) {
    const plural = weeks === 1 ? "" : "s";
    return { state: "out", type, weeks, short: `Out · ${weeks} wk${plural}`, label: `${type} · out ${weeks} week${plural}` };
  }
  if (weeks === 0 && type === "Questionable") {
    return { state: "questionable", type, weeks: 0, short: "Questionable", label: "Questionable · injury does not rule him out" };
  }
  if (weeks === 0) return { state: "recovered", type, weeks: 0, short: "Cleared", label: `${type} · cleared` };
  return { state: "unknown", type, weeks: null, short: "Status unknown", label: `${type} · recovery not established` };
}
