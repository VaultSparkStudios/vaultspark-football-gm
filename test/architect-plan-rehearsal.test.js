import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPlanRehearsalNeed,
  buildArchitectPlanRehearsal,
  planRehearsalEvidence,
  standingReinforcementEvidence,
  standingTacticFromDashboard
} from "../public/lib/architectPlanRehearsal.js";

const dashboard = {
  franchiseId: "fa-59-BUF",
  controlledTeamId: "BUF",
  currentYear: 2031,
  currentWeek: 8,
  startScenarioReceipt: {
    effects: {
      identity: { label: "Build through the trenches" },
      pressure: { label: "Win with patience" }
    }
  },
  tacticalFilmLedger: [{
    tactic: "run-heavy",
    label: "Run-Heavy",
    aligned: false,
    observed: "31% rush share"
  }],
  currentWeekSchedule: { games: [{ homeTeamId: "BUF", awayTeamId: "MIA" }] },
  teams: [{ id: "MIA", name: "Miami", scheme: { passRate: 0.61, aggression: 0.65 }, overallRating: 86 }]
};

test("rehearsal joins staged intent to source-derived pressure and strongest counter-signal", () => {
  const rehearsal = buildArchitectPlanRehearsal({
    dashboard,
    decisionChoice: { choiceId: "protect-the-core" },
    tacticId: "run-heavy"
  });
  assert.equal(rehearsal.authority, "fa-59-BUF:BUF:2031:8");
  assert.equal(rehearsal.decision.label, "Protect The Core");
  assert.equal(rehearsal.tactic.label, "Run-Heavy");
  assert.equal(rehearsal.franchisePromise, "Build through the trenches");
  assert.equal(rehearsal.activePressure, "Win with patience");
  assert.equal(rehearsal.counterSignal.source, "Latest matching film");
  assert.match(rehearsal.counterSignal.text, /31% rush share/);
  assert.match(rehearsal.disclaimer, /predicts no result/);
});

test("no-plan rehearsal is explicit and still produces bounded review evidence", () => {
  const rehearsal = buildArchitectPlanRehearsal({ dashboard, tacticId: null });
  assert.equal(rehearsal.tactic.label, "Explicit no-plan");
  assert.match(rehearsal.counterSignal.text, /no tactical intent/i);
  assert.deepEqual(planRehearsalEvidence(rehearsal), {
    schemaVersion: "1.0",
    authority: "fa-59-BUF:BUF:2031:8",
    counterSignalSource: "No-plan boundary",
    tacticId: null,
    reviewed: true
  });
});

test("review evidence rejects non-rehearsal payloads", () => {
  assert.equal(planRehearsalEvidence({ schemaVersion: "1.0", kind: "other" }), null);
});

test("standing-plan reinforcement skips ceremony only when every red flag is absent", () => {
  const stable = {
    ...dashboard,
    tacticalFilmLedger: [{
      id: "film-2031-7-BUF-run-heavy",
      tactic: "run-heavy",
      aligned: true,
      observed: "52% rush share"
    }],
    architectLedger: [],
    architectThesis: null,
    controlledTeam: { owner: { expectation: { heat: 30, ultimatum: null } } },
    injuryReport: []
  };
  assert.equal(standingTacticFromDashboard(stable).id, "run-heavy");
  const assessment = assessPlanRehearsalNeed({ dashboard: stable, tacticId: "run-heavy" });
  assert.equal(assessment.required, false);
  assert.deepEqual(assessment.reasons, ["standing-plan-stable"]);
  const evidence = standingReinforcementEvidence(assessment);
  assert.equal(evidence.reviewed, false);
  assert.equal(evidence.mode, "standing-reinforcement");
  assert.equal(evidence.sourceReceiptId, "film-2031-7-BUF-run-heavy");
});

test("standing-plan assessor fails closed on material counter-signals", () => {
  const base = {
    ...dashboard,
    tacticalFilmLedger: [{ id: "film-1", tactic: "run-heavy", aligned: true }],
    architectLedger: [],
    architectThesis: null,
    controlledTeam: { owner: { expectation: { heat: 30 } } },
    injuryReport: []
  };
  assert.deepEqual(
    assessPlanRehearsalNeed({ dashboard: base, tacticId: "pass-heavy" }).reasons,
    ["plan-changed"]
  );
  assert.ok(assessPlanRehearsalNeed({
    dashboard: base,
    tacticId: "run-heavy",
    decisionChoice: { choiceId: "protect-the-core" }
  }).reasons.includes("gm-decision"));
  assert.ok(assessPlanRehearsalNeed({
    dashboard: { ...base, tacticalFilmLedger: [{ id: "film-1", tactic: "run-heavy", aligned: false }] },
    tacticId: "run-heavy"
  }).reasons.includes("failed-matching-film"));
  assert.ok(assessPlanRehearsalNeed({
    dashboard: { ...base, controlledTeam: { owner: { expectation: { ultimatum: { active: true } } } } },
    tacticId: "run-heavy"
  }).reasons.includes("owner-red-flag"));
});
