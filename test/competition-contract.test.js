import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { getSportRules, listSports, registerSport } from "../src/sport/registry.js";
import { FOOTBALL_COMPETITION } from "../src/sport/football/competition.js";
import { POSTSEASON_FUNCTIONS, validateCompetition, validateSchedule } from "../src/sport/competitionContract.js";
import { validateMatchOutput } from "../src/sport/matchEngineContract.js";
import {
  createPostseasonState,
  nextPostseasonGame,
  postseasonResultFromState,
  runPlayoffsAndSuperBowl,
  simulateNextPostseasonGame,
  simulateSeason,
  sortStandings
} from "../src/engine/seasonSimulator.js";

const restore = (session) => GameSession.fromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())), (seed) => new RNG(seed));
const football = getSportRules("football");

test("the football pack exposes competition.buildSchedule and every postseason function", () => {
  assert.equal(football.competition, FOOTBALL_COMPETITION);
  assert.deepEqual(validateCompetition(football.competition), []);
  for (const name of POSTSEASON_FUNCTIONS) assert.equal(typeof football.competition.postseason[name], "function", name);
  assert.deepEqual(football.competition.postseason.roundWeeks, { wildcard: 19, divisional: 20, conference: 21, "super-bowl": 22 });
});

test("a generated schedule gives every team gamesPerTeam games over regularSeasonWeeks weeks", () => {
  const { gamesPerTeam, regularSeasonWeeks } = football.structure;
  const session = new GameSession({ rng: new RNG(5150), startYear: 2026, controlledTeamId: "BUF" });
  const teamIds = session.league.teams.map((team) => team.id);
  assert.deepEqual(validateSchedule(session.seasonSchedule, { teamIds, gamesPerTeam, weeks: regularSeasonWeeks }), []);
  for (const year of [2027, 2028, 2029]) {
    const weeks = football.competition.buildSchedule({ league: session.league, year, previousDivisionRanks: null, rng: new RNG(year) });
    assert.deepEqual(validateSchedule(weeks, { teamIds, gamesPerTeam, weeks: regularSeasonWeeks }), [], `year ${year}`);
  }
});

test("playoff seeds are playoffTeamsPerConference per conference, numbered 1..n, from that conference", () => {
  const { conferences, playoffTeamsPerConference } = football.structure;
  const session = new GameSession({ rng: new RNG(77), startYear: 2026, controlledTeamId: "KC" });
  const seeds = football.competition.postseason.seeds(session.league);
  assert.deepEqual(Object.keys(seeds), conferences);
  for (const conference of conferences) {
    assert.equal(seeds[conference].length, playoffTeamsPerConference, conference);
    assert.deepEqual(seeds[conference].map((entry) => entry.seed), Array.from({ length: playoffTeamsPerConference }, (_, i) => i + 1));
    assert.equal(new Set(seeds[conference].map((entry) => entry.teamId)).size, playoffTeamsPerConference);
    for (const { teamId } of seeds[conference]) {
      assert.equal(session.league.teams.find((team) => team.id === teamId).conference, conference);
    }
  }
  const state = createPostseasonState({ league: session.league, year: 2026 });
  assert.deepEqual(state.seeds, seeds, "the bracket is built on the same seeds");
  assert.equal(state.stage, "AFC-wildcard", "stage ids are the strings saves already store");
});

test("the football postseason runs to one champion through the core calls", () => {
  const session = new GameSession({ rng: new RNG(31), startYear: 2026, controlledTeamId: "BUF" });
  const result = runPlayoffsAndSuperBowl({ league: session.league, statBook: session.statBook, year: 2026, rng: new RNG(32) });
  const { conferences, playoffTeamsPerConference } = football.structure;
  assert.equal(result.gameArchiveEntries.length, conferences.length * (playoffTeamsPerConference - 1) + 1);
  assert.ok(result.superBowl.championTeamId);
  assert.notEqual(result.superBowl.championTeamId, result.superBowl.runnerUpTeamId);
  assert.deepEqual(Object.keys(result.standings), conferences);
});

test("a restored session resolves the same competition", () => {
  const session = new GameSession({ rng: new RNG(9), startYear: 2026, controlledTeamId: "CHI" });
  const restored = restore(session);
  assert.equal(restored.sportRules.competition, session.sportRules.competition);
  assert.equal(restored.sportRules.competition, FOOTBALL_COMPETITION);
});

test("validateCompetition and validateSchedule catch malformed shapes", () => {
  assert.deepEqual(validateCompetition(null), ["competition is missing"]);
  const problems = validateCompetition({ buildSchedule: 1, postseason: { seeds() {}, roundWeeks: 3 } });
  assert.ok(problems.includes("competition.buildSchedule is not a function"));
  assert.ok(problems.includes("competition.postseason.nextGame is not a function"));
  assert.ok(problems.includes("competition.postseason.roundWeeks is not an object"));
  const bad = validateSchedule([{ week: 1, games: [{ homeTeamId: "A", awayTeamId: "B" }, { homeTeamId: "A", awayTeamId: "C" }] }], {
    teamIds: ["A", "B", "C"], gamesPerTeam: 1, weeks: 2
  });
  assert.ok(bad.includes("schedule has 1 weeks, expected 2"));
  assert.ok(bad.includes("A plays twice in week 1"));
  assert.ok(bad.includes("A plays 2 games, expected 1"));
});

// --- Pluggability proof: a toy sport whose competition is a single round robin
// and a top-two final, registered without editing any core file.

const TOY_ID = "toy-round-robin";
const TOY_TEAMS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];

function toySchedule({ league }) {
  // Circle method: n-1 rounds, every pair once.
  const ids = league.teams.map((team) => team.id);
  const rotating = ids.slice(1);
  const weeks = [];
  for (let round = 0; round < ids.length - 1; round += 1) {
    const order = [ids[0], ...rotating];
    const games = [];
    for (let i = 0; i < order.length / 2; i += 1) {
      const [a, b] = [order[i], order[order.length - 1 - i]];
      games.push(round % 2 ? { homeTeamId: a, awayTeamId: b, tag: "round-robin" } : { homeTeamId: b, awayTeamId: a, tag: "round-robin" });
    }
    weeks.push({ week: round + 1, games });
    rotating.unshift(rotating.pop());
  }
  return weeks;
}

const toyPostseason = Object.freeze({
  seeds: (league) => ({ league: sortStandings(league.teams).slice(0, 2).map((team, index) => ({ teamId: team.id, seed: index + 1 })) }),
  createState({ league, year }) {
    const seeds = toyPostseason.seeds(league);
    return {
      kind: "toy-final", year, status: "active", stage: "final", gameIndex: 0, seeds,
      matchups: [[seeds.league[0].teamId, seeds.league[1].teamId]],
      bracket: { final: null }, superBowl: null, gameArchiveEntries: []
    };
  },
  nextGame(state) {
    const matchup = state.status === "active" ? state.matchups[state.gameIndex] : null;
    return matchup ? { round: "final", homeTeamId: matchup[0], awayTeamId: matchup[1], neutralSite: true } : null;
  },
  gameLabel: () => "toy-final",
  recordResult({ state, next, result }) {
    const runnerUpTeamId = result.winnerId === next.homeTeamId ? next.awayTeamId : next.homeTeamId;
    state.bracket.final = { ...next, winnerId: result.winnerId };
    state.superBowl = { championTeamId: result.winnerId, runnerUpTeamId, homeScore: result.homeScore, awayScore: result.awayScore, gameId: result.gameId };
    state.gameArchiveEntries.push({ round: next.round, ...result });
    state.gameIndex += 1;
    state.status = "completed";
    state.stage = "complete";
    return result.winnerId;
  },
  result: (state) => (state?.status === "completed"
    ? { standings: { league: [] }, bracket: state.bracket, superBowl: state.superBowl, gameArchiveEntries: state.gameArchiveEntries, divisionRanksForNextYear: null }
    : null)
});

function toyMatch(ctx) {
  let homeScore = ctx.rng.int(0, 5);
  const awayScore = ctx.rng.int(0, 5);
  if (!ctx.allowTie && homeScore === awayScore) homeScore += 1;
  const isTie = homeScore === awayScore;
  const boxScore = { neutralSite: Boolean(ctx.neutralSite) };
  const result = {
    gameId: `${ctx.year}-${ctx.seasonType}-${ctx.label || "game"}-${ctx.awayTeamId}-${ctx.homeTeamId}`,
    homeTeamId: ctx.homeTeamId, awayTeamId: ctx.awayTeamId, homeScore, awayScore, isTie,
    winnerId: isTie ? null : homeScore > awayScore ? ctx.homeTeamId : ctx.awayTeamId,
    label: ctx.label, boxScore
  };
  return { result, boxScore, statDeltas: [], appearances: [], snapCounts: [] };
}

const TOY_PACK = Object.freeze({
  id: TOY_ID,
  displayName: "Toy Round Robin",
  structure: Object.freeze({ conferences: [], gamesPerTeam: TOY_TEAMS.length - 1, regularSeasonWeeks: TOY_TEAMS.length - 1 }),
  match: Object.freeze({ simulate: toyMatch }),
  competition: Object.freeze({ buildSchedule: toySchedule, postseason: toyPostseason })
});

function toyLeague() {
  return {
    sportId: TOY_ID,
    teams: TOY_TEAMS.map((id, index) => ({
      id, overallRating: 60 + index,
      season: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, weekResults: [] }
    }))
  };
}

test("a toy competition registered on a fake pack plays a schedule and crowns a champion through the core calls", (t) => {
  const unregister = registerSport(TOY_PACK);
  t.after(unregister);
  assert.ok(listSports().some((sport) => sport.id === TOY_ID));
  assert.deepEqual(validateCompetition(TOY_PACK.competition), []);
  assert.deepEqual(validateMatchOutput(toyMatch({ rng: new RNG(1), year: 1, homeTeamId: "AAA", awayTeamId: "BBB" })), []);

  // The whole season through the core simulator: schedule, games, standings, postseason.
  const league = toyLeague();
  const season = simulateSeason({ league, statBook: {}, year: 2030, rng: new RNG(2030) });
  const { gamesPerTeam } = TOY_PACK.structure;
  for (const team of league.teams) {
    assert.equal(team.season.wins + team.season.losses + team.season.ties, gamesPerTeam, `${team.id} played the round robin`);
  }
  const topTwo = sortStandings(league.teams).slice(0, 2).map((team) => team.id);
  assert.ok(topTwo.includes(season.superBowl.championTeamId), "the champion is one of the two finalists");
  assert.ok(topTwo.includes(season.superBowl.runnerUpTeamId));
  assert.equal(season.divisionRanksForNextYear, null);

  // The same schedule passes the shared schedule check.
  const weeks = getSportRules(TOY_ID).competition.buildSchedule({ league, year: 2030, previousDivisionRanks: null, rng: new RNG(1) });
  assert.deepEqual(validateSchedule(weeks, { teamIds: TOY_TEAMS, gamesPerTeam, weeks: TOY_PACK.structure.regularSeasonWeeks }), []);

  // Step-by-step postseason through the core dispatchers.
  const state = createPostseasonState({ league, year: 2030 });
  assert.deepEqual(nextPostseasonGame(state, league), { round: "final", homeTeamId: topTwo[0], awayTeamId: topTwo[1], neutralSite: true });
  assert.equal(postseasonResultFromState(state, league), null);
  const played = simulateNextPostseasonGame({ state, league, statBook: {}, year: 2030, rng: new RNG(7) });
  assert.equal(played.round, "final");
  assert.equal(played.game.label, "toy-final", "the core used the pack's game label");
  assert.equal(played.game.boxScore.neutralSite, true, "the core passed the pack's neutral-site flag");
  assert.equal(nextPostseasonGame(state, league), null);
  assert.equal(simulateNextPostseasonGame({ state, league, statBook: {}, year: 2030, rng: new RNG(7) }), null);
  assert.equal(postseasonResultFromState(state, league).superBowl.championTeamId, played.winnerId);
});

test("GameSession's postseason flow drives a toy competition without knowing its format", (t) => {
  const unregister = registerSport(TOY_PACK);
  t.after(unregister);
  const league = toyLeague();
  simulateSeason({ league, statBook: {}, year: 2031, rng: new RNG(2031) });
  // A session shell: the postseason methods read only these fields. The
  // controlled team is not in the toy league, so every game is CPU-simulated.
  const session = Object.assign(Object.create(GameSession.prototype), {
    league, currentYear: 2031, currentWeek: 5, rng: new RNG(5), mode: "drive", statBook: {},
    controlledTeamId: "ZZZ", postseasonState: null
  });
  assert.equal(session.sportRules, TOY_PACK);
  const gate = session.preparePostseasonControlledGate();
  assert.equal(gate, null, "no game waits on the (absent) user team");
  assert.equal(session.postseasonState.status, "completed");
  assert.equal(session.currentWeek, 5, "a format without roundWeeks leaves the week alone");
  const progress = session.getPostseasonProgress();
  assert.equal(progress.status, "completed");
  assert.equal(progress.controlledStatus, "not-qualified");
  assert.equal(progress.completedGames, 1);
});

test("registerSport refuses duplicates and unregisters cleanly", () => {
  assert.throws(() => registerSport({ id: "football" }), /already registered/);
  assert.throws(() => registerSport({}), /string id/);
  const unregister = registerSport(TOY_PACK);
  assert.throws(() => registerSport(TOY_PACK), /already registered/);
  unregister();
  assert.throws(() => getSportRules(TOY_ID), /Unknown sport/);
  assert.deepEqual(listSports(), [{ id: "football", displayName: "Football" }]);
});
