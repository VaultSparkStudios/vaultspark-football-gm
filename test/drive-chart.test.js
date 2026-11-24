import test from "node:test";
import assert from "node:assert/strict";
import { buildDriveChart } from "../public/lib/simWatchPlayback.js";

const teamIds = { home: "BUF", away: "MIA" };
const plays = [
  { offenseTeamId: "BUF", fieldPosition: 25, driveNumber: 1, description: "Run for 5" },
  { offenseTeamId: "BUF", fieldPosition: 30, driveNumber: 1, description: "Pass for 70 and a touchdown" },
  { offenseTeamId: "MIA", fieldPosition: 20, driveNumber: 2, description: "Run for 3" },
  { offenseTeamId: "MIA", fieldPosition: 23, driveNumber: 2, type: "interception", description: "Intercepted" },
  { offenseTeamId: "BUF", driveNumber: 3, description: "No spot recorded" }
];

test("each drive is one row: club, start, end and how it ended, in the home-end orientation", () => {
  const drives = buildDriveChart(plays, teamIds);
  assert.equal(drives.length, 2, "a drive without any recorded spot is skipped, never invented");
  assert.deepEqual(drives[0], { teamId: "BUF", startX: 25, endX: 30, plays: 2, result: "td" });
  assert.deepEqual(drives[1], { teamId: "MIA", startX: 80, endX: 77, plays: 2, result: "turnover" }, "the away club drives toward the home end zone");
});

test("the chart only shows what has been played so far", () => {
  const drives = buildDriveChart(plays, teamIds, 0);
  assert.equal(drives.length, 1);
  assert.equal(drives[0].result, null);
});
