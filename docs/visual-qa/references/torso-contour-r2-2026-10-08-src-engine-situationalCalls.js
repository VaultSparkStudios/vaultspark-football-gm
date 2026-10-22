/**
 * situationalCalls.js — the player's standing game-day posture.
 *
 * Two situations, each with a neutral middle setting:
 *   - fourthDown: "conservative" | "by-the-book" | "aggressive"
 *   - twoMinute:  "protect" | "standard" | "hurry-up"
 *
 * The posture is stored only on the controlled team (`team.situationalCalls`)
 * and enters the drive engine as a bounded, additive adjustment through seams
 * that already exist: extra `aggressionDelta` for `chooseFourthDownDecision`,
 * and a pass-lean nudge plus a play-budget shift during a two-minute drill.
 *
 * Invariants (pinned by test/situational-calls.test.js):
 *   - The defaults are exactly neutral: every adjustment is literally 0, so an
 *     unset posture and the default posture produce identical games.
 *   - No posture adds or removes an RNG draw. Only thresholds and ranges move;
 *     the number of draws at every decision point is unchanged.
 *   - `normalizeSituationalCalls` is the single place a missing or malformed
 *     value is defaulted, so old saves read as neutral. It never touches an RNG.
 */

export const FOURTH_DOWN_POSTURES = Object.freeze(["conservative", "by-the-book", "aggressive"]);
export const TWO_MINUTE_POSTURES = Object.freeze(["protect", "standard", "hurry-up"]);

export const DEFAULT_SITUATIONAL_CALLS = Object.freeze({
  fourthDown: "by-the-book",
  twoMinute: "standard"
});

// Added to the weekly-plan offense aggression on every fourth down. The
// decision model weights aggression by 0.3, so ±0.4 moves the go probability
// by ±0.12 before its own clamp — a real lean, never a guarantee.
const FOURTH_DOWN_AGGRESSION = Object.freeze({
  conservative: -0.4,
  "by-the-book": 0,
  aggressive: 0.4
});

// Two-minute drill: pass-lean nudge (clamped downstream by choosePlayType) and
// a shift of the drive's play budget range. The budget is one draw either way.
const TWO_MINUTE_ADJUSTMENTS = Object.freeze({
  protect: Object.freeze({ passLean: -0.12, playBudget: -1 }),
  standard: Object.freeze({ passLean: 0, playBudget: 0 }),
  "hurry-up": Object.freeze({ passLean: 0.12, playBudget: 2 })
});

const NEUTRAL_TWO_MINUTE = TWO_MINUTE_ADJUSTMENTS.standard;

// End of each half: the last 2:00 of the second and fourth quarters.
const HALF_LENGTH_SECONDS = 1800;
const TWO_MINUTE_WINDOW_SECONDS = 120;

/** The one normalizer. Pure; consumes no RNG. */
export function normalizeSituationalCalls(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    fourthDown: FOURTH_DOWN_POSTURES.includes(source.fourthDown)
      ? source.fourthDown
      : DEFAULT_SITUATIONAL_CALLS.fourthDown,
    twoMinute: TWO_MINUTE_POSTURES.includes(source.twoMinute)
      ? source.twoMinute
      : DEFAULT_SITUATIONAL_CALLS.twoMinute
  };
}

/**
 * True when a drive starting at `elapsedSeconds` is a two-minute drill for an
 * offense that trails or is tied: inside the final 2:00 of either half of
 * regulation. Overtime is not a two-minute drill.
 */
export function isTwoMinuteDrill(elapsedSeconds, scoreDifferential = 0) {
  const elapsed = Number(elapsedSeconds);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= HALF_LENGTH_SECONDS * 2) return false;
  if (!(Number(scoreDifferential) <= 0)) return false;
  const intoHalf = elapsed % HALF_LENGTH_SECONDS;
  return intoHalf >= HALF_LENGTH_SECONDS - TWO_MINUTE_WINDOW_SECONDS;
}

/** Extra fourth-down aggression for a posture. 0 for the default or unset. */
export function fourthDownAggressionAdjustment(calls) {
  const posture = normalizeSituationalCalls(calls).fourthDown;
  return FOURTH_DOWN_AGGRESSION[posture] || 0;
}

/** Two-minute adjustments for a posture. All zeros for the default or unset. */
export function twoMinuteAdjustment(calls) {
  const posture = normalizeSituationalCalls(calls).twoMinute;
  return TWO_MINUTE_ADJUSTMENTS[posture] || NEUTRAL_TWO_MINUTE;
}
