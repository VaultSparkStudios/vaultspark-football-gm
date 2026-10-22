// One browser-side authority for locating, formatting, and comparing team records.
// Ties are first-class franchise truth: omit the third column only when it is zero.

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function teamKeys(team) {
  if (team == null) return [];
  if (typeof team === "string") return [team];
  return [team.id, team.teamId, team.abbrev, team.abbreviation, team.name].filter(Boolean);
}

export function findTeamStanding(standings, team) {
  const keys = new Set(teamKeys(team).map(String));
  if (!keys.size) return null;
  return (Array.isArray(standings) ? standings : []).find((row) => {
    const rowKeys = [row?.teamId, row?.teamName, ...teamKeys(row?.team)].filter(Boolean).map(String);
    return rowKeys.some((key) => keys.has(key));
  }) || null;
}

export function normalizeTeamRecord(row) {
  return {
    wins: finiteCount(row?.wins),
    losses: finiteCount(row?.losses),
    ties: finiteCount(row?.ties)
  };
}

export function formatTeamRecord(row, { separator = "–", empty = "—" } = {}) {
  if (!row) return empty;
  const { wins, losses, ties } = normalizeTeamRecord(row);
  return ties > 0
    ? `${wins}${separator}${losses}${separator}${ties}`
    : `${wins}${separator}${losses}`;
}

export function teamRecordWinPct(row, { empty = 0.5 } = {}) {
  const { wins, losses, ties } = normalizeTeamRecord(row);
  const games = wins + losses + ties;
  return games > 0 ? (wins + (ties * 0.5)) / games : empty;
}

export function diffTeamRecord(current, prior) {
  const next = normalizeTeamRecord(current);
  const previous = normalizeTeamRecord(prior);
  return {
    wins: next.wins - previous.wins,
    losses: next.losses - previous.losses,
    ties: next.ties - previous.ties
  };
}
