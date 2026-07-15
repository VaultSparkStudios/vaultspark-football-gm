import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMeritAdjustedRoomShares,
  rotationMeritScore
} from "../src/engine/depthChartUsage.js";
import { simulateGame } from "../src/engine/gameSimulator.js";
import { createSession } from "../src/runtime/bootstrap.js";

test("exclusive football roles assign 100 percent to the first available QB, kicker, and punter", () => {
  const players = [
    { overall: 88, potential: 90, schemeFit: 80, morale: 80 },
    { overall: 76, potential: 84, schemeFit: 75, morale: 75 }
  ];
  for (const position of ["QB", "K", "P"]) {
    assert.deepEqual(buildMeritAdjustedRoomShares({ position, players, baseShares: [0.7, 0.3] }), [1, 0]);
  }
});

test("automatic room shares reward current quality and future ceiling while preserving room volume", () => {
  const players = [
    { overall: 91, potential: 95, schemeFit: 88, morale: 84 },
    { overall: 78, potential: 82, schemeFit: 72, morale: 70 },
    { overall: 69, potential: 75, schemeFit: 66, morale: 65 }
  ];
  const baseShares = [0.55, 0.3, 0.15];
  const shares = buildMeritAdjustedRoomShares({ position: "RB", players, baseShares });
  assert.ok(rotationMeritScore(players[0]) > rotationMeritScore(players[1]));
  assert.ok(shares[0] > baseShares[0]);
  assert.ok(shares[2] < baseShares[2]);
  assert.equal(Number(shares.reduce((sum, value) => sum + value, 0).toFixed(3)), 1);
});

test("injury substitution moves all QB snaps to QB2 and recovery restores QB1 plus manual room thresholds", () => {
  const session = createSession({ seed: 4601, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const qbIds = session.getDepthChart("BUF").QB.slice(0, 2);
  const rbIds = session.getDepthChart("BUF").RB.slice(0, 3);
  const qb1 = session.getPlayerById(qbIds[0]);
  const qb2 = session.getPlayerById(qbIds[1]);
  assert.ok(qb1 && qb2);

  session.setDepthChart({
    teamId: "BUF",
    position: "RB",
    playerIds: rbIds,
    snapShares: { [rbIds[0]]: 0.22 }
  });
  const storedBefore = session.getDepthChartSnapShare("BUF").RB.find((row) => row.playerId === rbIds[0]);
  assert.equal(storedBefore.snapShare, 0.22);

  qb1.injury = { type: "Out 1W", weeksRemaining: 1 };
  session.getPlayerById(rbIds[0]).injury = { type: "Out 1W", weeksRemaining: 1 };
  const injuredGame = simulateGame({
    league: session.league,
    statBook: session.statBook,
    homeTeamId: "BUF",
    awayTeamId: "MIA",
    year: 2026,
    week: 1,
    rng: session.rng,
    mode: "play"
  });
  const injuredQbSnaps = injuredGame.boxScore.playerStats.home.snaps.filter((row) => row.pos === "QB");
  assert.equal(injuredQbSnaps.find((row) => row.playerId === qb1.id), undefined);
  assert.equal(injuredQbSnaps.find((row) => row.playerId === qb2.id)?.offSn, injuredGame.homeOffSnaps);

  qb1.injury = null;
  session.getPlayerById(rbIds[0]).injury = null;
  const recoveredGame = simulateGame({
    league: session.league,
    statBook: session.statBook,
    homeTeamId: "BUF",
    awayTeamId: "MIA",
    year: 2026,
    week: 2,
    rng: session.rng,
    mode: "play"
  });
  const recoveredQbSnaps = recoveredGame.boxScore.playerStats.home.snaps.filter((row) => row.pos === "QB");
  assert.equal(recoveredQbSnaps.find((row) => row.playerId === qb1.id)?.offSn, recoveredGame.homeOffSnaps);
  assert.equal(recoveredQbSnaps.find((row) => row.playerId === qb2.id), undefined);
  assert.equal(session.getDepthChartSnapShare("BUF").RB.find((row) => row.playerId === rbIds[0]).snapShare, 0.22);
});

test("box score situational conversions are observed from stamped plays and rich stat groups are present", () => {
  const session = createSession({ seed: 4602, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const game = simulateGame({
    league: session.league,
    statBook: session.statBook,
    homeTeamId: "BUF",
    awayTeamId: "MIA",
    year: 2026,
    week: 1,
    rng: session.rng,
    mode: "play"
  });
  const homeThirdDowns = game.boxScore.playByPlay.filter((play) => play.offenseTeamId === "BUF" && play.down === 3);
  assert.equal(game.boxScore.homeTeam.thirdDowns, homeThirdDowns.length);
  assert.equal(
    game.boxScore.homeTeam.thirdDownConversions,
    homeThirdDowns.filter((play) => Number(play.yards || 0) >= Number(play.distance || 10)).length
  );
  assert.ok(game.boxScore.homeTeam.plays > 0);
  assert.ok(game.boxScore.homeTeam.drives > 0);
  assert.ok(Array.isArray(game.boxScore.playerStats.home.punting));
  assert.ok(Array.isArray(game.boxScore.playerStats.home.blocking));
  assert.ok(game.boxScore.playerStats.home.snaps.some((row) => row.totalSn > 0));
  const passer = game.boxScore.playerStats.home.passing[0];
  assert.ok(Object.hasOwn(passer, "cmpPct"));
  assert.ok(Object.hasOwn(passer, "rate"));
  assert.ok(Object.hasOwn(passer, "offSn"));
  const seasonPasser = session.statBook
    .getPlayerSeasonTable("passing", { year: 2026, seasonType: "regular" })
    .find((row) => row.playerId === passer.playerId);
  assert.ok(Number.isFinite(seasonPasser.ovr));
  assert.ok(Number.isFinite(seasonPasser.pot));
  assert.ok(Object.hasOwn(seasonPasser, "tdPct"));
  assert.ok(Object.hasOwn(seasonPasser, "anya"));
});
