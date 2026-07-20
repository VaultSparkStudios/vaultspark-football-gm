import test from "node:test";
import assert from "node:assert/strict";
import { createAuthorityEpochTracker } from "../public/lib/authorityEpoch.js";

test("an older roster response cannot commit after a team authority change", async () => {
  const tracker = createAuthorityEpochTracker();
  tracker.replaceAuthority("league:BUF:2026:1", { force: true });
  const oldRequest = tracker.begin("roster", "BUF");
  tracker.replaceAuthority("league:DEN:2026:1", { force: true });
  const nextRequest = tracker.begin("roster", "DEN");
  const painted = [];

  assert.equal(tracker.commit(oldRequest, "BUF", () => painted.push("BUF")), false);
  assert.equal(tracker.commit(nextRequest, "DEN", () => painted.push("DEN")), true);
  assert.deepEqual(painted, ["DEN"]);
  assert.equal(tracker.snapshot().staleResponsesDiscarded, 1);
});

test("a slower request for the same filter loses to the newer sequence", () => {
  const tracker = createAuthorityEpochTracker("league:BUF:2026:1");
  const slow = tracker.begin("history", "BUF");
  const fast = tracker.begin("history", "BUF");
  const painted = [];
  assert.equal(tracker.commit(fast, "BUF", () => painted.push("new")), true);
  assert.equal(tracker.commit(slow, "BUF", () => painted.push("old")), false);
  assert.deepEqual(painted, ["new"]);
  assert.equal(tracker.snapshot().staleResponsesDiscarded, 1);
});
