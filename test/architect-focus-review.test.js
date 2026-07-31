import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArchitectFocusReview,
  captureArchitectFocusBaseline
} from "../src/engine/architectFocusReview.js";

function portfolio(score = 4, evidenceCount = 1) {
  return {
    paths: [{
      id: "identity",
      label: "Architect Identity",
      score,
      evidenceCount,
      evidence: `${evidenceCount} committed receipt(s)`,
      nextMilestone: "Commit the next film receipt."
    }]
  };
}

test("focus review baseline is captured from portfolio authority, not browser fields", () => {
  const baseline = captureArchitectFocusBaseline(portfolio(), "identity", {
    year: 2026,
    week: 3,
    phase: "regular-season"
  });
  assert.deepEqual(baseline, {
    schemaVersion: "1.0",
    pathId: "identity",
    label: "Architect Identity",
    score: 4,
    evidenceCount: 1,
    evidence: "1 committed receipt(s)",
    declaredAt: { year: 2026, week: 3, phase: "regular-season" },
    authority: "architect-mastery-portfolio"
  });
});

test("focus review states no change explicitly and points to an exact action", () => {
  const focusBaseline = captureArchitectFocusBaseline(portfolio(), "identity");
  const review = buildArchitectFocusReview({
    thesis: { focusPathId: "identity", focusBaseline },
    portfolio: portfolio(),
    year: 2026,
    week: 4,
    phase: "regular-season"
  });
  assert.equal(review.status, "no-new-receipt");
  assert.equal(review.newReceipt, false);
  assert.deepEqual(review.delta, { score: 0, evidenceCount: 0 });
  assert.deepEqual(review.nextAction, {
    targetTab: "strategyTab",
    targetId: "weeklyTacticCard",
    label: "Declare a tactic and commit its next film receipt"
  });
});

test("focus review reports only source-derived deltas", () => {
  const focusBaseline = captureArchitectFocusBaseline(portfolio(4, 1), "identity");
  const review = buildArchitectFocusReview({
    thesis: { focusPathId: "identity", focusBaseline },
    portfolio: portfolio(9, 3)
  });
  assert.equal(review.status, "new-source-receipt");
  assert.deepEqual(review.delta, { score: 5, evidenceCount: 2 });
  assert.equal(review.newReceipt, true);
});
