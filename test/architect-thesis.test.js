import test from "node:test";
import assert from "node:assert/strict";
import {
  auditArchitectThesisLineage,
  getArchitectThesis,
  resolveArchitectThesis,
  setArchitectThesis
} from "../src/engine/architectThesis.js";
import { buildArchitectMasteryPortfolio } from "../src/engine/architectMasteryPortfolio.js";
import { initGmLegacy } from "../src/engine/gmLegacyScore.js";
import { buildArchitectPlanRehearsal } from "../public/lib/architectPlanRehearsal.js";

function fixture() {
  const league = {
    teams: [{ id: "BUF" }],
    champions: [],
    architectLedger: [{
      id: "architect-BUF-2026-1-2026-2",
      teamId: "BUF",
      intent: { tactic: { id: "run-heavy" } },
      outcome: { observed: "Rushing rate rose in the committed game.", aligned: true }
    }]
  };
  initGmLegacy(league);
  return league;
}

test("focus is player-authored while the lowest path remains an explicit recommendation", () => {
  const league = fixture();
  const result = setArchitectThesis(league, { teamId: "BUF", focusPathId: "identity", year: 2026, week: 2 });
  assert.equal(result.ok, true);
  const mastery = buildArchitectMasteryPortfolio(league, "BUF");
  assert.equal(mastery.focus.pathId, "identity");
  assert.equal(mastery.focus.source, "player-authored");
  assert.ok(mastery.paths.some((path) => path.id === mastery.recommendedFocus.pathId));
});

test("adaptation requires source film, validates values, and preserves unrelated focus", () => {
  const empty = { teams: [{ id: "BUF" }] };
  assert.equal(setArchitectThesis(empty, { teamId: "BUF", adaptationMode: "counter" }).status, 409);
  assert.equal(setArchitectThesis(empty, { teamId: "BUF", focusPathId: "magic" }).status, 400);
  const league = fixture();
  setArchitectThesis(league, { teamId: "BUF", focusPathId: "promise" });
  const declared = setArchitectThesis(league, { teamId: "BUF", adaptationMode: "investigate", year: 2026, week: 2 });
  assert.equal(declared.thesis.focusPathId, "promise");
  assert.equal(declared.thesis.pendingAdaptation.sourceEntryId, league.architectLedger[0].id);
});

test("resolution consumes the pending hypothesis with descriptive, non-causal evidence", () => {
  const league = fixture();
  setArchitectThesis(league, { teamId: "BUF", adaptationMode: "reinforce", year: 2026, week: 2 });
  const entry = { id: "architect-BUF-2026-2-2026-3", outcome: { observed: "Explosive runs fell.", aligned: false } };
  const resolution = resolveArchitectThesis(league, "BUF", entry);
  assert.match(resolution.summary, /Explosive runs fell/);
  assert.match(resolution.disclaimer, /does not infer causation/i);
  assert.equal(getArchitectThesis(league, "BUF").pendingAdaptation, null);
  assert.equal(getArchitectThesis(league, "BUF").resolutions[0].resolvedByEntryId, entry.id);
});

test("weekly rehearsal surfaces the pending player thesis without predicting a result", () => {
  const dashboard = {
    controlledTeamId: "BUF",
    currentYear: 2026,
    currentWeek: 3,
    architectThesis: { pendingAdaptation: { label: "Counter", sourceEntryId: "receipt-1", sourceObserved: "Pressure rate fell." } }
  };
  const rehearsal = buildArchitectPlanRehearsal({ dashboard, tacticId: null });
  assert.match(rehearsal.architectThesis.text, /Pressure rate fell/);
  assert.match(rehearsal.disclaimer, /predicts no result/i);
});

test("revision conflicts fail closed without overwriting newer intent", () => {
  const league = fixture();
  const first = setArchitectThesis(league, { teamId: "BUF", focusPathId: "identity", expectedRevision: 0 });
  assert.equal(first.thesis.revision, 1);
  const conflict = setArchitectThesis(league, { teamId: "BUF", focusPathId: "results", expectedRevision: 0 });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.reasonCode, "ARCHITECT_THESIS_REVISION_CONFLICT");
  assert.equal(getArchitectThesis(league, "BUF").focusPathId, "identity");
  assert.equal(getArchitectThesis(league, "BUF").revision, 1);
});

test("lineage derives from ledger authority and detects observation drift", () => {
  const league = fixture();
  setArchitectThesis(league, { teamId: "BUF", adaptationMode: "counter" });
  const resolvedEntry = {
    id: "architect-BUF-2026-2-2026-3",
    teamId: "BUF",
    year: 2026,
    week: 3,
    outcome: { observed: "Pressure rate rose.", aligned: true }
  };
  league.architectLedger.unshift(resolvedEntry);
  resolveArchitectThesis(league, "BUF", resolvedEntry);
  assert.equal(auditArchitectThesisLineage(league, "BUF").valid, true);
  league.architectTheses.BUF.resolutions[0].observed = "Invented observation";
  const drift = auditArchitectThesisLineage(league, "BUF");
  assert.equal(drift.valid, false);
  assert.ok(drift.issues.some((issue) => issue.code === "THESIS_RESOLUTION_OBSERVATION_DRIFT"));
});
