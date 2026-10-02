// S114: a club's display code from team rows a pure module already holds (no DOM imports).
export function teamCodeFrom(teams, teamId) {
  if (!teamId) return "";
  const team = (teams || []).find((row) => row.id === teamId);
  return team?.abbrev || teamId;
}
