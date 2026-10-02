/**
 * operatingStatement.js — the Boardroom's profit-and-loss view (S113).
 *
 * A read-only statement over money the simulation already moves: weekly gate
 * revenue and staff costs (owner.finances), facility upkeep and the operating
 * liquidity owner.cash represents (ownerEconomy.js). It invents no revenue line
 * the engine does not model — player payroll stays with the salary cap, exactly
 * as ownerEconomy documents — and it writes nothing, so it cannot move a result.
 */

import { measureOwnerOperatingLiquidity, operatingLiquidityPressure, OWNER_LIQUIDITY_PROFILE } from "./ownerEconomy.js";

const finite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

function rankOf(value, values) {
  return 1 + values.filter((other) => other > value).length;
}

export function buildOperatingStatement(team, leagueTeams = []) {
  const owner = team?.owner;
  if (!owner) return null;
  const revenue = Math.round(finite(owner.finances?.revenueYtd));
  const staffCosts = Math.round(finite(owner.finances?.expensesYtd));
  const net = revenue - staffCosts;
  const liquidity = measureOwnerOperatingLiquidity(owner);
  const { pressure } = operatingLiquidityPressure(owner);
  const leagueRevenue = leagueTeams.map((other) => finite(other?.owner?.finances?.revenueYtd)).filter((value) => value >= 0);
  const leagueAverage = leagueRevenue.length ? Math.round(leagueRevenue.reduce((sum, value) => sum + value, 0) / leagueRevenue.length) : null;
  const status = pressure >= 12 ? "pressure" : pressure > 0 ? "watch" : "healthy";
  return {
    teamId: team.id,
    revenueYtd: revenue,
    staffCostsYtd: staffCosts,
    netOperatingYtd: net,
    marginPct: revenue > 0 ? Math.round((net / revenue) * 100) : null,
    revenueRank: leagueRevenue.length ? rankOf(revenue, leagueRevenue) : null,
    leagueTeams: leagueRevenue.length,
    leagueAverageRevenueYtd: leagueAverage,
    ticketPrice: finite(owner.ticketPrice, null),
    marketSize: finite(owner.marketSize, null),
    cash: liquidity.cash,
    reserve: liquidity.reserve,
    annualObligations: liquidity.obligations.total,
    facilityUpkeep: liquidity.obligations.facilityUpkeep,
    staffBudget: liquidity.obligations.staffBudget,
    runwayYears: Number(liquidity.runwayYears.toFixed(2)),
    targetRunwayYears: Number(liquidity.targetRunwayYears.toFixed(2)),
    ownerHeatFromFinances: pressure,
    status,
    verdict: status === "pressure"
      ? `Cash covers under ${OWNER_LIQUIDITY_PROFILE.severeRunwayYears} years of football costs; ownership is feeling it.`
      : status === "watch"
        ? "Cash is thin against next year's costs; ownership is watching."
        : liquidity.excessCash > 0
          ? "Comfortable. Cash above the owner's target goes back to ownership each year."
          : "Healthy: next year's football costs are covered.",
    note: "Player salaries are paid through the salary cap and are not part of this statement."
  };
}
