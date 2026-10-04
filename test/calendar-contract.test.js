import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { getSportRules } from "../src/sport/registry.js";
import { FOOTBALL_CALENDAR } from "../src/sport/football/calendar.js";
import {
  UnknownCalendarPhaseError,
  calendarPhase,
  nextCalendarPhaseId,
  offseasonStageIds,
  validateCalendar
} from "../src/sport/calendarContract.js";

const restore = (session) => GameSession.fromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())), (seed) => new RNG(seed));
const phaseIds = FOOTBALL_CALENDAR.phases.map((phase) => phase.id);

test("the football pack carries the calendar and every handler it names is a GameSession method", () => {
  assert.equal(getSportRules("football").calendar, FOOTBALL_CALENDAR);
  assert.deepEqual(validateCalendar(FOOTBALL_CALENDAR, GameSession.prototype), []);
});

test("phase and stage ids are the strings old saves already store", () => {
  assert.deepEqual(phaseIds, ["regular-season", "postseason", "season-awards", "offseason"]);
  assert.deepEqual(offseasonStageIds(FOOTBALL_CALENDAR), [
    "retirements", "coaching-carousel", "combine", "pro-days", "free-agency", "draft", "udfa", "camp-cuts", "complete"
  ]);
  assert.equal(nextCalendarPhaseId(FOOTBALL_CALENDAR, "offseason"), "regular-season", "the offseason wraps to a new season");
});

test("every phase GameSession compares against is declared by the calendar", () => {
  const source = fs.readFileSync(new URL("../src/runtime/GameSession.js", import.meta.url), "utf8");
  const compared = new Set([...source.matchAll(/this\.phase\s*[!=]==\s*"([a-z-]+)"/g)].map((match) => match[1]));
  assert.ok(compared.size > 0, "the scan found the phase comparisons");
  for (const id of compared) assert.ok(phaseIds.includes(id), `GameSession compares against undeclared phase "${id}"`);
});

test("a season played through advanceWeek visits only declared phases and stages, in calendar order", () => {
  const session = new GameSession({ rng: new RNG(4), startYear: 2026, controlledTeamId: "BUF", mode: "drive" });
  const pipeline = session.getOffseasonPipeline();
  assert.deepEqual(pipeline.stages, offseasonStageIds(FOOTBALL_CALENDAR), "the snapshot pipeline lists the calendar's stages");
  assert.equal(pipeline.stage, FOOTBALL_CALENDAR.offseasonStages[0].id);

  const seen = [session.phase];
  const startYear = session.currentYear;
  let guard = 0;
  while (!(session.currentYear > startYear && session.phase === "regular-season") && guard++ < 400) {
    if (session.phase === "offseason" && session.getOffseasonPipeline().stage === "draft" && session.getDraftAuthority().userActionRequired) {
      session.runCpuDraft({ untilUserPick: false });
    }
    session.advanceWeek();
    if (seen[seen.length - 1] !== session.phase) seen.push(session.phase);
  }
  assert.deepEqual(seen, [...phaseIds, phaseIds[0]], "phases advance exactly in declared order and wrap");

  const finished = session.league.offseasonPipeline;
  const declaredStages = offseasonStageIds(FOOTBALL_CALENDAR);
  assert.equal(finished.completed, true);
  assert.equal(finished.stage, "complete");
  const visited = [...new Set(finished.history.map((entry) => entry.stage))];
  assert.deepEqual(visited, declaredStages.slice(0, -1), "every working stage ran once, in calendar order");
  for (const entry of finished.history) {
    assert.ok(declaredStages.includes(entry.stage), `history ran undeclared stage "${entry.stage}"`);
    assert.equal(entry.result.nextStage, declaredStages[declaredStages.indexOf(entry.stage) + 1], "the recorded next stage is the calendar's");
  }
});

test("a restored session resolves the same calendar", () => {
  const session = new GameSession({ rng: new RNG(5), startYear: 2026, controlledTeamId: "CHI" });
  const restored = restore(session);
  assert.equal(restored.sportRules.calendar, session.sportRules.calendar);
  assert.equal(restored.sportRules.calendar, FOOTBALL_CALENDAR);
  assert.deepEqual(restored.getOffseasonPipeline().stages, offseasonStageIds(FOOTBALL_CALENDAR));
});

test("an unknown phase throws a named error instead of silently doing nothing", () => {
  assert.throws(() => calendarPhase(FOOTBALL_CALENDAR, "preseason"), UnknownCalendarPhaseError);
  const session = new GameSession({ rng: new RNG(6), startYear: 2026, controlledTeamId: "BUF" });
  const restored = restore(session);
  restored.phase = "preseason";
  assert.throws(() => restored.advanceWeek(), (error) => {
    assert.ok(error instanceof UnknownCalendarPhaseError);
    assert.equal(error.name, "UnknownCalendarPhaseError");
    assert.equal(error.phaseId, "preseason");
    return true;
  });
});

test("an offseason stage the calendar does not declare (a legacy save) completes the pipeline, as before", () => {
  const session = new GameSession({ rng: new RNG(7), startYear: 2026, controlledTeamId: "BUF" });
  const pipeline = session.getOffseasonPipeline();
  pipeline.stage = "legacy-stage";
  const result = session.advanceOffseasonPipeline();
  assert.equal(result.completed, true);
  assert.equal(result.stage, "complete");
});

test("the validator catches a malformed calendar", () => {
  const broken = {
    phases: [{ id: "a", handler: "nope" }, { id: "a", handler: "advanceWeek" }],
    offseasonStages: [{ id: "end", terminal: true }, { id: "x", handler: "advanceWeek" }]
  };
  const problems = validateCalendar(broken, GameSession.prototype);
  assert.ok(problems.some((p) => p.includes('"a" is declared twice')));
  assert.ok(problems.some((p) => p.includes("nope is not a method")));
  assert.ok(problems.some((p) => p.includes('terminal stage "end" is not last')));
  assert.ok(problems.some((p) => p.includes('last stage "x" is not terminal')));
});
