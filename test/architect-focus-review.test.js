import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    targetTab: "overviewTab",
    targetId: "advanceWeekBtn",
    label: "Prepare your next weekly plan"
  });
});

test("every mastery focus names a real tab and a reachable target in the shipped game shell", () => {
  const html = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  for (const id of ["results", "stewardship", "promise", "identity"]) {
    const value = { paths: [{ ...portfolio().paths[0], id }] };
    const action = buildArchitectFocusReview({
      thesis: { focusPathId: id, focusBaseline: captureArchitectFocusBaseline(value, id) },
      portfolio: value
    }).nextAction;
    const tab = new RegExp(`<section id="${action.targetTab}" class="tab-panel`);
    assert.match(html, tab, `${id}: destination tab exists`);
    const targetOffset = html.indexOf(`id="${action.targetId}"`);
    assert.ok(targetOffset >= 0, `${id}: destination target exists`);
    const precedingPanels = [...html.slice(0, targetOffset).matchAll(/<section id="([^"]+)" class="tab-panel/g)];
    const owner = precedingPanels.at(-1)?.[1];
    // Header controls precede all panels and are reachable from every tab.
    if (owner) assert.equal(owner, action.targetTab, `${id}: target belongs to selected tab`);
  }
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
