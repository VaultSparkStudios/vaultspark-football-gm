/**
 * Football's postseason format (multi-sport Phase 1 step 6): seven seeds per
 * conference (four division winners, three wild cards), a single-elimination
 * bracket per conference with the top seed resting through the wild-card
 * round and re-seeding after it, then a neutral-site final between the two
 * conference champions.
 *
 * This module owns the bracket state and decides who plays next; the core
 * (simulateNextPostseasonGame in src/engine/seasonSimulator.js) plays each game
 * through the pack's match engine and hands the result back to
 * `recordResult`. The state object is stored in saves (`postseasonState`), so
 * its stage ids and keys are fixed: the stage strings are built from the
 * conference names in the rules, which reproduces "AFC-wildcard" ...
 * "NFL-super-bowl" exactly. `superBowl` stays the data key for the final until
 * the dedicated rename-with-migration step.
 */
import { FOOTBALL_RULES } from "./rules.js";
import { conferenceStandings, divisionStandings, sortStandings } from "../../engine/standings.js";

export const POSTSEASON_STATE_SCHEMA_VERSION = "1.0";

const STRUCTURE = FOOTBALL_RULES.structure;
const CONFERENCES = STRUCTURE.conferences;
const LEAGUE_STAGE_PREFIX = "NFL";
const CONFERENCE_ROUNDS = Object.freeze(["wildcard", "divisional", "conference"]);
const FINAL_ROUND = "super-bowl";
const WILDCARD_PAIRINGS = Object.freeze([[2, 7], [3, 6], [4, 5]]);

const POSTSEASON_STAGE_ORDER = Object.freeze([
  ...CONFERENCES.flatMap((conference) => CONFERENCE_ROUNDS.map((round) => `${conference}-${round}`)),
  `${LEAGUE_STAGE_PREFIX}-${FINAL_ROUND}`
]);

/** The week number the UI shows for each postseason round (the regular season is weeks 1-18). */
export const FOOTBALL_POSTSEASON_ROUND_WEEKS = Object.freeze({ wildcard: 19, divisional: 20, conference: 21, "super-bowl": 22 });

export function getPlayoffSeeds(league, conference) {
  const divisions = [...new Set(league.teams.filter((t) => t.conference === conference).map((t) => t.division))];
  const divisionWinners = divisions.map((d) => divisionStandings(league, conference, d)[0]);
  const sortedDivisionWinners = sortStandings(divisionWinners);

  const nonWinners = league.teams.filter(
    (team) => team.conference === conference && !sortedDivisionWinners.some((w) => w.id === team.id)
  );
  const wildCards = sortStandings(nonWinners).slice(0, 3);
  const seeds = [...sortedDivisionWinners, ...wildCards].slice(0, STRUCTURE.playoffTeamsPerConference);
  seeds.forEach((team, index) => {
    team.playoffSeed = index + 1;
  });
  return seeds;
}

/** Seeds for every conference, `{ [conference]: [{ teamId, seed }] }`; sets `team.playoffSeed`. */
export function footballPlayoffSeeds(league) {
  return Object.fromEntries(CONFERENCES.map((conference) => [
    conference,
    getPlayoffSeeds(league, conference).map((team) => ({ teamId: team.id, seed: team.playoffSeed }))
  ]));
}

/** Each team's finishing place in its division, { teamId: rank }; seeds next year's standing-based games. */
export function buildDivisionRankMap(league) {
  const rankMap = {};
  for (const conference of CONFERENCES) {
    const divisions = [...new Set(league.teams.filter((t) => t.conference === conference).map((t) => t.division))];
    for (const division of divisions) {
      const ranked = divisionStandings(league, conference, division);
      ranked.forEach((team, index) => {
        rankMap[team.id] = index + 1;
      });
    }
  }
  return rankMap;
}

function bracketGameRow({ conference, round, higherSeedTeam, lowerSeedTeam, result }) {
  return {
    conference,
    round,
    gameId: result.gameId,
    homeTeamId: higherSeedTeam.id,
    awayTeamId: lowerSeedTeam.id,
    homeSeed: higherSeedTeam.playoffSeed,
    awaySeed: lowerSeedTeam.playoffSeed,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    winnerId: result.winnerId
  };
}

function lowestRemaining(seedTeams) {
  return seedTeams.slice().sort((a, b) => b.playoffSeed - a.playoffSeed)[0];
}

function teamForPostseason(league, teamId) {
  return league.teams.find((team) => team.id === teamId) || null;
}

function stagePrefix(stage) {
  return [...CONFERENCES, LEAGUE_STAGE_PREFIX].find((prefix) => stage.startsWith(`${prefix}-`)) || null;
}

function conferenceFromStage(stage) {
  const prefix = stagePrefix(stage);
  return prefix && prefix !== LEAGUE_STAGE_PREFIX ? prefix : LEAGUE_STAGE_PREFIX;
}

function roundFromStage(stage) {
  const prefix = stagePrefix(stage);
  return prefix ? stage.slice(prefix.length + 1) : stage;
}

function matchupIds(left, right) {
  return [left.id, right.id];
}

function buildWildcardMatchups(state, conference) {
  const bySeed = Object.fromEntries(state.seeds[conference].map((entry) => [entry.seed, entry.teamId]));
  return WILDCARD_PAIRINGS.map(([high, low]) => [bySeed[high], bySeed[low]]);
}

function buildDivisionalMatchups(state, league, conference) {
  const seedOneId = state.seeds[conference].find((entry) => entry.seed === 1).teamId;
  const survivors = [seedOneId, ...state.roundWinners];
  const topSeed = teamForPostseason(league, seedOneId);
  const opponentForTop = lowestRemaining(
    survivors.filter((teamId) => teamId !== seedOneId).map((teamId) => teamForPostseason(league, teamId))
  );
  const otherTwo = survivors
    .filter((teamId) => teamId !== seedOneId && teamId !== opponentForTop.id)
    .map((teamId) => teamForPostseason(league, teamId))
    .sort((a, b) => a.playoffSeed - b.playoffSeed);
  return [matchupIds(topSeed, opponentForTop), matchupIds(otherTwo[0], otherTwo[1])];
}

function buildConferenceMatchup(state, league) {
  const finalists = state.roundWinners
    .map((teamId) => teamForPostseason(league, teamId))
    .sort((a, b) => a.playoffSeed - b.playoffSeed);
  return [matchupIds(finalists[0], finalists[1])];
}

function advancePostseasonStage(state, league) {
  const currentStageIndex = POSTSEASON_STAGE_ORDER.indexOf(state.stage);
  const conference = conferenceFromStage(state.stage);
  const round = roundFromStage(state.stage);

  if (round === "conference") state.conferenceChampions[conference] = state.roundWinners[0];
  if (round === FINAL_ROUND) {
    state.stage = "complete";
    state.status = "completed";
    state.matchups = [];
    state.gameIndex = 0;
    state.roundWinners = [];
    state.standings = Object.fromEntries(CONFERENCES.map((name) => [
      name,
      conferenceStandings(league, name).map((team) => ({
        teamId: team.id,
        wins: team.season.wins,
        losses: team.season.losses,
        ties: team.season.ties
      }))
    ]));
    state.divisionRanksForNextYear = buildDivisionRankMap(league);
    return state;
  }

  state.stage = POSTSEASON_STAGE_ORDER[currentStageIndex + 1];
  state.gameIndex = 0;
  if (state.stage.endsWith("-wildcard")) {
    state.roundWinners = [];
    state.matchups = buildWildcardMatchups(state, conferenceFromStage(state.stage));
  } else if (state.stage.endsWith("-divisional")) {
    state.matchups = buildDivisionalMatchups(state, league, conferenceFromStage(state.stage));
    state.roundWinners = [];
  } else if (state.stage.endsWith("-conference")) {
    state.matchups = buildConferenceMatchup(state, league);
    state.roundWinners = [];
  } else {
    state.matchups = [CONFERENCES.map((name) => state.conferenceChampions[name])];
    state.roundWinners = [];
  }
  return state;
}

export function createPostseasonState({ league, year }) {
  const seeds = footballPlayoffSeeds(league);
  const emptyRounds = () => Object.fromEntries(CONFERENCE_ROUNDS.map((round) => [round, []]));
  const state = {
    schemaVersion: POSTSEASON_STATE_SCHEMA_VERSION,
    kind: "postseason-round-state",
    year,
    status: "active",
    stage: POSTSEASON_STAGE_ORDER[0],
    gameIndex: 0,
    seeds,
    matchups: [],
    roundWinners: [],
    conferenceChampions: Object.fromEntries(CONFERENCES.map((name) => [name, null])),
    bracket: {
      ...Object.fromEntries(CONFERENCES.map((name) => [name, emptyRounds()])),
      seeds,
      superBowl: null
    },
    superBowl: null,
    gameArchiveEntries: [],
    standings: null,
    divisionRanksForNextYear: null
  };
  state.matchups = buildWildcardMatchups(state, CONFERENCES[0]);
  return state;
}

export function nextPostseasonGame(state = {}) {
  if (state.status !== "active") return null;
  const matchup = state.matchups?.[state.gameIndex];
  if (!matchup) return null;
  const conference = conferenceFromStage(state.stage);
  const round = roundFromStage(state.stage);
  return {
    conference,
    round,
    homeTeamId: matchup[0],
    awayTeamId: matchup[1],
    neutralSite: round === FINAL_ROUND
  };
}

/** The match-engine label for a postseason game (it is part of the game id). */
export function postseasonGameLabel(next) {
  return next.round === FINAL_ROUND ? FINAL_ROUND : `${next.conference.toLowerCase()}-${next.round}`;
}

/**
 * Writes one played game into the bracket state and advances the stage when
 * the round is done. `next` is the `nextPostseasonGame(state)` the game was
 * played for; returns the winner's team id.
 */
export function recordPostseasonResult({ state, league, next, result }) {
  const higherSeedTeam = teamForPostseason(league, next.homeTeamId);
  const lowerSeedTeam = teamForPostseason(league, next.awayTeamId);
  const winner = result.winnerId === higherSeedTeam.id ? higherSeedTeam : lowerSeedTeam;
  if (next.round === FINAL_ROUND) {
    const runnerUp = winner.id === higherSeedTeam.id ? lowerSeedTeam : higherSeedTeam;
    state.bracket.superBowl = {
      homeTeamId: higherSeedTeam.id,
      awayTeamId: lowerSeedTeam.id,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winnerId: result.winnerId
    };
    state.superBowl = {
      homeTeamId: higherSeedTeam.id,
      awayTeamId: lowerSeedTeam.id,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      championTeamId: winner.id,
      runnerUpTeamId: runnerUp.id,
      gameId: result.gameId
    };
  } else {
    state.bracket[next.conference][next.round].push(bracketGameRow({
      conference: next.conference,
      round: next.round,
      higherSeedTeam,
      lowerSeedTeam,
      result
    }));
  }

  state.gameArchiveEntries.push({ conference: next.conference, round: next.round, ...result });
  state.roundWinners.push(winner.id);
  state.gameIndex += 1;
  if (state.gameIndex >= state.matchups.length) advancePostseasonStage(state, league);
  return winner.id;
}

export function postseasonResultFromState(state) {
  if (state?.status !== "completed") return null;
  return {
    standings: state.standings,
    bracket: state.bracket,
    superBowl: state.superBowl,
    gameArchiveEntries: state.gameArchiveEntries,
    divisionRanksForNextYear: state.divisionRanksForNextYear
  };
}

export const FOOTBALL_POSTSEASON = Object.freeze({
  seeds: footballPlayoffSeeds,
  createState: createPostseasonState,
  nextGame: nextPostseasonGame,
  gameLabel: postseasonGameLabel,
  recordResult: recordPostseasonResult,
  result: postseasonResultFromState,
  roundWeeks: FOOTBALL_POSTSEASON_ROUND_WEEKS
});
