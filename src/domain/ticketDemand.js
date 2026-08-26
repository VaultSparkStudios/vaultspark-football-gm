/**
 * ticketDemand.js — the ticket price becomes a decision (S93).
 *
 * ── The hole this closes ────────────────────────────────────────────────────
 *
 * Gate revenue is `marketSize x ticketPrice x 66,500 x attendanceFactor`, and
 * before this module `attendanceFactor` was
 *
 *     clamp(fanInterest / 100 + fanInterestWeeklyDelta * 0.02 + noise, 0.52, 1.12)
 *
 * with **no ticketPrice term anywhere in it**. `owner.fanInterest` is written only
 * by match results, the press room and GM decision consequences; no code path in
 * the project connected price to demand. So revenue was strictly linear in a dial
 * the GM set for free, in a panel with no cost and no confirmation.
 *
 * Measured live before the fix (seed 20260307, BUF, one season):
 *
 *     price  98  ->   57M revenue      (the generated price)
 *     price 450  ->  263M revenue      (the legal maximum)
 *     price  35  ->   20M revenue      (the legal minimum)
 *
 * A 4.59x price multiple returned a 4.61x revenue multiple — elasticity of zero
 * to within simulation noise — and **fan interest ended at 97 in all three
 * scenarios**. The fan base did not notice a 4.6x ticket. One free click on turn
 * one was worth +206M in the first season alone, against a 112-190M starting cash
 * band, and it permanently disabled the only pressure operating liquidity
 * exerted: runway against modeled football obligations, which an unbounded
 * price dial makes unreachable.
 *
 * ── Why the centre is measured from the league, never declared ──────────────
 *
 * This project has now twice shipped a differentiator measured against a fixed
 * centre and twice watched it become a league-wide subsidy: `LEAGUE_AVERAGE_POTENTIAL`
 * (S71) and the development environment's literals (S90). Both times the fix was
 * the same — measure the centre from the league actually being simulated. A
 * declared centre is a subsidy waiting for the league to drift away from it.
 *
 * So demand is measured against **the league's own mean ticket price**. The
 * identity that follows is the whole guarantee: a club priced exactly at the
 * league mean has a demand factor of exactly 1.0 and is affected by this module
 * not at all. Pricing is a *relative* decision, like everything else this project
 * has had to rescue.
 *
 * ── Why demand is linear rather than constant-elasticity ────────────────────
 *
 * Constant-elasticity demand — `(centre / price) ^ e` — has no interior optimum:
 * revenue is `price ^ (1 - e)`, which is monotone for every e, so the best price
 * is always an endpoint and the dial is still not a decision. Linear demand makes
 * revenue a downward parabola in price, which is what puts the optimum in the
 * interior where a choice lives.
 *
 * With `elasticity = 0.55`, revenue peaks at `1.41 x` the league mean price and
 * is worth about 9% more than pricing at the mean — a real but modest edge, with
 * a severe cliff on the far side: past `2.82 x` the mean the stadium empties to
 * the floor. That asymmetry is deliberate. The point is not to hand the player a
 * new optimization exploit; it is to make gouging cost something.
 */

import { clamp } from "../utils/rng.js";

export const TICKET_DEMAND_PROFILE = Object.freeze({
  version: "2026-s93-elastic",
  /** Share of attendance lost per 1.0x of relative price above the league mean. */
  elasticity: 0.55,
  /** A stadium never fully empties and never exceeds capacity by much. */
  minDemandFactor: 0.05,
  maxDemandFactor: 1.25,
  /**
   * The minimum number of clubs that may define a price centre. Below it the
   * league is a fixture, not a league, and the declared fallback is used with the
   * source reported as "declared" rather than passed off as measured — the same
   * convention `measureDevelopmentCentres` uses for the same reason.
   */
  minimumCentreSample: 8,
  fallbackCentrePrice: 120,
  /** Relative price above which the fan base starts to resent the gate. */
  gougingThreshold: 1.2,
  /** Fan-interest points per week at the extremes of the relative-price range. */
  gougingFanInterestWeight: 1.5,
  maxFanInterestSwing: 1.5
});

function assertFinite(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`ticketDemand: ${label} must be finite, received ${value}`);
  }
  return numeric;
}

/**
 * The league's own mean ticket price.
 *
 * Consumes no RNG stream — it is a single arithmetic pass over the clubs, so a
 * league that measures its centre and a league that does not draw the identical
 * sequence of random numbers.
 */
export function measureTicketPriceCentre(league) {
  const profile = TICKET_DEMAND_PROFILE;
  const prices = (league?.teams || [])
    .map((team) => Number(team?.owner?.ticketPrice))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length < profile.minimumCentreSample) {
    return Object.freeze({
      price: profile.fallbackCentrePrice,
      sampleSize: prices.length,
      source: "declared",
      profileVersion: profile.version
    });
  }
  return Object.freeze({
    price: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    sampleSize: prices.length,
    source: "measured",
    profileVersion: profile.version
  });
}

/**
 * How full the stadium is, relative to what fan interest alone would fill.
 *
 * `ticketDemandFactor(centre.price, centre) === 1` exactly, for every centre —
 * the centred-differentiator identity, and the thing a test should assert rather
 * than a comment should claim.
 */
export function ticketDemandFactor(price, centre) {
  const profile = TICKET_DEMAND_PROFILE;
  const centrePrice = assertFinite(centre?.price, "centre.price");
  if (centrePrice <= 0) return 1;
  const relative = assertFinite(price, "price") / centrePrice;
  return clamp(1 - profile.elasticity * (relative - 1), profile.minDemandFactor, profile.maxDemandFactor);
}

/**
 * The weekly fan-interest consequence of where the club prices itself.
 *
 * Continuous, bounded and zero at the league mean, so it redistributes goodwill
 * between clubs instead of handing the league a standing bonus or penalty.
 */
export function ticketPriceFanInterestDelta(price, centre) {
  const profile = TICKET_DEMAND_PROFILE;
  const centrePrice = assertFinite(centre?.price, "centre.price");
  if (centrePrice <= 0) return 0;
  const relative = assertFinite(price, "price") / centrePrice;
  const excess = relative - profile.gougingThreshold;
  const shortfall = 1 - relative;
  const raw = excess > 0 ? -excess * profile.gougingFanInterestWeight : Math.max(0, shortfall) * profile.gougingFanInterestWeight;
  return clamp(raw, -profile.maxFanInterestSwing, profile.maxFanInterestSwing);
}

/**
 * The price that maximizes gate revenue against a given centre, and what the
 * curve is worth there. Derived from the profile rather than searched, so the UI
 * and the tests read the same number the engine implies.
 *
 * Revenue is proportional to `p x (1 - e(p/c - 1))`, maximized at
 * `p* = c(1 + e) / 2e`.
 */
export function optimalTicketPrice(centre) {
  const profile = TICKET_DEMAND_PROFILE;
  const centrePrice = assertFinite(centre?.price, "centre.price");
  const price = (centrePrice * (1 + profile.elasticity)) / (2 * profile.elasticity);
  return {
    price: Number(price.toFixed(2)),
    relative: Number((price / centrePrice).toFixed(3)),
    revenueMultipleVsCentre: Number(((price * ticketDemandFactor(price, centre)) / centrePrice).toFixed(3))
  };
}
