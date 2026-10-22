/**
 * Standings (core). Pure ordering of teams by record with head-to-head,
 * division, conference and points tiebreakers. No sport-pack imports, so a
 * pack's competition format can rank teams without importing the season
 * simulator (which reads the registry).
 */
export function winPct(team) {
  const games = team.season.wins + team.season.losses + team.season.ties;
  if (!games) return 0;
  return (team.season.wins + 0.5 * team.season.ties) / games;
}

function resultPoints(result) {
  if (result === "W") return 1;
  if (result === "T") return 0.5;
  return 0;
}

function recordPctFromEntries(entries) {
  if (!entries.length) return null;
  const points = entries.reduce((sum, entry) => sum + resultPoints(entry.result), 0);
  return points / entries.length;
}

function recordPctAgainstSet(team, opponentSet) {
  const entries = (team.season.weekResults || []).filter((entry) => opponentSet.has(entry.opponent));
  return recordPctFromEntries(entries);
}

function headToHeadPct(team, tieGroup) {
  const opponents = new Set(tieGroup.filter((entry) => entry.id !== team.id).map((entry) => entry.id));
  return recordPctAgainstSet(team, opponents);
}

function divisionPct(team, allTeams) {
  const opponents = new Set(
    allTeams
      .filter(
        (entry) => entry.id !== team.id && entry.conference === team.conference && entry.division === team.division
      )
      .map((entry) => entry.id)
  );
  return recordPctAgainstSet(team, opponents);
}

function conferencePct(team, allTeams) {
  const opponents = new Set(
    allTeams.filter((entry) => entry.id !== team.id && entry.conference === team.conference).map((entry) => entry.id)
  );
  return recordPctAgainstSet(team, opponents);
}

function pointDifferential(team) {
  return (team.season.pointsFor || 0) - (team.season.pointsAgainst || 0);
}

function compareNullableDesc(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function sortTieGroup(group, allTeams) {
  const sameDivision = group.every(
    (entry) => entry.conference === group[0].conference && entry.division === group[0].division
  );
  const sameConference = group.every((entry) => entry.conference === group[0].conference);

  return group.slice().sort((a, b) => {
    const h2hCmp = compareNullableDesc(headToHeadPct(a, group), headToHeadPct(b, group));
    if (h2hCmp !== 0) return h2hCmp;

    if (sameDivision) {
      const divCmp = compareNullableDesc(divisionPct(a, allTeams), divisionPct(b, allTeams));
      if (divCmp !== 0) return divCmp;
    }

    if (sameConference) {
      const confCmp = compareNullableDesc(conferencePct(a, allTeams), conferencePct(b, allTeams));
      if (confCmp !== 0) return confCmp;
    }

    return (
      pointDifferential(b) - pointDifferential(a) ||
      (b.season.pointsFor || 0) - (a.season.pointsFor || 0) ||
      b.overallRating - a.overallRating ||
      a.id.localeCompare(b.id)
    );
  });
}

export function sortStandings(teams) {
  const base = teams.slice().sort((a, b) => winPct(b) - winPct(a) || b.season.wins - a.season.wins);
  const ranked = [];
  let index = 0;

  while (index < base.length) {
    const currentPct = winPct(base[index]);
    let end = index + 1;
    while (end < base.length && Math.abs(winPct(base[end]) - currentPct) < 1e-9) end += 1;

    const tieGroup = base.slice(index, end);
    const resolved = tieGroup.length > 1 ? sortTieGroup(tieGroup, teams) : tieGroup;
    ranked.push(...resolved);
    index = end;
  }

  return ranked;
}

export function conferenceStandings(league, conference) {
  return sortStandings(league.teams.filter((t) => t.conference === conference));
}

export function divisionStandings(league, conference, division) {
  return sortStandings(league.teams.filter((t) => t.conference === conference && t.division === division));
}
