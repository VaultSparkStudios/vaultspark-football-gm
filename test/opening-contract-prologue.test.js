import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildStartScenarioRequest } from "../public/lib/startScenarioContract.js";
import { executeAdvanceWeekCommand } from "../src/runtime/advanceWeekCommand.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";

function openingRequest() {
  return buildStartScenarioRequest({
    identity: "balanced",
    pressure: "balanced-mandate",
    "first-call": "ignore"
  });
}

test("opening contract becomes a source-derived playable prologue", () => {
  const session = createSession({ seed: 52031, startYear: 2026, controlledTeamId: "BUF" });
  assert.equal(session.getOpeningContractProgress(), null);
  assert.equal(session.applyStartScenario(openingRequest()).ok, true);

  const before = session.getDashboardState().openingContractProgress;
  assert.equal(before.status, "active");
  assert.deepEqual(before.steps.map((step) => step.complete), [true, true, false]);
  assert.match(before.nextAction, /play the opening week/i);

  const command = executeAdvanceWeekCommand(session, { count: 1, weeklyTacticOverride: "pass-heavy" });
  assert.equal(command.ok, true);
  const after = session.getDashboardState().openingContractProgress;
  assert.equal(after.status, "completed");
  assert.deepEqual(after.steps.map((step) => step.complete), [true, true, true]);
  assert.match(after.result.verdict, /^[WLT]$/);
  assert.equal(after.result.tactic, "Pass-Heavy");
  assert.equal(typeof after.result.tacticalVerdict, "string");
  assert.equal(typeof after.ownerPressure.heat, "number");
});

test("opening prologue evidence survives save and restore without tutorial flags", () => {
  const session = createSession({ seed: 52032, startYear: 2026, controlledTeamId: "BUF" });
  session.applyStartScenario(openingRequest());
  executeAdvanceWeekCommand(session, { count: 1, weeklyTacticOverride: "run-heavy" });
  const restored = createSessionFromSnapshot(session.toSnapshot());
  assert.deepEqual(restored.getOpeningContractProgress(), session.getOpeningContractProgress());
});

test("opening contract CTA delegates to the shared weekly command coordinator", () => {
  const overview = readFileSync(new URL("../public/lib/tabOverview.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const tutorial = readFileSync(new URL("../public/lib/tutorialCampaign.js", import.meta.url), "utf8");
  assert.match(overview, /dataset\.openingPrologueAction = "advance-week"/);
  assert.match(overview, /openingContractProgress/);
  assert.match(app, /data-opening-prologue-action='advance-week'/);
  assert.match(app, /document\.getElementById\("advanceWeekBtn"\)\?\.click\(\)/);
  assert.match(tutorial, /It's Week 1 of your first season/);
});
