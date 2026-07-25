import test from "node:test";
import assert from "node:assert/strict";
import {
  FAST_SIMULATION_POLICY_VERSION,
  applyFastSimulationPolicy,
  createFastSimulationPolicy,
  policyDigestEvidence
} from "../public/lib/fastSimulationPolicy.js";
import { appendSimulationDigest, formatSimulationDigest } from "../public/lib/simulationCheckpoints.js";

test("architect auto-plan is explicit, versioned, and regular-season scoped", () => {
  const policy = createFastSimulationPolicy("run-heavy", "four-weeks");
  assert.equal(policy.schemaVersion, FAST_SIMULATION_POLICY_VERSION);
  assert.equal(policy.tactic.label, "Run-Heavy");
  assert.match(policy.disclaimer, /regular-season/i);
  assert.deepEqual(
    applyFastSimulationPolicy({ count: 1 }, { phase: "regular-season" }, policy),
    { count: 1, weeklyTacticOverride: "run-heavy" }
  );
  assert.deepEqual(
    applyFastSimulationPolicy({ count: 1 }, { phase: "offseason" }, policy),
    { count: 1 }
  );
});

test("unknown tactics and implicit no-plan choices never fabricate intent", () => {
  assert.equal(createFastSimulationPolicy("four-verts", "season"), null);
  assert.equal(createFastSimulationPolicy(null, "four-weeks"), null);
  assert.deepEqual(
    applyFastSimulationPolicy({ count: 1 }, { phase: "regular-season" }, null),
    { count: 1 }
  );
});

test("accelerated digest joins policy to the committed Architect receipt", () => {
  const policy = createFastSimulationPolicy("pass-heavy", "season");
  const architectEntry = {
    id: "architect-2026-4",
    intent: { tactic: { id: "pass-heavy", label: "Pass-Heavy" } },
    execution: {
      started: { year: 2026, week: 4 },
      completed: { year: 2026, week: 5 }
    },
    evidence: { aligned: true },
    nextAdaptation: "Reinforce the spacing."
  };
  const evidence = policyDigestEvidence(policy, architectEntry);
  const digest = appendSimulationDigest([], {
    previous: { currentYear: 2026, currentWeek: 4 },
    next: { currentYear: 2026, currentWeek: 5, phase: "regular-season" },
    policyEvidence: evidence
  });
  assert.equal(digest[0].policy.tactic, "Pass-Heavy");
  assert.equal(digest[0].policy.receiptId, "architect-2026-4");
  assert.match(formatSimulationDigest(digest)[0], /Plan: Pass-Heavy · aligned/);
});
