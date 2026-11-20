/**
 * gamePlanDepth.js — what the three weekly game-plan dials do on the field.
 *
 * Ids and copy live in public/lib/gamePlanDepth.js; this file owns only the
 * numbers. The dials reach the simulator on `team.weeklyPlan.gamePlan`, written
 * by the staged-and-consumed weekly tactic path (src/runtime/weeklyTactic.js)
 * and never by a CPU club.
 *
 * Invariants (pinned by test/game-plan-depth.test.js):
 *   - A plan with no `gamePlan` reads as NEUTRAL_EFFECTS: every additive term
 *     is literally 0 and every scale is literally 1, so the arithmetic and the
 *     random draws of a game are bit-for-bit what they were before the dials
 *     existed.
 *   - No position adds or removes a random draw at a decision point. Only
 *     ranges, thresholds and yardage move.
 *
 * Sizes are deliberately small: a dial should show up in a season's box
 * scores, not decide a game. Measured effects are recorded beside the test.
 */
import { normalizeGamePlan } from "../../public/lib/gamePlanDepth.js";

export const NEUTRAL_EFFECTS = Object.freeze({
  active: false,
  // Pace: shifts the low/high end of each team's drive budget for the game.
  possessionsLow: 0,
  possessionsHigh: 0,
  // Pace: scales this offense's own interception and fumble chance.
  giveawayScale: 1,
  // Run-pass lean: added to this offense's pass lean.
  passLean: 0,
  // Coverage (this defense): scales the opposing passer's interception chance.
  interceptionScale: 1,
  // Coverage (this defense): added to completion chance by throw depth.
  completionShort: 0,
  completionDeep: 0
});

const PACE = Object.freeze({
  slow: Object.freeze({ possessionsLow: -1, possessionsHigh: 0, giveawayScale: 0.96 }),
  "hurry-up": Object.freeze({ possessionsLow: 0, possessionsHigh: 1, giveawayScale: 1.04 })
});

const LEAN = Object.freeze({
  "lean-run": Object.freeze({ passLean: -0.02 }),
  "lean-pass": Object.freeze({ passLean: 0.02 })
});

const COVERAGE = Object.freeze({
  safe: Object.freeze({ interceptionScale: 0.9, completionShort: 0.05, completionDeep: -0.025 }),
  "take-chances": Object.freeze({ interceptionScale: 1.1, completionShort: -0.05, completionDeep: 0.025 })
});

/**
 * Field effects for a weekly plan. Returns the shared NEUTRAL_EFFECTS object
 * when the plan carries no dial off neutral. Pure; never touches an RNG.
 */
export function gamePlanEffects(weeklyPlan = null) {
  const stored = weeklyPlan?.gamePlan;
  if (!stored) return NEUTRAL_EFFECTS;
  const plan = normalizeGamePlan(stored);
  const pace = PACE[plan.pace] || null;
  const lean = LEAN[plan.lean] || null;
  const coverage = COVERAGE[plan.coverage] || null;
  if (!pace && !lean && !coverage) return NEUTRAL_EFFECTS;
  return { ...NEUTRAL_EFFECTS, ...pace, ...lean, ...coverage, active: true };
}

/**
 * The drive-budget range for one game. Either club's pace moves it for both,
 * because a faster or slower game hands both offenses the ball more or less.
 */
export function possessionRange(baseRange, homeEffects = NEUTRAL_EFFECTS, awayEffects = NEUTRAL_EFFECTS) {
  const [low, high] = baseRange;
  if (!homeEffects.active && !awayEffects.active) return [low, high];
  const nextLow = Math.max(1, low + homeEffects.possessionsLow + awayEffects.possessionsLow);
  const nextHigh = Math.max(nextLow, high + homeEffects.possessionsHigh + awayEffects.possessionsHigh);
  return [nextLow, nextHigh];
}
