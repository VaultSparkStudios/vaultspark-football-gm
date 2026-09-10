import { CONTRACT_RULES } from "../config.js";
import { clamp } from "../utils/rng.js";

const MIN_SALARY = CONTRACT_RULES.minSalary;

export const CONTRACT_MARKET_PROFILE = Object.freeze({
  version: "2026-s87-scarcity",
  baselineOverall: 50,
  cubicCoefficient: 190,
  eliteThreshold: 88,
  eliteCoefficient: 130_000
});

function rounded(value) {
  return Math.max(0, Math.round(value));
}

export function normalizeContract(contract = {}) {
  // `|| 1` here meant an expired contract (yearsRemaining 0) was silently
  // resurrected to a one-year deal on every normalize — and normalize runs on
  // every read. The clamp floor of 0 shows 0 was always meant to be legal, but
  // the falsy default made it unreachable, so `advanceContractYear`'s expiry
  // branch and `expireContracts`' `<= 0` check were both dead code and no
  // contract in this game had ever run out. Nullish coalescing keeps the
  // "field absent" default while letting zero mean zero. (S67)
  const yearsRemaining = clamp(Number(contract.yearsRemaining ?? 1), 0, 10);
  const voidYears = clamp(Number(contract.voidYears || 0), 0, 4);
  const salary = rounded(contract.salary ?? contract.capHit ?? MIN_SALARY);
  const baseSalary = rounded(contract.baseSalary ?? salary * 0.82);
  const signingBonus = rounded(contract.signingBonus ?? salary - baseSalary);
  const guaranteed = rounded(contract.guaranteed ?? baseSalary * 0.45 + signingBonus);
  // S102 — the term the signing bonus is amortized over, fixed at signing.
  //
  // Until now this was a local (`capYears`) computed from *remaining* years and
  // thrown away, so every reader re-derived proration from whatever was left on
  // the deal. `advanceContractYear` therefore divided the same bonus by a
  // smaller number every season and the cap hit climbed for the whole life of
  // the contract: measured +23.0% over 3 years, +26.6% over 4, +28.9% over 5,
  // with the final year always costing the full salary. A deal's most expensive
  // year was its last, which is backwards — real proration is set when the pen
  // touches the paper and does not move.
  //
  // Migration for saves written before this field existed: default to the
  // remaining term plus void years, which is exactly the value the old
  // `capYears` local held at that moment. A migrated deal therefore keeps the
  // cap hit it already had and stops accelerating from the load forward; it is
  // not back-dated, because the original term is not recoverable from the save
  // and inventing one would be fabrication.
  const prorationYears = clamp(
    Math.round(Number(contract.prorationYears ?? Math.max(1, yearsRemaining + voidYears))),
    1,
    CONTRACT_RULES.maxYears + 4
  );
  const capHit = rounded(contract.capHit ?? baseSalary + signingBonus / prorationYears);
  const deadCapRemaining = rounded(contract.deadCapRemaining ?? signingBonus + guaranteed * 0.35);
  return {
    salary,
    yearsRemaining,
    voidYears,
    prorationYears,
    capHit,
    baseSalary,
    signingBonus,
    guaranteed,
    deadCapRemaining,
    restructureCount: Number(contract.restructureCount || 0),
    franchiseTagYear: Number(contract.franchiseTagYear || 0),
    optionYear: contract.optionYear === true
  };
}

export function marketSalaryForOverall(overall, {
  minSalary = MIN_SALARY,
  maxSalary = CONTRACT_RULES.maxSalary,
  variance = 0
} = {}) {
  const rating = clamp(Math.round(Number(overall) || 0), 0, 100);
  const marketSteps = Math.max(0, rating - CONTRACT_MARKET_PROFILE.baselineOverall);
  const eliteSteps = Math.max(0, rating - CONTRACT_MARKET_PROFILE.eliteThreshold);
  const marketValue =
    minSalary +
    marketSteps ** 3 * CONTRACT_MARKET_PROFILE.cubicCoefficient +
    eliteSteps ** 2 * CONTRACT_MARKET_PROFILE.eliteCoefficient +
    Number(variance || 0);
  return clamp(Math.round(marketValue), minSalary, maxSalary);
}

export function buildContract({
  overall,
  years,
  salary,
  minSalary = MIN_SALARY,
  maxSalary = CONTRACT_RULES.maxSalary,
  rng
}) {
  const safeYears = clamp(Number(years || rng?.int(1, 4) || 3), 1, CONTRACT_RULES.maxYears);
  const computedSalary =
    salary ??
    marketSalaryForOverall(overall, {
      minSalary,
      maxSalary,
      variance: rng ? rng.int(-900_000, 1_200_000) : 0
    });

  const signingBonusShare = 0.18 + (rng ? rng.float(0, 0.14) : 0.1);
  const signingBonus = rounded(computedSalary * signingBonusShare);
  const baseSalary = rounded(computedSalary - signingBonus);
  const guaranteed = rounded(baseSalary * 0.42 + signingBonus);
  const capHit = rounded(baseSalary + signingBonus / safeYears);
  const deadCapRemaining = rounded(signingBonus + guaranteed * 0.35);

  return normalizeContract({
    salary: computedSalary,
    yearsRemaining: safeYears,
    prorationYears: safeYears,
    baseSalary,
    signingBonus,
    guaranteed,
    capHit,
    deadCapRemaining,
    restructureCount: 0
  });
}

export function advanceContractYear(contract) {
  const normalized = normalizeContract(contract);
  if (normalized.yearsRemaining <= 0) return normalized;
  const yearsRemaining = normalized.yearsRemaining - 1;
  // One year of the fixed schedule comes off the books — not one year of
  // whatever is left, which is what made the remainder accelerate.
  const bonusProration = normalized.signingBonus / normalized.prorationYears;
  const deadCapRemaining = rounded(Math.max(0, normalized.deadCapRemaining - bonusProration));
  if (yearsRemaining <= 0) {
    return normalizeContract({
      salary: 0,
      yearsRemaining: 0,
      capHit: 0,
      baseSalary: 0,
      signingBonus: 0,
      guaranteed: 0,
      deadCapRemaining: 0,
      restructureCount: normalized.restructureCount
    });
  }
  const capHit = rounded(normalized.baseSalary + normalized.signingBonus / normalized.prorationYears);
  return normalizeContract({
    ...normalized,
    yearsRemaining,
    capHit,
    deadCapRemaining
  });
}

/**
 * Releasing a player accelerates every remaining year of proration onto the
 * books at once — that is the whole reason a bad contract is hard to escape.
 *
 * S102: this used to charge `signingBonus / yearsRemaining`, i.e. exactly one
 * year of a schedule that was itself being re-derived every season. Cutting a
 * player in year 1 of a five-year deal therefore cost a fifth of the bonus and
 * the other four fifths simply vanished, and the June 1 branch split that
 * single year 55/45 across two seasons — a designation whose real purpose is to
 * split *multi-year* acceleration, applied to money that had none. The
 * unamortized remainder is now derived from the persisted schedule, and June 1
 * does what it is named for: this year carries one year of proration (plus the
 * guarantee), next year carries everything still outstanding.
 */
export function computeReleaseDeadCap(contract, { june1 = false } = {}) {
  const normalized = normalizeContract(contract);
  const annualProration = normalized.signingBonus / normalized.prorationYears;
  const unamortized = annualProration * Math.max(0, Math.min(normalized.yearsRemaining, normalized.prorationYears));
  const guaranteeCharge = normalized.guaranteed * 0.24;
  // Round the total once and split the rounded figure, so deferring money can
  // never create or destroy a dollar of it through two independent roundings.
  const total = rounded(unamortized + guaranteeCharge);
  if (june1 && normalized.yearsRemaining > 1) {
    const currentYearDeadCap = Math.min(total, rounded(annualProration + guaranteeCharge));
    return { currentYearDeadCap, nextYearDeadCap: total - currentYearDeadCap };
  }
  return { currentYearDeadCap: total, nextYearDeadCap: 0 };
}

export function restructureContract(contract, rng) {
  const normalized = normalizeContract(contract);
  if (normalized.yearsRemaining <= 1) return normalizeContract(normalized);
  const convertRatio = 0.24 + (rng ? rng.float(0, 0.18) : 0.3);
  const converted = rounded(normalized.baseSalary * convertRatio);
  const newBase = rounded(Math.max(MIN_SALARY * 0.7, normalized.baseSalary - converted));
  const newBonus = rounded(normalized.signingBonus + converted);
  const years = normalized.yearsRemaining;
  const newCapHit = rounded(newBase + newBonus / years);
  const deadCapRemaining = rounded(normalized.deadCapRemaining + converted * 0.72);
  return normalizeContract({
    ...normalized,
    baseSalary: newBase,
    signingBonus: newBonus,
    // A restructure re-prorates over the years that are left — that is what
    // buys the current-year relief, and what pushes the bill into the back of
    // the deal. The new schedule is persisted so it holds for the rest of the
    // contract instead of tightening again every season.
    prorationYears: years,
    capHit: newCapHit,
    deadCapRemaining,
    restructureCount: normalized.restructureCount + 1
  });
}

export function applyFranchiseTag(contract, { year, salary = null } = {}) {
  const normalized = normalizeContract(contract);
  const tagSalary = rounded(
    salary ??
      Math.max(normalized.salary * 1.2, normalized.capHit * 1.35, 18_000_000)
  );
  return normalizeContract({
    ...normalized,
    salary: tagSalary,
    baseSalary: tagSalary,
    guaranteed: tagSalary,
    yearsRemaining: 1,
    voidYears: normalized.voidYears,
    // A tag is a one-year deal: whatever proration is still outstanding lands
    // on this year, so the schedule collapses to 1 rather than carrying the
    // multi-year term of the contract the tag replaced.
    prorationYears: 1,
    capHit: tagSalary,
    franchiseTagYear: Number(year || 0),
    optionYear: false
  });
}

export function applyFifthYearOption(contract, { salary = null } = {}) {
  const normalized = normalizeContract(contract);
  const optionSalary = rounded(
    salary ?? Math.max(normalized.salary * 1.15, normalized.capHit * 1.2, 7_500_000)
  );
  return normalizeContract({
    ...normalized,
    salary: optionSalary,
    baseSalary: optionSalary,
    // S102 — `capHit` came through the spread untouched, so exercising the
    // option raised the salary and the club paid nothing for it against the
    // cap. The option is a guaranteed salary year, not new bonus money, so the
    // hit is the new base against the existing proration schedule.
    capHit: rounded(optionSalary + normalized.signingBonus / normalized.prorationYears),
    yearsRemaining: Math.max(1, normalized.yearsRemaining) + 1,
    optionYear: true
  });
}
