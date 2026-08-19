import { clamp } from "../utils/rng.js";

/**
 * Potential-reversion authority — the term that makes `potential` an actual
 * ceiling instead of a constant drift coefficient.
 *
 * ## The defect this exists to fix (S91, measured on the live engine)
 *
 * `developmentDelta` moves a player by `ageFactor + traitFactor + variance`,
 * where `traitFactor` is `(potential - 80) / 20` — a *constant* for the life of
 * the player. Nothing in the expression depends on the player's current rating.
 * That makes offseason development a **random walk with drift and no mean
 * reversion**: a player never converges on his potential, he diffuses straight
 * past it and keeps going. `variance` is uniform +/-2.5, and nothing pulls a
 * player back toward where he is supposed to end up.
 *
 * The league then applies a one-sided filter to that walk. Players who drift
 * *down* are released by the S89 roster bound, retire early under the
 * low-overall attrition multipliers, and leave the population. Players who drift
 * *up* are retained, extended, and keep drawing. **The bottom is truncated by
 * selection; the top is truncated by nothing.**
 *
 * Measured across a 12-season league on the fixed rostered denominator — the
 * ~2,180 slots S89 pinned, so population growth explains none of it:
 *
 *   season    0     4     6     9    12
 *   mean  76.90 75.80 76.58 77.74 77.97   <- barely moves
 *   p50      77    76    77    77    77   <- does not move at all
 *   sd     4.50  6.61  6.69  6.16  5.99   <- rises 33%, then PLATEAUS
 *   p99      88    91    91    93    93   <- keeps extending
 *   max      94    94    96    95    97
 *   90+   0.32%  1.55% 2.33% 3.35% 4.03%  <- 12.6x, still climbing at s12
 *
 * Note what dispersion does and does not do: sd peaks around season 5 and then
 * falls back. The distribution is not simply widening — selection compresses its
 * left side while the walk extends its right, so it **skews**. sd goes quiet
 * after season 8 while the elite tail is still growing, which is why the S91
 * gate reads elite density as well as dispersion drift. Either statistic alone
 * would have called this league calibrated.
 *
 * This is a shape defect with almost no first-moment signature, which is exactly
 * why it survived S71, S72, S89 and S90: every gate this project owned was a
 * **mean** gate, and the mean is the one statistic it does not move. 32-38% of
 * rostered players sit above their own declared potential throughout.
 *
 * ## The fix, and the trap it must not fall into
 *
 * Reverting each player toward his own potential is the obvious correction and
 * the obvious trap. Measured at season 0, `mean(overall - potential)` is
 * **-2.86**: the generated league sits nearly three points below its own
 * potential by construction. A naive `rate * (potential - overall)` term would
 * therefore hand every player roughly **+0.46 OVR every offseason, forever** —
 * a league-wide subsidy, arriving through the exact door S71 (`potential - 70`)
 * and S90 (`coaching.development - 72`) already had to be rescued from. Three
 * times now, a differentiator measured against a stale centre has become a
 * subsidy.
 *
 * So the centre is **measured from the league actually being simulated**, and
 * the term is **zero-centred by construction**: a player is reverted toward
 * `potential + gapCentre`, where `gapCentre` is the league's own mean
 * `overall - potential`. The sum over the measured population is then exactly
 * zero, so the term cannot move the league's mean at all — it can only move
 * players *relative to each other*, pulling the over-achieved back toward the
 * field and the under-achieved up toward it.
 *
 * That is the whole point. S90 zero-centred the *first* moment so a club's
 * environment redistributes development instead of minting it. This applies the
 * same principle to the *second* moment: it damps the diffusion without
 * touching the mean the S90 receipt polices, so the two fixes compose instead
 * of fighting.
 *
 * Applied at the `applyAgingProgressionAndRetirements` seam rather than passed
 * in as optional context, because it is a property of the league, not of a club
 * — and because the headless `runOffseason` facade deliberately passes no
 * development context. A context-borne fix would have silently not applied on
 * the very path the career-realism regression runs.
 */
export const POTENTIAL_REVERSION_PROFILE = Object.freeze({
  version: "2026-s91-centred",
  /**
   * Fraction of the centred gap closed per offseason. This converts the walk
   * from a driftless accumulation into a discrete AR(1) with coefficient
   * `1 - rate`, whose accumulated variance is bounded at
   * `sigma^2 / (2*rate - rate^2)` — at rate 0.16, ~3.4x the per-offseason
   * variance rather than growing with every season a player survives. Chosen to
   * be gentle: a player 6 points clear of his centred potential is pulled back
   * by ~1 point a year, so a genuine outlier still has a multi-season run at the
   * top rather than snapping back. Cross-sectional spread from heterogeneous
   * potentials is untouched; only the accumulated walk is damped.
   */
  rate: 0.16,
  /** Symmetric. An asymmetric clamp is a subsidy wearing a clamp's clothes. */
  minReversion: -2.5,
  maxReversion: 2.5,
  /**
   * Below this the population is a fixture, not a league: a handful of players
   * would define themselves as the centre. The declared neutral centre is used
   * and the source is reported as "declared" rather than passed off as measured.
   */
  minimumCentreSample: 200
});

/**
 * League mean tilt this authority guarantees. Asserted directly, with a negative
 * control that reconstructs the uncentred `rate * (potential - overall)` form
 * and proves this tolerance rejects it.
 */
export const ZERO_CENTRED_REVERSION_TOLERANCE = 0.05;

function assertFinite(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`potentialReversion: ${label} must be finite, received ${value}`);
  }
  return numeric;
}

/**
 * The population the centre is measured over: **exactly the players the term
 * will be applied to** — every active player the offseason progresses, rostered
 * or not.
 *
 * This identity is the whole guarantee. Measuring over one population and
 * applying to a wider one is how a centred term leaks: the unrostered pool sits
 * far below its own potential (mean overall 66.9 against a much higher mean
 * potential), so a *rostered* centre applied to the pool would hand every
 * unemployed player a standing raise — the S71/S90 subsidy failure, rebuilt from
 * scratch inside its own fix. Measuring over the progressed set instead makes
 * the term a strict conservation law: it can redistribute development, and it
 * can never mint or destroy it, whatever the pool does.
 *
 * (The pool must still be kept out of the *reporting* population — a gate that
 * blends the rostered league with an unbounded junk drawer is the separate S91
 * finding in `src/stats/progressionParity.js`. Measurement and conservation are
 * different jobs and want different populations; conflating them is what made
 * both defects hard to see.)
 */
export function progressedPopulation(league) {
  return (league?.players || []).filter(
    (player) =>
      player?.status !== "retired" &&
      Number.isFinite(Number(player?.overall)) &&
      Number.isFinite(Number(player?.potential))
  );
}

/**
 * Measure the league's own mean `overall - potential`.
 *
 * This is the centre that makes reversion a redistribution rather than a raise.
 * It is re-measured every offseason from the live league precisely so it cannot
 * rot into a literal, which is the failure mode that produced this defect's two
 * predecessors.
 */
export function measurePotentialGapCentre(league) {
  const profile = POTENTIAL_REVERSION_PROFILE;
  const population = progressedPopulation(league);
  if (population.length < profile.minimumCentreSample) {
    return Object.freeze({
      gapCentre: 0,
      sampleSize: population.length,
      source: "declared",
      profileVersion: profile.version
    });
  }
  let gapSum = 0;
  for (const player of population) {
    gapSum += assertFinite(player.overall, "player overall") - assertFinite(player.potential, "player potential");
  }
  return Object.freeze({
    gapCentre: gapSum / population.length,
    sampleSize: population.length,
    source: "measured",
    profileVersion: profile.version
  });
}

/**
 * The centred, clamped reversion applied to one player's offseason development.
 *
 * Continuous on purpose: `progressPlayer` folds it into the single unbiased
 * rounding that already carries the curve's random variance. Rounding a
 * deterministic per-player quantity on its own biases it in whichever direction
 * it happens to sit — the quieter half of the S90 defect, and not a mistake
 * worth making a second time.
 */
export function potentialReversionFor(player, centres) {
  const profile = POTENTIAL_REVERSION_PROFILE;
  const overall = assertFinite(player?.overall, "player overall");
  const potential = assertFinite(player?.potential, "player potential");
  const gapCentre = assertFinite(centres?.gapCentre ?? 0, "centres.gapCentre");
  const raw = profile.rate * (potential + gapCentre - overall);
  return clamp(raw, profile.minReversion, profile.maxReversion);
}
