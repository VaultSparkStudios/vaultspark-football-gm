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

  const sameConferencePatterns = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]]
  ];
  const sameConferencePattern = sameConferencePatterns[year % sameConferencePatterns.length];
  const sameConferencePartner = { AFC: {}, NFC: {} };

  for (const conference of NFL_STRUCTURE.conferences) {
    const divisions = divisionsByConference[conference];
    for (const [leftIndex, rightIndex] of sameConferencePattern) {
      sameConferencePartner[conference][leftIndex] = rightIndex;
      sameConferencePartner[conference][rightIndex] = leftIndex;
      const leftTeams = teamsInDivision(league, conference, divisions[leftIndex]);
      const rightTeams = teamsInDivision(league, conference, divisions[rightIndex]);
      for (const left of leftTeams) {
        for (const right of rightTeams) {
          const [home, away] = fairHomeAway(left.id, right.id, homeCounts, awayCounts, rng);
          addMatchup({
            home,
            away,
            tag: "same-conference-rotation",
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

  const interConferenceOffset = year % divisionsByConference.NFC.length;
  const interConferenceRotation = {};
  for (let index = 0; index < divisionsByConference.AFC.length; index += 1) {
    interConferenceRotation[index] = (index + interConferenceOffset) % divisionsByConference.NFC.length;
    const afcTeams = teamsInDivision(league, "AFC", divisionsByConference.AFC[index]);
    const nfcTeams = teamsInDivision(league, "NFC", divisionsByConference.NFC[interConferenceRotation[index]]);
    for (const afcTeam of afcTeams) {
      for (const nfcTeam of nfcTeams) {
        const [home, away] = fairHomeAway(afcTeam.id, nfcTeam.id, homeCounts, awayCounts, rng);
        addMatchup({
          home,
          away,
          tag: "inter-conference-rotation",
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

  for (const conference of NFL_STRUCTURE.conferences) {
    const divisions = divisionsByConference[conference];
    for (let leftIndex = 0; leftIndex < divisions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < divisions.length; rightIndex += 1) {
        if (sameConferencePartner[conference][leftIndex] === rightIndex) continue;
        const leftTeams = teamsInDivision(league, conference, divisions[leftIndex]);
        const rightTeams = teamsInDivision(league, conference, divisions[rightIndex]);
        for (let rank = 1; rank <= 4; rank += 1) {
          const leftTeam = leftTeams.find((entry) => (ranks[entry.id] || 2) === rank) || leftTeams[rank - 1];
          const rightTeam = rightTeams.find((entry) => (ranks[entry.id] || 2) === rank) || rightTeams[rank - 1];
          const [home, away] = fairHomeAway(leftTeam.id, rightTeam.id, homeCounts, awayCounts, rng);
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

  const interConferenceStandingOffset = (year % 3) + 1;
  for (let divisionIndex = 0; divisionIndex < divisionsByConference.AFC.length; divisionIndex += 1) {
    const afcDivision = divisionsByConference.AFC[divisionIndex];
    const targetNfcDivision = divisionsByConference.NFC[
      (divisionIndex + interConferenceOffset + interConferenceStandingOffset) % divisionsByConference.NFC.length
    ];
    const afcTeams = teamsInDivision(league, "AFC", afcDivision);
    const nfcTeams = teamsInDivision(league, "NFC", targetNfcDivision);
    for (let rank = 1; rank <= 4; rank += 1) {
      const afcTeam = afcTeams.find((entry) => (ranks[entry.id] || 2) === rank) || afcTeams[rank - 1];
      const nfcTeam = nfcTeams.find((entry) => (ranks[entry.id] || 2) === rank) || nfcTeams[rank - 1];
      const [home, away] = fairHomeAway(afcTeam.id, nfcTeam.id, homeCounts, awayCounts, rng);
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

  return games;
}

function weekTeamGames(week, teamId) {
  return week.games.filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId);
}

function teamMissingWeeks(teamWeekUsage, totalWeeks, teamId) {
  const used = teamWeekUsage.get(teamId) || new Set();
  const missing = [];
  for (let week = 1; week <= totalWeeks; week += 1) {
    if (!used.has(week)) missing.push(week);
  }
  return missing;
}

function cloneScheduleState(weeks, teamWeekUsage) {
  return {
    weeks: weeks.map((week) => ({ week: week.week, games: [...week.games] })),
    usage: new Map([...teamWeekUsage.entries()].map(([teamId, weeksSet]) => [teamId, new Set(weeksSet)]))
  };
}

function stateWeek(state, weekNumber) {
  return state.weeks.find((week) => week.week === weekNumber) || null;
}

function stateHasTeamConflict(state, game, weekNumber) {
  const week = stateWeek(state, weekNumber);
  if (!week) return true;
  return week.games.some(
    (entry) =>
      [entry.homeTeamId, entry.awayTeamId].includes(game.homeTeamId)
      || [entry.homeTeamId, entry.awayTeamId].includes(game.awayTeamId)
  );
}

function stateRemoveGame(state, game, weekNumber) {
  const week = stateWeek(state, weekNumber);
  if (!week) return;
  week.games = week.games.filter((entry) => entry !== game);
  if (!week.games.some((entry) => entry.homeTeamId === game.homeTeamId || entry.awayTeamId === game.homeTeamId)) {
    state.usage.get(game.homeTeamId).delete(weekNumber);
  }
  if (!week.games.some((entry) => entry.homeTeamId === game.awayTeamId || entry.awayTeamId === game.awayTeamId)) {
    state.usage.get(game.awayTeamId).delete(weekNumber);
  }
}

function stateAddGame(state, game, weekNumber) {
  const week = stateWeek(state, weekNumber);
  if (!week) return;
  week.games.push(game);
  state.usage.get(game.homeTeamId).add(weekNumber);
  state.usage.get(game.awayTeamId).add(weekNumber);
}

function relocateInState(state, game, fromWeekNumber, targetWeekNumber, depth = 2, seen = new Set()) {
  const visitKey = `${game.homeTeamId}-${game.awayTeamId}-${fromWeekNumber}-${targetWeekNumber}`;
  if (seen.has(visitKey)) return null;
  const nextSeen = new Set(seen);
  nextSeen.add(visitKey);

  const working = cloneScheduleState(state.weeks, state.usage);
  stateRemoveGame(working, game, fromWeekNumber);
  if (!stateHasTeamConflict(working, game, targetWeekNumber)) {
    stateAddGame(working, game, targetWeekNumber);
    return working;
  }
  if (depth <= 0) return null;

  const target = stateWeek(working, targetWeekNumber);
  const conflicts = target.games.filter(
    (entry) =>
      [entry.homeTeamId, entry.awayTeamId].includes(game.homeTeamId)
      || [entry.homeTeamId, entry.awayTeamId].includes(game.awayTeamId)
  );

  for (const conflictGame of conflicts) {
    for (const altWeek of working.weeks) {
      if (altWeek.week === targetWeekNumber) continue;
      const moved = relocateInState(working, conflictGame, targetWeekNumber, altWeek.week, depth - 1, nextSeen);
      if (!moved) continue;
      if (!stateHasTeamConflict(moved, game, targetWeekNumber)) {
        stateAddGame(moved, game, targetWeekNumber);
        return moved;
      }
    }
  }
  return null;
}

function repairWeekConflicts(weeks, league, teamWeekUsage) {
  const weekByNumber = new Map(weeks.map((week) => [week.week, week]));
  let changed = true;
  let guard = 0;

  while (changed && guard < 300) {
    changed = false;
    guard += 1;
    for (const team of league.teams) {
      const missingWeeks = teamMissingWeeks(teamWeekUsage, NFL_STRUCTURE.regularSeasonWeeks, team.id);
      if (!missingWeeks.length) continue;
      const duplicateWeeks = weeks.filter((week) => weekTeamGames(week, team.id).length > 1);
      if (!duplicateWeeks.length) continue;

      for (const missingWeekNumber of missingWeeks) {
        const missingWeek = weekByNumber.get(missingWeekNumber);
        if (!missingWeek) continue;

        let repaired = false;
        for (const duplicateWeek of duplicateWeeks) {
          const duplicateGames = weekTeamGames(duplicateWeek, team.id);
          for (const game of duplicateGames) {
            const repairedState = relocateInState(
              { weeks, usage: teamWeekUsage },
              game,
              duplicateWeek.week,
              missingWeek.week,
              3
            );
            if (repairedState) {
              for (const week of weeks) {
                const nextWeek = stateWeek(repairedState, week.week);
                week.games = [...(nextWeek?.games || [])];
              }
              for (const [teamId, weeksSet] of repairedState.usage.entries()) {
                teamWeekUsage.set(teamId, new Set(weeksSet));
              }
              changed = true;
              repaired = true;
              break;
            }
            if (repaired) break;
          }
          if (repaired) break;
        }
      }
    }
  }
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
    const candidateWeeks = weeks.slice().sort((a, b) => a.games.length - b.games.length || a.week - b.week);
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
  repairWeekConflicts(weeks, league, teamWeekUsage);
  return weeks;
}
