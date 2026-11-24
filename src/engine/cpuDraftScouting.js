/**
 * cpuDraftScouting.js — what a club's scouts believe about a prospect.
 *
 * The user drafts through fog: the board shows a public `scoutedOverall`
 * (truth plus the class-generation and pro-day noise) and a fogged
 * `scoutedPotential`, refined only where the user spends scouting points.
 * CPU clubs scored prospects on the true `overall`, so the league never missed
 * the way a human does and ignored potential and age.
 *
 * This module gives every club a read built the same way the user's is:
 *
 *   read = public + (truth - public) * convergence + clubNoise * (1 - convergence)
 *
 * `public` is the very number the user's unscouted board shows, so a consensus
 * miss is shared by the league (everybody's board has the same overrated
 * player on it). `convergence` is how much of that public error a club's own
 * department removes — the same shape as `allocateScoutingPoints` — and is the
 * product of the club's accuracy and the prospect's scouting confidence: early
 * projected rounds get the most looks. `clubNoise` is the club's own
 * idiosyncratic error on that prospect.
 *
 * Determinism: nothing here draws from the session RNG. Accuracy is derived
 * from (league identity, team id); a read is derived from (league identity,
 * draft year, team id, prospect id). Same league, same read, in any call
 * order, and nothing is persisted, so the save format is untouched.
 *
 * Numbers are validated where they are produced: a non-finite truth throws,
 * a missing scouting field falls back to a declared default, and every output
 * is asserted finite before it is returned.
 */

import { clamp, derivedRng } from "../utils/rng.js";
import { DRAFT_PERSONA_TILT, draftPersonaTilt } from "./aiTeamStrategy.js";

export const CPU_DRAFT_SCOUTING = Object.freeze({
  /** Seed-derived band for a club's persistent scouting accuracy. */
  accuracyBase: Object.freeze({ min: 0.1, max: 0.6 }),
  /** Accuracy per point of `scoutingWeeklyBonus` (scouting staff, analytics, culture: -2..8). */
  accuracyPerWeeklyBonus: 0.03,
  accuracyBounds: Object.freeze({ min: 0.1, max: 0.92 }),
  /** Confidence by projected round: round 1 is 1, each later round loses a step, floor for round 7 / unknown. */
  confidenceStepPerRound: 0.125,
  confidenceFloor: 0.25,
  /** Share of a club's accuracy that applies even to the least-watched prospect. */
  convergenceFloorShare: 0.4,
  /** Half-width (rating points) of a club's own error on overall / potential at zero convergence. */
  overallNoise: 10,
  potentialNoise: 12,
  ratingBounds: Object.freeze({ min: 40, max: 99 }),
  /** Score points per point of believed headroom that every front office pays (the persona tilt adds to it). */
  baseHeadroomWeight: 0.2,
  /** Score points per year younger than `referenceAge`, before the persona term. */
  baseAgeWeight: 0.5,
  /** Converts the existing DRAFT_PERSONA_TILT weight into score points per year of youth. */
  agePersonaScale: 3,
  referenceAge: 22
});

function requireFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`cpuDraftScouting: ${label} must be finite, received ${value}`);
  return value;
}

/** A finite number, or the fallback when the field is absent or corrupt. Never `|| 0`. */
function finiteOr(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * A club's persistent scouting accuracy in [0.1, 0.92].
 *
 * Two parts: a seed-derived base that belongs to the club for the life of the
 * league, and the club's real scouting environment (`scoutingWeeklyBonus`, the
 * same modifier that sets the user's weekly scouting points), so a front
 * office that invests in analytics scouts better.
 */
export function clubScoutingAccuracy({ leagueKey, teamId, scoutingWeeklyBonus = 0 } = {}) {
  const { accuracyBase, accuracyPerWeeklyBonus, accuracyBounds } = CPU_DRAFT_SCOUTING;
  const base = derivedRng(`cpu-scout-accuracy|${leagueKey ?? "league"}|${teamId ?? "club"}`).float(accuracyBase.min, accuracyBase.max);
  const bonus = finiteOr(scoutingWeeklyBonus, 0) * accuracyPerWeeklyBonus;
  return requireFinite(clamp(base + bonus, accuracyBounds.min, accuracyBounds.max), "accuracy");
}

/** How well the league knows a prospect, in [confidenceFloor, 1]: earlier projected rounds get more looks. */
export function prospectScoutingConfidence(prospect) {
  const { confidenceStepPerRound, confidenceFloor } = CPU_DRAFT_SCOUTING;
  const round = finiteOr(prospect?.scouting?.projectedRound, null);
  // S133: a prospect who tested at the combine is a better-known quantity.
  // Every club saw the same public workout, so it narrows every read a little.
  const combineBonus = Number.isFinite(Number(prospect?.scouting?.combineGrade)) ? 0.08 : 0;
  if (round === null || round < 1) return clamp(confidenceFloor + combineBonus, confidenceFloor, 1);
  return clamp(1 - (round - 1) * confidenceStepPerRound + combineBonus, confidenceFloor, 1);
}

/** Share of the public error a club removes for this prospect, in [0, accuracy]. */
export function scoutingConvergence(accuracy, confidence) {
  const share = CPU_DRAFT_SCOUTING.convergenceFloorShare;
  return clamp(finiteOr(accuracy, 0) * (share + (1 - share) * finiteOr(confidence, CPU_DRAFT_SCOUTING.confidenceFloor)), 0, 1);
}

/**
 * One club's read of one prospect.
 *
 * @param prospect         the live prospect (true `overall` / `potential`, `scouting` block)
 * @param leagueKey        persisted league identity
 * @param teamId           the club whose scouts are reading
 * @param draftYear        the class year
 * @param accuracy         `clubScoutingAccuracy` for the club
 * @param publicPotential  the fogged potential the user's board shows (`scoutedPotential`); truth when absent
 * @returns {{ overall:number, potential:number, confidence:number, convergence:number }}
 */
export function clubScoutedRead({ prospect, leagueKey, teamId, draftYear, accuracy, publicPotential = null } = {}) {
  const { overallNoise, potentialNoise, ratingBounds } = CPU_DRAFT_SCOUTING;
  const trueOverall = requireFinite(Number(prospect?.overall), "prospect.overall");
  // A prospect without a potential reading is treated as finished, not as NaN.
  const truePotential = finiteOr(prospect?.potential, trueOverall);
  const publicOverall = finiteOr(prospect?.scouting?.scoutedOverall, trueOverall);
  const publicPot = finiteOr(publicPotential, truePotential);

  const confidence = prospectScoutingConfidence(prospect);
  const convergence = scoutingConvergence(accuracy, confidence);
  const rng = derivedRng(`cpu-scout|${leagueKey ?? "league"}|${draftYear ?? 0}|${teamId ?? "club"}|${prospect?.id ?? "prospect"}`);
  // Sum of two uniforms: a triangular error centred on zero, most reads close, a few badly off.
  const triangular = () => rng.float(-0.5, 0.5) + rng.float(-0.5, 0.5);
  const residual = 1 - convergence;
  const overall = clamp(
    publicOverall + (trueOverall - publicOverall) * convergence + triangular() * overallNoise * residual,
    ratingBounds.min,
    ratingBounds.max
  );
  const potential = clamp(
    publicPot + (truePotential - publicPot) * convergence + triangular() * potentialNoise * residual,
    ratingBounds.min,
    ratingBounds.max
  );
  return {
    overall: requireFinite(overall, "read.overall"),
    potential: requireFinite(potential, "read.potential"),
    confidence,
    convergence
  };
}

/**
 * What a front office pays for a read: twice the believed overall (the scale
 * the need boost and depth penalty were tuned against), plus believed headroom
 * and youth, both tilted by the club's existing GM archetype
 * (`DRAFT_PERSONA_TILT`): Moneyball and Loyalty fronts pay for the younger
 * player with the higher ceiling, Win-Now and Gut-Feel fronts for the finished
 * one. `archetypeLabel` null (the user's own delegated pick) is neutral.
 */
export function draftReadValue({ read, age, archetypeLabel = null } = {}) {
  const { baseHeadroomWeight, baseAgeWeight, agePersonaScale, referenceAge } = CPU_DRAFT_SCOUTING;
  const overall = requireFinite(Number(read?.overall), "read.overall");
  const potential = finiteOr(read?.potential, overall);
  const tilt = DRAFT_PERSONA_TILT[archetypeLabel] ?? 0;
  const headroom = Math.max(0, potential - overall);
  const youth = referenceAge - finiteOr(age, referenceAge);
  const value = overall * 2
    + baseHeadroomWeight * headroom
    // The S114 persona term, unchanged, now reading the believed headroom rather than the true one.
    + draftPersonaTilt({ overall, potential }, archetypeLabel)
    + (baseAgeWeight + tilt * agePersonaScale) * youth;
  return requireFinite(value, "draft read value");
}
