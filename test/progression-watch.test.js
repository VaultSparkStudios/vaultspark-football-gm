import assert from "node:assert/strict";
import test from "node:test";

import { derivePositionRoomWatch } from "../public/lib/progressionWatch.js";

test("position-room watch distinguishes repeat drift and prescribes verification before tuning", () => {
  const report = {
    progression: { roomAlerts: [
      { room: "Quarterback", status: "out-of-range", annualMeanOverallDrift: 0.82 },
      { room: "Specialists", status: "incomplete", annualMeanOverallDrift: null }
    ] },
    progressionHistory: [
      { rooms: [{ room: "Quarterback", status: "watch" }] },
      { rooms: [{ room: "Quarterback", status: "out-of-range" }, { room: "Specialists", status: "incomplete" }] }
    ]
  };
  const watch = derivePositionRoomWatch(report);
  assert.equal(watch.status, "action-required");
  assert.equal(watch.alerts[0].room, "Quarterback");
  assert.equal(watch.alerts[0].persistence, "repeat");
  assert.match(watch.alerts[0].action, /another seed before changing targets/);
  assert.match(watch.summary, /no tuning was applied automatically/);
});

test("position-room watch has explicit unavailable and clear states", () => {
  assert.equal(derivePositionRoomWatch().status, "unavailable");
  assert.equal(derivePositionRoomWatch({ progression: { rooms: [], roomAlerts: [] } }).status, "clear");
});
