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
import { franchiseStorageKey } from "./franchiseScope.js";

const ADVISOR_LAST_PREFIX = "front-office-advisor:last";
const ADVISOR_TALLY_PREFIX = "front-office-advisor:tally";
let advisorStyleMounted = false;

function readFranchiseJson(prefix) {
  try {
    const raw = localStorage.getItem(franchiseStorageKey(prefix, state.dashboard));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeFranchiseJson(prefix, value) {
  try {
    localStorage.setItem(franchiseStorageKey(prefix, state.dashboard), JSON.stringify(value));
  } catch {
    // Storage full or blocked: the advisor simply loses its memory of last week.
  }
}

export function describeAdvisorTally(tally) {
  const weeks = Number(tally?.weeks || 0);
  if (!weeks) return "No calls scored yet";
  const parts = [`${tally.agreed || 0} with the room`, `${tally.against || 0} against`];
  if (tally.deferred) parts.push(`${tally.deferred} deferred`);
  return `${parts.join(" · ")} over ${weeks} week${weeks === 1 ? "" : "s"}`;
}

export async function renderFrontOfficeAdvisor() {
  const panel = document.getElementById("frontOfficeAdvisorPanel");
  const content = document.getElementById("frontOfficeAdvisorContent");
  if (!panel || !content || !state.dashboard?.controlledTeamId) return;
  const advisor = await import("./frontOfficeAdvisor.js");
  if (!advisorStyleMounted && !document.getElementById("front-office-advisor-style")) {
    const style = document.createElement("style");
    style.id = "front-office-advisor-style";
    style.textContent = advisor.ADVISOR_STYLE;
    document.head.appendChild(style);
    advisorStyleMounted = true;
  }
  const memory = readFranchiseJson(ADVISOR_LAST_PREFIX) || {};
  const advice = advisor.buildAdvice(currentCoGmBriefingPacket(), {
    lastWeekAdvice: memory.scored?.advice || null,
    lastWeekReceipt: memory.scored?.receipt || null
  });
  content.innerHTML = advisor.renderAdvisorCard(advice, { compact: isMobileModeEnabled() });
  const tallyEl = document.getElementById("frontOfficeAdvisorTally");
  if (tallyEl) tallyEl.textContent = describeAdvisorTally(readFranchiseJson(ADVISOR_TALLY_PREFIX));
  // The advice on the desk is what the coming commit will be scored against.
  writeFranchiseJson(ADVISOR_LAST_PREFIX, {
    ...memory,
    pending: { advice, year: state.dashboard.currentYear, week: state.dashboard.currentWeek }
  });
  panel.hidden = false;
}

export async function recordAdvisorOutcome(receipt) {
  const memory = readFranchiseJson(ADVISOR_LAST_PREFIX);
  if (!memory?.pending?.advice) return;
  const advisor = await import("./frontOfficeAdvisor.js");
  const agreement = advisor.scoreAgreement(memory.pending.advice, receipt);
  writeFranchiseJson(ADVISOR_TALLY_PREFIX, advisor.updateAgreementTally(readFranchiseJson(ADVISOR_TALLY_PREFIX) || {}, agreement));
  writeFranchiseJson(ADVISOR_LAST_PREFIX, { scored: { advice: memory.pending.advice, receipt, agreement }, pending: null });
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
