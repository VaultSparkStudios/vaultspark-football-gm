import test from "node:test";
import assert from "node:assert/strict";
import {
  commitWeeklyPlanReceipt,
  composeWeeklyPlan,
  describeWeeklyPlanReceipt
} from "../public/lib/weeklyPlanComposer.js";

test("weekly composer resolves GM choice before tactic and emits one body", async () => {
  const calls = [];
  const result = await composeWeeklyPlan({
    phase: "regular-season",
    collectDecision: async () => {
      calls.push("decision");
      return { status: "chosen", choice: { decisionId: "d1", choiceId: "c1", occurrenceKey: "o1" } };
    },
    collectTactic: async () => {
      calls.push("tactic");
      return "aggressive";
    },
    reviewPlan: async (receipt) => {
      calls.push(`review:${receipt.plan.tacticId}`);
      return { status: "commit", evidence: { reviewed: true } };
    },
    onCheckpoint: (name) => calls.push(name)
  });

  assert.equal(result.deferred, false);
  assert.deepEqual(result.body, {
    count: 1,
    gmDecisionChoice: { decisionId: "d1", choiceId: "c1", occurrenceKey: "o1" },
    weeklyTacticOverride: "aggressive"
  });
  assert.ok(calls.indexOf("decision") < calls.indexOf("tactic"));
  assert.deepEqual(result.receipt.compositionOrder, ["gm-decision", "tactic", "review"]);
  assert.deepEqual(result.receipt.review, { reviewed: true });
});

test("review can revise the tactic before one final commit", async () => {
  const tactics = ["run-heavy", "pass-heavy"];
  const reviews = ["revise", "commit"];
  const result = await composeWeeklyPlan({
    phase: "regular-season",
    collectTactic: async () => tactics.shift(),
    reviewPlan: async () => ({ status: reviews.shift(), evidence: { reviewed: true } })
  });
  assert.equal(result.deferred, false);
  assert.equal(result.body.weeklyTacticOverride, "pass-heavy");
  assert.deepEqual(result.receipt.compositionOrder, ["gm-decision", "tactic", "review", "review-revise", "tactic-revision", "review"]);
});

test("review deferral is non-mutating and returns no command body", async () => {
  const result = await composeWeeklyPlan({
    phase: "regular-season",
    collectTactic: async () => "run-heavy",
    reviewPlan: async () => ({ status: "deferred" })
  });
  assert.equal(result.deferred, true);
  assert.equal(result.body, null);
  assert.equal(result.receipt.status, "deferred");
});

test("deferred decision is non-mutating and never opens tactic collector", async () => {
  let tacticCalls = 0;
  const result = await composeWeeklyPlan({
    phase: "regular-season",
    collectDecision: async () => ({ status: "deferred", choice: null }),
    collectTactic: async () => { tacticCalls += 1; return "balanced"; }
  });
  assert.equal(result.deferred, true);
  assert.equal(result.body, null);
  assert.equal(tacticCalls, 0);
  assert.equal(result.receipt.status, "deferred");
});

test("explicit no-plan remains honest and commit receipt names source authority", async () => {
  const preview = await composeWeeklyPlan({
    phase: "regular-season",
    presetDecisionChoice: { decisionId: "d2", choiceId: "c2" },
    collectTactic: async () => null
  });
  assert.equal(preview.receipt.plan.explicitNoPlan, true);
  assert.equal("weeklyTacticOverride" in preview.body, false);

  const committed = commitWeeklyPlanReceipt(preview.receipt, {
    state: { currentYear: 2030, currentWeek: 7, controlledTeamId: "BUF" },
    gmDecision: { applied: true },
    architectEntry: { id: "architect-BUF-2030-7" }
  });
  assert.equal(committed.status, "committed");
  assert.equal(committed.authority.teamId, "BUF");
  assert.match(describeWeeklyPlanReceipt(committed).detail, /explicit no-plan/);
  assert.match(committed.disclaimer, /does not claim/);
});

test("committed receipt keeps the source used to red-team the plan visible", async () => {
  const preview = await composeWeeklyPlan({
    phase: "regular-season",
    collectTactic: async () => "run-heavy",
    reviewPlan: async () => ({
      status: "commit",
      evidence: { reviewed: true, counterSignalSource: "Latest matching film", authority: "fa-a:BUF:2030:7" }
    })
  });
  const committed = commitWeeklyPlanReceipt(preview.receipt, { state: { currentYear: 2030, currentWeek: 8, controlledTeamId: "BUF" } });
  assert.match(describeWeeklyPlanReceipt(committed).detail, /reviewed against Latest matching film/);
});
