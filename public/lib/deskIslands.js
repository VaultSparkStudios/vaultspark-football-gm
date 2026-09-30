/**
 * deskIslands.js — the Desk's lazy surfaces (S109).
 *
 * The Front Office Advisor argues one call from the Co-GM packet and keeps a
 * running tally of when the player went against the room; the First Season
 * Contract marks five first-year objectives. Both re-render on every applied
 * dashboard and neither touches the engine. This module is itself lazy so the
 * boot graph carries only app.js's thin wrappers, not the wiring.
 */

import { state } from "./appState.js";
import { showToast } from "./appCore.js";
import { currentCoGmBriefingPacket } from "./tabOverview.js";
import { isMobileModeEnabled } from "./mobileLoop.js";
import { recordAchievementEvent } from "./achievements.js";
import { franchiseStorageKey, dashboardAuthorityKey } from "./franchiseScope.js";

// v1 counted unobserved actions as agreements. Retain those historical keys,
// but start the evidence-based tally separately rather than relabel old data.
const ADVISOR_STATE_PREFIX = "front-office-advisor:v2";

function readFranchiseJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeFranchiseJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the advisor simply loses its memory of last week.
  }
}

export function describeAdvisorTally(tally) {
  const weeks = Number(tally?.weeks || 0);
  if (!weeks) return "No calls scored yet";
  const parts = [`${tally.agreed || 0} with the room`, `${tally.against || 0} against`];
  if (tally.unscored) parts.push(`${tally.unscored} unscored`);
  return `${parts.join(" · ")} over ${weeks} recorded week${weeks === 1 ? "" : "s"}`;
}

export async function renderFrontOfficeAdvisor() {
  const panel = document.getElementById("frontOfficeAdvisorPanel");
  const content = document.getElementById("frontOfficeAdvisorContent");
  if (!panel || !content || !state.dashboard?.controlledTeamId) return;
  const dashboard = state.dashboard;
  const sourceAuthority = {
    key: dashboardAuthorityKey(dashboard), year: dashboard.currentYear,
    week: dashboard.currentWeek, phase: dashboard.phase, teamId: dashboard.controlledTeamId
  };
  const key = franchiseStorageKey(ADVISOR_STATE_PREFIX, dashboard);
  const packet = currentCoGmBriefingPacket();
  const advisor = await import("./frontOfficeAdvisor.js");
  if (sourceAuthority.key !== dashboardAuthorityKey(state.dashboard)) return;
  const memory = readFranchiseJson(key) || {};
  const advice = advisor.buildAdvice(packet, {
    lastWeekAdvice: memory.scored?.advice || null,
    lastWeekReceipt: memory.scored?.receipt || null
  });
  content.innerHTML = advisor.renderAdvisorCard(advice, { compact: isMobileModeEnabled() });
  const tallyEl = document.getElementById("frontOfficeAdvisorTally");
  if (tallyEl) tallyEl.textContent = describeAdvisorTally(memory.tally);
  // The advice on the desk is what the coming commit will be scored against.
  writeFranchiseJson(key, {
    ...memory,
    pending: { advice, sourceAuthority }
  });
  panel.hidden = false;
}

export async function recordAdvisorOutcome(receipt, dashboard = state.dashboard) {
  const key = franchiseStorageKey(ADVISOR_STATE_PREFIX, dashboard);
  const advisor = await import("./frontOfficeAdvisor.js");
  const memory = readFranchiseJson(key) || {};
  const next = advisor.reduceAdvisorOutcome(memory, receipt);
  if (next !== memory) writeFranchiseJson(key, next);
}

export async function renderFirstSeasonContractStrip() {
  if (!state.dashboard?.controlledTeamId) return;
  const contract = await import("./firstSeasonContract.js");
  const result = contract.renderFirstSeasonContract({ dashboard: state.dashboard });
  if (result.completedNow) {
    recordAchievementEvent("first-season-contract");
    showToast("First Season Contract honoured — the owner noticed.");
  }
}

export async function markFirstSeasonObjective(id) {
  if (!state.dashboard?.controlledTeamId) return;
  const contract = await import("./firstSeasonContract.js");
  contract.markObjective(state.dashboard, id);
  await renderFirstSeasonContractStrip();
}

export async function dismissFirstSeasonContract() {
  const contract = await import("./firstSeasonContract.js");
  contract.dismissContract(state.dashboard);
  await renderFirstSeasonContractStrip();
  showToast("Contract shelved. The owner still remembers what was in it.");
}
