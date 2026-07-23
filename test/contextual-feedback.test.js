import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTEXTUAL_FEEDBACK_CADENCE_MS,
  deriveContextualEvidenceMoments,
  recordContextualFeedbackAction,
  selectContextualEvidenceMoment
} from "../public/lib/contextualFeedback.js";
import { buildLocalPlaytestReceipt, saveLocalPlaytestReceipt, loadLocalPlaytestReceipts } from "../public/lib/playtestReceipts.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const dashboard = {
  controlledTeamId: "BUF",
  currentYear: 2027,
  currentWeek: 1,
  phase: "offseason",
  seasonsSimulated: 1,
  champions: [{ year: 2026, championTeamId: "KC" }],
  draft: { year: 2027, controlledSelections: [{ pick: 9, player: "Avery Stone", pos: "CB" }] },
  openingContractProgress: { status: "completed", result: { verdict: "W" } }
};

test("evidence moments are derived only from authoritative milestone fields and ranked by arc depth", () => {
  const moments = deriveContextualEvidenceMoments(dashboard);
  assert.deepEqual(moments.map((moment) => moment.kind), [
    "season-complete", "controlled-team-draft-selection", "opening-contract-complete"
  ]);
  assert.match(moments[1].title, /Avery Stone/);
  assert.deepEqual(deriveContextualEvidenceMoments({ controlledTeamId: "BUF" }), []);
});

test("contextual prompts dedupe, snooze, dismiss, and enforce a seven-day global cadence", () => {
  const now = 1_800_000_000_000;
  const first = selectContextualEvidenceMoment({ dashboard, ledger: {}, now });
  assert.equal(first.kind, "season-complete");
  const shown = recordContextualFeedbackAction({ ledger: {}, momentId: first.id, action: "shown", now });
  assert.equal(selectContextualEvidenceMoment({ dashboard, ledger: shown, now: now + 1 }), null);
  const snoozed = recordContextualFeedbackAction({ ledger: shown, momentId: first.id, action: "snooze", now });
  assert.deepEqual(selectContextualEvidenceMoment({ dashboard, ledger: snoozed, now: now + CONTEXTUAL_FEEDBACK_CADENCE_MS }), first);
  const dismissed = recordContextualFeedbackAction({ ledger: snoozed, momentId: first.id, action: "dismiss", now });
  assert.equal(selectContextualEvidenceMoment({ dashboard, ledger: dismissed, now: now + CONTEXTUAL_FEEDBACK_CADENCE_MS }).kind, "controlled-team-draft-selection");
});

test("contextual evidence saves to the shared local-only receipt format without network behavior", () => {
  const storage = memoryStorage();
  const receipt = buildLocalPlaytestReceipt({
    clarity: 4, agency: 5, pace: 3, returnIntent: 5, note: "The board made the tradeoff legible."
  }, {
    year: 2027, week: 1, phase: "offseason", teamId: "BUF", evidenceMoment: "controlled-team-draft-selection"
  });
  saveLocalPlaytestReceipt(receipt, storage);
  assert.equal(loadLocalPlaytestReceipts(storage)[0].context.evidenceMoment, "controlled-team-draft-selection");
  assert.equal(receipt.privacy.localOnlyUntilShared, true);
  const source = readFileSync(new URL("../public/lib/contextualFeedback.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|window\.open/);
});

test("dashboard hydration mounts the contextual evidence evaluator", () => {
  const source = readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  assert.match(source, /maybeMountContextualFeedback\(newState/);
});