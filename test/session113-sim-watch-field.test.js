import test from "node:test";
import assert from "node:assert/strict";
import { buildGameFlow, deriveFieldState } from "../public/lib/simWatchPlayback.js";

const teamIds = { home: "BUF", away: "MIA" };

test("the field marker is the recorded spot, oriented by possession", () => {
  const home = deriveFieldState({ offenseTeamId: "BUF", fieldPosition: 30, down: 2, distance: 7 }, teamIds);
  assert.equal(home.x, 30);
  assert.equal(home.downLabel, "2nd & 7");
  assert.equal(home.spotLabel, "Own 30");
  const away = deriveFieldState({ offenseTeamId: "MIA", fieldPosition: 30, down: 1, distance: 10 }, teamIds);
  assert.equal(away.x, 70, "the away offense attacks the other way");
  const goal = deriveFieldState({ offenseTeamId: "BUF", fieldPosition: 95, down: 3, distance: 5 }, teamIds);
  assert.equal(goal.downLabel, "3rd & Goal");
  assert.equal(goal.redZone, true);
  assert.equal(deriveFieldState({ description: "old save, no spot" }, teamIds), null, "no spot is reported as unknown, never invented");
});

test("game flow accumulates home-minus-away margin at the scoring plays", () => {
  const plays = new Array(6).fill({});
  const flow = buildGameFlow(plays, [
    { teamId: "MIA", points: 7, playIndex: 1 },
    { teamId: "BUF", points: 3, playIndex: 4 },
    { teamId: "BUF", points: 7, playIndex: null }
  ], teamIds);
  assert.deepEqual(flow, [0, -7, -7, -7, -4, -4]);
});
