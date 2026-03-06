import { simulateGame } from "./gameSimulator.js";
import { applyRegularSeasonResult, conferenceStandings, sortStandings } from "./seasonSimulator.js";

export function simulateRegularSeasonWeek({
  league,
  statBook,
  year,
  weekBlock,
  rng,
  mode = "drive"
}) {
  const games = [];
  for (const matchup of weekBlock.games) {
    const game = simulateGame({
      league,
      statBook,
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      year,
      rng,
      mode,
      allowTie: true
    });
    applyRegularSeasonResult(league, weekBlock.week, game);
    games.push({
      week: weekBlock.week,
      ...game
    });
  }
  return {
    week: weekBlock.week,
    games,
    standings: {
      AFC: conferenceStandings(league, "AFC").map((team) => ({
        teamId: team.id,
        wins: team.season.wins,
        losses: team.season.losses,
        ties: team.season.ties
      })),
      NFC: conferenceStandings(league, "NFC").map((team) => ({
        teamId: team.id,
        wins: team.season.wins,
        losses: team.season.losses,
        ties: team.season.ties
      })),
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
