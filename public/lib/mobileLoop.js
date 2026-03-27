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
