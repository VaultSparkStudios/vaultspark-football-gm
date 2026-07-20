import { applyGmDecisionConsequence, resolveGmDecisionConsequence } from "../engine/gmDecisionConsequences.js";
import { validatePendingGmDecision } from "../engine/gmDecisionAuthority.js";
import { buildTacticalFilmReceipt, tacticDefinition } from "../../public/lib/tacticalFilmRoom.js";

export const ADVANCE_WEEK_COMMAND_VERSION = "2.0";

const tacticModifiers = Object.freeze({
  "run-heavy": { passLeanDelta: -0.15, aggressionDelta: 0.05, summary: "Ground game focus" },
  "pass-heavy": { passLeanDelta: 0.15, aggressionDelta: 0.05, summary: "Air attack tempo" },
  "blitz-heavy": { passLeanDelta: -0.05, aggressionDelta: 0.2, summary: "Pressure package" },
  prevent: { passLeanDelta: -0.1, aggressionDelta: -0.15, summary: "Prevent defense" }
});

function normalizeCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(40, parsed)) : 1;
}

export function validateAdvanceWeekCommand(session, payload = {}) {
  if (!session?.league) {
    return { ok: false, status: 409, reasonCode: "ADVANCE_WEEK_NO_SESSION", error: "No active league can advance." };
  }
  const tactic = payload.weeklyTacticOverride ? String(payload.weeklyTacticOverride) : null;
  if (tactic && !tacticDefinition(tactic)) {
    return { ok: false, status: 400, reasonCode: "ADVANCE_WEEK_UNKNOWN_TACTIC", error: `Unknown weekly tactic: ${tactic}.` };
  }
  const pendingDecision = session.getDashboardState?.().gmDecisionQueue?.[0] || null;
  const pendingValidation = validatePendingGmDecision(pendingDecision, payload.gmDecisionChoice || null);
  if (!pendingValidation.ok) return pendingValidation;
  if (payload.gmDecisionChoice && !resolveGmDecisionConsequence(payload.gmDecisionChoice)) {
    return { ok: false, status: 400, reasonCode: "ADVANCE_WEEK_UNKNOWN_GM_DECISION", error: "Unknown GM decision choice." };
  }
  return { ok: true, count: normalizeCount(payload.count), tactic, gmDecisionChoice: pendingValidation.choice };
}

export function executeAdvanceWeekCommand(session, payload = {}, { afterAdvance } = {}) {
  const command = validateAdvanceWeekCommand(session, payload);
  if (!command.ok) return command;

  const started = { year: session.currentYear, week: session.currentWeek, phase: session.phase };
  const gmDecision = command.gmDecisionChoice
    ? applyGmDecisionConsequence(session, command.gmDecisionChoice)
    : { ok: true, applied: false };
  if (!gmDecision.ok) return { ...gmDecision, status: 400, reasonCode: "ADVANCE_WEEK_GM_DECISION_FAILED" };

  const team = command.tactic && session.controlledTeamId
    ? session.league.teams?.find((entry) => entry.id === session.controlledTeamId)
    : null;
  const originalWeeklyPlan = team?.weeklyPlan ? { ...team.weeklyPlan } : null;
  if (team?.weeklyPlan && command.tactic) Object.assign(team.weeklyPlan, tacticModifiers[command.tactic]);

  const results = [];
  try {
    for (let index = 0; index < command.count; index += 1) {
      const before = { year: session.currentYear, week: session.currentWeek, phase: session.phase };
      const result = session.advanceWeek();
      results.push(result);
      afterAdvance?.({ result, before, session, index });
    }
  } finally {
    if (team && originalWeeklyPlan) team.weeklyPlan = originalWeeklyPlan;
  }

  const tacticalReceipt = command.tactic
    ? buildTacticalFilmReceipt({
        tactic: command.tactic,
        results,
        controlledTeamId: session.controlledTeamId,
        year: session.currentYear
      })
    : null;
  if (tacticalReceipt) {
    if (!Array.isArray(session.league.tacticalFilmLog)) session.league.tacticalFilmLog = [];
    session.league.tacticalFilmLog.unshift(tacticalReceipt);
    session.league.tacticalFilmLog = session.league.tacticalFilmLog.slice(0, 40);
  }

  return {
    ok: true,
    count: command.count,
    results,
    gmDecision,
    tacticApplied: command.tactic,
    tacticalReceipt,
    commandReceipt: {
      schemaVersion: ADVANCE_WEEK_COMMAND_VERSION,
      kind: "advance-week",
      started,
      completed: { year: session.currentYear, week: session.currentWeek, phase: session.phase },
      count: command.count,
      tactic: command.tactic,
      gmDecisionApplied: gmDecision.applied === true
    }
  };
}

function cloneSessionForTransaction(session) {
  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  return session.constructor.fromSnapshot(
    snapshot,
    (seed) => new session.rng.constructor(seed)
  );
}

export function executeAdvanceWeekTransaction(session, payload = {}, options = {}) {
  try {
    const workingSession = cloneSessionForTransaction(session);
    const outcome = executeAdvanceWeekCommand(workingSession, payload, options);
    if (!outcome.ok) return outcome;
    return { ...outcome, committedSession: workingSession };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      reasonCode: "ADVANCE_WEEK_TRANSACTION_FAILED",
      error: "The week could not be committed. Your franchise remains unchanged.",
      diagnostic: error?.message || "Unknown weekly transaction failure."
    };
  }
}
