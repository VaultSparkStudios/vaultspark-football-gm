/**
 * Weekly tactic application — the single shared applier.
 *
 * S86 [audit #1]. This logic previously lived inside advanceWeekCommand, which
 * mutated `team.weeklyPlan` in place BEFORE calling `session.advanceWeek()`.
 * The first thing `advanceWeek()` does for a regular-season week is
 * `runStaffAndStrategyRefresh()`, which reassigns `team.weeklyPlan =
 * this.buildWeeklyPlan(team.id)` wholesale for every team — so the override was
 * discarded before `gameSimulator` ever read the plan. All four weekly tactics
 * were measurably inert: on seed 77123, run-heavy / pass-heavy / blitz-heavy /
 * prevent each produced 8-week league results byte-identical to no tactic.
 *
 * The fix is an ordering change, not a behaviour change: the command stages a
 * pending tactic on the session, and `advanceWeek()` applies it to the freshly
 * rebuilt plan, after the refresh and before the simulation. It is consumed
 * exactly once, so a multi-week advance keeps the tactic a single-week effect.
 *
 * Kept in its own module so exactly one definition of the override shape
 * exists — the command seam and the session both import this one.
 */

/**
 * Layer a tactic's modifiers onto a weekly plan, in place.
 *
 * @param {object} weeklyPlan the team's current weekly plan (mutated)
 * @param {object} tacticPlan a tacticDefinition() result
 */
export function applyTacticOverride(weeklyPlan, tacticPlan) {
  if (!weeklyPlan || !tacticPlan) return;
  for (const [key, delta] of Object.entries(tacticPlan.modifiers || {})) {
    weeklyPlan[key] = Number(weeklyPlan[key] || 0) + Number(delta || 0);
  }
  weeklyPlan.tacticalOverride = {
    id: tacticPlan.id,
    definitionVersion: tacticPlan.definitionVersion,
    authorityId: tacticPlan.authorityId,
    label: tacticPlan.label,
    unit: tacticPlan.unit,
    summary: tacticPlan.summary
  };
}

/**
 * Stage a tactic to be applied to `teamId`'s plan on the next advanced week.
 * Staging (rather than mutating now) is what makes the override survive the
 * weekly plan rebuild.
 */
export function stagePendingWeeklyTactic(session, teamId, tacticPlan) {
  if (!session || !teamId || !tacticPlan) return;
  session.pendingWeeklyTactic = { teamId, tacticPlan };
}

/** Clear any staged tactic. Safe to call when none is staged. */
export function clearPendingWeeklyTactic(session) {
  if (session) session.pendingWeeklyTactic = null;
}

/**
 * Apply and consume the staged tactic, if any. Called by GameSession.advanceWeek
 * after the weekly plans are rebuilt and before the week is simulated.
 *
 * Consuming here (rather than leaving it staged) keeps the tactic a single-week
 * effect across a multi-week advance, matching the pre-existing restore semantics.
 *
 * @returns {object|null} the tacticPlan that was applied, or null
 */
export function consumePendingWeeklyTactic(session) {
  const pending = session?.pendingWeeklyTactic;
  if (!pending) return null;
  session.pendingWeeklyTactic = null;
  const team = session.league?.teams?.find((entry) => entry.id === pending.teamId);
  if (!team?.weeklyPlan) return null;
  applyTacticOverride(team.weeklyPlan, pending.tacticPlan);
  return pending.tacticPlan;
}
