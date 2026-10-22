/**
 * matchupEdge.js — offenses read the defense they are actually facing (S63).
 *
 * The drive engine has always computed the defense's unit ratings — `runDefense`,
 * `coverageShort/Medium/Deep`, `passRush`, `tackling` — and used them to resolve
 * *how well a play works*. It never used them to decide *which play to call*.
 * `buildTeamContext(league, teamId, rng)` takes no opponent, both contexts are
 * built independently, and `choosePlayType` received the offense's context alone.
 *
 * The consequence was precise and quietly wrong: a team facing an elite secondary
 * and a porous run front threw exactly as often as it would against the inverse.
 * Scheme, coaching and weekly plan all fed `passLean`; the opponent did not.
 *
 * This module supplies the missing read, with three deliberate constraints:
 *
 *   1. **Relative, not absolute.** A great defense does not make you pass less —
 *      it is the *gap between* their run defense and their coverage that tells you
 *      where the soft side is. Facing a uniformly elite defense yields no edge,
 *      which is correct: there is nowhere to go.
 *   2. **Bounded.** The delta is clamped hard and lands inside the existing
 *      `choosePlayType` envelope, so the realism calibration the sim shards guard
 *      is preserved. This is a lean, not a rewrite.
 *   3. **Earned.** A staff has to be good enough to find and use the edge.
 *      Coaching quality gates how much of the available gap a team exploits, so a
 *      strong coordinator is finally worth something concrete on the field.
 *
 * Every edge carries a receipt naming the unit and the direction, so the pre-game
 * tactical brief can show the player the read rather than hiding the math.
 */

import { clamp } from "../utils/rng.js";

/** Hard ceiling on how far a matchup read may move the pass/run lean. */
export const MATCHUP_LEAN_CAP = 0.055;

/** Rating gap that saturates the cap. A 17-18 point unit gap is a lopsided front. */
const GAP_SATURATION = 320;

/** Below this gap the units are close enough that no honest read exists. */
const NOISE_FLOOR = 2;

/**
 * How much of an available edge a staff can actually exploit.
 *
 * A replacement-level staff (60) finds about a third of it; an elite staff (95+)
 * finds all of it. Anchored on the engine's own 72 baseline for coaching.
 */
export function coachingExploitFactor(coachingOffense = 72) {
  return clamp(0.35 + (Number(coachingOffense) - 60) / 70, 0.35, 1);
}

/**
 * Read the opponent's soft side.
 *
 * @param {object} input
 * @param {number} input.runDefense  — opponent's run-stopping unit rating
 * @param {number} input.coverage    — opponent's aggregate coverage rating
 * @param {number} [input.coachingOffense] — the offense's offensive coaching rating
 * @returns {{delta: number, unit: string|null, direction: "pass"|"run"|"none",
 *            gap: number, exploited: number, label: string}}
 *   `delta` is added to the offense's pass lean: positive tilts pass, negative run.
 */
/**
 * Strict numeric read.
 *
 * `Number(null)` is `0`, not `NaN` — so a missing unit rating would otherwise
 * read as a defense with a zero-rated front and manufacture a maximum-strength
 * edge out of absent data. An unknown rating must produce no read at all.
 */
function finiteRating(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function computeMatchupEdge({ runDefense, coverage, coachingOffense = 72 } = {}) {
  const run = finiteRating(runDefense);
  const cover = finiteRating(coverage);
  const none = {
    delta: 0,
    unit: null,
    direction: "none",
    gap: 0,
    exploited: 0,
    label: "No exploitable unit gap — this defense is even across the front and the back end."
  };
  if (!Number.isFinite(run) || !Number.isFinite(cover)) return none;

  // Positive gap: their coverage outclasses their run defense, so run at them.
  // Negative gap: their front outclasses their secondary, so throw over it.
  const gap = cover - run;
  if (Math.abs(gap) < NOISE_FLOOR) return { ...none, gap: Number(gap.toFixed(2)) };

  const exploited = coachingExploitFactor(coachingOffense);
  const raw = clamp(-gap / GAP_SATURATION, -MATCHUP_LEAN_CAP, MATCHUP_LEAN_CAP);
  const delta = Number((raw * exploited).toFixed(4));
  const attackRun = delta < 0;

  return {
    delta,
    unit: attackRun ? "run defense" : "coverage",
    direction: attackRun ? "run" : "pass",
    gap: Number(gap.toFixed(2)),
    exploited: Number(exploited.toFixed(3)),
    label: attackRun
      ? `Their run defense grades ${Math.abs(Math.round(gap))} below their coverage — attack it on the ground.`
      : `Their coverage grades ${Math.abs(Math.round(gap))} below their front — attack it through the air.`
  };
}

/**
 * The same read, taken straight from a live drive-engine defense context.
 * Returns a zero edge when unit ratings are absent, so callers never branch.
 */
export function matchupEdgeFromContexts(offenseContext, defenseContext) {
  return computeMatchupEdge({
    runDefense: defenseContext?.unitRatings?.runDefense,
    coverage: defenseContext?.unitRatings?.coverage,
    coachingOffense: offenseContext?.team?.coaching?.offense
  });
}
