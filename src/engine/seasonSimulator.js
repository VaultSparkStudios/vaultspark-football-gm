/**
 * Season simulator (core). Plays a season the sport pack describes: the pack's
 * competition format builds the schedule and runs the postseason bracket
 * (src/sport/competitionContract.js), the pack's match engine plays every game
 * (src/sport/matchEngineContract.js), and this module applies results and
 * stats. Nothing here names a conference, a round or a seed.
 */
import { getSportRules } from "../sport/registry.js";
import { assertMatchReadiness } from "../sport/matchReadiness.js";
import { applyGameStats } from "../stats/applyGameStats.js";
import { recordPracticePostseasonPay, validateSnapshotPracticeContracts } from '../domain/practiceContracts.js';
import { previewPostseasonGameRecovery, applyPostseasonGameRecovery, finishPostseasonRecovery, previewPostseasonCompletionRecovery, commitPostseasonInjuryAccrual } from '../domain/postseasonMedicalClock.js';
import { previewCpuStandardElevations, applyCpuStandardElevations } from './cpuStandardElevations.js';
import { simulateRegularSeasonWeek } from './weeklySimulator.js';
import { previewRegularMedicalRecovery, applyRegularMedicalRecovery } from '../domain/regularMedicalRecovery.js';
import { previewAdmittedRegularAccrual,commitAdmittedRegularAccrual } from '../domain/admittedInjuryPayroll.js';
import { recordAdmittedPensionGameService } from '../domain/pensionService.js';
import { previewRegularInjuryAccrual, commitRegularInjuryAccrual } from '../domain/regularInjuryAccrual.js';
import { teamRecoveryModifiers } from './injurySystem.js';

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
export function simulateNextPostseasonGame({ state, league, statBook, year, rng, mode = "drive", getTeamModifiers, onRecovered, excludeElevationTeamIds = [] }) {
  const rules = getSportRules(league.sportId);
  const postseason = rules.competition.postseason;
  const next = postseason.nextGame(state);
  if (!next) return null;
  const football=(league.sportId||'football')==='football';
  let practiceTeamIds;
  const injuryAccrual = [];
  if(football) {
    validateSnapshotPracticeContracts({league});
    practiceTeamIds=next.round==='wildcard' ? state.seeds[next.conference].map(row=>row.teamId)
      : next.round==='super-bowl' ? [next.homeTeamId,next.awayTeamId]
      : [...new Set(state.matchups.flat())];
    if(practiceTeamIds.some(id=>!league.teams.some(team=>team.id===id))) throw new TypeError('Invalid postseason practice payroll club');
    const recovery = { state, league, next, year, getTeamModifiers };
    const recovered = previewPostseasonGameRecovery({...recovery,onInjuryAccrualPreview:receipts=>injuryAccrual.push(...receipts)});
    const label = postseason.gameLabel(next);
    const elevationGame = { ...next, year, week: 0, label, seasonType: 'playoffs' };
    const preview = previewCpuStandardElevations({ league: recovered, games: [elevationGame], excludeTeamIds: excludeElevationTeamIds }).league;
    assertMatchReadiness(rules, { league: preview, teamIds: [next.homeTeamId, next.awayTeamId], postseasonState: state,
      game: { ...next, year, week: 0, label, seasonType: 'playoffs',
        gameId: `${year}-playoffs-${label}-0-${next.awayTeamId}-${next.homeTeamId}` } });
    previewPostseasonCompletionRecovery(recovery);
    applyPostseasonGameRecovery({ ...recovery, onRecovered, onPeriod: ({ week, teamIds }) => {
      // Preserve prep-week continuation before the final's second recovery
      // step can close an entitlement. Normal round pay follows applied play.
      if (week === 22 && state.practicePayrollVersion === 'postseason-practice-weeks-v1')
        recordPracticePostseasonPay(league, { year, week, teamIds });
    } });
    applyCpuStandardElevations({ league, games: [elevationGame], excludeTeamIds: excludeElevationTeamIds });
  }
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
    postseasonState:state,
    label: postseason.gameLabel(next),
    neutralSite: Boolean(next.neutralSite)
  });
  applyGameStats(statBook, match);
  rules.match.afterGame?.({ league, result: match.result,postseasonState:state });
  if (football) recordAdmittedPensionGameService({ league, result: match.result });
  const winnerId = postseason.recordResult({ state, league, next, result: match.result });
  if(football) {
    // A conference's entire surviving round population earns that week's pay,
    // including its wildcard bye. Repeated individual games deduplicate on
    // each contract. Pay only after the game is successfully applied.
    const payrollWeek={wildcard:19,divisional:20,conference:21,'super-bowl':23}[next.round];
    if(next.round==='super-bowl'&&state.practicePayrollVersion==='postseason-practice-weeks-v1')
      recordPracticePostseasonPay(league,{year,week:22,teamIds:practiceTeamIds});
    recordPracticePostseasonPay(league,{year,week:payrollWeek,teamIds:practiceTeamIds});
    commitPostseasonInjuryAccrual({league,year,receipts:injuryAccrual});
    if (state.status === 'completed') finishPostseasonRecovery({ state, league, year, getTeamModifiers, onRecovered });
  }
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

// The headless path owns elapsed medical time; the interactive path already
// applies it during maintenance before calling the shared weekly simulator.
export function simulateHeadlessRegularSeasonWeek({league,statBook,year,weekBlock,rng,mode='drive',restedTeamIds=[]}) {
  const medical=(league.sportId||'football')==='football'&&year>=2023;
  const getTeamModifiers=teamId=>teamRecoveryModifiers(league.teams.find(team=>team.id===teamId));
  const options={year,week:weekBlock.week,getTeamModifiers};
  const receipts=medical?previewRegularInjuryAccrual(league,options):[];
  const admittedReceipts=medical?previewAdmittedRegularAccrual(league,options):[];
  if(medical) {
    const recovered=previewRegularMedicalRecovery(league,options).planned;
    const ready=previewCpuStandardElevations({league:recovered,games:weekBlock.games.map(game=>({...game,year,week:weekBlock.week,seasonType:'regular'}))}).league;
    assertMatchReadiness(getSportRules(league.sportId),{league:ready,year,weekBlock,
      teamIds:weekBlock.games.flatMap(game=>[game.homeTeamId,game.awayTeamId])});
    applyRegularMedicalRecovery(league,{...options,deferAdmittedPay:true});
  }
  const result=simulateRegularSeasonWeek({league,statBook,year,weekBlock,rng,mode,restedTeamIds});
  if(medical)commitRegularInjuryAccrual(league,{year,week:weekBlock.week,receipts});
  if(medical)commitAdmittedRegularAccrual(league,{year,week:weekBlock.week,receipts:admittedReceipts});
  if(medical)for(const game of result.games)recordAdmittedPensionGameService({league,result:game});
  return result;
}

export function simulateSeason({
  league,
  statBook,
  year,
  rng,
  previousDivisionRanks = null,
  mode = "drive"
}) {
  // Validate medical/source authority before schedule construction consumes RNG.
  if((league.sportId||'football')==='football'&&year>=2023) {
    previewRegularInjuryAccrual(league,{year,week:1});
    previewRegularMedicalRecovery(league,{year,week:1});
  }
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
    simulateHeadlessRegularSeasonWeek({league,statBook,year,weekBlock,rng,mode,restedTeamIds:rested});
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
