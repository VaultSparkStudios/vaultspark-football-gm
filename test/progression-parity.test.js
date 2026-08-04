import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/runtime/bootstrap.js";
import { PLAYER_DEVELOPMENT_PROFILE } from "../src/domain/ratings.js";
import {
  buildRosterWindowMap,
  buildProgressionParityReceipt,
  scanFiniteSimulationState,
  summarizeLeagueProgression
} from "../src/stats/progressionParity.js";

test("progression summaries are source-derived and cohort-complete", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const summary = summarizeLeagueProgression(session.league);

  assert.ok(summary.playerCount > 1_000);
  assert.ok(summary.meanOverall > 60 && summary.meanOverall < 90);
  assert.ok(summary.medianOverall > 60 && summary.medianOverall < 90);
  assert.equal(
    summary.cohorts.developing25AndUnder.count + summary.cohorts.prime26To29.count + summary.cohorts.veteran30Plus.count,
    summary.playerCount
  );
});

test("the parity verdict is computed from the published target", () => {
  const base = { playerCount: 10, meanOverall: 75, medianOverall: 75, elite90Plus: 0, cohorts: {} };
  const good = buildProgressionParityReceipt({
    start: base,
    end: { ...base, meanOverall: 75.8 },
    seasons: 10,
    seed: 7,
    developmentProfile: PLAYER_DEVELOPMENT_PROFILE
  });
  const bad = buildProgressionParityReceipt({
    start: base,
    end: { ...base, meanOverall: 79 },
    seasons: 10,
    seed: 7,
    developmentProfile: PLAYER_DEVELOPMENT_PROFILE
  });

  assert.equal(good.status, "on-target");
  assert.equal(good.annualMeanOverallDrift, 0.08);
  assert.equal(bad.status, "out-of-range");
  assert.equal(good.developmentProfile.version, "2026-s72-parity");
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
