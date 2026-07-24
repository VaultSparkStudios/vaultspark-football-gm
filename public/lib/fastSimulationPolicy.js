import { tacticDefinition } from "./tacticalFilmRoom.js";

export const FAST_SIMULATION_POLICY_VERSION = "1.0";

const SCOPES = Object.freeze({
  "four-weeks": {
    label: "next four weeks",
    disclaimer: "The same weekly intent will be requested for each regular-season game until a checkpoint or the four-week window ends."
  },
  season: {
    label: "this season run",
    disclaimer: "The same weekly intent will be requested only for regular-season games; offseason and draft checkpoints never inherit it."
  }
});

export function createFastSimulationPolicy(tacticId, scope = "four-weeks") {
  const tactic = tacticDefinition(tacticId);
  const scopeDefinition = SCOPES[scope];
  if (!tactic || !scopeDefinition) return null;
  return {
    schemaVersion: FAST_SIMULATION_POLICY_VERSION,
    kind: "architect-auto-plan",
    scope,
    scopeLabel: scopeDefinition.label,
    tactic: {
      id: tacticId,
      label: tactic.label,
      intent: tactic.intent,
      tradeoff: tactic.tradeoff
    },
    disclaimer: scopeDefinition.disclaimer
  };
}

export function applyFastSimulationPolicy(body = {}, dashboard = {}, policy = null) {
  if (
    policy?.schemaVersion !== FAST_SIMULATION_POLICY_VERSION ||
    policy?.kind !== "architect-auto-plan" ||
    dashboard?.phase !== "regular-season" ||
    !tacticDefinition(policy?.tactic?.id)
  ) {
    return { ...body };
  }
  return { ...body, weeklyTacticOverride: policy.tactic.id };
}

export function policyDigestEvidence(policy = null, architectEntry = null) {
  if (!policy || !architectEntry?.intent?.tactic) return null;
  const execution = architectEntry.execution || {};
  return {
    tactic: architectEntry.intent.tactic.label || policy.tactic.label,
    aligned: architectEntry.evidence?.aligned ?? null,
    adaptation: architectEntry.nextAdaptation || null,
    receiptId: architectEntry.id || null,
    interval: execution.started && execution.completed
      ? `${execution.started.year}:${execution.started.week}→${execution.completed.year}:${execution.completed.week}`
      : null
  };
}
