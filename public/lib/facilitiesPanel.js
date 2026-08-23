/**
 * facilitiesPanel.js — the priced facilities market panel (S93).
 *
 * Lives outside the settings island's static graph and is pulled in with a
 * dynamic import when the Owner panel actually renders. The island carries a
 * 15% headroom floor precisely so a new feature has to make this choice rather
 * than quietly spend the boot budget; nobody who never opens the Owner tab
 * should pay for this markup.
 *
 * Every figure here comes from `getFacilitiesMarket` / `ticketPricingOutlook`,
 * which are the same functions the command prices against — so the panel cannot
 * quote a price the engine will not charge, or show an allowance the command
 * will not honour.
 */

import { escapeHtml, fmtMoney, teamByCode } from "./appCore.js";

function facilityCard(row, centre) {
  const gap = Number.isFinite(centre) ? row.current - centre : null;
  const standing =
    gap == null ? "" : gap >= 0 ? `${gap.toFixed(1)} above the league` : `${Math.abs(gap).toFixed(1)} behind the league`;
  const next =
    row.nextPointCost == null
      ? "At the league maximum."
      : `Next point ${fmtMoney(row.nextPointCost)} | ${row.allowanceRemaining} of ${row.allowance} left to build this year`;
  const upkeep = `Upkeep ${fmtMoney(row.upkeep)}/yr, ${fmtMoney(row.upkeepAfterNextPoint)} after the next point`;
  return `
    <div class="control-spotlight-card">
      <strong>${escapeHtml(row.facility)}</strong>
      <div>${escapeHtml(String(row.current))}${centre == null ? "" : escapeHtml(` | league ${centre}`)}</div>
      <div class="small">${escapeHtml(standing)}</div>
      <div class="small">${escapeHtml(next)}</div>
      <div class="small">${escapeHtml(upkeep)}</div>
    </div>`;
}

function pricingCard(pricing) {
  if (!pricing) return "";
  const sign = pricing.fanInterestPerWeek >= 0 ? "+" : "";
  return `
    <div class="control-spotlight-card">
      <strong>Gate Pricing</strong>
      <div>${escapeHtml(`Ticket ${pricing.price} | league mean ${pricing.leagueCentre}`)}</div>
      <div class="small">${escapeHtml(`Attendance ${(pricing.demandFactor * 100).toFixed(0)}% of what fan interest alone would fill`)}</div>
      <div class="small">${escapeHtml(
        `Best gate revenue near ${Math.round(pricing.revenueMaximisingPrice)} | fan interest ${sign}${pricing.fanInterestPerWeek}/week at this price`
      )}</div>
    </div>`;
}

/**
 * Both panels take `(host, state)` so the settings island can mount either
 * through one helper. Keeping the shape uniform is what lets the island carry a
 * single lazy-mount function instead of two near-identical blocks — which
 * matters, because that island runs against a 15% boot-budget headroom floor.
 *
 * Failures are routed through `observeBackgroundTask` at the call site rather
 * than swallowed by a bare `.catch`: a lazily imported panel that fails to load
 * must land in the client diagnostics ledger and stay retryable, not disappear
 * behind a reassuring sentence. `test/browser-promise-observability.test.js`
 * enforces that, and it caught the first version of this wiring.
 */
export function renderFacilitiesMarketPanel(host, state) {
  if (!host) return;
  const market = state?.ownerState?.facilitiesMarket;
  const pricing = state?.ownerState?.ticketPricing;
  if (!market?.ok) {
    host.innerHTML = `<div class="small">Load an owner profile to review facility investment.</div>`;
    return;
  }
  const cards = (market.facilities || [])
    .map((row) => facilityCard(row, market.leagueCentres?.[row.facility]))
    .join("");
  host.innerHTML = `
    <div class="small">${escapeHtml(
      `Club cash ${fmtMoney(market.cash)} | facility upkeep ${fmtMoney(market.annualUpkeep)}/yr | operating reserve ${fmtMoney(market.minimumCashReserve)} must remain | league year ${market.year}`
    )}</div>
    <div class="control-spotlight-grid">${cards}${pricingCard(pricing)}</div>
  `;
}

export function renderOwnerSpotlightPanel(spotlight, state) {
  const owner = state.ownerState?.owner;
  if (!owner) {
    spotlight.innerHTML = `<div class="small">Load an owner profile to review mandate, market pressure, and budget posture.</div>`;
    return;
  }
  const culture = state.ownerState?.cultureProfile || {};
  const scheme = state.ownerState?.schemeIdentity || {};
  const weeklyPlan = state.ownerState?.weeklyPlan || {};
  const expectation = owner.expectation || {};
  const teamId = document.getElementById("ownerTeamSelect")?.value || state.dashboard?.controlledTeamId || "";
  const team = teamByCode(teamId) || null;
  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">${escapeHtml(team?.name || teamId || "Owner")}</div>
      <div class="overview-team-meta">
        ${escapeHtml(owner.personality || "owner")} | market ${escapeHtml(owner.marketSize || "-")} | fan interest ${escapeHtml(owner.fanInterest ?? "-")}
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Mandate</strong>
        <div>${escapeHtml(expectation.mandate || "Stabilize the club")}</div>
        <div class="small">${escapeHtml(`Target ${expectation.targetWins ?? "-"} wins | Projected ${expectation.projectedWins ?? "-"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Economics</strong>
        <div>${escapeHtml(`${fmtMoney(owner.cash || 0)} cash | ${fmtMoney(owner.staffBudget || 0)} staff budget`)}</div>
        <div class="small">${escapeHtml(`Ticket ${owner.ticketPrice ?? "-"} | Revenue YTD ${fmtMoney(owner.finances?.revenueYtd || 0)}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Facilities</strong>
        <div>${escapeHtml(`Training ${owner.facilities?.training ?? "-"} | Rehab ${owner.facilities?.rehab ?? "-"} | Analytics ${owner.facilities?.analytics ?? "-"}`)}</div>
        <div class="small">${escapeHtml(`${culture.identity || "Balanced"} culture | ${scheme.offense || "-"} / ${scheme.defense || "-"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Weekly Pressure</strong>
        <div>${escapeHtml(weeklyPlan.summary || "No weekly plan summary loaded")}</div>
        <div class="small">${escapeHtml((expectation.reasons || []).join("; ") || "No pressure reasons flagged")}</div>
      </div>
    </div>
  `;
}
