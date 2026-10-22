import assert from "node:assert/strict";
import test from "node:test";
import { createSession } from "../src/runtime/bootstrap.js";

test("Hall candidate batches preserve individual scores, ballots and state while sharing career tables", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });
  const positions = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"];
  const retirees = positions.flatMap(position => session.league.players
    .filter(player => player.position === position)
    .sort((a, b) => (b.careerStats.games || 0) - (a.careerStats.games || 0))
    .slice(0, 2));
  assert.equal(retirees.length, positions.length * 2);
  const retiredIds = new Set(retirees.map(player => player.id));
  session.league.players = session.league.players.filter(player => !retiredIds.has(player.id));
  session.league.retiredPlayers = retirees;
  for (const player of retirees) player.retiredYear = session.currentYear - 2;
  const settings = session.getLeagueSettings();
  settings.hallOfFameYearsRetiredMin = 1;
  settings.hallOfFameInductionScoreMin = 0;
  settings.hallOfFameMaxClassSize = 3;
  session.league.settings = settings;
  // A zero-volume retiree still has a legacy resume, but earns no table AV.
  const zero = structuredClone(retirees.find(player => player.position === "QB"));
  zero.id = "zero-volume-retiree";
  zero.careerStats = session.statBook.statSchema.zeroedCareerStats();
  zero.seasonStats = {};
  session.league.retiredPlayers.push(zero);
  const notYetEligible = structuredClone(zero);
  notYetEligible.id = "not-yet-eligible";
  notYetEligible.retiredYear = session.currentYear;
  session.league.retiredPlayers.push(notYetEligible);

  const eligible = session.league.retiredPlayers.filter(player => session.currentYear - player.retiredYear >= 1);
  const expected = eligible.map(player => session.scoreHallOfFameCandidate(player));
  assert.ok(expected.some(row => row.careerAv > 0), "exercise actual nonzero season values");
  const before = JSON.stringify(session.toSnapshot());
  const getTable = session.statBook.getPlayerCareerTable.bind(session.statBook);
  const calls = [];
  session.statBook.getPlayerCareerTable = (category, filters) => {
    calls.push({ category, filters });
    return getTable(category, filters);
  };
  const actual = session.getHallOfFameCandidates();
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(session.toSnapshot()), before, "scoring must preserve state and random streams");
  assert.deepEqual(calls.map(call => call.category).sort(), ["passing", "rushing", "receiving", "blocking", "defense", "kicking", "punting"].sort());
  assert.ok(calls.every(call => call.filters.seasonType === "all"));
  assert.equal(actual.find(row => row.player.id === zero.id).careerAv, 0);
  assert.ok(!actual.some(row => row.player.id === notYetEligible.id));

  const expectedHall = structuredClone(session.refreshHallOfFame({ candidates: expected }));
  const expectedBallot = session.getHallOfFameBallot({ candidates: expected, refresh: false });
  assert.deepEqual(session.refreshHallOfFame({ candidates: actual }), expectedHall);
  assert.deepEqual(session.getHallOfFameBallot({ candidates: actual, refresh: false }), expectedBallot);

  // Subsequent passes must observe mutations, not a persistent cached table.
  const qb = retirees.find(player => player.position === "QB");
  const season = Object.values(qb.seasonStats)[0];
  season.passing.td += 30;
  qb.careerStats.passing.td += 30;
  calls.length = 0;
  const refreshed = session.getHallOfFameCandidates();
  assert.equal(calls.length, 7);
  session.statBook.getPlayerCareerTable = getTable;
  assert.deepEqual(refreshed, eligible.map(player => session.scoreHallOfFameCandidate(player)));
  assert.notEqual(refreshed.find(row => row.player.id === qb.id).inductionScore,
    expected.find(row => row.player.id === qb.id).inductionScore);
});

test("an empty eligible Hall cohort does not build career tables", () => {
  const session = createSession({ seed: 47, startYear: 2026, controlledTeamId: "BUF" });
  session.statBook.getPlayerCareerTable = () => assert.fail("no eligible candidates need no career table");
  assert.deepEqual(session.getHallOfFameCandidates(), []);
});
