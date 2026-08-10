import assert from "node:assert/strict";
import test from "node:test";

import { shouldPlayTdFlourish } from "../public/lib/simWatchDirector.js";

// shouldPlayTdFlourish is the pure decision function simWatchDirector.js's
// renderFrame() consults before calling playSound("td-flourish"). It is
// deliberately DOM-free so it can be exercised directly against the same
// snapshot shape createSimWatchPlayback() emits (see sim-watch-playback.test.js).

test("fires on a forward tick into a touchdown play", () => {
  assert.equal(shouldPlayTdFlourish({ reason: "tick", play: { description: "QB pass to WR for the touchdown" } }), true);
});

test("fires on an explicit next-step into a touchdown play", () => {
  assert.equal(shouldPlayTdFlourish({ reason: "next", play: { description: "RB rushes in for a touchdown" } }), true);
});

test("does not fire on a non-scoring play", () => {
  assert.equal(shouldPlayTdFlourish({ reason: "tick", play: { description: "RB run for 3 yards" } }), false);
});

test("does not fire on a different scoring play type (field goal)", () => {
  assert.equal(shouldPlayTdFlourish({ reason: "tick", play: { description: "K. Boot hits a 44-yard field goal" } }), false);
});

test("does not re-fire when scrubbing backward over an already-seen touchdown", () => {
  assert.equal(shouldPlayTdFlourish({ reason: "previous", play: { description: "QB pass to WR for the touchdown" } }), false);
});

test("does not fire on speed change or pause/resume even if current play is a touchdown", () => {
  assert.equal(shouldPlayTdFlourish({ reason: "speed", play: { description: "the touchdown" } }), false);
  assert.equal(shouldPlayTdFlourish({ reason: "pause", play: { description: "the touchdown" } }), false);
  assert.equal(shouldPlayTdFlourish({ reason: "play", play: { description: "the touchdown" } }), false);
});

test("handles missing/pregame snapshot safely", () => {
  assert.equal(shouldPlayTdFlourish(null), false);
  assert.equal(shouldPlayTdFlourish({ reason: "tick", play: null }), false);
  assert.equal(shouldPlayTdFlourish({ reason: "tick" }), false);
});
