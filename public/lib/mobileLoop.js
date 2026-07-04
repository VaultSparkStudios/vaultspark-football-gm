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
  const pressureStack = buildMobilePressureStack({
    dashboard: d,
    newsRows: state.newsRows || []
  });
  const decisionDeck = buildMobileDecisionDeck({
    dashboard: d,
    newsRows: state.newsRows || [],
    pendingDecision: state.mobilePendingDecision || null
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

      <div class="ml-pressure-stack" aria-label="Franchise pressure stack">
        ${pressureStack.map((item, index) => `
          <button class="ml-pressure-card ${_esc(item.tone)}" data-mobile-pressure-index="${index}" data-target-tab="${_esc(item.targetTab || "")}">
            <span class="ml-pressure-kicker">${_esc(item.kicker)}</span>
            <strong>${_esc(item.title)}</strong>
            <span>${_esc(item.detail)}</span>
          </button>
        `).join("")}
      </div>

      <div class="ml-decision-deck" aria-label="General Manager decision deck">
        ${decisionDeck.map((card, index) => renderDecisionCard(card, index)).join("")}
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

  overlay.querySelectorAll("[data-mobile-decision-choice-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardIndex = Number(btn.dataset.mobileDecisionChoiceIndex || 0);
      const choiceIndex = Number(btn.dataset.mobileDecisionChoiceOption || 0);
      const decision = decisionDeck[cardIndex];
      const choice = decision?.choices?.[choiceIndex];
      if (!decision || !choice) return;
      overlay.dispatchEvent(new CustomEvent("vsfgm:mobile-gm-decision-choice", {
        detail: {
          decisionId: decision.decisionId,
          choiceId: choice.id,
          type: decision.type,
          week: decision.week
        }
      }));
    });
  });

  overlay.querySelectorAll("[data-mobile-pressure-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.mobilePressureIndex || 0);
      const pressure = pressureStack[index];
      if (!pressure) return;
      if (pressure.targetTab) {
        document.querySelector(`[data-tab="${pressure.targetTab}"]`)?.click();
      }
      overlay.dispatchEvent(new CustomEvent("vsfgm:mobile-pressure", { detail: pressure }));
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

export function buildMobilePressureStack({ dashboard = {}, newsRows = [] } = {}) {
  const controlledTeamId = dashboard.controlledTeamId;
  const team = dashboard.controlledTeam || {};
  const expectation = team.owner?.expectation || {};
  const fan = dashboard.fanSentiment || {};
  const capSpace = dashboard.cap?.capSpace ?? null;
  const injuries = (dashboard.injuryReport || []).filter((entry) => entry.teamId === controlledTeamId);
  const week = Number(dashboard.currentWeek || 0);
  const phase = String(dashboard.phase || "").toLowerCase();
  const rosterNeeds = (dashboard.rosterNeeds || []).map((need) => need.pos || need.position || need).filter(Boolean);
  const newsHead = newsRows[0]?.headline || "";
  const cards = [];


  if (expectation.ultimatum?.active) {
    cards.push({
      kicker: "Owner mandate",
      title: expectation.mandate || "Ultimatum active",
      detail: `${expectation.ultimatum.weeksLeft ?? "?"} week${expectation.ultimatum.weeksLeft === 1 ? "" : "s"} left: ${expectation.ultimatum.consequence || "results required"}.`,
      targetTab: "overviewTab",
      tone: "danger"
    });
  } else if (Number.isFinite(expectation.heat) || expectation.mandate) {
    const heat = Number.isFinite(expectation.heat) ? expectation.heat : null;
    cards.push({
      kicker: "Owner pressure",
      title: expectation.mandate || "Build trust",
      detail: heat == null
        ? "Mandate is active; keep the plan aligned before advancing."
        : `Heat ${heat}/100${expectation.trend ? `, ${expectation.trend}` : ""}.`,
      targetTab: "overviewTab",
      tone: heat != null && heat >= 75 ? "danger" : heat != null && heat >= 55 ? "warning" : "neutral"
    });
  }

  if (Number.isFinite(fan.approval)) {
    cards.push({
      kicker: "Fan pulse",
      title: fan.label || "Fan approval",
      detail: `${Math.round(fan.approval)}/100${fan.trend ? `, ${fan.trend}` : ""}${fan.reasons?.[0] ? `: ${fan.reasons[0]}` : ""}.`,
      targetTab: "overviewTab",
      tone: fan.approval < 45 ? "danger" : fan.approval < 65 ? "warning" : "positive"
    });
  }

  if (capSpace != null && capSpace < 0) {
    cards.push({
      kicker: "Cap pressure",
      title: "Over the cap",
      detail: `${_fmtMoney(capSpace)} space. Fix contracts before simulating too far.`,
      targetTab: "contractsTab",
      tone: "danger"
    });
  }

  if (injuries.length) {
    cards.push({
      kicker: "Trainer report",
      title: `${injuries.length} controlled-team ${injuries.length === 1 ? "injury" : "injuries"}`,
      detail: "Check depth before advancing the week.",
      targetTab: "rosterTab",
      tone: injuries.length >= 3 ? "danger" : "warning"
    });
  }

  if (phase === "regular-season" && week >= 9 && week <= 11) {
    const topNeed = rosterNeeds[0] || "roster";
    cards.push({
      kicker: "Deadline window",
      title: "Trade market is live",
      detail: `Week ${week}: price ${topNeed} help or sell before the window shuts.`,
      targetTab: "transactionsTab",
      tone: "warning"
    });
  }

  if (!cards.length && newsHead) {
    cards.push({
      kicker: "League pulse",
      title: "Latest headline",
      detail: newsHead,
      targetTab: "overviewTab",
      tone: "neutral"
    });
  }

  if (!cards.length) {
    cards.push({
      kicker: "Franchise state",
      title: "No urgent pressure",
      detail: "Advance when the roster plan is set.",
      targetTab: null,
      tone: "positive"
    });
  }

  return cards.slice(0, 4);
}

export function buildMobileDecisionDeck({ dashboard = {}, newsRows = [], pendingDecision = null } = {}) {
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

  if (pendingDecision?.id) {
    const optionCount = Array.isArray(pendingDecision.options) ? pendingDecision.options.length : 0;
    cards.push({
      kicker: "GM decision",
      title: pendingDecision.label || pendingDecision.type || "Decision required",
      detail: pendingDecision.prompt || `${optionCount || "Multiple"} option${optionCount === 1 ? "" : "s"} waiting before you advance.`,
      action: "choose-gm-decision",
      decisionId: pendingDecision.id,
      type: pendingDecision.type,
      week: pendingDecision.week,
      choices: (pendingDecision.options || []).slice(0, 4).map((option) => ({
        id: option.id,
        label: option.label || option.id,
        effect: option.effect || ""
      })),
      targetTab: null,
      tone: "danger"
    });
  }
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

function renderDecisionCard(card, index) {
  const common = `
    <span class="ml-decision-kicker">${_esc(card.kicker)}</span>
    <strong>${_esc(card.title)}</strong>
    <span>${_esc(card.detail)}</span>
  `;
  if (card.action === "choose-gm-decision" && card.choices?.length) {
    return `
      <article class="ml-decision-card ${_esc(card.tone)} ml-decision-card-with-options" data-action="${_esc(card.action)}">
        ${common}
        <div class="ml-decision-options" aria-label="GM decision options">
          ${card.choices.map((choice, choiceIndex) => `
            <button class="ml-decision-option-btn" data-mobile-decision-choice-index="${index}" data-mobile-decision-choice-option="${choiceIndex}">
              <span>${_esc(choice.label)}</span>
              ${choice.effect ? `<small>${_esc(choice.effect)}</small>` : ""}
            </button>
          `).join("")}
        </div>
      </article>
    `;
  }
  return `
    <button class="ml-decision-card ${_esc(card.tone)}" data-mobile-decision-index="${index}" data-action="${_esc(card.action)}" data-target-tab="${_esc(card.targetTab || "")}">
      ${common}
    </button>
  `;
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
