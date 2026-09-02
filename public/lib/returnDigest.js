/**
 * returnDigest.js — session-bound Welcome Back continuity hook
 *
 * Persists an authoritative franchise boundary after each committed action and
 * at pagehide. The next session only surfaces a digest when live state differs
 * from that boundary; elapsed time alone never invents activity or urgency.
 */

import { api } from "./appState.js";
import { escapeHtml } from "./appCore.js";
import { getUnreadCount } from "./engagementFeatures.js";
import { buildSeasonChapter } from "./seasonChapters.js";
import { franchiseScopeFromDashboard, franchiseStorageKey } from "./franchiseScope.js";
import { diffTeamRecord, findTeamStanding, formatTeamRecord, normalizeTeamRecord } from "./teamRecord.js";

const STORAGE_PREFIX = "franchise-architect-session-boundary:v3";
export const RETURN_BOUNDARY_SCHEMA_VERSION = "1.0";
export const ABSENCE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

export function returnDigestStorageKey(dashboard = {}) {
  return franchiseStorageKey(STORAGE_PREFIX, dashboard);
}

export function readLastVisit(dashboard = {}, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(returnDigestStorageKey(dashboard));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeLastVisit(dashboard = {}, entry = {}, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(returnDigestStorageKey(dashboard), JSON.stringify({
      schemaVersion: RETURN_BOUNDARY_SCHEMA_VERSION,
      ...entry,
      scope: franchiseScopeFromDashboard(dashboard)
    }));
    return true;
  } catch {
    // Ignore storage failures (private browsing, quota) — the boundary is a
    // useful continuity receipt, never a hard requirement to boot the game.
    return false;
  }
}

function controlledStandingsRow(dashboard) {
  const team = dashboard?.controlledTeam || {};
  const teamKey = team.abbrev || team.teamId || dashboard?.controlledTeamId || "";
  const standings = dashboard?.latestStandings || [];
  return findTeamStanding(standings, { ...team, id: teamKey });
}

const activeReturnSessions = new Map();
let lifecycleBound = false;

function returnSessionId(dashboard = {}, now = Date.now()) {
  const scope = franchiseScopeFromDashboard(dashboard);
  if (!activeReturnSessions.has(scope)) activeReturnSessions.set(scope, `${scope}:${now}`);
  return activeReturnSessions.get(scope);
}

export function buildReturnBoundary(dashboard = {}, {
  timestamp = Date.now(),
  reason = "session-boundary",
  sessionId = returnSessionId(dashboard, timestamp),
  sequence = 1
} = {}) {
  const row = controlledStandingsRow(dashboard);
  const chapter = buildSeasonChapter(dashboard);
  return {
    schemaVersion: RETURN_BOUNDARY_SCHEMA_VERSION,
    kind: "return-session-boundary",
    timestamp,
    reason,
    sessionId,
    sequence,
    year: dashboard.currentYear ?? null,
    week: dashboard.currentWeek ?? null,
    record: row ? normalizeTeamRecord(row) : null,
    chapterId: chapter?.id || null,
    chapterCheckpointStatus: chapter?.seasonThesis?.checkpointStatus || null
  };
}

export function recordReturnBoundary(dashboard = {}, options = {}, storage = globalThis.localStorage) {
  if (!dashboard) return false;
  const prior = readLastVisit(dashboard, storage);
  const sequence = Math.max(0, Number(prior?.sequence || 0)) + 1;
  return writeLastVisit(dashboard, buildReturnBoundary(dashboard, { ...options, sequence }), storage);
}

export function bindReturnBoundaryLifecycle(getDashboard, windowObject = globalThis.window, storage = globalThis.localStorage) {
  if (lifecycleBound || typeof getDashboard !== "function" || !windowObject?.addEventListener) return false;
  lifecycleBound = true;
  windowObject.addEventListener("pagehide", () => {
    recordReturnBoundary(getDashboard(), { reason: "pagehide" }, storage);
  });
  return true;
}

/**
 * Pure — no DOM, no storage side effects. Returns null when no digest
 * should be shown (first visit, or the player was barely away).
 */
export function buildReturnDigest(dashboard, priorVisit, now = Date.now()) {
  if (!dashboard || !priorVisit) return null;
  const scope = franchiseScopeFromDashboard(dashboard);
  if (priorVisit.scope !== scope) return null;
  const elapsedMs = now - (priorVisit.timestamp || 0);
  const weekAdvanced =
    priorVisit.year != null &&
    (dashboard.currentYear > priorVisit.year ||
      (dashboard.currentYear === priorVisit.year && dashboard.currentWeek > priorVisit.week));

  const team = dashboard.controlledTeam || {};
  const teamKey = team.abbrev || team.teamId || dashboard.controlledTeamId || "";
  const myRow = controlledStandingsRow(dashboard);
  const priorRecord = priorVisit.record || null;
  const currentRecord = myRow ? normalizeTeamRecord(myRow) : null;
  const recordDelta =
    priorRecord && currentRecord
      ? diffTeamRecord(currentRecord, priorRecord)
      : null;
  const seasonChapter = buildSeasonChapter(dashboard);
  const chapterChanged = Boolean(
    priorVisit.chapterId &&
    (priorVisit.chapterId !== seasonChapter?.id ||
      priorVisit.chapterCheckpointStatus !== seasonChapter?.seasonThesis?.checkpointStatus)
  );
  const recordChanged = Boolean(recordDelta && Object.values(recordDelta).some((value) => value !== 0));
  const unreadCount = getUnreadCount();
  const hasAuthoritativeDelta = weekAdvanced || recordChanged || chapterChanged || unreadCount > 0;
  if (!hasAuthoritativeDelta) return null;

  return {
    schemaVersion: RETURN_BOUNDARY_SCHEMA_VERSION,
    kind: "return-session-digest",
    elapsedMs,
    boundaryReason: priorVisit.reason || "unknown",
    boundarySessionId: priorVisit.sessionId || null,
    boundarySequence: Number(priorVisit.sequence || 0) || null,
    weekAdvanced,
    chapterChanged,
    fromWeek: priorVisit.week ?? null,
    fromYear: priorVisit.year ?? null,
    toWeek: dashboard.currentWeek ?? null,
    toYear: dashboard.currentYear ?? null,
    currentRecord,
    recordDelta,
    unreadCount,
    teamName: team.name || teamKey || "Your franchise",
    seasonChapter
  };
}
export function buildReturnChapterAction(digest = {}) {
  const chapter = digest.seasonChapter || null;
  if (!chapter?.targetTab) return null;
  const action = {
    kind: "continue-season-chapter",
    label: `Continue ${chapter.label || "Season Plan"}`,
    targetTab: chapter.targetTab,
    targetId: chapter.targetId || null,
    chapterId: chapter.id || null
  };
  if (chapter.seasonThesis?.thesisId) {
    action.thesisId = chapter.seasonThesis.thesisId;
    action.thesisCheckpoint = chapter.seasonThesis.checkpointId || null;
  }
  return action;
}

export function formatSeasonThesisContinuation(chapter = {}) {
  const thesis = chapter.seasonThesis || null;
  if (!thesis) return "";
  if (!thesis.thesisId) return "Season thesis remains unproven; no Opening Contract receipt is available.";
  return `Thesis ${thesis.identity?.label || thesis.thesisId}: ${thesis.checkpointId} is ${thesis.checkpointStatus}.`;
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

export function renderReturnDigest(digest, pendingDecision, { onDismiss, onJumpToInbox, onContinueChapter } = {}) {
  ensureStyles();
  const chapterAction = buildReturnChapterAction(digest);

  const recordLine = digest.recordDelta
    ? `Record is now ${formatTeamRecord(digest.currentRecord, { separator: "-" })} (${["wins", "losses", "ties"].filter((key) => digest.recordDelta[key] !== 0).map((key) => `${digest.recordDelta[key] >= 0 ? "+" : ""}${digest.recordDelta[key]}${key[0].toUpperCase()}`).join(", ")} since the recorded session boundary).`
    : digest.currentRecord
      ? `Current record: ${formatTeamRecord(digest.currentRecord, { separator: "-" })}.`
      : "";
  const weekLine = digest.weekAdvanced
    ? `Your saved franchise moved from Year ${digest.fromYear} Week ${digest.fromWeek} to Year ${digest.toYear} Week ${digest.toWeek} since the recorded session boundary.`
    : "";
  const inboxLine =
    digest.unreadCount > 0
      ? `${digest.unreadCount} item${digest.unreadCount === 1 ? "" : "s"} waiting in your Priority Inbox.`
      : "Inbox is clear.";
  const decisionLine = pendingDecision ? `A GM decision is waiting: "${pendingDecision.prompt || "a call needs to be made"}".` : "";
  const chapterLine = digest.seasonChapter
    ? `${digest.seasonChapter.label}: ${digest.seasonChapter.title}. ${formatSeasonThesisContinuation(digest.seasonChapter)} Next: ${digest.seasonChapter.nextCall}`
    : "";

  const overlay = document.createElement("div");
  overlay.className = "return-digest-overlay";
  overlay.id = "returnDigestOverlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Welcome back to your franchise");
  overlay.innerHTML = `
    <div class="return-digest-card">
      <div class="return-digest-header">Welcome Back</div>
      <div class="return-digest-sub">Session boundary recorded ${escapeHtml(formatElapsed(digest.elapsedMs))} ago for ${escapeHtml(digest.teamName)}.</div>
      <ul class="return-digest-list">
        ${weekLine ? `<li>${escapeHtml(weekLine)}</li>` : ""}
        ${recordLine ? `<li>${escapeHtml(recordLine)}</li>` : ""}
        ${chapterLine ? `<li>${escapeHtml(chapterLine)}</li>` : ""}
        <li>${escapeHtml(inboxLine)}</li>
        ${decisionLine ? `<li class="return-digest-decision">${escapeHtml(decisionLine)}</li>` : ""}
      </ul>
      <div class="return-digest-actions">
        ${chapterAction ? `<button type="button" data-action="continue-chapter">${escapeHtml(chapterAction.label)}</button>` : ""}
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
  overlay.querySelector('[data-action="continue-chapter"]')?.addEventListener("click", () => {
    overlay.remove();
    document.removeEventListener("keydown", escHandler);
    onContinueChapter?.(chapterAction);
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
  const priorVisit = readLastVisit(dashboard);
  let shown = false;
  if (dashboard) {
    const digest = buildReturnDigest(dashboard, priorVisit);
    if (digest) {
      const pendingDecision = await fetchPendingDecisionSummary();
      renderReturnDigest(digest, pendingDecision, options);
      shown = true;
    }
    recordReturnBoundary(dashboard, { reason: "session-open" });
    bindReturnBoundaryLifecycle(options.getDashboard || (() => dashboard));
  }
  return shown;
}
