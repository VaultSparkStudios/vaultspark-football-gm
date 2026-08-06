import assert from "node:assert/strict";
import test from "node:test";

import { buildScoringTimeline, createSimWatchPlayback, deriveBroadcastProgress, deriveFinalReel, resolveBoxScoreTeamIds, SIM_WATCH_SPEEDS } from "../public/lib/simWatchPlayback.js";

const plays = [
  { quarterLabel: "Q1", offenseTeamId: "BUF", driveId: 1, description: "Run" },
  { quarterLabel: "Q1", offenseTeamId: "BUF", driveId: 1, description: "Pass" },
  { quarterLabel: "Q1", offenseTeamId: "NYJ", driveId: 2, description: "Punt" },
  { quarterLabel: "Q2", offenseTeamId: "BUF", driveId: 3, description: "Touchdown" }
];

test("broadcast progress names exact quarter, drive, and play position", () => {
  assert.deepEqual(deriveBroadcastProgress(plays, 1), {
    index: 1, played: 2, total: 4, progressPct: 50,
    quarter: "Q1", quarterPlay: 2, quarterTotal: 3,
    drive: 1, driveTotal: 3
  });
  assert.equal(deriveBroadcastProgress(plays, 3).quarter, "Q2");
});

test("director controls are deterministic across pause, speed, step, and completion", () => {
  const pending = [];
  const changes = [];
  const controller = createSimWatchPlayback({
    plays,
    schedule: (callback, delay) => { pending.push({ callback, delay, cancelled: false }); return pending.length - 1; },
    cancel: (handle) => { if (pending[handle]) pending[handle].cancelled = true; },
    onChange: (snapshot) => changes.push(snapshot)
  });
  controller.play();
  assert.equal(pending.at(-1).delay, 280);
  pending.at(-1).callback();
  assert.equal(controller.snapshot().index, 0);
  controller.setSpeed(4);
  assert.equal(pending.at(-1).delay, 70);
  controller.pause();
  controller.next();
  assert.equal(controller.snapshot().index, 1);
  controller.previous();
  assert.equal(controller.snapshot().index, 0);
  controller.skip();
  assert.equal(controller.snapshot().status, "complete");
  assert.equal(controller.snapshot().progressPct, 100);
  assert.deepEqual(SIM_WATCH_SPEEDS, [0.5, 1, 2, 4]);
  assert.ok(changes.some((entry) => entry.reason === "speed"));
});

test("invalid speeds fail closed", () => {
  const controller = createSimWatchPlayback({ plays });
  assert.throws(() => controller.setSpeed(3), /Unsupported Sim-Watch speed/);
  controller.stop();
});

test("Final Reel deterministically selects only receipted high-impact plays in game order", () => {
  const plays = [
    { quarterLabel: "Q1", description: "Two-yard run" },
    { quarterLabel: "Q2", description: "A touchdown catch" },
    { quarterLabel: "Q3", description: "Pass intercepted at midfield" },
    { quarterLabel: "Q4", description: "Fourth down stop" },
    { quarterLabel: "Q4", description: "Kneel down" }
  ];
  const reel = deriveFinalReel(plays, [{ description: "A touchdown catch" }], 3);
  assert.deepEqual(reel.map((play) => play.reelSourceIndex), [1, 2, 3]);
  assert.ok(reel.every((play) => plays[play.reelSourceIndex] === play || plays[play.reelSourceIndex].description === play.description));
  assert.equal(deriveFinalReel(plays, [], 2).length, 2);
});
test("score timeline joins typed plays to canonical points despite description wording drift", () => {
  const timeline = buildScoringTimeline([
    { offenseTeamId: "BUF", type: "pass", description: "A. QB finds B. WR for the touchdown" },
    { offenseTeamId: "MIA", type: "field-goal", description: "K. Boot hits a 44-yard field goal" }
  ], [
    { teamId: "BUF", type: "TD", points: 7, description: "A. QB finds B. WR for the touchdown (XP good)" },
    { teamId: "MIA", type: "FG", points: 3, description: "K. Boot makes a 44-yard field goal" }
  ]);
  assert.deepEqual(timeline.map(({ teamId, points, playIndex }) => ({ teamId, points, playIndex })), [
    { teamId: "BUF", points: 7, playIndex: 0 },
    { teamId: "MIA", points: 3, playIndex: 1 }
  ]);
});
test("box-score team authority resolves the simulator's nested receipt shape", () => {
  assert.deepEqual(resolveBoxScoreTeamIds({
    awayTeam: { teamId: "BUF" },
    homeTeam: { teamId: "MIA" }
  }), { away: "BUF", home: "MIA" });
  assert.deepEqual(resolveBoxScoreTeamIds({
    awayTeamId: "NYJ",
    homeTeamId: "NE",
    awayTeam: { teamId: "legacy-away" },
    homeTeam: { teamId: "legacy-home" }
  }), { away: "NYJ", home: "NE" });
});