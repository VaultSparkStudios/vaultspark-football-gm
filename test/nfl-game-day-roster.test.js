import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { selectGameDayRoster, clearGameDayInactives } from "../src/engine/gameDayRoster.js";
import { simulateMatch } from "../src/engine/gameSimulator.js";
import { simulateRegularSeasonWeek } from "../src/engine/weeklySimulator.js";
import { getTeamPlayers } from "../src/domain/teamFactory.js";
import { RNG } from "../src/utils/rng.js";
import { FIELDABLE_DEPTH } from "../src/config.js";
import { executeAdvanceWeekCommand } from "../src/runtime/advanceWeekCommand.js";

test("empty-roster refusal precedes preview RNG, weekly mutations and bulk simulation", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  session.seasonSchedule[0].games = [{ homeTeamId: "MIA", awayTeamId: "NYJ" }, { homeTeamId: "BUF", awayTeamId: "NE" }];
  for (const player of getTeamPlayers(session.league, "BUF")) {
    assert.equal(session.setPlayerDesignation({ teamId: "BUF", playerId: player.id, designation: "gameDayInactive" }).ok, true);
  }
  const before = JSON.stringify(session.toSnapshot());
  const rngSeed = session.rng.seed;
  const failure = error => error.code === "GAME_DAY_ROSTER_EMPTY" && error.name === "MatchReadinessError";
  assert.throws(() => simulateMatch({ league: session.league, statBook: session.statBook, year: 2026,
    homeTeamId: "MIA", awayTeamId: "BUF", rng: session.rng }), failure);
  assert.throws(() => simulateRegularSeasonWeek({ league: session.league, statBook: session.statBook, year: 2026,
    // Match the controlled-club boundary used by GameSession. The engine's
    // default delegates all clubs and may legally elevate practice players.
    weekBlock: session.seasonSchedule[0], rng: session.rng,
    excludeElevationTeamIds: [session.controlledTeamId] }), failure);
  assert.equal(session.advanceWeek().reasonCode, "GAME_DAY_ROSTER_EMPTY");
  assert.equal(executeAdvanceWeekCommand(session, { count: 3, weeklyTacticOverride: "balanced" }).reasonCode, "GAME_DAY_ROSTER_EMPTY");
  assert.throws(() => session.simulateSeasons(2), failure);
  assert.equal(session.rng.seed, rngSeed);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  const player = session.league.players.find(p => p.teamId === "BUF" && p.rosterSlot === "active");
  session.setPlayerDesignation({ teamId: "BUF", playerId: player.id, designation: "gameDayInactive", active: false });
  assert.equal(session.getAdvanceReadiness().ok, true, "one available player satisfies the simulator prerequisite, not an invented NFL minimum");
});

test("readiness respects byes and previews recovery without mutating the franchise", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  const roster = getTeamPlayers(session.league, "BUF");
  for (const player of roster) player.designations.gameDayInactive = true;
  session.seasonSchedule[0].games = [{ homeTeamId: "MIA", awayTeamId: "NYJ" }];
  assert.equal(session.getAdvanceReadiness().ok, true);
  assert.equal(session.advanceWeek().ok, true);
  assert.ok(roster.every(player => player.designations.gameDayInactive));
  session.seasonSchedule[1].games = [{ homeTeamId: "BUF", awayTeamId: "MIA" }];
  const qb = roster.find(player => player.position === "QB");
  qb.designations.gameDayInactive = false;
  qb.injury = { type: "Test strain", weeksRemaining: 1 };
  qb.suspensionWeeks = 1;
  const before = JSON.stringify(session.toSnapshot());
  assert.equal(session.getAdvanceReadiness().reasonCode, 'GAME_DAY_ROSTER_EMPTY', 'last suspended game is still unavailable');
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  qb.suspensionWeeks = 0;
  assert.equal(session.getAdvanceReadiness().ok, true, 'ordinary deterministic injury recovery remains previewed');
  qb.injury.weeksRemaining = 100;
  assert.equal(session.getAdvanceReadiness().reasonCode, "GAME_DAY_ROSTER_EMPTY");
});

test("postseason empty-roster refusal leaves persisted bracket and statistics untouched", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "postseason";
  session.initializePostseasonRoundFlow();
  const next = session.getPostseasonProgress().nextGame;
  for (const player of getTeamPlayers(session.league, next.awayTeamId)) player.designations.gameDayInactive = true;
  const before = JSON.stringify(session.toSnapshot());
  assert.equal(session.advanceWeek().reasonCode, "GAME_DAY_ROSTER_EMPTY");
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  // A save can enter postseason without a materialized bracket. Seeding this
  // preview must not stamp live team.playoffSeed fields on a refused command.
  session.postseasonState = null;
  for (const team of session.league.teams) delete team.playoffSeed;
  const absentState = JSON.stringify(session.toSnapshot());
  assert.equal(session.advanceWeek().reasonCode, "GAME_DAY_ROSTER_EMPTY");
  assert.equal(JSON.stringify(session.toSnapshot()), absentState);
  session.initializePostseasonRoundFlow();
  const awaiting = JSON.stringify(session.toSnapshot());
  assert.equal(session.preparePostseasonControlledGate(), null);
  assert.equal(JSON.stringify(session.toSnapshot()), awaiting, "automatic transition must defer playoff games on refusal");
});

test("game-day allocator respects eight-lineman entitlement, role floors and manual depth", () => {
  const roster = [];
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    for (let i = 0; i < band.max; i += 1) roster.push({ id: `${position}${i}`, position, overall: position === "OL" ? 40 - i : 95 - i });
  }
  const weakStarter = roster.find(p => p.id === "WR6");
  const league = { depthCharts: { T: { WR: [weakStarter.id] } } };
  const full = selectGameDayRoster({ league, teamId: "T", roster });
  assert.equal(full.players.length, 48);
  assert.ok(full.receipt.offensiveLinemen >= 8);
  assert.ok(full.receipt.playerIds.includes(weakStarter.id));
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) assert.ok(full.players.filter(p => p.position === position).length >= band.min);
  const short = roster.filter(p => p.position !== "OL" || Number(p.id.slice(2)) < 7);
  const seven = selectGameDayRoster({ league, teamId: "T", roster: short });
  assert.equal(seven.players.length, 47);
  assert.equal(seven.receipt.limit, 47);
  assert.equal(seven.receipt.offensiveLinemen, 7);
  assert.deepEqual(selectGameDayRoster({ league, teamId: "T", roster: [] }).players, []);
});

test("actual match participants are a subset of the legal game-day receipt without preview mutations", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  const excluded = getTeamPlayers(session.league, "BUF").filter(p => p.position === "DB").at(-1);
  excluded.designations.gameDayInactive = true;
  const before = JSON.stringify(session.league);
  for (const allowTie of [true, false]) {
    const output = simulateMatch({ league: session.league, statBook: session.statBook, year: 2026,
      homeTeamId: "BUF", awayTeamId: "MIA", rng: new RNG(117), allowTie, seasonType: allowTie ? "regular" : "playoffs" });
    const ids = new Set();
    for (const [side, teamId] of [["home", "BUF"], ["away", "MIA"]]) {
      const roster = output.boxScore.gameDayRosters[side];
      assert.ok(roster.playerIds.length <= roster.limit);
      assert.ok(roster.limit === 47 || (roster.limit === 48 && roster.offensiveLinemen >= 8));
      for (const id of roster.playerIds) {
        ids.add(id);
        assert.equal(session.getPlayerById(id).teamId, teamId);
      }
    }
    assert.ok(!ids.has(excluded.id));
    for (const record of [...output.appearances, ...output.snapCounts, ...output.statDeltas]) assert.ok(ids.has(record.playerId), `${record.playerId} did not dress`);
  }
  assert.equal(JSON.stringify(session.league), before);
});

test("manual inactives survive save/load, affect their game and are consumed only after that club plays", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  const target = getTeamPlayers(session.league, "BUF").filter(p => p.position === "DB").at(-1);
  assert.equal(session.setPlayerDesignation({ teamId: "BUF", playerId: target.id, designation: "gameDayInactive" }).ok, true);
  const restored = session.constructor.fromSnapshot(session.toSnapshot(), seed => new RNG(seed));
  assert.equal(restored.getPlayerById(target.id).designations.gameDayInactive, true);
  // Playing another club's game must preserve the instruction across a bye.
  clearGameDayInactives(restored.league, ["MIA", "NYJ"]);
  assert.equal(restored.getPlayerById(target.id).designations.gameDayInactive, true);
  const week = simulateRegularSeasonWeek({ league: restored.league, statBook: restored.statBook, year: 2026,
    weekBlock: { week: 1, games: [{ homeTeamId: "BUF", awayTeamId: "MIA" }] }, rng: restored.rng });
  assert.ok(!week.games[0].boxScore.gameDayRosters.home.playerIds.includes(target.id));
  assert.equal(restored.getPlayerById(target.id).seasonStats[2026]?.games || 0, 0);
  assert.equal(restored.getPlayerById(target.id).designations.gameDayInactive, false);
});

test("actual weekly injuries exclude automatic and manual inactives from that game's receipt", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF", leagueSettings: { injuryRateMultiplier: 25 } });
  session.league.settings.injuryRateMultiplier = 25;
  const target = getTeamPlayers(session.league, "BUF").filter(p => p.position === "DB").at(-1);
  session.setPlayerDesignation({ teamId: "BUF", playerId: target.id, designation: "gameDayInactive" });
  const result = session.advanceWeek();
  assert.equal(result.ok, true);
  let dressedInjuries = 0;
  for (const game of result.games) {
    for (const [side, teamId] of [["home", game.homeTeamId], ["away", game.awayTeamId]]) {
      const ids = new Set(game.boxScore.gameDayRosters[side].playerIds);
      for (const player of session.league.players.filter(p => p.teamId === teamId && p.injury?.weeksRemaining > 0)) {
        assert.ok(ids.has(player.id), `${player.id} was injured while undressed`);
        dressedInjuries += 1;
      }
    }
  }
  assert.ok(dressedInjuries > 0);
});
