/**
 * Football's regular-season schedule (the NFL formula): division home-and-away,
 * same-conference and inter-conference rotations, standing-based games, then a
 * week packer. Reached through FOOTBALL_PACK.competition.buildSchedule
 * (src/sport/football/competition.js); the core never imports this file.
 */
import { FOOTBALL_RULES } from "../sport/football/rules.js";
import { validateSchedule } from "../sport/competitionContract.js";

const STRUCTURE = FOOTBALL_RULES.structure;

// Published 2026 byes occupy weeks5–14, excluding Thanksgiving week12.
// Other generated modern-format seasons use a fictional5–14 template; these
// are not claimed to reproduce unpublished future or historical NFL calendars.
export function allowedByeWeeks(year) {
  return Array.from({ length: 10 }, (_, i) => i + 5).filter(week => year !== 2026 || week !== 12);
}

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
  if ((teamGameCounts.get(home) || 0) >= STRUCTURE.gamesPerTeam) return false;
  if ((teamGameCounts.get(away) || 0) >= STRUCTURE.gamesPerTeam) return false;

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

  // The formula pairs exactly two conferences; the first plays "home side" of
  // every inter-conference rotation. Names come from the rules, in their order.
  const conferences = STRUCTURE.conferences;
  const [firstConference, secondConference] = conferences;
  const divisionsByConference = Object.fromEntries(
    conferences.map((conference) => [conference, listDivisionsForConference(league, conference)])
  );

  for (const conference of conferences) {
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
  const sameConferencePartner = Object.fromEntries(conferences.map((conference) => [conference, {}]));

  for (const conference of conferences) {
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

  const interConferenceOffset = year % divisionsByConference[secondConference].length;
  const interConferenceRotation = {};
  for (let index = 0; index < divisionsByConference[firstConference].length; index += 1) {
    interConferenceRotation[index] = (index + interConferenceOffset) % divisionsByConference[secondConference].length;
    const firstTeams = teamsInDivision(league, firstConference, divisionsByConference[firstConference][index]);
    const secondTeams = teamsInDivision(league, secondConference, divisionsByConference[secondConference][interConferenceRotation[index]]);
    for (const firstTeam of firstTeams) {
      for (const secondTeam of secondTeams) {
        const [home, away] = fairHomeAway(firstTeam.id, secondTeam.id, homeCounts, awayCounts, rng);
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

  for (const conference of conferences) {
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
  for (let divisionIndex = 0; divisionIndex < divisionsByConference[firstConference].length; divisionIndex += 1) {
    const firstDivision = divisionsByConference[firstConference][divisionIndex];
    const targetSecondDivision = divisionsByConference[secondConference][
      (divisionIndex + interConferenceOffset + interConferenceStandingOffset) % divisionsByConference[secondConference].length
    ];
    const firstTeams = teamsInDivision(league, firstConference, firstDivision);
    const secondTeams = teamsInDivision(league, secondConference, targetSecondDivision);
    for (let rank = 1; rank <= 4; rank += 1) {
      const firstTeam = firstTeams.find((entry) => (ranks[entry.id] || 2) === rank) || firstTeams[rank - 1];
      const secondTeam = secondTeams.find((entry) => (ranks[entry.id] || 2) === rank) || secondTeams[rank - 1];
      const [home, away] = fairHomeAway(firstTeam.id, secondTeam.id, homeCounts, awayCounts, rng);
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

// Each formula group is regular and decomposes into perfect matchings:
// division K4 groups give three rounds; rotation K4,4 groups give four;
// remaining standing games give two or one. No opponent is manufactured.
function takePerfectMatching(games, teamIds) {
  const adjacency=new Map(teamIds.map(id=>[id,[]]));
  for(const game of games) {
    adjacency.get(game.homeTeamId).push(game);
    adjacency.get(game.awayTeamId).push(game);
  }
  const visit=(remaining,chosen)=>{
    if(!remaining.size) return chosen;
    let options=null;
    for(const id of remaining) {
      const available=adjacency.get(id).filter(g=>remaining.has(g.homeTeamId)&&remaining.has(g.awayTeamId));
      if(!available.length) return null;
      if(!options||available.length<options.length) options=available;
    }
    for(const game of options) {
      const next=new Set(remaining);
      next.delete(game.homeTeamId);next.delete(game.awayTeamId);
      const result=visit(next,[...chosen,game]);
      if(result) return result;
    }
    return null;
  };
  return visit(new Set(teamIds),[]);
}

function packMatchups(rawGames, league, rng) {
  const teamIds=league.teams.map(t=>t.id), groups=new Map();
  for(const game of rng.shuffle(rawGames)) {
    if(!groups.has(game.tag)) groups.set(game.tag,[]);
    groups.get(game.tag).push(game);
  }
  const rounds=[];
  for(let games of groups.values()) {
    while(games.length) {
      const matching=takePerfectMatching(games,teamIds);
      if(!matching) throw new Error('Football matchup group cannot form a complete round');
      rounds.push(matching);
      const selected=new Set(matching);
      games=games.filter(g=>!selected.has(g));
    }
  }
  if(rounds.length!==STRUCTURE.gamesPerTeam) throw new Error('Football formula has an invalid round count');
  // Keep a complete division round for the finale. Start with an empty week17
  // and move alternating paths into it to distribute the legal midseason byes.
  const finaleIndex=rounds.findIndex(round=>round.every(g=>g.tag.startsWith('division-homeaway-')));
  if(finaleIndex<0) throw new Error('Football formula is missing a division finale');
  const finale=rounds.splice(finaleIndex,1)[0];
  const shuffled=rng.shuffle(rounds);
  const weeks=Array.from({length:STRUCTURE.regularSeasonWeeks},(_,i)=>({week:i+1,games:i<16?shuffled[i]:i===17?finale:[]}));
  const teamWeekUsage=new Map(teamIds.map(id=>[id,new Set()]));
  for(const week of weeks) for(const game of week.games) {
    teamWeekUsage.get(game.homeTeamId).add(week.week);
    teamWeekUsage.get(game.awayTeamId).add(week.week);
  }
  return {weeks,teamWeekUsage};
}

// Swapping all games in a two-week alternating path keeps opponents, venues
// and every player's one-game-per-week constraint. Only paths with both ends
// missing the forbidden week are swapped, so each move removes two bad byes
// without creating a new one. Cycles and paths ending in a legal bye stay put.
function repairByeWindow(weeks, league, usage, allowed) {
  const legal = new Set(allowed);
  for (;;) {
    const forbidden = weeks.filter(w => !legal.has(w.week) && w.games.length < league.teams.length / 2);
    if (!forbidden.length) return true;
    let changed = false;
    for (const bad of forbidden) {
      const candidates = weeks.filter(w => legal.has(w.week) && w.games.length > (league.teams.length - 6) / 2).sort((a,b) => b.games.length-a.games.length || a.week-b.week);
      for (const good of candidates) {
        const adjacency = new Map(league.teams.map(t => [t.id, []]));
        for (const game of [...bad.games, ...good.games]) {
          adjacency.get(game.homeTeamId).push(game);
          adjacency.get(game.awayTeamId).push(game);
        }
        for (const team of league.teams) {
          if (usage.get(team.id).has(bad.week)) continue;
          const visited = new Set(), edges = new Set(), queue = [team.id];
          for (let i=0;i<queue.length;i++) {
            const id=queue[i];
            if(visited.has(id)) continue;
            visited.add(id);
            for(const game of adjacency.get(id)) {
              edges.add(game);
              queue.push(game.homeTeamId===id?game.awayTeamId:game.homeTeamId);
            }
          }
          const missingBad=[...visited].filter(id=>!usage.get(id).has(bad.week)).length;
          const missingGood=[...visited].filter(id=>!usage.get(id).has(good.week)).length;
          if(missingBad<=missingGood) continue;
          const fromBad=bad.games.filter(g=>edges.has(g)), fromGood=good.games.filter(g=>edges.has(g));
          bad.games=[...bad.games.filter(g=>!edges.has(g)),...fromGood];
          good.games=[...good.games.filter(g=>!edges.has(g)),...fromBad];
          for(const id of visited) {
            for(const block of [bad,good]) {
              if(block.games.some(g=>g.homeTeamId===id||g.awayTeamId===id)) usage.get(id).add(block.week);
              else usage.get(id).delete(block.week);
            }
          }
          changed=true;
          break;
        }
        if(changed) break;
      }
      if(changed) break;
    }
    if(!changed) return false;
  }
}

/** Football competition: `{ league, year, previousDivisionRanks, rng }` -> `[{ week, games }]`. */
export function buildSeasonSchedule({ league, year, previousDivisionRanks, rng }) {
  const rawGames=buildMatchups(league,year,previousDivisionRanks,rng);
  const expected={teamIds:league.teams.map(t=>t.id),gamesPerTeam:STRUCTURE.gamesPerTeam,weeks:STRUCTURE.regularSeasonWeeks};
  const allowed=allowedByeWeeks(year);
  // Retry placement of the same matchups, never regenerate an opponent list or
  // silently return conflicts. Most schedules need only the first placement.
  for(let attempt=0;attempt<64;attempt++) {
    const {weeks,teamWeekUsage}=packMatchups(rawGames,league,rng);
    if(validateSchedule(weeks,expected).length) continue;
    if(!repairByeWindow(weeks,league,teamWeekUsage,allowed)) continue;
    if(!validateSchedule(weeks,expected).length) return weeks;
  }
  throw new Error('Unable to construct a conflict-free football schedule within the bye window');
}
