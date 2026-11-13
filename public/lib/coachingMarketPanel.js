/**
 * coachingMarketPanel.js — the coaching market on screen (S63).
 *
 * Replaces the numeric staff editor. Every figure rendered here — salary,
 * payroll, budget headroom, dead money, the reason a hire is blocked — comes
 * from the runtime's market payload, which derives it from live league state.
 * The panel computes no money of its own, so what the player is quoted is
 * exactly what the hire costs.
 */

import { escapeHtml, teamCode } from "./appCore.js";
import { state, api } from "./appState.js";
import { applyDashboard, callUiIsland } from "./gameFlow.js";
export { initCoachingMarketPanel } from "./coachingMarketActions.js";

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
    return `Poach from ${teamCode(candidate.currentTeamId)}`;
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

// The team is captured at the click boundary, before this module is fetched.
export async function applyCoachingMarketAction({ teamId, action, role, candidateId }) {
  const payload = await api("/api/coaching-market", {
    method: "POST", body: { teamId, role, action, candidateId }
  });
  applyDashboard(payload.state);
  await loadStaff();
}

const selectedStaffTeam = () => document.getElementById("staffTeamSelect")?.value || state.dashboard?.controlledTeamId;

export async function loadStaff() {
  const render = renderCoachingMarketPanel;
  const teamId = selectedStaffTeam() || "BUF";
  const controlledTeamId = state.dashboard?.controlledTeamId || null;
  render({
    ok: false,
    error: teamId !== controlledTeamId
      ? `You control ${teamCode(controlledTeamId)}. ${teamCode(teamId)}'s staff is visible, but only its own front office can change it.`
      : "Loading the coaching market…"
  });
  const payload = await api(`/api/staff?team=${encodeURIComponent(teamId)}`);
  const currentTeamId = selectedStaffTeam() || "BUF";
  if (currentTeamId !== teamId) return;
  state.staffState = payload.staff || null;
  callUiIsland("settings", "renderStaff");
  await loadCoachingMarket(teamId);
}
// Hiring is controlled-club only; rival staff sheets remain viewable.
export async function loadCoachingMarket(teamId = null) {
  const render = renderCoachingMarketPanel;
  const team = teamId || selectedStaffTeam();
  const role = document.getElementById("staffRoleSelect")?.value || "headCoach";
  if (team && state.dashboard?.controlledTeamId && team !== state.dashboard.controlledTeamId) {
    render({
      ok: false,
      error: `You control ${teamCode(state.dashboard.controlledTeamId)}. ${teamCode(team)}'s staff is visible, but only its own front office can change it.`
    });
    return;
  }
  try {
    const market = await api(
      `/api/coaching-market?team=${encodeURIComponent(team)}&role=${encodeURIComponent(role)}`
    );
    const currentTeam = selectedStaffTeam();
    const currentRole = document.getElementById("staffRoleSelect")?.value || "headCoach";
    if (currentTeam !== team || currentRole !== role) return;
    render(market);
  } catch (error) {
    if (selectedStaffTeam() !== team || (document.getElementById("staffRoleSelect")?.value || "headCoach") !== role) return;
    render({ ok: false, error: error?.message || "Coaching market unavailable." });
  }
}
