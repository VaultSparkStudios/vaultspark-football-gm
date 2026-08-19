import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/runtime/bootstrap.js";
import { PLAYER_DEVELOPMENT_PROFILE } from "../src/domain/ratings.js";
import {
  appendProgressionHistory,
  buildRosterWindowMap,
  buildProgressionParityReceipt,
  POSITION_ROOMS,
  scanFiniteSimulationState,
  summarizeLeagueProgression
} from "../src/stats/progressionParity.js";

test("progression summaries are source-derived and cohort-complete", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const summary = summarizeLeagueProgression(session.league);

  assert.ok(summary.playerCount > 1_000);
  assert.ok(summary.meanOverall > 60 && summary.meanOverall < 90);
assert.ok(summary.medianOverall > 60 && summary.medianOverall < 90);
  assert.equal(summary.rooms.length, 7);
  assert.ok(summary.rooms.every((room) => room.count >= 20));
  assert.equal(
    summary.cohorts.developing25AndUnder.count + summary.cohorts.prime26To29.count + summary.cohorts.veteran30Plus.count,
    summary.playerCount
  );
});

test("the parity verdict is computed from the published target", () => {
  const rooms = POSITION_ROOMS.map(({ room, positions }) => ({
    room,
    positions: positions.join("/"),
    count: 32,
    meanOverall: 75,
    medianOverall: 75,
    elite90Plus: 1,
    elite90PlusPct: 3.1
  }));
  const base = { playerCount: 224, meanOverall: 75, medianOverall: 75, elite90Plus: 7, cohorts: {}, rooms };
  const steadyRooms = rooms.map((room) => ({ ...room, meanOverall: 75.8, medianOverall: 75.5 }));
  const good = buildProgressionParityReceipt({
    start: base,
    end: { ...base, meanOverall: 75.8, rooms: steadyRooms },
    seasons: 10,
    seed: 7,
    developmentProfile: PLAYER_DEVELOPMENT_PROFILE
  });
  const bad = buildProgressionParityReceipt({
    start: base,
    end: { ...base, meanOverall: 79, rooms: steadyRooms },
    seasons: 10,
    seed: 7,
    developmentProfile: PLAYER_DEVELOPMENT_PROFILE
  });

  assert.equal(good.status, "on-target");
  assert.equal(good.annualMeanOverallDrift, 0.08);
  assert.equal(bad.status, "out-of-range");
  assert.equal(good.globalStatus, "on-target");
  assert.equal(good.roomSummary.onTarget, 7);
  assert.equal(good.developmentProfile.version, "2026-s91-reverting");

  const maskedRoomFailure = buildProgressionParityReceipt({
    start: base,
    end: {
      ...base,
      meanOverall: 75.8,
      rooms: steadyRooms.map((room, index) => index === 0 ? { ...room, meanOverall: 82 } : room)
    },
    seasons: 10,
    seed: 8,
    developmentProfile: PLAYER_DEVELOPMENT_PROFILE
  });
  assert.equal(maskedRoomFailure.globalStatus, "on-target");
  assert.equal(maskedRoomFailure.status, "out-of-range");
  assert.deepEqual(maskedRoomFailure.roomAlerts.map((alert) => alert.room), ["Quarterback"]);

  const incomplete = buildProgressionParityReceipt({
    start: { ...base, rooms: rooms.map((room, index) => index === 6 ? { ...room, count: 4 } : room) },
    end: { ...base, meanOverall: 75.8, rooms: steadyRooms },
    seasons: 10,
    seed: 9,
    developmentProfile: PLAYER_DEVELOPMENT_PROFILE
  });
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.rooms.find((room) => room.room === "Specialists").annualMeanOverallDrift, null);
});

test("multi-seed progression history is compact, bounded, and simulation-free on read", () => {
  let history = [];
  for (let seed = 1; seed <= 7; seed += 1) {
    history = appendProgressionHistory(history, {
      seed,
      observedSeasons: 10,
      status: seed === 4 ? "watch" : "on-target",
      globalStatus: "on-target",
      annualMeanOverallDrift: seed / 100,
      rooms: POSITION_ROOMS.map(({ room }) => ({ room, status: "on-target", annualMeanOverallDrift: 0.1 }))
    }, 1_000 + seed);
  }
  assert.deepEqual(history.map((entry) => entry.seed), [3, 4, 5, 6, 7]);
  assert.equal(history[0].rooms.length, 7);
  assert.equal(Object.hasOwn(history[0], "start"), false);
  assert.throws(() => appendProgressionHistory(history, { seed: Number.NaN }), /finite seed/);
});
test("finite-number integrity reports corruption instead of laundering it", () => {
  const session = createSession({ seed: 91, startYear: 2026, controlledTeamId: "BUF" });
  const clean = scanFiniteSimulationState({ league: session.league, statBook: session.statBook });
  assert.equal(clean.status, "pass");
  assert.ok(clean.inspectedNumbers > 10_000);

  session.league.teams[0].season.drivesFor = Number.NaN;
  session.league.players[0].ratings.awareness = Number.POSITIVE_INFINITY;
  const corrupt = scanFiniteSimulationState({ league: session.league, statBook: session.statBook });
  assert.equal(corrupt.status, "fail");
  assert.equal(corrupt.issueCount, 2);
  assert.deepEqual(corrupt.issues.map((issue) => issue.kind).sort(), ["Infinity", "NaN"]);
  assert.ok(corrupt.issues.some((issue) => issue.path.endsWith("season.drivesFor")));
  assert.ok(corrupt.issues.some((issue) => issue.path.endsWith("ratings.awareness")));
});

test("a bounded scan that cannot finish is explicitly incomplete", () => {
  const session = createSession({ seed: 92, startYear: 2026, controlledTeamId: "BUF" });
  const receipt = scanFiniteSimulationState({ league: session.league, statBook: session.statBook }, { maxNodes: 10 });
  assert.equal(receipt.status, "incomplete");
  assert.equal(receipt.truncated, true);
});

test("the roster window map turns the declared curve into room-level decisions", () => {
  const roster = [
    { name: "Young QB", pos: "QB", age: 23, overall: 78, potential: 92, contract: { yearsRemaining: 3 } },
    { name: "Old QB", pos: "QB", age: 35, overall: 84, potential: 84, contract: { yearsRemaining: 1 } },
    { name: "Prime WR", pos: "WR", age: 27, overall: 88, potential: 90, contract: { yearsRemaining: 1 } },
    { name: "Young WR", pos: "WR", age: 22, overall: 72, potential: 94, contract: { yearsRemaining: 4 } },
    { name: "Veteran OL", pos: "OL", age: 33, overall: 86, potential: 86, contract: { yearsRemaining: 1 } }
  ];
  const map = buildRosterWindowMap(roster, PLAYER_DEVELOPMENT_PROFILE);
  const receivers = map.groups.find((group) => group.room === "Receivers");
  const line = map.groups.find((group) => group.room === "Offensive Line");

  assert.equal(map.profileVersion, PLAYER_DEVELOPMENT_PROFILE.version);
  assert.equal(receivers.developing, 1);
  assert.equal(receivers.prime, 1);
  assert.equal(receivers.meanPotential, 92);
  assert.equal(receivers.standardBearer, "Prime WR (88)");
  assert.equal(line.window, "aging");
  assert.equal(line.priority, "Succession + contract decision");
});
