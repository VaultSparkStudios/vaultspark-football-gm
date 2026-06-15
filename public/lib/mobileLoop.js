/**
 * Mobile Core Loop — Simplified Single-Column Daily Decision View
 *
 * Activates on narrow viewports (≤ 480px) or via Settings toggle.
 * Shows: team record, next game, cap space, top roster needs, and 2-3 actions.
 * The full game UI remains accessible via "Full View" button.
 *
 * Usage:
 *   import { isMobileModeEnabled, setMobileModeEnabled, renderMobileOverlay } from "./lib/mobileLoop.js";
 */

const MOBILE_PREF_KEY = "vsfgm_mobile_loop";

// ── Mode detection ────────────────────────────────────────────────────────────

export function isMobileModeEnabled() {
  const stored = localStorage.getItem(MOBILE_PREF_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return window.innerWidth <= 480;
}

export function setMobileModeEnabled(enabled) {
  localStorage.setItem(MOBILE_PREF_KEY, enabled ? "1" : "0");
  _applyBodyClass(enabled);
}

function _applyBodyClass(enabled) {
  document.body.classList.toggle("mobile-loop-active", !!enabled);
}

// ── Render the mobile overlay ─────────────────────────────────────────────────

export function renderMobileOverlay(state, onAdvanceWeek) {
  const overlay = document.getElementById("mobileLoopOverlay");
  if (!overlay) return;

  const d = state.dashboard;
  if (!d) {
    overlay.innerHTML = `<div class="ml-loading">Loading franchise…</div>`;
    return;
  }

  const team        = d.controlledTeam || {};
  const standings   = d.latestStandings || [];
  const myRow       = standings.find((r) => r.team === (team.abbrev || team.teamId)) || {};
  const record      = `${myRow.wins || 0}–${myRow.losses || 0}`;
  const capSpace    = d.cap?.capSpace ?? null;
  const phase       = d.phase || "";
  const newsHead    = (state.newsRows || [])[0]?.headline || "";
  const needs       = (d.rosterNeeds || []).slice(0, 4).map((n) => n.pos || n).join(", ");

  // Next game from current week schedule
  const games   = d.currentWeekSchedule?.games || [];
  const nextGame = games.find(
    (g) => g.homeTeamId === d.controlledTeamId || g.awayTeamId === d.controlledTeamId
  );
  const nextGameText = nextGame
    ? `${nextGame.homeTeamId} vs ${nextGame.awayTeamId}`
    : "No game this week";

  // Injury count
  const injuredCount = (d.injuryReport || []).filter((e) => e.teamId === d.controlledTeamId).length;
  const decisionDeck = buildMobileDecisionDeck({
    dashboard: d,
    newsRows: state.newsRows || []
  });

  overlay.innerHTML = `
    <div class="ml-card">
      <div class="ml-header">
        <div class="ml-team">${_esc(team.name || team.abbrev || "Your Franchise")}</div>
        <div class="ml-record">${_esc(record)}</div>
      </div>
      <div class="ml-meta">
        ${_esc(phase.replace(/-/g, " "))} · Year ${d.currentYear} · Week ${d.currentWeek}
      </div>

      ${newsHead ? `<div class="ml-news-ticker">${_esc(newsHead)}</div>` : ""}

      <div class="ml-stats-row">
        <div class="ml-stat">
          <div class="ml-stat-label">Cap Space</div>
          <div class="ml-stat-value">${_fmtMoney(capSpace)}</div>
        </div>
        <div class="ml-stat">
          <div class="ml-stat-label">Next Game</div>
          <div class="ml-stat-value">${_esc(nextGameText)}</div>
        </div>
        ${injuredCount ? `<div class="ml-stat">
          <div class="ml-stat-label">Injured</div>
          <div class="ml-stat-value negative">${injuredCount}</div>
        </div>` : ""}
      </div>

      ${needs ? `<div class="ml-needs"><strong>Roster Needs:</strong> ${_esc(needs)}</div>` : ""}

      <div class="ml-decision-deck" aria-label="General Manager decision deck">
        ${decisionDeck.map((card, index) => `
          <button class="ml-decision-card ${_esc(card.tone)}" data-mobile-decision-index="${index}" data-action="${_esc(card.action)}" data-target-tab="${_esc(card.targetTab || "")}">
            <span class="ml-decision-kicker">${_esc(card.kicker)}</span>
            <strong>${_esc(card.title)}</strong>
            <span>${_esc(card.detail)}</span>
          </button>
        `).join("")}
      </div>

      <div class="ml-actions">
        <button class="ml-btn primary" id="mlAdvanceWeekBtn">⏭ Advance Week</button>
        <button class="ml-btn" id="mlFullViewBtn">Full View</button>
      </div>
    </div>
  `;

  // Bind advance week
  document.getElementById("mlAdvanceWeekBtn")?.addEventListener("click", () => {
    if (typeof onAdvanceWeek === "function") onAdvanceWeek();
  });

  overlay.querySelectorAll("[data-mobile-decision-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.mobileDecisionIndex || 0);
      const decision = decisionDeck[index];
      if (!decision) return;
      if (decision.action === "advance-week" && typeof onAdvanceWeek === "function") {
        onAdvanceWeek();
        return;
      }
      if (decision.targetTab) {
        document.querySelector(`[data-tab="${decision.targetTab}"]`)?.click();
      }
      overlay.dispatchEvent(new CustomEvent("vsfgm:mobile-decision", { detail: decision }));
    });
  });

  // Exit mobile mode to full view
  document.getElementById("mlFullViewBtn")?.addEventListener("click", () => {
    setMobileModeEnabled(false);
    document.getElementById("mobileLoopOverlay")?.classList.add("hidden");
  });
}

// ── Init on load ──────────────────────────────────────────────────────────────

export function initMobileLoop(state, onAdvanceWeek) {
  const overlay = document.getElementById("mobileLoopOverlay");
  if (!overlay) return;
  const active = isMobileModeEnabled();
  _applyBodyClass(active);
  if (active) {
    overlay.classList.remove("hidden");
    renderMobileOverlay(state, onAdvanceWeek);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildMobileDecisionDeck({ dashboard = {}, newsRows = [] } = {}) {
  const controlledTeamId = dashboard.controlledTeamId;
  const phase = String(dashboard.phase || "").toLowerCase();
  const capSpace = dashboard.cap?.capSpace ?? 0;
  const injuries = (dashboard.injuryReport || []).filter((entry) => entry.teamId === controlledTeamId);
  const rosterNeeds = (dashboard.rosterNeeds || []).map((need) => need.pos || need.position || need).filter(Boolean);
  const topNeed = rosterNeeds[0] || "depth";
  const draftActive = phase.includes("draft") || Boolean(dashboard.draft?.available?.length || dashboard.draftState?.available?.length);
  const week = Number(dashboard.currentWeek || 0);
  const newsHead = newsRows[0]?.headline || "";

  const cards = [];
  if (draftActive) {
    cards.push({
      kicker: "Draft room",
      title: "Set your board",
      detail: topNeed === "depth" ? "Review the board before the next pick." : `Protect the ${topNeed} plan before the next pick.`,
      action: "open-tab",
      targetTab: "draftTab",
      tone: "danger"
    });
  }
  if (capSpace < 0) {
    cards.push({
      kicker: "Cap alert",
      title: "Clear cap pressure",
      detail: `${_fmtMoney(capSpace)} space. Open contracts before advancing.`,
      action: "open-tab",
      targetTab: "contractsTab",
      tone: "danger"
    });
  }
  if (injuries.length) {
    cards.push({
      kicker: "Trainer report",
      title: "Patch the depth chart",
      detail: `${injuries.length} controlled-team injury${injuries.length === 1 ? "" : "ies"} need a roster check.`,
      action: "open-tab",
      targetTab: "rosterTab",
      tone: cards.length ? "warning" : "danger"
    });
  }
  if (week >= 8 && week <= 10 && !cards.some((card) => card.targetTab === "transactionsTab")) {
    cards.push({
      kicker: "Deadline window",
      title: "Price the market",
      detail: topNeed === "depth" ? "Check trade options before the deadline closes." : `Shop for ${topNeed} help before the deadline closes.`,
      action: "open-tab",
      targetTab: "transactionsTab",
      tone: "warning"
    });
  }
  if (newsHead && cards.length < 2) {
    cards.push({
      kicker: "League pulse",
      title: "Read the room",
      detail: newsHead,
      action: "open-tab",
      targetTab: "overviewTab",
      tone: "neutral"
    });
  }
  cards.push({
    kicker: "Next snap",
    title: "Advance the week",
    detail: "Sim the next slate when your roster is set.",
    action: "advance-week",
    targetTab: null,
    tone: cards.length ? "neutral" : "primary"
  });

  return cards.slice(0, 3);
}

function _esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _fmtMoney(value) {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${prefix}$${(abs / 1_000).toFixed(0)}K`;
  return `${prefix}$${abs}`;
}
