/**
 * engagementFeatures.js — Session 8 engagement & depth feature suite
 *
 * Exports:
 *   Priority Inbox system (bell icon, CRITICAL/IMPORTANT/FLAVOR tiers)
 *   Franchise Moment card (cinematic post-game drama)
 *   GM Decision modal (pre-advance critical-week choices)
 *   Sim-Watch overlay (live 300ms drive-log animation)
 *   Season Narrative Arcs panel
 *   Cap War Room panel
 *   Trade Breakdown card
 *   Dynasty Records Board
 *   AI GM Archetypes display
 *   Mentorship badge renderer
 */

import { state, api } from "./appState.js";
import { escapeHtml, fmtMoney, showToast, renderTable, teamCode } from "./appCore.js";
import { closeModal, openModal } from "./modalManager.js";
import { observeBackgroundTask } from "./clientDiagnostics.js";
import { franchiseScopeFromDashboard } from "./franchiseScope.js";
export {
  closeSimWatch,
  handleSimWatchKeyboard,
  playSimWatchFinalReel,
  runSimWatch,
  setSimWatchSpeed,
  skipSimWatch,
  stepSimWatch,
  toggleSimWatchPlayback
} from "./simWatchDirector.js";

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY INBOX SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

const INBOX_STORAGE_PREFIX = "fa-inbox-v1";
const _inbox = { scope: null, items: [], seen: new Set(), lastSeen: 0 };

function browserStorage(storage) {
  return storage || globalThis.localStorage || null;
}

export function inboxScopeFromDashboard(dashboard = {}) {
  return franchiseScopeFromDashboard(dashboard);
}

export function inboxItemKey(item = {}) {
  if (item.id != null && String(item.id).trim()) return `id:${String(item.id).trim()}`;
  return ["event", item.type || "news", item.year ?? "?", item.week ?? "?", item.headline || item.detail || "untitled"]
    .map((part) => String(part).trim())
    .join(":");
}

function storageKey(scope) {
  return `${INBOX_STORAGE_PREFIX}:${scope}`;
}

function persistInbox(storage = null) {
  const target = browserStorage(storage);
  if (!target || !_inbox.scope) return false;
  try {
    target.setItem(storageKey(_inbox.scope), JSON.stringify({
      version: 1,
      scope: _inbox.scope,
      lastSeen: _inbox.lastSeen,
      items: _inbox.items.slice(0, 60)
    }));
    return true;
  } catch {
    return false;
  }
}

export function syncInboxScope(dashboard = state.dashboard || {}, storage = null) {
  const scope = inboxScopeFromDashboard(dashboard);
  if (_inbox.scope === scope) return scope;
  _inbox.scope = scope;
  _inbox.items = [];
  _inbox.seen = new Set();
  _inbox.lastSeen = 0;
  const target = browserStorage(storage);
  if (!target) return scope;
  try {
    const saved = JSON.parse(target.getItem(storageKey(scope)) || "null");
    if (saved?.version === 1 && saved.scope === scope && Array.isArray(saved.items)) {
      _inbox.items = saved.items.slice(0, 60);
      _inbox.seen = new Set(_inbox.items.map(inboxItemKey));
      _inbox.lastSeen = Number(saved.lastSeen || 0);
    }
  } catch {
    // A corrupt browser cache never blocks the simulation; rebuild from source news.
  }
  return scope;
}

export function classifyNewsItem(item) {
  const type = (item.type || "").toLowerCase();
  const headline = (item.headline || "").toLowerCase();
  if (type === "injury" && (headline.includes("out for season") || headline.includes("severe"))) return "CRITICAL";
  if (type === "cap-alert" || type === "cap_alert") return "CRITICAL";
  if (type === "owner-ultimatum") return "CRITICAL";
  if (type === "gm-commitment-resolution") return "IMPORTANT";
  if (type === "trade-offer") return headline.includes("deadline") ? "CRITICAL" : "IMPORTANT";
  if (type === "fa-outbid") return "IMPORTANT";
  if (type === "championship") return "CRITICAL";
  if (type === "playoff-win" || type === "playoff-elimination") return "IMPORTANT";
  if (type === "hof-induction" || type === "jersey-retirement") return "IMPORTANT";
  if (type === "trade" || type === "signing" || type === "milestone") return "IMPORTANT";
  if (type === "injury") return "IMPORTANT";
  if (type === "rehab-clearance") return "IMPORTANT";
  if (type === "standings" || type === "streak" || type === "upset" || type === "blowout") return "IMPORTANT";
  return "FLAVOR";
}

export function ingestNewsIntoInbox(newsItems = [], { dashboard = state.dashboard || {}, storage = null, now = Date.now } = {}) {
  syncInboxScope(dashboard, storage);
  let newCount = 0;
  for (const item of newsItems) {
    const key = inboxItemKey(item);
    if (_inbox.seen.has(key)) continue;
    _inbox.seen.add(key);
    const tier = classifyNewsItem(item);
    _inbox.items.unshift({ ...item, inboxKey: key, tier, receivedAt: Number(now()), resolvedAt: null });
    if (tier === "CRITICAL" || tier === "IMPORTANT") newCount++;
  }
  // Cap at 60 items
  if (_inbox.items.length > 60) _inbox.items = _inbox.items.slice(0, 60);
  persistInbox(storage);
  return newCount;
}

export function getUnreadCount({ dashboard = state.dashboard || {}, storage = null } = {}) {
  syncInboxScope(dashboard, storage);
  return _inbox.items.filter((i) => !i.resolvedAt && i.receivedAt > _inbox.lastSeen && (i.tier === "CRITICAL" || i.tier === "IMPORTANT")).length;
}

export function resolveInboxItem(key, { storage = null, now = Date.now } = {}) {
  const item = _inbox.items.find((entry) => (entry.inboxKey || inboxItemKey(entry)) === key);
  if (!item) return false;
  item.resolvedAt = Number(now());
  persistInbox(storage);
  return true;
}

export function getInboxSnapshot() {
  return { scope: _inbox.scope, lastSeen: _inbox.lastSeen, items: _inbox.items.map((item) => ({ ...item })) };
}

export function resetInboxForTests() {
  _inbox.scope = null;
  _inbox.items = [];
  _inbox.seen = new Set();
  _inbox.lastSeen = 0;
}

export function renderInboxBadge() {
  const badge = document.getElementById("inboxBadge");
  if (!badge) return;
  const count = getUnreadCount();
  badge.textContent = count > 9 ? "9+" : String(count);
  badge.hidden = count === 0;
  badge.className = count > 0 ? "inbox-badge" + (_inbox.items.some((i) => !i.resolvedAt && i.tier === "CRITICAL" && i.receivedAt > _inbox.lastSeen) ? " inbox-badge-critical" : "") : "inbox-badge";
}

export function openInbox() {
  const drawer = document.getElementById("inboxDrawer");
  if (!drawer) return;
  syncInboxScope();
  _inbox.lastSeen = Date.now();
  persistInbox();
  renderInboxBadge();
  renderInboxContent();
  drawer.classList.add("open");
  openModal(drawer, { onClose: closeInbox });
}

export function closeInbox() {
  const drawer = document.getElementById("inboxDrawer");
  if (drawer) {
    closeModal(drawer);
    drawer.classList.remove("open");
  }
}

const INBOX_ACTION_TABS = {
  "cap-alert":  "contractsTab",
  "cap_alert":  "contractsTab",
  injury:       "rosterTab",
  trade:        "contractsTab",
  "trade-offer": "transactionsTab",
  "fa-outbid": "faTab",
  "hof-induction": "historyTab",
  "jersey-retirement": "historyTab",
  "owner-ultimatum": "overviewTab",
};

export function getInboxActionTab(item) {
  return INBOX_ACTION_TABS[item.type?.toLowerCase()] || null;
}

function renderInboxContent() {
  const list = document.getElementById("inboxList");
  if (!list) return;
  if (!_inbox.items.length) {
    list.innerHTML = `<div class="inbox-empty">No messages yet. Simulate weeks to generate league events.</div>`;
    return;
  }
  const tierIcons = { CRITICAL: "🔴", IMPORTANT: "🟡", FLAVOR: "⬜" };
  const tierLabels = { CRITICAL: "Critical", IMPORTANT: "Important", FLAVOR: "Flavor" };
  const typeIcons = {
    injury: "🚑", trade: "🔄", blowout: "💥", upset: "⚡", milestone: "🌟",
    streak: "🔥", standings: "📊", retirement: "👋", signing: "✍️",
    "press-conference": "🎤", championship: "🏆", "cap-alert": "💰", "cap_alert": "💰",
    "rehab-clearance": "✅", "trade-offer": "📞", "fa-outbid": "🏷️",
    "hof-induction": "🏛️", "jersey-retirement": "🎽", "owner-ultimatum": "⚠️",
    "playoff-elimination": "🚪", "playoff-win": "🎯",
  };
  list.innerHTML = _inbox.items.slice(0, 30).map((item) => {
    const typeIcon = typeIcons[item.type?.toLowerCase()] || "📰";
    const actionTab = item.tier === "CRITICAL" ? getInboxActionTab(item) : null;
    return `
      <div class="inbox-item inbox-tier-${escapeHtml(item.tier.toLowerCase())}${item.resolvedAt ? " inbox-resolved" : ""}">
        <div class="inbox-item-header">
          <span class="inbox-tier-dot" title="${escapeHtml(tierLabels[item.tier])}">${escapeHtml(tierIcons[item.tier])}</span>
          <span class="inbox-type-icon">${typeIcon}</span>
          <span class="inbox-headline">${escapeHtml(item.headline || item.type || "League Event")}</span>
          <span class="inbox-week">W${item.week ?? "?"}</span>
        </div>
        ${item.detail ? `<div class="inbox-detail">${escapeHtml(item.detail)}</div>` : ""}
        ${item.quote ? `<div class="inbox-quote">"${escapeHtml(item.quote.slice(0, 100))}"</div>` : ""}
        ${item.resolvedAt ? `<div class="inbox-action-row"><span class="inbox-resolution">Action opened</span></div>` : actionTab ? `<div class="inbox-action-row"><button class="inbox-action-btn" data-inbox-key="${escapeHtml(item.inboxKey || inboxItemKey(item))}" data-inbox-action-tab="${escapeHtml(actionTab)}">Take Action →</button></div>` : ""}
      </div>`;
  }).join("");

  list.querySelectorAll("[data-inbox-action-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.inboxActionTab;
      const key = btn.dataset.inboxKey;
      if (key) resolveInboxItem(key);
      if (tab) document.querySelector(`[data-tab="${tab}"]`)?.click();
      renderInboxContent();
      renderInboxBadge();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FRANCHISE MOMENT CARD
// ─────────────────────────────────────────────────────────────────────────────

let _lastShownMomentGameId = null;

export async function checkAndShowFranchiseMoment() {
  try {
    const data = await api("/api/franchise-moment");
    if (!data?.moment) return;
    const moment = data.moment;
    if (moment.gameId === _lastShownMomentGameId) return;
    if (moment.dramaScore < 2) return; // Only show genuinely dramatic moments
    _lastShownMomentGameId = moment.gameId;
    showFranchiseMomentCard(moment);
  } catch {
    // non-critical
  }
}

export function showFranchiseMomentCard(moment) {
  const modal = document.getElementById("franchiseMomentModal");
  if (!modal) return;
  const isWin = moment.result === "win";
  document.getElementById("fmHeadline").textContent = moment.headline || "Franchise Moment";
  document.getElementById("fmScore").textContent = moment.score || "-";
  document.getElementById("fmWeek").textContent = `Week ${moment.week || "?"} · ${moment.year || ""}`;
  document.getElementById("fmHighlight").textContent = moment.highlight || "";
  const topPlay = document.getElementById("fmTopPlay");
  if (topPlay) {
    topPlay.textContent = moment.topPlay || "";
    topPlay.hidden = !moment.topPlay;
  }
  const shareBtn = document.getElementById("fmShareBtn");
  if (shareBtn) {
    shareBtn.onclick = () => {
      observeBackgroundTask(
        () => {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
          return navigator.clipboard.writeText(moment.shareText || "");
        },
        {
          surface: "action",
          operation: "copy-franchise-moment",
          authorityKey: moment.gameId || "",
          severity: "error",
          onSuccess: () => showToast("Copied to clipboard!"),
          onError: () => showToast("Clipboard unavailable — select the story text to copy it manually.")
        }
      );
    };
  }
  modal.className = `franchise-moment-modal ${isWin ? "fm-win" : "fm-loss"}`;
  modal.hidden = false;
  openModal(modal, { onClose: closeFranchiseMomentModal });
  modal.classList.add("fm-animate-in");
  setTimeout(() => modal.classList.remove("fm-animate-in"), 600);
}

export function closeFranchiseMomentModal() {
  const modal = document.getElementById("franchiseMomentModal");
  if (modal) {
    closeModal(modal);
    modal.hidden = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GM DECISION MODAL
// ─────────────────────────────────────────────────────────────────────────────

let _pendingDecisionResolve = null;
let _activeDecision = null;

export async function checkAndShowGmDecision() {
  const data = await api("/api/gm-decision");
  if (!data?.decisions?.length) return { status: "none", decision: null, choice: null };
  const decision = data.decisions[0];
  return new Promise((resolve) => {
    _pendingDecisionResolve = (choice) => {
      resolve(choice
        ? { status: "chosen", decision, choice }
        : { status: "deferred", decision, choice: null });
    };
    showGmDecisionModal(decision);
  });
}

export function showGmDecisionModal(decision) {
  const modal = document.getElementById("gmDecisionModal");
  if (!modal) return;
  _activeDecision = decision;
  document.getElementById("gmDecisionPrompt").textContent = decision.prompt || "";
  const optionsEl = document.getElementById("gmDecisionOptions");
  if (optionsEl) {
    optionsEl.innerHTML = (decision.options || []).map((opt) => `
      <button class="gm-decision-option" data-choice="${escapeHtml(opt.id)}">
        <div class="gm-decision-opt-label">${escapeHtml(opt.label)}</div>
        <div class="gm-decision-opt-effect">${escapeHtml(opt.effect)}</div>
      </button>`).join("");
    optionsEl.querySelectorAll(".gm-decision-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.choice;
        resolveGmDecision(choice);
      });
    });
  }
  const statusChip = document.getElementById("statusChip");
  if (statusChip) statusChip.textContent = "GM decision required";
  modal.hidden = false;
  openModal(modal, { onClose: dismissGmDecision });
}

export function resolveGmDecision(choice) {
  const modal = document.getElementById("gmDecisionModal");
  if (modal) {
    closeModal(modal);
    modal.hidden = true;
  }
  if (_pendingDecisionResolve) {
    const fn = _pendingDecisionResolve;
    _pendingDecisionResolve = null;
    const active = _activeDecision;
    _activeDecision = null;
    fn(choice && active ? {
      decisionId: active.id,
      choiceId: choice,
      type: active.type,
      year: active.year,
      week: active.week,
      teamId: active.teamId,
      occurrenceKey: active.occurrenceKey
    } : null);
  }
}

export function dismissGmDecision() {
  resolveGmDecision(null);
}

// ─────────────────────────────────────────────────────────────────────────────
// SIM-WATCH OVERLAY (Live box score feed with 300ms animation)
// ─────────────────────────────────────────────────────────────────────────────

// SEASON NARRATIVE ARCS PANEL
// ─────────────────────────────────────────────────────────────────────────────

export async function renderSeasonArcs() {
  const el = document.getElementById("seasonArcsPanel");
  if (!el) return;
  try {
    const data = await api("/api/season-arcs");
    const arcs = data?.arcs || [];
    if (!arcs.length) { el.hidden = true; return; }
    el.hidden = false;
    const statusColors = { "on-track": "var(--success)", "at-risk": "var(--danger)", resolved: "var(--muted)" };
    const statusLabels = { "on-track": "On Track", "at-risk": "At Risk", resolved: "Resolved" };
    document.getElementById("seasonArcsContent").innerHTML = arcs.map((arc) => `
      <div class="season-arc-card">
        <span class="season-arc-icon">${escapeHtml(arc.icon || "📖")}</span>
        <div class="season-arc-body">
          <div class="season-arc-title">${escapeHtml(arc.title)}</div>
          <div class="season-arc-status" style="color:${statusColors[arc.status] || "var(--muted)"}">
            ${escapeHtml(statusLabels[arc.status] || arc.status)}
            ${arc.resolved !== null ? ` · ${arc.resolved ? "✓ Achieved" : "✗ Failed"}` : ""}
          </div>
        </div>
        <div class="season-arc-type">${escapeHtml(arc.type?.replace(/_/g, " ") || "")}</div>
      </div>`).join("");
  } catch {
    // non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CAP WAR ROOM (multi-year cap timeline)
// ─────────────────────────────────────────────────────────────────────────────

const CAP_WAR_ROOM_LIMIT = 255_000_000;

/**
 * Pure multi-year cap projection used by the Cap War Room panel.
 *
 * A contract at yearsRemaining === 0 is a real, legally reachable mid-season
 * state (S67 offseason fix made contract expiry reachable at all) and is
 * arguably *more* urgent than one at yearsRemaining === 1, so both count as
 * "expiring" in the current year — `<= 1` rather than the old `=== 1`
 * boundary that made 0-year contracts invisible to this counter.
 */
export function computeCapProjection(roster, currentYear, { capLimit = CAP_WAR_ROOM_LIMIT, yearSpan = 4 } = {}) {
  const years = Array.from({ length: yearSpan }, (_, i) => currentYear + i);
  return years.map((yr) => {
    let committed = 0;
    let dead = 0;
    let expiring = 0;
    for (const player of roster) {
      const contract = player.contract || {};
      const yearsRemaining = contract.yearsRemaining || 0;
      if (yr <= currentYear + yearsRemaining - 1) {
        committed += contract.salary || 0;
      } else {
        dead += contract.deadCap || 0;
      }
      if (yr === currentYear && yearsRemaining <= 1) expiring++;
    }
    const total = Math.min(committed + dead, capLimit * 1.1);
    const pct = Math.min(100, Math.round((total / capLimit) * 100));
    const zone = pct >= 95 ? "critical" : pct >= 85 ? "warning" : "safe";
    return { year: yr, committed, dead, total, pct, zone, expiring };
  });
}

export async function renderCapWarRoom() {
  const el = document.getElementById("capWarRoomPanel");
  if (!el) return;
  try {
    const teamId = state.contractTeamId || state.dashboard?.controlledTeamId || "BUF";
    const data = await api(`/api/roster?team=${encodeURIComponent(teamId)}`);
    const roster = data?.roster || [];
    const cap = data?.cap || {};
    const currentYear = state.dashboard?.currentYear || new Date().getFullYear();
    const CAP_LIMIT = CAP_WAR_ROOM_LIMIT;
    // Build 4-year projection by summing contracts per year
    const yearData = computeCapProjection(roster, currentYear, { capLimit: CAP_LIMIT, yearSpan: 4 });
    el.hidden = false;
    const bars = yearData.map((d) => `
      <div class="cwr-year">
        <div class="cwr-year-label">${d.year}</div>
        <div class="cwr-bar-track">
          <div class="cwr-bar-fill cwr-zone-${escapeHtml(d.zone)}" style="width:${d.pct}%" title="${fmtMoney(d.total)} / ${fmtMoney(CAP_LIMIT)}"></div>
        </div>
        <div class="cwr-pct cwr-pct-${escapeHtml(d.zone)}">${d.pct}%</div>
        <div class="cwr-detail">
          <span>${fmtMoney(d.committed)} committed</span>
          ${d.dead > 0 ? `<span class="cwr-dead">+${fmtMoney(d.dead)} dead</span>` : ""}
          ${d.expiring > 0 ? `<span class="cwr-expiring">${d.expiring} expiring</span>` : ""}
        </div>
      </div>`).join("");
    document.getElementById("capWarRoomBars").innerHTML = bars;
    const hint = document.getElementById("capWarRoomHint");
    if (hint) {
      const critical = yearData.find((d) => d.zone === "critical");
      const warning = yearData.find((d) => d.zone === "warning");
      if (critical) hint.textContent = `⚠ ${critical.year} is over the danger zone — restructure or release contracts now.`;
      else if (warning) hint.textContent = `Watch ${warning.year} — limited flexibility. Plan restructures early.`;
      else hint.textContent = "Cap trajectory looks healthy across all projected years.";
    }
  } catch {
    // non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADE BREAKDOWN CARD (letter grades + verdict)
// ─────────────────────────────────────────────────────────────────────────────

export function renderTradeBreakdown(evalResult) {
  const el = document.getElementById("tradeBreakdownCard");
  if (!el || !evalResult) return;
  const { fairness, teamAPlayers, teamBPlayers, teamAPicksValue, teamBPicksValue } = evalResult;
  const gradeScore = (score) => {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "A-";
    if (score >= 75) return "B+";
    if (score >= 70) return "B";
    if (score >= 65) return "B-";
    if (score >= 60) return "C+";
    if (score >= 55) return "C";
    if (score >= 50) return "C-";
    return "D";
  };
  const gradeClass = (grade) => {
    if (grade.startsWith("A")) return "grade-a";
    if (grade.startsWith("B")) return "grade-b";
    if (grade.startsWith("C")) return "grade-c";
    return "grade-d";
  };
  const aVal = (teamAPlayers || []).reduce((s, p) => s + (p.tradeValue || p.overall || 70), 0) + (teamAPicksValue || 0);
  const bVal = (teamBPlayers || []).reduce((s, p) => s + (p.tradeValue || p.overall || 70), 0) + (teamBPicksValue || 0);
  const delta = aVal - bVal;
  const verdict = Math.abs(delta) < 5
    ? "Even trade — both sides get fair value"
    : delta > 15 ? "Team B wins this trade decisively"
    : delta < -15 ? "Team A wins this trade decisively"
    : delta > 0 ? "Slight edge to Team B"
    : "Slight edge to Team A";
  const fairGrade = gradeScore(Number(fairness) || 70);
  el.hidden = false;
  el.innerHTML = `
    <div class="tbd-header">Trade Breakdown</div>
    <div class="tbd-row">
      <div class="tbd-side">
        <div class="tbd-side-label">Team A Gets</div>
        ${(teamBPlayers || []).map((p) => `<div class="tbd-player"><span class="tbd-pos">${escapeHtml(p.pos || "")}</span><span>${escapeHtml(p.name || p.playerId || "")}</span><span class="tbd-grade ${gradeClass(gradeScore(p.overall || 70))}">${gradeScore(p.overall || 70)}</span></div>`).join("")}
        ${teamBPicksValue ? `<div class="tbd-picks">+${fmtMoney(teamBPicksValue * 1000)} pick value</div>` : ""}
      </div>
      <div class="tbd-divider">⇄</div>
      <div class="tbd-side">
        <div class="tbd-side-label">Team B Gets</div>
        ${(teamAPlayers || []).map((p) => `<div class="tbd-player"><span class="tbd-pos">${escapeHtml(p.pos || "")}</span><span>${escapeHtml(p.name || p.playerId || "")}</span><span class="tbd-grade ${gradeClass(gradeScore(p.overall || 70))}">${gradeScore(p.overall || 70)}</span></div>`).join("")}
        ${teamAPicksValue ? `<div class="tbd-picks">+${fmtMoney(teamAPicksValue * 1000)} pick value</div>` : ""}
      </div>
    </div>
    <div class="tbd-verdict">
      <span class="tbd-fairness-grade ${gradeClass(fairGrade)}">${fairGrade}</span>
      <span class="tbd-verdict-text">${escapeHtml(verdict)}</span>
    </div>
  `;
}

export function hideTradeBreakdown() {
  const el = document.getElementById("tradeBreakdownCard");
  if (el) el.hidden = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNASTY RECORDS BOARD
// ─────────────────────────────────────────────────────────────────────────────

export async function renderDynastyRecordsBoard() {
  const el = document.getElementById("dynastyRecordsBoard");
  if (!el) return;
  const teamId = state.dashboard?.controlledTeamId || "BUF";
  const data = await api(`/api/records/franchise?team=${encodeURIComponent(teamId)}`);
  const records = data?.records || {};
  const cats = Object.entries(records).slice(0, 12);
  if (!cats.length) { el.innerHTML = `<div class="records-empty">No franchise records yet — simulate seasons to build your legacy.</div>`; return; }
  el.innerHTML = `<div class="records-grid">${cats.map(([cat, record]) => {
    if (!record) return "";
    const label = cat.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    const val = typeof record === "object" ? (record.value ?? record.stat ?? "-") : record;
    const player = typeof record === "object" ? (record.player || record.name || "") : "";
    const year = typeof record === "object" ? (record.year || "") : "";
    return `
      <div class="record-card">
        <div class="record-cat">${escapeHtml(label)}</div>
        <div class="record-val">${typeof val === "number" ? val.toLocaleString() : escapeHtml(String(val))}</div>
        ${player ? `<div class="record-player">${escapeHtml(player)}</div>` : ""}
        ${year ? `<div class="record-year">${escapeHtml(String(year))}</div>` : ""}
      </div>`;
  }).join("")}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI GM ARCHETYPES DISPLAY
// ─────────────────────────────────────────────────────────────────────────────

let _archetypesCache = null;

export async function loadTeamArchetypes() {
  const data = await api("/api/team-archetypes");
  _archetypesCache = {};
  for (const team of (data?.archetypes || [])) {
    _archetypesCache[team.teamId] = team.archetype;
  }
}

export function getTeamArchetype(teamId) {
  return _archetypesCache?.[teamId] || null;
}

export function renderArchetypesTable() {
  const el = document.getElementById("teamArchetypesTable");
  if (!el || !_archetypesCache) return;
  const rows = Object.entries(_archetypesCache).map(([teamId, arch]) => ({
    team: teamCode(teamId),
    archetype: arch.icon + " " + arch.label,
    style: arch.description
  }));
  renderTable("teamArchetypesTable", rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// MENTORSHIP BADGE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

export function buildMentorshipBadge(player, mentorships = []) {
  if (!player?.id) return "";
  const pair = mentorships.find((m) => m.menteeId === player.id || m.menteePlayerId === player.id);
  if (!pair) return "";
  const bonus = pair.statBonus || pair.bonus || 0;
  const mentorName = pair.mentorName || pair.mentor?.name || "Veteran";
  return `
    <div class="mentorship-badge" title="Mentored by ${escapeHtml(mentorName)}">
      <span class="mentorship-badge-icon">🎓</span>
      <span class="mentorship-badge-text">Mentored by <strong>${escapeHtml(mentorName)}</strong></span>
      ${bonus > 0 ? `<span class="mentorship-badge-bonus">+${bonus} AWR</span>` : ""}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCALSTORAGE SIZE GUARD
// ─────────────────────────────────────────────────────────────────────────────

const REWIND_SIZE_LIMIT = 4 * 1024 * 1024; // 4MB

export function checkAndPruneRewindStorage() {
  try {
    const indexRaw = localStorage.getItem("vsfgm-rw-index");
    if (!indexRaw) return;
    const index = JSON.parse(indexRaw);
    if (!Array.isArray(index)) return;
    // Estimate total size of rewind slots
    let totalSize = indexRaw.length;
    for (const slot of index) {
      const raw = localStorage.getItem(`vsfgm:rw-state:${slot.id}`);
      if (raw) totalSize += raw.length;
    }
    if (totalSize <= REWIND_SIZE_LIMIT) return;
    // Prune oldest slots until under limit
    let pruned = 0;
    const sorted = [...index].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    while (totalSize > REWIND_SIZE_LIMIT && sorted.length > 1) {
      const oldest = sorted.shift();
      const raw = localStorage.getItem(`vsfgm:rw-state:${oldest.id}`);
      if (raw) totalSize -= raw.length;
      localStorage.removeItem(`vsfgm:rw-state:${oldest.id}`);
      const newIndex = index.filter((s) => s.id !== oldest.id);
      localStorage.setItem("vsfgm-rw-index", JSON.stringify(newIndex));
      pruned++;
    }
    if (pruned > 0) {
      showToast(`Rewind storage pruned — ${pruned} oldest checkpoint${pruned > 1 ? "s" : ""} removed to free space.`, "warning");
    }
  } catch {
    // non-critical — never block gameplay
  }
}

