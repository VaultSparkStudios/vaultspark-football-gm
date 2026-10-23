import { getSportRules } from "../sport/registry.js";
import { assertMatchReadiness } from "../sport/matchReadiness.js";
import { applyGameStats } from "../stats/applyGameStats.js";
import { applyRegularSeasonResult, conferenceStandings, sortStandings } from "./seasonSimulator.js";
import { recordPracticeWeekPay } from '../domain/practiceContracts.js';
import { previewCpuStandardElevations, applyCpuStandardElevations } from './cpuStandardElevations.js';

export function simulateRegularSeasonWeek({
  league,
  statBook,
  year,
  weekBlock,
  rng,
  mode = "drive",
  restedTeamIds = [],
  excludeElevationTeamIds = []
}) {
  const football = (league.sportId || 'football') === 'football';
  const elevations = { league, excludeTeamIds: excludeElevationTeamIds, games: weekBlock.games.map(game => ({ ...game,
    year, week: weekBlock.week, seasonType: 'regular' })) };
  const readyLeague = football ? previewCpuStandardElevations(elevations).league : league;
  assertMatchReadiness(getSportRules(league.sportId), { league: readyLeague,
    year,weekBlock,
    teamIds: weekBlock.games.flatMap(game => [game.homeTeamId, game.awayTeamId]) });
  const cpuElevations = football ? applyCpuStandardElevations(elevations) : [];
  const games = [];
  const activeTeams = new Set();
  const rested = restedTeamIds instanceof Set ? restedTeamIds : new Set(restedTeamIds);
  for (const matchup of weekBlock.games) {
    activeTeams.add(matchup.homeTeamId);
    activeTeams.add(matchup.awayTeamId);
    const match = getSportRules(league.sportId).match.simulate({
      league,
      statBook,
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      year,
      week: weekBlock.week,
      rng,
      mode,
      allowTie: true,
      seasonType: "regular",
      label: "regular-season",
      homeRested: rested.has(matchup.homeTeamId),
      awayRested: rested.has(matchup.awayTeamId)
    });
    // The engine returns stat records; the season's stat book is written here.
    applyGameStats(statBook, match);
    const game = match.result;
    applyRegularSeasonResult(league, weekBlock.week, game);
    getSportRules(league.sportId).match.afterGame?.({ league, result: game });
    games.push({
      week: weekBlock.week,
      ...game
    });
  }
  const practicePayroll=(league.sportId||'football')==='football'?recordPracticeWeekPay(league,{year,week:weekBlock.week}):[];
  // Conference tables come from the sport pack, as schedule and postseason
  // already do; a pack without conferences gets the overall table only.
  const conferences = getSportRules(league.sportId).structure?.conferences || [];
  return {
    cpuElevations,
    practicePayroll,
    week: weekBlock.week,
    games,
    byeTeams: league.teams.map((team) => team.id).filter((teamId) => !activeTeams.has(teamId)).sort(),
    standings: {
      ...Object.fromEntries(conferences.map((conference) => [
        conference,
        conferenceStandings(league, conference).map((team) => ({
          teamId: team.id,
          wins: team.season.wins,
          losses: team.season.losses,
          ties: team.season.ties
        }))
      ])),
      overall: sortStandings(league.teams).map((team) => ({
        teamId: team.id,
        wins: team.season.wins,
        losses: team.season.losses,
        ties: team.season.ties,
        pointsFor: team.season.pointsFor,
        pointsAgainst: team.season.pointsAgainst
      }))
    }
  };
}
