/**
 * Season simulator (core). Plays a season the sport pack describes: the pack's
 * competition format builds the schedule and runs the postseason bracket
 * (src/sport/competitionContract.js), the pack's match engine plays every game
 * (src/sport/matchEngineContract.js), and this module applies results and
 * stats. Nothing here names a conference, a round or a seed.
 */
import { getSportRules } from "../sport/registry.js";
import { applyGameStats } from "../stats/applyGameStats.js";

// Standings live in ./standings.js (no registry import, so a pack can rank
// teams without a cycle back through here); re-exported for existing callers.
export { winPct, sortStandings, conferenceStandings, divisionStandings } from "./standings.js";

/**
 * Add one game's contribution to a season counter, treating a missing or
 * non-finite running total as zero so a single bad value cannot poison the rest
 * of the season. Non-finite contributions are dropped, not accumulated.
 */
function addSeasonCounter(season, key, delta) {
  const running = Number(season[key]);
  const add = Number(delta);
  season[key] = (Number.isFinite(running) ? running : 0) + (Number.isFinite(add) ? add : 0);
}

export function applyRegularSeasonResult(league, week, result) {
  const home = league.teams.find((t) => t.id === result.homeTeamId);
  const away = league.teams.find((t) => t.id === result.awayTeamId);
  if (!home || !away) return;

  // S71: accumulate through a finite guard. A season record that arrives from an
  // older save missing a counter would otherwise pin it at NaN for the whole
  // year, and every downstream reader takes these as `x || 0` — which launders
  // the NaN into a zero denominator instead of raising it.
  addSeasonCounter(home.season, "pointsFor", result.homeScore);
  addSeasonCounter(home.season, "pointsAgainst", result.awayScore);
  addSeasonCounter(home.season, "yardsFor", result.homeYards);
  addSeasonCounter(home.season, "yardsAgainst", result.awayYards);
  addSeasonCounter(home.season, "drivesFor", result.homeDrives);
  addSeasonCounter(home.season, "drivesAgainst", result.awayDrives);
  addSeasonCounter(home.season, "turnovers", result.homeTurnovers);
  addSeasonCounter(away.season, "pointsFor", result.awayScore);
  addSeasonCounter(away.season, "pointsAgainst", result.homeScore);
  addSeasonCounter(away.season, "yardsFor", result.awayYards);
  addSeasonCounter(away.season, "yardsAgainst", result.homeYards);
  addSeasonCounter(away.season, "drivesFor", result.awayDrives);
  addSeasonCounter(away.season, "drivesAgainst", result.homeDrives);
  addSeasonCounter(away.season, "turnovers", result.awayTurnovers);

  if (result.isTie) {
    home.season.ties += 1;
    away.season.ties += 1;
    home.season.weekResults.push({ week, opponent: away.id, result: "T", score: `${result.homeScore}-${result.awayScore}` });
    away.season.weekResults.push({ week, opponent: home.id, result: "T", score: `${result.awayScore}-${result.homeScore}` });
    return;
  }

  const homeWon = result.winnerId === home.id;
  if (homeWon) {
    home.season.wins += 1;
    away.season.losses += 1;
    home.season.weekResults.push({ week, opponent: away.id, result: "W", score: `${result.homeScore}-${result.awayScore}` });
    away.season.weekResults.push({ week, opponent: home.id, result: "L", score: `${result.awayScore}-${result.homeScore}` });
  } else {
    away.season.wins += 1;
    home.season.losses += 1;
    home.season.weekResults.push({ week, opponent: away.id, result: "L", score: `${result.homeScore}-${result.awayScore}` });
    away.season.weekResults.push({ week, opponent: home.id, result: "W", score: `${result.awayScore}-${result.homeScore}` });
  }
}

function competitionOf(league) {
  return getSportRules(league?.sportId).competition;
}

/** A fresh postseason bracket state for the league's sport (seeds are taken now). */
export function createPostseasonState({ league, year }) {
  return competitionOf(league).postseason.createState({ league, year });
}

/**
 * The next postseason game, or null when the bracket is complete. `league`
 * selects the sport; without it the state is read as football's (the default
 * sport), which is every save made before the multi-sport work.
 */
export function nextPostseasonGame(state = {}, league = null) {
  return competitionOf(league).postseason.nextGame(state);
}

/**
 * Plays the next postseason game: the pack names the matchup, its match engine
 * plays it, the core applies the stat records, and the pack records the result
 * in its bracket state.
 */
export function simulateNextPostseasonGame({ state, league, statBook, year, rng, mode = "drive" }) {
  const rules = getSportRules(league.sportId);
  const postseason = rules.competition.postseason;
  const next = postseason.nextGame(state);
  if (!next) return null;
  const match = rules.match.simulate({
    league,
    statBook,
    homeTeamId: next.homeTeamId,
    awayTeamId: next.awayTeamId,
    year,
    week: 0,
    rng,
    mode,
    allowTie: false,
    seasonType: "playoffs",
    label: postseason.gameLabel(next),
    neutralSite: Boolean(next.neutralSite)
  });
  applyGameStats(statBook, match);
  const winnerId = postseason.recordResult({ state, league, next, result: match.result });
  return { game: match.result, winnerId, conference: next.conference, round: next.round };
}

/** The finished postseason (standings, bracket, final, archive), or null while games remain. */
export function postseasonResultFromState(state, league = null) {
  return competitionOf(league).postseason.result(state);
}

export function runPlayoffsAndSuperBowl({ league, statBook, year, rng, mode = "drive" }) {
  const state = createPostseasonState({ league, year });
  while (state.status === "active") {
    // A state that claims to be active but names no game would otherwise spin forever.
    if (!simulateNextPostseasonGame({ state, league, statBook, year, rng, mode })) break;
  }
  return postseasonResultFromState(state, league);
}

export function simulateSeason({
  league,
  statBook,
  year,
  rng,
  previousDivisionRanks = null,
  mode = "drive"
}) {
  const schedule = getSportRules(league.sportId).competition.buildSchedule({ league, year, previousDivisionRanks, rng });

  let previousBlock = null;
  for (const weekBlock of schedule) {
    const rested = new Set(
      previousBlock
        ? league.teams
            .map((team) => team.id)
            .filter((teamId) =>
              !previousBlock.games.some(
                (game) => game.homeTeamId === teamId || game.awayTeamId === teamId
              )
            )
        : []
    );
    for (const matchup of weekBlock.games) {
      const match = getSportRules(league.sportId).match.simulate({
        league,
        statBook,
        homeTeamId: matchup.homeTeamId,
        awayTeamId: matchup.awayTeamId,
        year,
        rng,
        mode,
        allowTie: true,
        seasonType: "regular",
        homeRested: rested.has(matchup.homeTeamId),
        awayRested: rested.has(matchup.awayTeamId)
      });
      applyGameStats(statBook, match);
      applyRegularSeasonResult(league, weekBlock.week, match.result);
    }
    previousBlock = weekBlock;
  }

  const playoffResult = runPlayoffsAndSuperBowl({ league, statBook, year, rng, mode });

  return {
    year,
    standings: playoffResult.standings,
    superBowl: playoffResult.superBowl,
    divisionRanksForNextYear: playoffResult.divisionRanksForNextYear
  };
}
