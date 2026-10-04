import test from "node:test";
import assert from "node:assert/strict";
import { simulateGame, simulateMatch } from "../src/engine/gameSimulator.js";
import { applyGameStats } from "../src/stats/applyGameStats.js";
import { StatBook } from "../src/stats/statBook.js";
import { createZeroedSeasonStats } from "../src/domain/playerFactory.js";
import { validateMatchOutput } from "../src/sport/matchEngineContract.js";
import { getSportRules } from "../src/sport/registry.js";
import { createSession } from "../src/runtime/bootstrap.js";

// Multi-sport Phase 1 step 2: the match engine returns what happened and the
// core applies it. The golden master (scripts/golden-master.mjs) proves the
// split is byte-identical to the old inline writes across three seasons; these
// checks pin the contract on one game so a break names itself.

const SEED = 20260316;
const YEAR = 2026;

function gameContext(session) {
  return {
    league: session.league,
    statBook: session.statBook,
    homeTeamId: "BUF",
    awayTeamId: "MIA",
    year: YEAR,
    week: 1,
    rng: session.rng,
    mode: "drive",
    seasonType: "regular",
    label: "regular-season"
  };
}

function statState(league) {
  return JSON.stringify(
    [...league.players, ...league.retiredPlayers].map((player) => [player.id, player.seasonStats, player.careerStats])
  );
}

test("football's match engine output satisfies the contract", () => {
  const session = createSession({ seed: SEED, startYear: YEAR, controlledTeamId: "BUF" });
  const output = getSportRules(session.league.sportId).match.simulate(gameContext(session));
  assert.deepEqual(validateMatchOutput(output), []);
  assert.ok(output.appearances.length >= 44, "both teams' starters appear");
  assert.ok(output.statDeltas.length > 0);
  assert.ok(output.snapCounts.length > 0);
  assert.equal(output.boxScore, output.result.boxScore);
});

test("the engine reads the stat book but never writes it", () => {
  const session = createSession({ seed: SEED, startYear: YEAR, controlledTeamId: "BUF" });
  const before = statState(session.league);
  simulateMatch(gameContext(session));
  assert.equal(statState(session.league), before, "a preview that skips applying must leave every player's stats untouched");
});

test("applying the returned records later equals the old apply-as-you-play path", () => {
  const inline = createSession({ seed: SEED, startYear: YEAR, controlledTeamId: "BUF" });
  const deferred = createSession({ seed: SEED, startYear: YEAR, controlledTeamId: "BUF" });
  assert.equal(statState(deferred.league), statState(inline.league), "same seed, same starting league");

  const inlineResult = simulateGame(gameContext(inline));
  const output = simulateMatch(gameContext(deferred));
  assert.deepEqual(output.result, inlineResult, "the result object is unchanged by the split");

  applyGameStats(deferred.statBook, output);
  assert.equal(statState(deferred.league), statState(inline.league));
});

test("stat closure: a fresh stat book credited from the records matches the box score", () => {
  const session = createSession({ seed: SEED, startYear: YEAR, controlledTeamId: "BUF" });
  const before = new Map(session.league.players.map((player) => [player.id, JSON.parse(JSON.stringify(player.seasonStats[YEAR] || createZeroedSeasonStats()))]));
  const output = simulateMatch(gameContext(session));
  applyGameStats(session.statBook, output);

  const gained = (playerId, group, key) => {
    const player = session.statBook.getPlayerById(playerId);
    return (player.seasonStats[YEAR]?.[group]?.[key] || 0) - (before.get(playerId)?.[group]?.[key] || 0);
  };
  let checked = 0;
  for (const side of ["home", "away"]) {
    const groups = output.boxScore.playerStats[side];
    for (const row of groups.rushing) {
      assert.equal(gained(row.playerId, "rushing", "yards"), row.yds, `${row.playerId} rushing yards`);
      checked += 1;
    }
    for (const row of groups.passing) {
      assert.equal(gained(row.playerId, "passing", "att"), row.att, `${row.playerId} pass attempts`);
      assert.equal(gained(row.playerId, "snaps", "offense"), row.offSn, `${row.playerId} offensive snaps`);
      checked += 1;
    }
  }
  assert.ok(checked >= 4, "closure checked real rows, not an empty box score");

  const credited = new Set(output.appearances.map((record) => record.playerId));
  for (const playerId of credited) {
    const player = session.statBook.getPlayerById(playerId);
    if (!player) continue;
    assert.equal((player.seasonStats[YEAR]?.games || 0) - (before.get(playerId)?.games || 0), 1, `${playerId} credited one game`);
  }
});

test("records apply in engine order, not list order", () => {
  // A player whose season is split evenly between two teams is credited to the
  // team written first, so the applier must replay the shared sequence.
  const makeBook = () => {
    const player = { id: "p1", name: "Test Player", teamId: "AAA", position: "QB", seasonStats: {}, careerStats: createZeroedSeasonStats() };
    return { player, book: new StatBook({ players: [player], retiredPlayers: [], teams: [] }) };
  };
  const output = {
    appearances: [{ seq: 1, playerId: "p1", year: YEAR, started: true, teamId: "BBB", position: "QB", seasonType: "regular" }],
    statDeltas: [{ seq: 0, playerId: "p1", year: YEAR, delta: { passing: { att: 3 } }, meta: { teamId: "AAA", position: "QB", seasonType: "regular" } }],
    snapCounts: []
  };
  const ordered = makeBook();
  applyGameStats(ordered.book, output);
  assert.equal(ordered.player.seasonStats[YEAR].meta.teamId, "AAA");

  // Negative control: list order (appearances first) credits the other team.
  const listOrder = makeBook();
  listOrder.book.registerGameAppearance("p1", YEAR, true, "BBB", "QB", "regular");
  listOrder.book.applyStatDelta("p1", YEAR, { passing: { att: 3 } }, { teamId: "AAA", position: "QB", seasonType: "regular" });
  assert.equal(listOrder.player.seasonStats[YEAR].meta.teamId, "BBB", "order is observable, so honoring seq is load-bearing");
});

test("the validator names broken outputs", () => {
  const session = createSession({ seed: SEED, startYear: YEAR, controlledTeamId: "BUF" });
  const output = simulateMatch(gameContext(session));
  const problems = (mutate) => validateMatchOutput(mutate(structuredClone(output)));

  assert.match(problems((o) => { o.result.statDeltas = []; return o; }).join("\n"), /must not ride inside the saved result/);
  assert.match(problems((o) => { o.boxScore = { ...o.boxScore }; return o; }).join("\n"), /boxScore is not result.boxScore/);
  assert.match(problems((o) => { o.statDeltas[0].delta = { passing: { yards: Number.NaN } }; return o; }).join("\n"), /not a finite number/);
  assert.match(problems((o) => { o.snapCounts[0].seq = o.appearances[0].seq; return o; }).join("\n"), /reused/);
  assert.match(problems((o) => { delete o.appearances; return o; }).join("\n"), /appearances is not an array/);
  assert.deepEqual(validateMatchOutput(null), ["output is not an object"]);
});
