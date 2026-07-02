/**
 * returnDigest.js — "While You Were Away" Return Hook (S29)
 *
 * All prior engagement in this game was in-session (inbox badge, ticker,
 * moment cards) — there was no return/retention loop of any kind. This adds
 * a zero-backend one: the last-visit timestamp + week/year are stamped in
 * localStorage, and on the next load after a real absence a compact digest
 * — what changed in your franchise, in three lines — surfaces before the
 * player dives back into the dashboard.
 *
 * Trigger: more than ABSENCE_THRESHOLD_MS has elapsed since the last visit,
 * OR the league's current week/year has advanced since then. A first-ever
 * visit never shows a digest (there is nothing to report yet).
 */

import { api } from "./appState.js";
import { escapeHtml } from "./appCore.js";
import { getUnreadCount } from "./engagementFeatures.js";

const STORAGE_KEY = "franchise-architect-last-seen";
export const ABSENCE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

function readLastVisit() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLastVisit(entry) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage failures (private browsing, quota) — the digest is a
    // nice-to-have, never a hard requirement to boot the game.
  }
}

function controlledStandingsRow(dashboard) {
  const team = dashboard?.controlledTeam || {};
  const teamKey = team.abbrev || team.teamId || dashboard?.controlledTeamId || "";
  const standings = dashboard?.latestStandings || [];
  return standings.find((r) => r.team === teamKey) || null;
}

/**
 * Pure — no DOM, no storage side effects. Returns null when no digest
 * should be shown (first visit, or the player was barely away).
 */
export function buildReturnDigest(dashboard, priorVisit, now = Date.now()) {
  if (!dashboard || !priorVisit) return null;
  const elapsedMs = now - (priorVisit.timestamp || 0);
  const weekAdvanced =
    priorVisit.year != null &&
    (dashboard.currentYear > priorVisit.year ||
      (dashboard.currentYear === priorVisit.year && dashboard.currentWeek > priorVisit.week));
  if (elapsedMs < ABSENCE_THRESHOLD_MS && !weekAdvanced) return null;

  const team = dashboard.controlledTeam || {};
  const teamKey = team.abbrev || team.teamId || dashboard.controlledTeamId || "";
  const myRow = controlledStandingsRow(dashboard);

  const priorRecord = priorVisit.record || null;
  const currentRecord = myRow ? { wins: myRow.wins || 0, losses: myRow.losses || 0 } : null;
  const recordDelta =
    priorRecord && currentRecord
      ? { wins: currentRecord.wins - priorRecord.wins, losses: currentRecord.losses - priorRecord.losses }
      : null;

  return {
    elapsedMs,
    weekAdvanced,
    fromWeek: priorVisit.week ?? null,
    fromYear: priorVisit.year ?? null,
    toWeek: dashboard.currentWeek ?? null,
    toYear: dashboard.currentYear ?? null,
    currentRecord,
    recordDelta,
    unreadCount: getUnreadCount(),
    teamName: team.name || teamKey || "Your franchise"
  };
}

export function formatElapsed(ms) {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export async function fetchPendingDecisionSummary() {
  try {
    const data = await api("/api/gm-decision");
    return data?.decisions?.[0] || null;
  } catch {
    return null;
  }
}

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || document.getElementById("returnDigestStyles")) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "returnDigestStyles";
  style.textContent = `
    .return-digest-overlay { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center; background: rgba(6, 10, 18, 0.72); padding: 1rem; pointer-events: none; }
    .return-digest-card { max-width: 420px; width: 100%; background: var(--panel, #141c2b); color: var(--ink, #eef2fb); border: 1px solid var(--line, #263248); border-radius: 14px; padding: 1.25rem 1.4rem; box-shadow: 0 18px 60px rgba(0,0,0,0.45); pointer-events: auto; }
    .return-digest-header { font-size: 1.15rem; font-weight: 700; letter-spacing: 0.01em; }
    .return-digest-sub { margin-top: 0.25rem; font-size: 0.85rem; color: var(--muted, #93a1bd); }
    .return-digest-list { list-style: none; margin: 0.9rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.9rem; }
    .return-digest-list li { padding-left: 1.1rem; position: relative; }
    .return-digest-list li::before { content: "\\2022"; position: absolute; left: 0; color: var(--accent, #5b8cff); }
    .return-digest-decision { color: var(--accent, #5b8cff); font-weight: 600; }
    .return-digest-actions { display: flex; gap: 0.6rem; margin-top: 1rem; flex-wrap: wrap; }
    .return-digest-actions button { flex: 1; min-height: 44px; border-radius: 8px; border: 1px solid var(--line, #263248); background: transparent; color: inherit; cursor: pointer; font: inherit; }
    .return-digest-actions button[data-action="dismiss"] { background: var(--accent, #5b8cff); border-color: transparent; color: #0b1220; font-weight: 700; }
  `;
  document.head.appendChild(style);
}

export function renderReturnDigest(digest, pendingDecision, { onDismiss, onJumpToInbox } = {}) {
  ensureStyles();

  const recordLine = digest.recordDelta
    ? `Record moved to ${digest.currentRecord.wins}-${digest.currentRecord.losses} (${digest.recordDelta.wins >= 0 ? "+" : ""}${digest.recordDelta.wins}W since your last visit).`
    : digest.currentRecord
      ? `Current record: ${digest.currentRecord.wins}-${digest.currentRecord.losses}.`
      : "";
  const weekLine = digest.weekAdvanced
    ? `The league moved from Year ${digest.fromYear} Week ${digest.fromWeek} to Year ${digest.toYear} Week ${digest.toWeek}.`
    : "";
  const inboxLine =
    digest.unreadCount > 0
      ? `${digest.unreadCount} item${digest.unreadCount === 1 ? "" : "s"} waiting in your Priority Inbox.`
      : "Inbox is clear.";
  const decisionLine = pendingDecision ? `A GM decision is waiting: "${pendingDecision.prompt || "a call needs to be made"}".` : "";

  const overlay = document.createElement("div");
  overlay.className = "return-digest-overlay";
  overlay.id = "returnDigestOverlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "While you were away");
  overlay.innerHTML = `
    <div class="return-digest-card">
      <div class="return-digest-header">While You Were Away</div>
      <div class="return-digest-sub">${escapeHtml(formatElapsed(digest.elapsedMs))} since your last visit to ${escapeHtml(digest.teamName)}.</div>
      <ul class="return-digest-list">
        ${weekLine ? `<li>${escapeHtml(weekLine)}</li>` : ""}
        ${recordLine ? `<li>${escapeHtml(recordLine)}</li>` : ""}
        <li>${escapeHtml(inboxLine)}</li>
        ${decisionLine ? `<li class="return-digest-decision">${escapeHtml(decisionLine)}</li>` : ""}
      </ul>
      <div class="return-digest-actions">
        <button type="button" data-action="jump-inbox">Open Priority Inbox</button>
        <button type="button" data-action="dismiss">Jump Back In</button>
      </div>
    </div>
  `;

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", escHandler);
    onDismiss?.();
  };
  function escHandler(event) {
    if (event.key === "Escape") close();
  }
  overlay.querySelector('[data-action="dismiss"]')?.addEventListener("click", close);
  overlay.querySelector('[data-action="jump-inbox"]')?.addEventListener("click", () => {
    overlay.remove();
    document.removeEventListener("keydown", escHandler);
    onJumpToInbox?.();
  });
  document.addEventListener("keydown", escHandler);

  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Orchestrates the full return-hook flow: read the prior visit, build the
 * digest, render it if applicable, then stamp this visit for next time.
 * Call once, after the dashboard has finished its first load.
 */
export async function maybeShowReturnDigest(dashboard, options = {}) {
  const priorVisit = readLastVisit();
  let shown = false;
  if (dashboard) {
    const digest = buildReturnDigest(dashboard, priorVisit);
    if (digest) {
      const pendingDecision = await fetchPendingDecisionSummary();
      renderReturnDigest(digest, pendingDecision, options);
      shown = true;
    }
    const myRow = controlledStandingsRow(dashboard);
    writeLastVisit({
      timestamp: Date.now(),
      year: dashboard.currentYear ?? null,
      week: dashboard.currentWeek ?? null,
      record: myRow ? { wins: myRow.wins || 0, losses: myRow.losses || 0 } : null
    });
  }
  return shown;
}
