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
  assert.ok(session.seasonSchedule.find(entry => Number(entry.week) === 1).games.some(game =>
    game.homeTeamId === session.controlledTeamId || game.awayTeamId === session.controlledTeamId), 'new seasons must schedule the controlled club in Week 1');
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
  const evidence = restored.getOpeningContractProgress().steps.find(step => step.id === 'plan').detail;
  restored.getControlledTeam().weeklyPlan.summary = 'A different upcoming matchup plan';
  assert.equal(restored.getOpeningContractProgress().steps.find(step => step.id === 'plan').detail, evidence,
    'completed opening evidence is independent of upcoming plans');
  const completed = restored.getOpeningContractProgress();
  const firstFilm = restored.league.tacticalFilmLog[0];
  restored.league.tacticalFilmLog.unshift({ ...firstFilm, week: Number(firstFilm.week) + 1, label: 'Later Week Pass-Heavy', observed: 'Later game evidence' });
  assert.deepEqual(restored.getOpeningContractProgress(), completed, 'later film cannot replace the opening game tactic');
  delete restored.league.startScenarioReceipt.effects.weeklyPlan;
  const legacy = restored.getOpeningContractProgress();
  assert.equal(legacy.steps.find(step => step.id === 'plan').detail, firstFilm.label);
  assert.equal(legacy.result.tactic, firstFilm.label);
  assert.equal(legacy.result.tacticalVerdict, firstFilm.observed);
  assert.deepEqual(createSessionFromSnapshot(restored.toSnapshot()).getOpeningContractProgress(), legacy);
});

test("opening prologue advances honestly when the controlled team starts on a bye", () => {
  const session = createSession({ seed: 52033, startYear: 2026, controlledTeamId: "BUF" });
  const openingWeek = session.seasonSchedule.find((entry) => Number(entry.week) === 1);
  openingWeek.games = openingWeek.games.filter((game) => game.homeTeamId !== "BUF" && game.awayTeamId !== "BUF");
  session.applyStartScenario(openingRequest());

  const command = executeAdvanceWeekCommand(session, { count: 1, weeklyTacticOverride: "run-heavy" });
  assert.equal(command.ok, true);
  const progress = session.getDashboardState().openingContractProgress;
  assert.equal(progress.status, "active");
  assert.match(progress.steps.find((step) => step.id === "receipt").detail, /Week 1 was a scheduled bye/i);
  assert.match(progress.nextAction, /Week 2/i);
  assert.doesNotMatch(progress.nextAction, /play the opening week/i);
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
