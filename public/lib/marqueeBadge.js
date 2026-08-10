/**
 * marqueeBadge.js — deterministic "primetime" flavor badge (S78).
 *
 * public/lib/simWatchDirector.js:33 already renders a rivalry-only "RIVALRY
 * WEEK" banner. Nothing equivalent exists for editorially notable games that
 * are *not* rivalries — two division leaders clashing, or two strong records
 * meeting late in the season. This module derives that badge purely from
 * existing standings state: no randomness, no fabricated broadcast/network
 * data, no false-positive spam when no signal qualifies.
 *
 * Usage: deriveMarqueeBadge(game, standings, week) -> { label, reason } | null
 */

const MIN_QUALIFYING_WEEK = 6;

function winPctOf(row) {
  if (typeof row.winPct === "number") return row.winPct;
  const games = (row.wins || 0) + (row.losses || 0) + (row.ties || 0);
  return games ? (row.wins || 0) / games : 0;
}

/** Deterministic comparator: better winPct first; ties broken by wins, then team code (alphabetical) so the result never depends on array/object iteration order. */
function compareStanding(a, b) {
  const pctDelta = winPctOf(b) - winPctOf(a);
  if (pctDelta !== 0) return pctDelta;
  const winsDelta = (b.wins || 0) - (a.wins || 0);
  if (winsDelta !== 0) return winsDelta;
  return String(a.team).localeCompare(String(b.team));
}

function divisionLeaders(standings) {
  const byDivision = new Map();
  for (const row of standings) {
    const key = `${row.conference || ""}::${row.division || ""}`;
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key).push(row);
  }
  const leaders = new Set();
  for (const rows of byDivision.values()) {
    const sorted = [...rows].sort(compareStanding);
    if (sorted[0]) leaders.add(sorted[0].team);
  }
  return leaders;
}

function conferenceTop4(standings) {
  const byConference = new Map();
  for (const row of standings) {
    const key = row.conference || "";
    if (!byConference.has(key)) byConference.set(key, []);
    byConference.get(key).push(row);
  }
  const top4 = new Set();
  for (const rows of byConference.values()) {
    const sorted = [...rows].sort(compareStanding);
    for (const row of sorted.slice(0, 4)) top4.add(row.team);
  }
  return top4;
}

/**
 * Derive a marquee-game badge for a single scheduled game.
 *
 * @param {{awayTeamId: string, homeTeamId: string}} game
 * @param {Array<object>} standings latestStandings rows (team, conference, division, wins, losses, ties, winPct)
 * @param {number} week the schedule week this game is being played in
 * @returns {{label: string, reason: string} | null}
 */
export function deriveMarqueeBadge(game, standings, week) {
  if (!game || !Array.isArray(standings) || !standings.length) return null;
  if (!Number.isFinite(week) || week < MIN_QUALIFYING_WEEK) return null;

  const awayRow = standings.find((r) => r.team === game.awayTeamId);
  const homeRow = standings.find((r) => r.team === game.homeTeamId);
  if (!awayRow || !homeRow) return null;

  const leaders = divisionLeaders(standings);
  const top4 = conferenceTop4(standings);

  const awayIsLeader = leaders.has(awayRow.team);
  const homeIsLeader = leaders.has(homeRow.team);
  const sameDivision = awayRow.conference === homeRow.conference && awayRow.division === homeRow.division;

  // Only one team can lead a given division, so "both leaders" can never be
  // true within the same division — a same-division marquee game instead
  // means a divisional rival taking on the team currently leading that
  // division (the divisional-race stakes that make it a "showdown").
  if (sameDivision && (awayIsLeader || homeIsLeader)) {
    return { label: "Division Showdown", reason: "A divisional rival is taking on the team currently leading their division." };
  }

  if (awayIsLeader && homeIsLeader) {
    return { label: "Playoff Preview", reason: "Both teams lead their divisions — a likely playoff-seeding preview." };
  }

  const awayIsTop4 = top4.has(awayRow.team);
  const homeIsTop4 = top4.has(homeRow.team);
  if (awayIsTop4 && homeIsTop4 && awayRow.conference === homeRow.conference) {
    return { label: "Statement Game", reason: "Two of the conference's top-4 records meet." };
  }

  return null;
}
