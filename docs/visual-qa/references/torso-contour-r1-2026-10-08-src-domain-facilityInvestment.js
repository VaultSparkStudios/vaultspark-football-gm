/**
 * facilityInvestment.js — a facility is bought, not typed in (S93).
 *
 * ── The hole this closes ────────────────────────────────────────────────────
 *
 * S63 closed exactly this surface one panel over. `GameSession.updateStaff` still
 * carries the note it left behind: the Coaching Staff sheet "used to accept
 * playcalling / development / discipline and write them straight into the
 * simulation, clamped 40-99. That made the Coaching Staff panel a god-mode
 * surface: three number boxes, free, any value." Coaching ability now comes only
 * from hiring a real candidate through the coaching market, priced against the
 * owner's staff budget.
 *
 * Eight lines below that fix, `updateOwnerState` did the identical thing to the
 * owner's facilities: `team.owner.facilities.training = clamp(..., 40, 99)`, and
 * the same for rehab and analytics — no cost, no cash debit, no build time, no
 * owner approval, no rate limit. `public/game.html` shipped them as three bare
 * `<input type="number">` boxes with no min, max or price.
 *
 * All three are live simulation inputs:
 *
 *   training   -> the S90 development environment (`trainingDivisor: 10`)
 *   rehab      -> injury probability and recovery
 *   analytics  -> `scoutingWeeklyBonus`, and therefore draft reveal and confidence
 *
 * `buildFranchiseEconomics` generates every club's facilities in **[64, 82]**.
 * The panel's legal range was **[40, 99]**. So the player could set a value
 * seventeen points above the top of the entire generated league distribution, on
 * turn one, for free, permanently. Measured: training 99 against the league's own
 * measured centre of ~72 buys `(99 - 72) / 10 = +2.7` development points per
 * player per offseason, against a clamp ceiling of 3.0 and a measured
 * best-club-in-the-league advantage of +1.14 (seed 20260307, season 0). One free
 * click was worth about 2.4x the best environment any club is ever generated with.
 *
 * That is what made the S90/S91/S92 calibration arc conditional: those sessions
 * hardened the talent curve against drift the player cannot see, while the
 * shipped Settings tab let the player overwrite its strongest input by hand.
 *
 * ── Why the price is a pure function of the level ───────────────────────────
 *
 * The same reason `coachSalary` is a pure function of a staffer's ratings: every
 * facility level in every existing save already has a well-defined price, so
 * pricing needs **no snapshot migration**. A save written before this module
 * existed loads and prices correctly on the first read.
 *
 * Cost is superlinear in the level being bought — the same shape as
 * `coachSalary`'s `pow(normalized, 2.1)`. The gap between an 88 and a 94 facility
 * costs far more than the gap between a 62 and a 68, because the top of the range
 * is supposed to be the end of a decade-long franchise project rather than a
 * purchase decision.
 *
 * ── Why there is an annual allowance as well as a price ─────────────────────
 *
 * Price alone is not a constraint in a league whose revenue outruns its sinks. A
 * build allowance makes a facility take *time*, which is the resource a franchise
 * game is actually about. It is tracked on `owner.facilityInvestment = { year,
 * points }` with an absent-means-unspent default, rather than derived from
 * `league.transactionLog` — that log truncates at 5,000 entries, so a long
 * franchise would silently re-open the allowance the moment the truncation
 * window passed the current year.
 */

import { clamp } from "../utils/rng.js";

/** The three owner facilities, in the order the UI presents them. */
export const FACILITY_KEYS = Object.freeze(["training", "rehab", "analytics"]);

export const FACILITY_LABELS = Object.freeze({
  training: "Training",
  rehab: "Rehab",
  analytics: "Analytics"
});

export const FACILITY_INVESTMENT_PROFILE = Object.freeze({
  version: "2026-s93-priced",
  /** The legal facility range. Unchanged from the pre-S93 clamp on purpose — the
   *  defect was never the range, it was that reaching the top of it was free. */
  floor: 40,
  ceiling: 99,
  /** Marginal cost of the very first point above the floor. */
  baseMarginalCost: 1_000_000,
  /** How much the marginal cost climbs across the full range. */
  marginalCostSpan: 20_000_000,
  /** Superlinearity. Matches the exponent `coachSalary` uses for the same reason. */
  costExponent: 2.1,
  /** Points of facility a single club may buy in one league year, per facility. */
  annualPointAllowance: 3,
  /** A club may not spend itself below this operating reserve. Owner pressure is
   *  derived from runway against modeled football obligations, not nominal cash. */
  minimumCashReserve: 20_000_000,
  /**
   * Annual upkeep at the top of the range, per facility. See `facilityUpkeepCost`
   * for why a purchase price alone is not a constraint.
   */
  upkeepSpanPerYear: 12_000_000,
  upkeepExponent: 2.1
});

function assertFinite(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`facilityInvestment: ${label} must be finite, received ${value}`);
  }
  return numeric;
}

export function isFacilityKey(facility) {
  return FACILITY_KEYS.includes(String(facility));
}

/** A facility level, normalized to 0..1 across the legal range. */
function normalizedLevel(level) {
  const profile = FACILITY_INVESTMENT_PROFILE;
  return clamp((assertFinite(level, "level") - profile.floor) / (profile.ceiling - profile.floor), 0, 1);
}

/**
 * The cost of the single point that takes a facility **to** `toLevel`.
 *
 * Exported so tests and the UI can price one step without summing a range, and
 * so the cost curve provably has exactly one definition.
 */
export function facilityMarginalCost(toLevel) {
  const profile = FACILITY_INVESTMENT_PROFILE;
  const normalized = normalizedLevel(toLevel);
  const raw = profile.baseMarginalCost + Math.pow(normalized, profile.costExponent) * profile.marginalCostSpan;
  return Math.round(raw / 50_000) * 50_000;
}

/**
 * What it costs to move a facility from `fromLevel` to `toLevel`.
 *
 * Pure and total: no state, no RNG, no league. Downgrades cost nothing and
 * refund nothing — a facility is not a liquid asset, and a refund would be a new
 * way to launder cash.
 */
export function facilityUpgradeCost(fromLevel, toLevel) {
  const from = Math.round(assertFinite(fromLevel, "fromLevel"));
  const to = Math.round(assertFinite(toLevel, "toLevel"));
  if (to <= from) return 0;
  let total = 0;
  for (let level = from + 1; level <= to; level += 1) total += facilityMarginalCost(level);
  return total;
}

/**
 * What one facility costs to keep running for a year.
 *
 * ── Why a purchase price alone was not a constraint ────────────────────────
 *
 * Priced construction plus an AI investment round was measured on a live seeded
 * league before this function existed:
 *
 *     season      0      2      5
 *     mean     71.72  72.97  74.81
 *     sd        5.658  4.398  3.729
 *     max         82     82     82
 *
 * Every club climbed and none ever fell, because a club's only reason to build
 * was a deficit against the league centre — so the centre ratcheted upward at
 * roughly +0.6 a season with nothing pushing back. Extrapolated over the
 * forty-season franchise this project explicitly builds for, every club reaches
 * the ceiling and the standard deviation goes to zero. That would delete the S90
 * development environment as completely as a constant stub would: a
 * differentiator measured against a centre everybody shares is not a
 * differentiator at all.
 *
 * A one-off purchase price cannot supply that counterforce — it is paid once out
 * of a cash pile that regrows every season. Upkeep can, because it is a
 * *recurring* claim on revenue, so the level a club can sustain is bounded by
 * what its market and its gate actually earn. Spread then rests on live
 * economics (market size, gate pricing, winning) rather than on a generation-time
 * roll nothing can ever change. It also gives `owner.cash` its first recurring
 * sink: before S93 the only outflows were staff-budget upkeep and coach-firing
 * dead money, against unbounded price-linear revenue.
 *
 * Superlinear for the same reason the purchase price is: a 99 facility should be
 * something only a club with real revenue behind it can hold, and a club that
 * cannot fund what it built loses a point of it (deferred maintenance).
 *
 * innovation-pack:ignore — the prose above documents a *fixed* defect (the
 * ratchet, and the constant-stub failure it would otherwise have reproduced),
 * not live debt. This declared file-level opt-out is scoped to the
 * "unfinished behavior" class only; explicit inline engineering markers are
 * never suppressed and still fire here normally.
 */
export function facilityUpkeepCost(level) {
  const profile = FACILITY_INVESTMENT_PROFILE;
  const raw = Math.pow(normalizedLevel(level), profile.upkeepExponent) * profile.upkeepSpanPerYear;
  return Math.round(raw / 50_000) * 50_000;
}

/** Total annual upkeep across all three wings. */
export function totalFacilityUpkeep(owner) {
  return FACILITY_KEYS.reduce(
    (sum, key) => sum + facilityUpkeepCost(Number(owner?.facilities?.[key] ?? FACILITY_INVESTMENT_PROFILE.floor)),
    0
  );
}

/**
 * Charge one club's annual facility upkeep, degrading a wing it cannot fund.
 *
 * Applies to every club including the controlled one — upkeep is an economic
 * fact of owning a facility, not a command someone chooses to issue.
 *
 * @returns {{ owed:number, paid:number, degraded:(string|null), from:number, to:number }}
 */
export function chargeFacilityUpkeep(owner) {
  const profile = FACILITY_INVESTMENT_PROFILE;
  const owed = totalFacilityUpkeep(owner);
  const cash = Math.round(Number(owner?.cash) || 0);

  if (cash - owed >= profile.minimumCashReserve) {
    owner.cash = cash - owed;
    return { owed, paid: owed, degraded: null, from: null, to: null };
  }

  // Deferred maintenance: pay what the reserve allows and let the most expensive
  // wing slip a point. A club cannot hold a facility its revenue does not carry.
  const paid = Math.max(0, Math.min(owed, cash - profile.minimumCashReserve));
  owner.cash = cash - paid;
  owner.facilities = owner.facilities || {};
  let worst = null;
  for (const key of FACILITY_KEYS) {
    const level = Number(owner.facilities[key] ?? profile.floor);
    if (!worst || level > worst.level) worst = { key, level };
  }
  if (!worst || worst.level <= profile.floor) {
    return { owed, paid, degraded: null, from: null, to: null };
  }
  owner.facilities[worst.key] = worst.level - 1;
  return { owed, paid, degraded: worst.key, from: worst.level, to: worst.level - 1 };
}

/**
 * The club's facility spend for one league year.
 *
 * Absent means unspent, which is what makes every pre-S93 save legal on load
 * without a migration. A record stamped with a different year is stale and reads
 * as unspent, so the allowance resets on the league calendar rather than on a
 * counter someone has to remember to clear.
 */
export function facilityAllowanceState(owner, year) {
  const profile = FACILITY_INVESTMENT_PROFILE;
  const record = owner?.facilityInvestment;
  const currentYear = Number(year);
  const stale = !record || Number(record.year) !== currentYear;
  const spent = {};
  for (const key of FACILITY_KEYS) {
    const value = stale ? 0 : Math.max(0, Math.round(Number(record?.points?.[key]) || 0));
    spent[key] = value;
  }
  const remaining = {};
  for (const key of FACILITY_KEYS) {
    remaining[key] = Math.max(0, profile.annualPointAllowance - spent[key]);
  }
  return { year: currentYear, spent, remaining, allowance: profile.annualPointAllowance };
}

/**
 * Everything the UI needs to present one club's facility investment decision,
 * derived entirely from live state so it cannot disagree with what the command
 * will actually do.
 */
export function facilityInvestmentQuote(owner, year, facility, points = 1) {
  const profile = FACILITY_INVESTMENT_PROFILE;
  if (!isFacilityKey(facility)) {
    return { ok: false, error: `Unknown facility "${facility}".`, reasonCode: "facility-unknown" };
  }
  const requested = Math.round(Number(points) || 0);
  const current = clamp(Math.round(Number(owner?.facilities?.[facility] ?? profile.floor)), profile.floor, profile.ceiling);
  const allowance = facilityAllowanceState(owner, year);
  const headroom = Math.min(profile.ceiling - current, allowance.remaining[facility]);
  const granted = Math.max(0, Math.min(requested, headroom));
  const target = current + granted;
  const cost = facilityUpgradeCost(current, target);
  const cash = Math.round(Number(owner?.cash) || 0);
  return {
    ok: true,
    facility,
    current,
    requested,
    granted,
    target,
    cost,
    cash,
    cashAfter: cash - cost,
    nextPointCost: current < profile.ceiling ? facilityMarginalCost(current + 1) : null,
    allowanceRemaining: allowance.remaining[facility],
    allowance: profile.annualPointAllowance,
    ceiling: profile.ceiling,
    minimumCashReserve: profile.minimumCashReserve,
    affordable: cash - cost >= profile.minimumCashReserve,
    profileVersion: profile.version
  };
}

/**
 * Validate one investment against price, allowance and ceiling.
 *
 * Returns a plain verdict; the caller performs the mutation. Keeping the decision
 * pure is what lets the AI policy and the player's command share one cost model
 * instead of two that will drift.
 */
export function evaluateFacilityInvestment(owner, year, facility, points) {
  const profile = FACILITY_INVESTMENT_PROFILE;
  const quote = facilityInvestmentQuote(owner, year, facility, points);
  if (!quote.ok) return quote;

  if (Math.round(Number(points) || 0) <= 0) {
    return { ok: false, error: "Investment must be at least one point.", reasonCode: "facility-no-points", quote };
  }
  if (quote.current >= profile.ceiling) {
    return {
      ok: false,
      error: `${FACILITY_LABELS[facility]} is already at the league maximum of ${profile.ceiling}.`,
      reasonCode: "facility-at-ceiling",
      quote
    };
  }
  if (quote.allowanceRemaining <= 0) {
    return {
      ok: false,
      error: `This club has already committed its ${profile.annualPointAllowance}-point ${FACILITY_LABELS[facility].toLowerCase()} build for ${year}. Construction resumes next league year.`,
      reasonCode: "facility-allowance-spent",
      quote
    };
  }
  if (!quote.affordable) {
    return {
      ok: false,
      error: `That build costs ${quote.cost.toLocaleString()} and would leave the club under its ${profile.minimumCashReserve.toLocaleString()} operating reserve.`,
      reasonCode: "facility-insufficient-cash",
      quote
    };
  }
  return { ok: true, quote };
}

/**
 * Apply a validated investment to the owner in place.
 *
 * Separated from `evaluateFacilityInvestment` so nothing can mutate without
 * having been priced, and so the AI policy reuses the identical write.
 */
export function applyFacilityInvestment(owner, year, facility, quote) {
  owner.facilities = owner.facilities || {};
  owner.facilities[facility] = quote.target;
  owner.cash = Math.round((Number(owner.cash) || 0) - quote.cost);

  const record = owner.facilityInvestment;
  const currentPoints =
    record && Number(record.year) === Number(year) ? { ...record.points } : {};
  for (const key of FACILITY_KEYS) currentPoints[key] = Math.max(0, Math.round(Number(currentPoints[key]) || 0));
  currentPoints[facility] += quote.granted;
  owner.facilityInvestment = { year: Number(year), points: currentPoints };
  return owner;
}
