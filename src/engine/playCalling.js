/**
 * playCalling.js — Situational Play-Calling + Fourth-Down Decision Model (S29)
 *
 * Before this module, the drive engine chose pass-vs-run with one flat coin
 * flip (`rng.chance(offenseContext.passLean)`) every play, regardless of
 * down, distance, field position, score, or clock — and there was no
 * fourth-down decision at all (the game never explicitly went for it, kicked,
 * or punted; drives just ran out of a pre-rolled play budget and resolved via
 * an aggregate power-differential comparison). This was the single biggest
 * realism ceiling named in the S29 audit.
 *
 * This module adds a real, additive situational layer on top of the existing
 * engine:
 *   - choosePlayType() — down/distance/deficit/clock-aware pass-run lean,
 *     still rooted in the team's existing `passLean` (scheme + weekly-plan +
 *     coaching + QB/RB talent, computed in buildTeamContext) so team identity
 *     is preserved; this only adds situational pressure on top of it.
 *   - chooseFourthDownDecision() — a real go/kick/punt decision using field
 *     position, distance, score differential, time remaining, and the
 *     offense's own weekly-plan aggression tendency.
 *
 * Deliberately out of scope: this does not touch the yardage, completion,
 * sack, or interception formulas in gameSimulator.js — those stay exactly as
 * calibrated. `fieldPosition` here is a per-drive synthetic estimate (starts
 * at a plausible average value and accumulates yards gained within the
 * drive) rather than a fully tracked field-position engine across
 * possessions — consistent with the abstraction level of the rest of the
 * drive simulator, which does not model field position across drives either.
 */

import { clamp } from "../utils/rng.js";

const OWN_TERRITORY_CAUTION_DOWN = 2;
const LONG_DISTANCE = 8;
const SHORT_DISTANCE = 2;
const CLOCK_URGENCY_SECONDS = 3300; // last 5 minutes of regulation (4 * 900 = 3600)

export function isClockUrgent(elapsedSeconds) {
  return elapsedSeconds >= CLOCK_URGENCY_SECONDS;
}

/**
 * Decide pass vs run for a single play, situationally, honoring the team's
 * baseline scheme/game-plan `passLean`.
 *
 * @returns {"pass"|"run"}
 */
export function choosePlayType(
  { down, distance, fieldPosition, scoreDifferential = 0, elapsedSeconds = 0 },
  offenseContext,
  rng
) {
  let lean = offenseContext.passLean;
  const clockUrgent = isClockUrgent(elapsedSeconds);

  // Distance pressure: long yardage tilts pass, short/goal-line tilts run.
  if (distance >= LONG_DISTANCE) lean += 0.16;
  else if (distance <= SHORT_DISTANCE) lean -= 0.22;

  // Down pressure: 3rd/4th-and-long is a passing down at every level of football.
  if (down >= 3 && distance >= 6) lean += 0.14;

  // Two-minute-style urgency: trailing teams pass to cover ground and stop
  // the clock; teams protecting a real lead lean run to bleed it.
  if (clockUrgent && scoreDifferential < 0) lean += 0.2;
  if (clockUrgent && scoreDifferential > 6) lean -= 0.18;

  // Conservative early downs deep in your own territory.
  if (fieldPosition <= 20 && down <= OWN_TERRITORY_CAUTION_DOWN) lean -= 0.08;

  return rng.chance(clamp(lean, 0.22, 0.86)) ? "pass" : "run";
}

/**
 * Decide the fourth-down call: go for it, attempt a field goal, or punt.
 *
 * @returns {"go"|"field-goal"|"punt"}
 */
export function chooseFourthDownDecision(
  { distance, fieldPosition, scoreDifferential = 0, elapsedSeconds = 0, aggressionDelta = 0 },
  rng
) {
  const fgDistance = 100 - fieldPosition + 17;
  const fgInRange = fgDistance <= 56;
  const clockUrgent = isClockUrgent(elapsedSeconds);
  const trailingLate = clockUrgent && scoreDifferential < 0;
  const desperation = clockUrgent && scoreDifferential <= -9;

  let goScore =
    (distance <= 1 ? 0.55 : distance <= 3 ? 0.3 : distance <= 6 ? 0.12 : 0.03) +
    (fieldPosition >= 60 ? 0.12 : 0) +
    (trailingLate ? 0.25 : 0) +
    (desperation ? 0.35 : 0) +
    aggressionDelta * 0.3;

  if (desperation && !fgInRange) goScore = Math.max(goScore, 0.85);
  goScore = clamp(goScore, 0.02, 0.92);

  if (rng.chance(goScore)) return "go";
  if (fgInRange && (fieldPosition >= 35 || trailingLate)) return "field-goal";
  return "punt";
}

/**
 * Field-goal attempt distance implied by a synthetic in-drive field position
 * (used only for the fourth-down-forced path; the natural-end-of-drive path
 * keeps its existing random distance formula unchanged for calibration
 * stability).
 */
export function fieldGoalDistanceFromPosition(fieldPosition) {
  return clamp(100 - fieldPosition + 17, 18, 62);
}
