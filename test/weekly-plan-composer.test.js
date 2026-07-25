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
    onCheckpoint: (name) => calls.push(name)
  });

  assert.equal(result.deferred, false);
  assert.deepEqual(result.body, {
    count: 1,
    gmDecisionChoice: { decisionId: "d1", choiceId: "c1", occurrenceKey: "o1" },
    weeklyTacticOverride: "aggressive"
  });
  assert.ok(calls.indexOf("decision") < calls.indexOf("tactic"));
  assert.deepEqual(result.receipt.compositionOrder, ["gm-decision", "tactic"]);
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
