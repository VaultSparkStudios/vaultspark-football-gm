// S113 lazy island: the Co-GM Brief drawer and the packet its copy/download buttons export.
import { state } from "./appState.js";
import { escapeHtml, humanizeId } from "./appCore.js";
import { buildCoGmBriefingPacket } from "./coGmBriefing.js";

export function currentCoGmBriefingPacket() {
  return buildCoGmBriefingPacket({
    dashboard: state.dashboard || {},
    newsRows: state.newsRows || [],
    pendingDecision: state.mobilePendingDecision || state.dashboard?.gmDecisionQueue?.[0] || null,
    pendingChoice: state.mobilePendingDecisionChoice || null
  });
}

export function renderCoGmBriefingPanel() {
  const panel = document.getElementById("coGmBriefPanel");
  if (!panel) return;
  const packet = currentCoGmBriefingPacket();
  const command = packet.currentCommand;
  const receipts = packet.recentDecisionReceipts;
  const status = document.getElementById("coGmBriefStatus");
  const content = document.getElementById("coGmBriefContent");
  if (status) status.textContent = `${packet.authority.teamName} · ${packet.authority.year ?? "—"} W${packet.authority.week ?? "—"}`;
  if (content) content.innerHTML = `
    <div class="history-card-grid">
      <div class="history-card-stat"><strong>Current command</strong><div>${escapeHtml(command.title)}</div><small>${command.blocking ? "Must be settled before you advance" : "Optional this week"}</small></div>
      <div class="history-card-stat"><strong>Pressure</strong><div>${escapeHtml(packet.pressure.ownerMandate)}</div><small>${escapeHtml(packet.pressure.controlledTeamInjuries)} injuries · ${escapeHtml(packet.pressure.rosterNeeds.join(", ") || "no ranked need")}</small></div>
      <div class="history-card-stat"><strong>Your focus</strong><div>${escapeHtml(humanizeId(packet.architectThesis.focusPathId) || "Not declared")}</div><small>Version ${escapeHtml(packet.architectThesis.revision)}</small></div>
      <div class="history-card-stat"><strong>Decision memory</strong><div>${escapeHtml(receipts.length)} logged decision${receipts.length === 1 ? "" : "s"}</div><small>${escapeHtml(receipts[0]?.declared || "No recorded declaration yet")}</small></div>
    </div>`;
}
