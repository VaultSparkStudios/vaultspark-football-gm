import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("session integration supports week advance and draft preparation", () => {
  const session = createSession({ seed: 33, startYear: 2026, controlledTeamId: "BUF" });
  const initial = session.getDashboardState();
  assert.equal(initial.phase, "regular-season");
  assert.equal(initial.currentWeek, 1);

  const week = session.advanceWeek();
  assert.equal(week.ok, true);
  assert.ok(session.getDashboardState().currentWeek >= 2);

  session.prepareDraft();
  const draft = session.getDraftState();
  assert.ok(draft);
  assert.equal(draft.currentPick, 1);
  assert.ok(draft.available.length > 100);
});
