import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { buildPowerRankings, buildAwardRaces, buildRecordWatch, buildSeasonRecordBook } from "../src/stats/leagueLens.js";

const standings = [
  { team: "AAA", wins: 6, losses: 0, ties: 0, pf: 180, pa: 90 },
  { team: "BBB", wins: 3, losses: 3, ties: 0, pf: 130, pa: 130 },
  { team: "CCC", wins: 0, losses: 6, ties: 0, pf: 80, pa: 170 }
];
const teams = [
  { id: "AAA", name: "Alphas", overallRating: 78 },
  { id: "BBB", name: "Betas", overallRating: 84 },
  { id: "CCC", name: "Gammas", overallRating: 80 }
];

test("power rankings blend results over roster strength and are deterministic", () => {
  const first = buildPowerRankings({ standings, teams });
  assert.deepEqual(first.map((row) => row.teamId), ["AAA", "BBB", "CCC"]);
  assert.deepEqual(buildPowerRankings({ standings, teams }), first, "same inputs, same list");
  const preseason = buildPowerRankings({ standings: standings.map((row) => ({ ...row, wins: 0, losses: 0, pf: 0, pa: 0 })), teams });
  assert.equal(preseason[0].teamId, "BBB", "with no games the strongest roster leads");
  assert.match(preseason[0].blurb, /roster strength/);
});

test("movement compares against the standings before the latest week", () => {
  const latestWeek = { seasonType: "regular", games: [{ homeTeamId: "CCC", awayTeamId: "AAA", homeScore: 10, awayScore: 40, winnerId: "AAA" }] };
  const ranks = buildPowerRankings({ standings, teams, latestWeek });
  const alpha = ranks.find((row) => row.teamId === "AAA");
  assert.equal(typeof alpha.previousRank, "number");
  assert.equal(alpha.move, alpha.previousRank - alpha.rank);
});

test("award races reuse the impact weights and report shares, not odds", () => {
  const leaders = {
    passing: [{ playerId: "p1", player: "QB One", pos: "QB", tm: "AAA", yds: 1800, td: 15, int: 2 }],
    rushing: [{ playerId: "p2", player: "RB Two", pos: "RB", tm: "CCC", yds: 700, td: 6 }],
    receiving: [],
    defense: [{ playerId: "d1", player: "Edge", pos: "DL", tm: "BBB", tkl: 30, sacks: 8, int: 0, pd: 2 }]
  };
  const races = buildAwardRaces({ leaders, standings, teams });
  assert.equal(races.mvp[0].playerId, "p1");
  assert.equal(races.mvp[0].shareOfLeader, 100);
  assert.ok(races.mvp[1].shareOfLeader < 100);
  assert.equal(races.dpoy[0].playerId, "d1");
  assert.equal(races.coachOfTheYear[0].teamId, "AAA", "the biggest over-performer leads Coach of the Year");
});

test("record watch flags on-pace and broken marks only against completed seasons", () => {
  const recordBook = buildSeasonRecordBook({
    years: [2020, 2021],
    seasonTable: (category, year) => category === "passing" ? [{ playerId: `old${year}`, player: `Old ${year}`, yds: year === 2021 ? 4000 : 3500, td: 30 }] : []
  });
  assert.equal(recordBook.passingYards.value, 4000);
  const onPace = buildRecordWatch({ leaders: { passing: [{ playerId: "p1", player: "QB One", tm: "AAA", yds: 1500, td: 5 }] }, standings, recordBook });
  assert.equal(onPace.length, 1);
  assert.equal(onPace[0].status, "on-pace");
  assert.equal(onPace[0].pace, 4250);
  const broken = buildRecordWatch({ leaders: { passing: [{ playerId: "p1", player: "QB One", tm: "AAA", yds: 4100, td: 5 }] }, standings, recordBook });
  assert.equal(broken[0].status, "broken");
  const quiet = buildRecordWatch({ leaders: { passing: [{ playerId: "p1", player: "QB One", tm: "AAA", yds: 600, td: 5 }] }, standings, recordBook });
  assert.equal(quiet.length, 0, "a normal season raises no alert");
});

test("the dashboard carries a league lens without moving the simulation", async () => {
  const run = async () => {
    const session = new GameSession({ rng: new RNG(4113), startYear: 2026, controlledTeamId: "BUF" });
    session.advanceWeek();
    session.advanceWeek();
    return session;
  };
  const a = await run();
  const b = await run();
  const lens = a.getDashboardState().leagueLens;
  assert.equal(lens.powerRankings.length, 32);
  assert.equal(lens.powerRankings[0].rank, 1);
  assert.ok(lens.awardRaces.mvp.length > 0);
  assert.deepEqual(lens, b.getDashboardState().leagueLens, "same seed, same lens");
  assert.deepEqual(a.getDashboardState().latestStandings, b.getDashboardState().latestStandings);
});
