/**
 * ownerEconomy.js — operating liquidity, not an NFL owner balance sheet (S95).
 *
 * `owner.cash` pays the football-operations costs this simulation actually models:
 * coaching staff, facility construction/upkeep, and coaching dead money. Player
 * payroll belongs to the salary-cap system and is deliberately not debited here.
 * Naming the pool operating liquidity prevents a partial model from masquerading
 * as a franchise valuation or an owner's personal wealth.
 *
 * The liquidity runway is measured against the next year of modeled obligations.
 * Excess above a trait-shaped capital envelope is returned to ownership annually.
 * That return is a sink, not a new spendable currency: it prevents an inactive or
 * already-maxed franchise from compounding cash forever while never taking a club
 * below the reserve and obligations its football operation needs.
 */

import { clamp } from "../utils/rng.js";
import {
  FACILITY_INVESTMENT_PROFILE,
  totalFacilityUpkeep
} from "./facilityInvestment.js";

export const OWNER_LIQUIDITY_PROFILE = Object.freeze({
  version: "2026-s95-operating-liquidity",
  /** Runway below these bands adds owner heat. */
  severeRunwayYears: 0.35,
  watchRunwayYears: 0.9,
  /** Trait-specific capital retained before ownership takes a distribution. */
  targetRunwayByPersonality: Object.freeze({
    "profit-first": 1.35,
    "win-now": 1.85,
    "player-friendly": 2.05,
    "legacy-builder": 2.25
  }),
  /** Fraction of true excess returned each league year. A fraction, rather than
   * a fixed cap, makes the recurrence converge even for the richest market. */
  distributionRateByPersonality: Object.freeze({
    "profit-first": 0.72,
    "win-now": 0.32,
    "player-friendly": 0.42,
    "legacy-builder": 0.38
  }),
  minimumDistributionRate: 0.22,
  maximumDistributionRate: 0.82,
  receiptLimit: 256
});

const finite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const priority01 = (value, floor = 0, ceiling = 100, fallback = 50) =>
  clamp((finite(value, fallback) - floor) / Math.max(1, ceiling - floor), 0, 1);

/**
 * The next year of football obligations represented by `owner.cash`.
 * Player contracts are intentionally absent: they are governed by salary cap,
 * while this pool models owner-controlled football-operations liquidity.
 */
export function nearTermFootballObligations(owner = {}) {
  const staffBudget = Math.max(0, Math.round(finite(owner.staffBudget, 25_000_000)));
  const facilityUpkeep = Math.max(0, totalFacilityUpkeep(owner));
  return {
    staffBudget,
    facilityUpkeep,
    total: Math.max(1, staffBudget + facilityUpkeep)
  };
}

/** A complete, replayable measurement of one owner's operating liquidity. */
export function measureOwnerOperatingLiquidity(owner = {}) {
  const profile = OWNER_LIQUIDITY_PROFILE;
  const cash = Math.round(finite(owner.cash));
  const reserve = FACILITY_INVESTMENT_PROFILE.minimumCashReserve;
  const obligations = nearTermFootballObligations(owner);
  const deployableCash = Math.max(0, cash - reserve);
  const runwayYears = deployableCash / obligations.total;
  const personality = String(owner.personality || "legacy-builder");
  const baseTarget = profile.targetRunwayByPersonality[personality] ?? 1.9;
  const championshipPriority = priority01(owner.priorities?.championships, 60, 95, 70);
  const profitPriority = priority01(owner.priorities?.profit, 45, 90, 60);
  // Championship-driven owners retain more deployable capital; profit-driven
  // owners return it sooner. The band stays bounded and visible in the receipt.
  const targetRunwayYears = clamp(
    baseTarget + championshipPriority * 0.35 - profitPriority * 0.3,
    1.1,
    2.6
  );
  const targetCash = Math.round(reserve + obligations.total * targetRunwayYears);

  return {
    profileVersion: profile.version,
    meaning: "football-operations-liquidity",
    cash,
    reserve,
    deployableCash,
    obligations,
    runwayYears: Number(runwayYears.toFixed(4)),
    targetRunwayYears: Number(targetRunwayYears.toFixed(4)),
    targetCash,
    excessCash: Math.max(0, cash - targetCash),
    championshipPriority: Number(championshipPriority.toFixed(4)),
    profitPriority: Number(profitPriority.toFixed(4))
  };
}

export function operatingLiquidityPressure(owner = {}) {
  const liquidity = measureOwnerOperatingLiquidity(owner);
  const pressure = liquidity.runwayYears <= OWNER_LIQUIDITY_PROFILE.severeRunwayYears
    ? 12
    : liquidity.runwayYears <= OWNER_LIQUIDITY_PROFILE.watchRunwayYears
      ? 5
      : 0;
  return { pressure, liquidity };
}

export function ownerDistributionRate(owner = {}) {
  const personality = String(owner.personality || "legacy-builder");
  const base = OWNER_LIQUIDITY_PROFILE.distributionRateByPersonality[personality] ?? 0.4;
  const profit = priority01(owner.priorities?.profit, 45, 90, 60);
  const championships = priority01(owner.priorities?.championships, 60, 95, 70);
  return clamp(
    base + (profit - 0.5) * 0.18 - (championships - 0.5) * 0.1,
    OWNER_LIQUIDITY_PROFILE.minimumDistributionRate,
    OWNER_LIQUIDITY_PROFILE.maximumDistributionRate
  );
}

/**
 * Return true excess capital to ownership without crossing the capital envelope.
 * Idempotent within a league year so a retried offseason stage cannot pay twice.
 */
export function applyOwnerCapitalReturn(owner = {}, year) {
  const numericYear = Number(year);
  const previous = owner.capitalReturn;
  if (previous && Number(previous.year) === numericYear) {
    return {
      ...previous,
      applied: false,
      reasonCode: "capital-return-already-settled"
    };
  }

  const liquidity = measureOwnerOperatingLiquidity(owner);
  const rate = ownerDistributionRate(owner);
  const returned = Math.min(
    liquidity.excessCash,
    Math.max(0, Math.round((liquidity.excessCash * rate) / 50_000) * 50_000)
  );
  const cashAfter = liquidity.cash - returned;
  const cumulative = Math.max(0, Math.round(finite(previous?.cumulative))) + returned;
  owner.cash = cashAfter;
  owner.capitalReturn = {
    year: numericYear,
    returned,
    cumulative,
    cashBefore: liquidity.cash,
    cashAfter,
    targetCash: liquidity.targetCash,
    targetRunwayYears: liquidity.targetRunwayYears,
    distributionRate: Number(rate.toFixed(4)),
    profileVersion: OWNER_LIQUIDITY_PROFILE.version
  };

  return {
    ...owner.capitalReturn,
    applied: returned > 0,
    reasonCode: returned > 0 ? "owner-capital-return" : "inside-capital-envelope",
    liquidity
  };
}
