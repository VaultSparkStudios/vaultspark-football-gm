/**
 * coachingMarketPanel.js — the coaching market on screen (S63).
 *
 * Replaces the numeric staff editor. Every figure rendered here — salary,
 * payroll, budget headroom, dead money, the reason a hire is blocked — comes
 * from the runtime's market payload, which derives it from live league state.
 * The panel computes no money of its own, so what the player is quoted is
 * exactly what the hire costs.
 */

import { escapeHtml } from "./appCore.js";

const PANEL_ID = "coachingMarketPanel";

function money(value) {
  const millions = Number(value || 0) / 1_000_000;
  return `$${millions.toFixed(millions >= 10 ? 1 : 2)}M`;
}

function ratingRow(candidate) {
  return `PC ${candidate.playcalling} · DEV ${candidate.development} · DIS ${candidate.discipline}`;
}

function originLabel(candidate) {
  if (candidate.origin === "coordinator" && candidate.currentTeamId) {
    return `Poach from ${candidate.currentTeamId}`;
  }
  return "Free agent";
}

export function renderCoachingMarketPanel(market) {
  const node = document.getElementById(PANEL_ID);
  if (!node) return;

  if (!market?.ok) {
    node.innerHTML = `<div class="coaching-market-empty">${escapeHtml(
      market?.error || "Select a team and role to see the coaching market."
    )}</div>`;
    return;
  }

  const budgetClass = market.overBudget ? "coaching-market-budget over" : "coaching-market-budget";
  const incumbent = market.incumbent
    ? `
      <div class="coaching-market-incumbent">
        <span class="cm-label">Currently</span>
        <strong>${escapeHtml(market.incumbent.name || "Vacant")}</strong>
        <span class="cm-meta">${escapeHtml(ratingRow(market.incumbent))} · ${escapeHtml(money(market.incumbent.salary))}/yr · ${escapeHtml(String(market.incumbent.yearsRemaining ?? "?"))} yr left</span>
        <button type="button" class="cm-fire" data-coach-action="fire" data-role="${escapeHtml(market.role)}">
          Move on — ${escapeHtml(money(market.incumbent.firingCost))} dead money
        </button>
      </div>`
    : `<div class="coaching-market-incumbent"><span class="cm-label">Currently</span><strong>Vacant</strong></div>`;

  const candidates = (market.candidates || [])
    .map(
      (candidate) => `
      <div class="cm-candidate${candidate.affordable ? "" : " cm-blocked"}">
        <div class="cm-candidate-head">
          <strong>${escapeHtml(candidate.name)}</strong>
          <span class="cm-origin">${escapeHtml(originLabel(candidate))}</span>
        </div>
        <div class="cm-meta">${escapeHtml(ratingRow(candidate))}</div>
        <div class="cm-meta">${escapeHtml(money(candidate.salary))}/yr · ${escapeHtml(String(candidate.yearsRequested))} years</div>
        <div class="cm-note">${escapeHtml(candidate.note || "")}</div>
        ${
          candidate.affordable
            ? `<button type="button" class="cm-hire" data-coach-action="hire" data-role="${escapeHtml(market.role)}" data-candidate="${escapeHtml(candidate.id)}">Hire</button>`
            : `<div class="cm-blocked-reason">${escapeHtml(candidate.blockedReason || "Outside the staff budget.")}</div>`
        }
      </div>`
    )
    .join("");

  const receipts = (market.receipts || [])
    .slice(0, 3)
    .map(
      (receipt) => `<li>${escapeHtml(`${receipt.roleLabel}: ${(receipt.reasons || []).join(" · ")}`)}</li>`
    )
    .join("");

  node.innerHTML = `
    <div class="coaching-market-head">
      <h3>${escapeHtml(market.roleLabel)} Market</h3>
      <span class="${budgetClass}">Staff payroll ${escapeHtml(money(market.payroll))} of ${escapeHtml(money(market.budget))}${
        market.overBudget ? " — over budget" : ` · ${escapeHtml(money(market.headroom))} free`
      }</span>
    </div>
    ${incumbent}
    <div class="cm-candidates">${candidates}</div>
    ${receipts ? `<ul class="cm-receipts">${receipts}</ul>` : ""}
  `;
}

/**
 * Wire the market once. Delegated so re-renders never need re-binding.
 * @param {(payload: {action: string, role: string, candidateId: string|null}) => void} onAction
 */
export function initCoachingMarketPanel(onAction) {
  const node = document.getElementById(PANEL_ID);
  if (!node || node.dataset.wired === "1") return;
  node.dataset.wired = "1";
  node.addEventListener("click", (event) => {
    const button = event.target.closest("[data-coach-action]");
    if (!button || button.disabled) return;
    node.querySelectorAll("[data-coach-action]").forEach((el) => { el.disabled = true; });
    onAction({
      action: button.dataset.coachAction,
      role: button.dataset.role,
      candidateId: button.dataset.candidate || null
    });
  });
}
