import { NFL_STRUCTURE } from "../config.js";

function divisionKey(team) {
  return `${team.conference}-${team.division}`;
}

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

function buildDivisionRanks(league, previousDivisionRanks, rng) {
  if (previousDivisionRanks) return previousDivisionRanks;
  const ranks = {};
  const byDivision = new Map();
  for (const team of league.teams) {
    const key = divisionKey(team);
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key).push(team.id);
  }
  for (const teamIds of byDivision.values()) {
    const shuffled = rng.shuffle(teamIds);
    for (let i = 0; i < shuffled.length; i += 1) {
      ranks[shuffled[i]] = i + 1;
    }
  }
  return ranks;
}

function listDivisionsForConference(league, conference) {
  return [...new Set(league.teams.filter((t) => t.conference === conference).map((t) => t.division))];
}

function teamsInDivision(league, conference, division) {
  return league.teams.filter((t) => t.conference === conference && t.division === division);
}

function addMatchup({ home, away, tag, games, pairCounts, teamGameCounts, homeCounts, awayCounts, maxPair = 2 }) {
  if (home === away) return false;
  if ((teamGameCounts.get(home) || 0) >= NFL_STRUCTURE.gamesPerTeam) return false;
  if ((teamGameCounts.get(away) || 0) >= NFL_STRUCTURE.gamesPerTeam) return false;

  const key = pairKey(home, away);
  if ((pairCounts.get(key) || 0) >= maxPair) return false;

  games.push({ homeTeamId: home, awayTeamId: away, tag });
  pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  teamGameCounts.set(home, (teamGameCounts.get(home) || 0) + 1);
  teamGameCounts.set(away, (teamGameCounts.get(away) || 0) + 1);
  homeCounts.set(home, (homeCounts.get(home) || 0) + 1);
  awayCounts.set(away, (awayCounts.get(away) || 0) + 1);
  return true;
}

function fairHomeAway(teamA, teamB, homeCounts, awayCounts, rng) {
  const aHomeNeed = (awayCounts.get(teamA) || 0) - (homeCounts.get(teamA) || 0);
  const bHomeNeed = (awayCounts.get(teamB) || 0) - (homeCounts.get(teamB) || 0);
  if (aHomeNeed > bHomeNeed) return [teamA, teamB];
  if (bHomeNeed > aHomeNeed) return [teamB, teamA];
  return rng.chance(0.5) ? [teamA, teamB] : [teamB, teamA];
}

function buildMatchups(league, year, previousDivisionRanks, rng) {
  const games = [];
  const pairCounts = new Map();
  const teamGameCounts = new Map(league.teams.map((t) => [t.id, 0]));
  const homeCounts = new Map(league.teams.map((t) => [t.id, 0]));
  const awayCounts = new Map(league.teams.map((t) => [t.id, 0]));
  const ranks = buildDivisionRanks(league, previousDivisionRanks, rng);

  const divisionsByConference = {
    AFC: listDivisionsForConference(league, "AFC"),
    NFC: listDivisionsForConference(league, "NFC")
  };

  for (const conference of NFL_STRUCTURE.conferences) {
    for (const division of divisionsByConference[conference]) {
      const teams = teamsInDivision(league, conference, division);
      for (let i = 0; i < teams.length; i += 1) {
        for (let j = i + 1; j < teams.length; j += 1) {
          addMatchup({
            home: teams[i].id,
            away: teams[j].id,
            tag: "division-homeaway-a",
            games,
            pairCounts,
            teamGameCounts,
            homeCounts,
            awayCounts,
            maxPair: 2
          });
          addMatchup({
            home: teams[j].id,
            away: teams[i].id,
            tag: "division-homeaway-b",
            games,
            pairCounts,
            teamGameCounts,
            homeCounts,
            awayCounts,
            maxPair: 2
          });
        }
      }
    }
  }

  const yearOffset = year % 4;
  for (const conference of NFL_STRUCTURE.conferences) {
    const sameConferenceDivisions = divisionsByConference[conference];
    const otherConference = conference === "AFC" ? "NFC" : "AFC";
    const otherDivisions = divisionsByConference[otherConference];

    for (let index = 0; index < sameConferenceDivisions.length; index += 1) {
      const division = sameConferenceDivisions[index];
      const intraDivision = sameConferenceDivisions[(index + 1 + yearOffset) % sameConferenceDivisions.length];
      const interDivision = otherDivisions[(index + yearOffset) % otherDivisions.length];

      const teams = teamsInDivision(league, conference, division);
      const intraTeams = teamsInDivision(league, conference, intraDivision);
      const interTeams = teamsInDivision(league, otherConference, interDivision);

      for (const team of teams) {
        for (const opponent of intraTeams) {
          const [home, away] = fairHomeAway(team.id, opponent.id, homeCounts, awayCounts, rng);
          addMatchup({
            home,
            away,
            tag: "intra-division-rotation",
            games,
            pairCounts,
            teamGameCounts,
            homeCounts,
            awayCounts,
            maxPair: 1
          });
        }
        for (const opponent of interTeams) {
          const [home, away] = fairHomeAway(team.id, opponent.id, homeCounts, awayCounts, rng);
          addMatchup({
            home,
            away,
            tag: "inter-division-rotation",
            games,
            pairCounts,
            teamGameCounts,
            homeCounts,
            awayCounts,
            maxPair: 1
          });
        }
      }
    }
  }

  for (const conference of NFL_STRUCTURE.conferences) {
    const divisions = divisionsByConference[conference];
    for (let i = 0; i < divisions.length; i += 1) {
      const division = divisions[i];
      const other1 = divisions[(i + 1) % divisions.length];
      const other2 = divisions[(i + 2) % divisions.length];

      const teams = teamsInDivision(league, conference, division);
      const candidates1 = teamsInDivision(league, conference, other1);
      const candidates2 = teamsInDivision(league, conference, other2);

      for (const team of teams) {
        const rank = ranks[team.id] || 2;
        const opp1 = candidates1.find((c) => (ranks[c.id] || 2) === rank) || candidates1[0];
        const opp2 = candidates2.find((c) => (ranks[c.id] || 2) === rank) || candidates2[0];
        for (const opp of [opp1, opp2]) {
          const [home, away] = fairHomeAway(team.id, opp.id, homeCounts, awayCounts, rng);
          addMatchup({
            home,
            away,
            tag: "same-conference-standing",
            games,
            pairCounts,
            teamGameCounts,
            homeCounts,
            awayCounts,
            maxPair: 1
          });
        }
      }
    }
  }

  for (const conference of NFL_STRUCTURE.conferences) {
    const otherConference = conference === "AFC" ? "NFC" : "AFC";
    const divisions = divisionsByConference[conference];
    const otherDivisions = divisionsByConference[otherConference];
    for (let i = 0; i < divisions.length; i += 1) {
      const division = divisions[i];
      const targetOtherDivision = otherDivisions[(i + 2 + yearOffset) % otherDivisions.length];
      const teams = teamsInDivision(league, conference, division);
      const opponents = teamsInDivision(league, otherConference, targetOtherDivision);
      for (const team of teams) {
        const rank = ranks[team.id] || 2;
        const opp = opponents.find((c) => (ranks[c.id] || 2) === rank) || opponents[0];
        const [home, away] = fairHomeAway(team.id, opp.id, homeCounts, awayCounts, rng);
        addMatchup({
          home,
          away,
          tag: "inter-conference-standing",
          games,
          pairCounts,
          teamGameCounts,
          homeCounts,
          awayCounts,
          maxPair: 1
        });
      }
    }
  }

  while ([...teamGameCounts.values()].some((count) => count < NFL_STRUCTURE.gamesPerTeam)) {
    const underfilled = league.teams
      .slice()
      .sort((a, b) => (teamGameCounts.get(a.id) || 0) - (teamGameCounts.get(b.id) || 0))
      .find((team) => (teamGameCounts.get(team.id) || 0) < NFL_STRUCTURE.gamesPerTeam);
    if (!underfilled) break;

    const opponents = league.teams
      .filter((t) => t.id !== underfilled.id && (teamGameCounts.get(t.id) || 0) < NFL_STRUCTURE.gamesPerTeam)
      .sort((a, b) => (teamGameCounts.get(a.id) || 0) - (teamGameCounts.get(b.id) || 0));
    let filled = false;
    for (const opponent of opponents) {
      const [home, away] = fairHomeAway(underfilled.id, opponent.id, homeCounts, awayCounts, rng);
      if (
        addMatchup({
          home,
          away,
          tag: "balance-fill",
          games,
          pairCounts,
          teamGameCounts,
          homeCounts,
          awayCounts,
          maxPair: 2
        })
      ) {
        filled = true;
        break;
      }
    }
    if (!filled) break;
  }

  return games;
}

export function buildSeasonSchedule({ league, year, previousDivisionRanks, rng }) {
  const rawGames = buildMatchups(league, year, previousDivisionRanks, rng);
  const games = rng.shuffle(rawGames);
  const weeks = Array.from({ length: NFL_STRUCTURE.regularSeasonWeeks }, (_, index) => ({
    week: index + 1,
    games: []
  }));

  const teamWeekUsage = new Map(league.teams.map((t) => [t.id, new Set()]));
  for (const game of games) {
    let placed = false;
    const candidateWeeks = weeks.slice().sort((a, b) => a.games.length - b.games.length);
    for (const week of candidateWeeks) {
      const homeBusy = teamWeekUsage.get(game.homeTeamId).has(week.week);
      const awayBusy = teamWeekUsage.get(game.awayTeamId).has(week.week);
      if (homeBusy || awayBusy) continue;
      week.games.push(game);
      teamWeekUsage.get(game.homeTeamId).add(week.week);
      teamWeekUsage.get(game.awayTeamId).add(week.week);
      placed = true;
      break;
    }
    if (!placed) {
      const fallback = candidateWeeks[0];
      fallback.games.push(game);
      teamWeekUsage.get(game.homeTeamId).add(fallback.week);
      teamWeekUsage.get(game.awayTeamId).add(fallback.week);
    }
  }

  return weeks;
}
