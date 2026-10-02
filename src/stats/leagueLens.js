/**
 * leagueLens.js — the league's weekly talking points (S113).
 *
 * Power rankings, award races and the record watch are read-only lenses over
 * state the simulation already produced: standings, team ratings, season stat
 * tables and the prior single-season bests. Nothing here draws from an RNG
 * stream or writes to the league, so adding the lens cannot move a single
 * simulated outcome. Ties break on team or player id so the same league always
 * prints the same list.
 *
 * Award scoring reuses GAME_IMPACT_WEIGHTS — the weights the season MVP ballot
 * already uses — so the "race" and the eventual ballot share one opinion of a
 * stat line instead of two that could disagree.
 */

import { GAME_IMPACT_WEIGHTS } from "./gameImpact.js";

export const LEAGUE_LENS_VERSION = 1;
export const REGULAR_SEASON_GAMES = 17;

const finite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round1 = (value) => Math.round(value * 10) / 10;
const byIdThen = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));

function recordText(row) {
  const ties = finite(row.ties);
  return `${finite(row.wins)}-${finite(row.losses)}${ties ? `-${ties}` : ""}`;
}

function gamesOf(row) {
  return finite(row.wins) + finite(row.losses) + finite(row.ties);
}

/**
 * Early in a season the rankings lean on roster strength; by week 8 results
 * carry them. The blend is continuous, so no single week causes a jump.
 */
export function powerScore(row, overallRating) {
  const games = gamesOf(row);
  const winPct = games ? (finite(row.wins) + finite(row.ties) * 0.5) / games : 0.5;
  const diffPerGame = games ? (finite(row.pf) - finite(row.pa)) / games : 0;
  const ovrScore = clamp((finite(overallRating, 70) - 60) * 2.5, 0, 100);
  const winScore = winPct * 100;
  const diffScore = clamp(50 + diffPerGame * 2.5, 0, 100);
  const resultWeight = Math.min(1, games / 8);
  const score = (1 - resultWeight) * ovrScore + resultWeight * (0.45 * winScore + 0.35 * diffScore + 0.2 * ovrScore);
  return { score: round1(score), games, winPct, diffPerGame };
}

function rankRows(rows, teamsById) {
  return rows
    .map((row) => {
      const team = teamsById.get(row.team) || {};
      return { row, team, ...powerScore(row, team.overallRating) };
    })
    .sort((a, b) => b.score - a.score || String(a.row.team).localeCompare(String(b.row.team)))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Undo the latest regular-season week so movement compares like with like. */
function previousStandings(standings, latestWeek) {
  const games = latestWeek?.seasonType === "regular" || latestWeek?.seasonType == null ? latestWeek?.games || [] : [];
  if (!games.length) return null;
  const rows = new Map(standings.map((row) => [row.team, { ...row }]));
  for (const game of games) {
    for (const [teamId, own, other] of [
      [game.homeTeamId, game.homeScore, game.awayScore],
      [game.awayTeamId, game.awayScore, game.homeScore]
    ]) {
      const row = rows.get(teamId);
      if (!row) continue;
      row.pf = finite(row.pf) - finite(own);
      row.pa = finite(row.pa) - finite(other);
      if (game.isTie) row.ties = Math.max(0, finite(row.ties) - 1);
      else if (game.winnerId === teamId) row.wins = Math.max(0, finite(row.wins) - 1);
      else row.losses = Math.max(0, finite(row.losses) - 1);
    }
  }
  return [...rows.values()];
}

function powerBlurb(entry) {
  const { games, diffPerGame, winPct, rank, move } = entry;
  if (games < 3) return "Ranked mostly on roster strength until results pile up";
  if (rank === 1) return diffPerGame > 0 ? `The team to beat · +${round1(diffPerGame)} points a game` : "The team to beat";
  if (move >= 3) return `Climbing · up ${move} after last week`;
  if (move <= -3) return `Sliding · down ${Math.abs(move)} after last week`;
  if (winPct >= 0.6 && diffPerGame < 3) return "Winning the close ones";
  if (winPct <= 0.4 && diffPerGame > 0) return "Better than the record says";
  const sign = diffPerGame >= 0 ? "+" : "−";
  return `${sign}${round1(Math.abs(diffPerGame))} points a game`;
}

export function buildPowerRankings({ standings = [], teams = [], latestWeek = null } = {}) {
  const rows = (standings || []).filter((row) => row && row.team);
  if (!rows.length) return [];
  const teamsById = new Map((teams || []).map((team) => [team.id, team]));
  const now = rankRows(rows, teamsById);
  const prior = previousStandings(rows, latestWeek);
  const priorRank = prior ? new Map(rankRows(prior, teamsById).map((entry) => [entry.row.team, entry.rank])) : new Map();
  return now.map((entry) => {
    const previousRank = priorRank.get(entry.row.team) ?? null;
    const move = previousRank == null ? 0 : previousRank - entry.rank;
    const result = {
      rank: entry.rank,
      previousRank,
      move,
      teamId: entry.row.team,
      teamName: entry.team.name || entry.row.teamName || entry.row.team,
      record: recordText(entry.row),
      score: entry.score,
      games: entry.games,
      winPct: round1(entry.winPct * 100) / 100,
      pointDiffPerGame: round1(entry.diffPerGame),
      overallRating: finite(entry.team.overallRating, null)
    };
    return { ...result, blurb: powerBlurb({ ...entry, move }) };
  });
}

function teamWinPct(standings) {
  const map = new Map();
  for (const row of standings || []) {
    const games = gamesOf(row);
    map.set(row.team, games ? (finite(row.wins) + finite(row.ties) * 0.5) / games : 0.5);
  }
  return map;
}

function raceFrom(entries, limit) {
  const sorted = entries
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.playerId ?? a.teamId).localeCompare(String(b.playerId ?? b.teamId)))
    .slice(0, limit);
  const leader = sorted[0]?.score || 0;
  return sorted.map((entry, index) => ({
    ...entry,
    place: index + 1,
    score: round1(entry.score),
    // Share of the leader's score — a standing, never a probability.
    shareOfLeader: leader ? Math.round((entry.score / leader) * 100) : 0
  }));
}

function statLine(categories) {
  const parts = [];
  if (categories.passing) parts.push(`${categories.passing.yds || 0} pass yds, ${categories.passing.td || 0} TD, ${categories.passing.int || 0} INT`);
  if (categories.rushing) parts.push(`${categories.rushing.yds || 0} rush yds, ${categories.rushing.td || 0} TD`);
  if (categories.receiving) parts.push(`${categories.receiving.yds || 0} rec yds, ${categories.receiving.td || 0} TD`);
  if (categories.defense) parts.push(`${categories.defense.tkl || 0} tkl, ${categories.defense.sacks || 0} sacks, ${categories.defense.int || 0} INT`);
  return parts.join(" · ");
}

export function buildAwardRaces({ leaders = {}, standings = [], teams = [], limit = 5 } = {}) {
  const winPct = teamWinPct(standings);
  const offense = new Map();
  for (const category of ["passing", "rushing", "receiving"]) {
    for (const row of leaders[category] || []) {
      if (!row?.playerId) continue;
      const entry = offense.get(row.playerId) || { playerId: row.playerId, player: row.player, pos: row.pos, teamId: row.tm, categories: {}, statScore: 0 };
      entry.categories[category] = row;
      entry.statScore += GAME_IMPACT_WEIGHTS[category](row);
      offense.set(row.playerId, entry);
    }
  }
  // Team success matters to MVP voters; it never touches the defensive award.
  const mvp = raceFrom([...offense.values()].map((entry) => ({
    playerId: entry.playerId,
    player: entry.player,
    pos: entry.pos,
    teamId: entry.teamId,
    score: entry.statScore * (0.75 + 0.5 * (winPct.get(entry.teamId) ?? 0.5)),
    line: statLine(entry.categories)
  })), limit);
  const dpoy = raceFrom((leaders.defense || []).filter((row) => row?.playerId).map((row) => ({
    playerId: row.playerId,
    player: row.player,
    pos: row.pos,
    teamId: row.tm,
    score: GAME_IMPACT_WEIGHTS.defense(row),
    line: statLine({ defense: row })
  })), limit);
  const ratings = (teams || []).map((team) => finite(team.overallRating, NaN)).filter(Number.isFinite);
  const meanOvr = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 75;
  const teamsById = new Map((teams || []).map((team) => [team.id, team]));
  const coach = raceFrom((standings || []).filter((row) => gamesOf(row) >= 3).map((row) => {
    const team = teamsById.get(row.team) || {};
    const expected = clamp(0.5 + (finite(team.overallRating, meanOvr) - meanOvr) * 0.03, 0.1, 0.9);
    const actual = winPct.get(row.team) ?? 0.5;
    return {
      teamId: row.team,
      teamName: team.name || row.teamName || row.team,
      coach: team.coaching?.headCoach?.name || team.staff?.headCoach?.name || null,
      score: (actual - expected) * 100,
      line: `${recordText(row)} · expected about ${Math.round(expected * gamesOf(row))} wins by now`
    };
  }), Math.min(limit, 3));
  return { mvp, dpoy, coachOfTheYear: coach };
}

export const RECORD_WATCH_STATS = Object.freeze([
  { id: "passingYards", label: "single-season passing yards", category: "passing", field: "yds" },
  { id: "passingTD", label: "single-season passing touchdowns", category: "passing", field: "td" },
  { id: "rushingYards", label: "single-season rushing yards", category: "rushing", field: "yds" },
  { id: "rushingTD", label: "single-season rushing touchdowns", category: "rushing", field: "td" },
  { id: "receivingYards", label: "single-season receiving yards", category: "receiving", field: "yds" },
  { id: "receivingTD", label: "single-season receiving touchdowns", category: "receiving", field: "td" },
  { id: "sacks", label: "single-season sacks", category: "defense", field: "sacks" },
  { id: "interceptions", label: "single-season interceptions", category: "defense", field: "int" }
]);

/**
 * Best prior regular-season line per watched stat, from completed seasons only.
 * `seasonTable(category, year)` returns the statBook season table for that year.
 */
export function buildSeasonRecordBook({ seasonTable, years = [] } = {}) {
  const book = {};
  for (const stat of RECORD_WATCH_STATS) book[stat.id] = null;
  for (const year of years) {
    const tables = {};
    for (const stat of RECORD_WATCH_STATS) {
      tables[stat.category] ||= seasonTable(stat.category, year) || [];
      for (const row of tables[stat.category]) {
        const value = finite(row[stat.field]);
        const best = book[stat.id];
        if (value > 0 && (!best || value > best.value)) {
          book[stat.id] = { value, player: row.player, playerId: row.playerId, year };
        }
      }
    }
  }
  return book;
}

export function buildRecordWatch({ leaders = {}, standings = [], recordBook = {}, minGames = 4 } = {}) {
  const teamGames = new Map((standings || []).map((row) => [row.team, gamesOf(row)]));
  const alerts = [];
  for (const stat of RECORD_WATCH_STATS) {
    const record = recordBook?.[stat.id];
    if (!record?.value) continue;
    const top = (leaders[stat.category] || [])
      .filter((row) => row?.playerId)
      .sort((a, b) => finite(b[stat.field]) - finite(a[stat.field]) || String(a.playerId).localeCompare(String(b.playerId)))[0];
    if (!top) continue;
    const games = teamGames.get(top.tm) || 0;
    const value = finite(top[stat.field]);
    if (games < minGames || value <= 0) continue;
    const pace = Math.round((value / games) * REGULAR_SEASON_GAMES);
    const status = value > record.value ? "broken" : pace >= record.value ? "on-pace" : null;
    if (!status) continue;
    alerts.push({
      statId: stat.id,
      label: stat.label,
      status,
      playerId: top.playerId,
      player: top.player,
      teamId: top.tm,
      value,
      pace,
      record: record.value,
      holder: record.player,
      recordYear: record.year
    });
  }
  return alerts.sort((a, b) => (a.status === b.status ? 0 : a.status === "broken" ? -1 : 1) || a.statId.localeCompare(b.statId));
}

export function buildLeagueLens({ standings = [], teams = [], latestWeek = null, leaders = {}, recordBook = {}, year = null, week = null } = {}) {
  return {
    version: LEAGUE_LENS_VERSION,
    year,
    week,
    powerRankings: buildPowerRankings({ standings, teams, latestWeek }),
    awardRaces: buildAwardRaces({ leaders, standings, teams }),
    recordWatch: buildRecordWatch({ leaders, standings, recordBook })
  };
}
