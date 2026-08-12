/**
 * Mobile Core Loop — Simplified Single-Column Daily Decision View
 *
 * Activates on phone-width viewports (≤ 640px) or via the Settings toggle.
 * Shows: team record, next game, cap space, top roster needs, and 2-3 actions.
 * The full game UI remains accessible via "Full View" button.
 *
 * ── The auto-enable band, and why it is 640 ────────────────────────────────
 *
 * This overlay is `position: fixed; inset: 0; z-index: 1000` — it *replaces* the
 * entire game UI rather than layering on it. That makes the auto-enable width a
 * product decision, not a styling one: every viewport inside the band loses the
 * full desktop shell by default.
 *
 * The gate originally read `innerWidth <= 480`, which left large phones on a
 * desktop layout whose `.side-menu` had already collapsed to a single stacked
 * column at 640px — the worst of both worlds. S63 corrected that, but
 * overcorrected to 980px, which swept in tablets *and* small laptops and took
 * the whole game UI away from them; CI caught it as the overlay intercepting
 * pointer events during responsive capture at 768px.
 *
 * 640px is the honest boundary: it is exactly where `styles.css` collapses the
 * desktop navigation, so it marks the point at which the full shell genuinely
 * stops working rather than an arbitrary device guess. Anything wider keeps the
 * real UI.
 *
 * A dedicated *tablet* layout — as opposed to a phone overlay stretched over
 * tablets — remains deliberately deferred (TASK_BOARD → Next) alongside touch
 * affordances, because it needs its own visual-evidence baseline.
 *
 * The explicit Settings toggle stays authoritative in *both* directions: a
 * player who chose full view on a phone keeps it, and a tablet or desktop player
 * who prefers the deck can opt in and keep it. Auto-detection only decides for
 * players who never expressed a preference.
 *
 * Usage:
 *   import { isMobileModeEnabled, setMobileModeEnabled, renderMobileOverlay } from "./lib/mobileLoop.js";
 */

import { buildFranchiseCommandStack, hasBlockingFranchiseCommand } from "./franchiseCommandCenter.js";
import { renderTrophyRoad } from "./achievements.js";

const MOBILE_PREF_KEY = "vsfgm_mobile_loop";

// ── Mode detection ────────────────────────────────────────────────────────────

/**
 * Widest viewport that auto-enables the decision deck.
 *
 * Matches the `max-width: 640px` breakpoint at which styles.css collapses
 * `.side-menu` to a single column — the point where the desktop shell stops
 * being usable. Kept in sync with scripts/responsive-evidence.mjs by
 * test/tablet-decision-deck.test.js, so the deck can never silently swallow a
 * viewport the evidence capture expects to drive as desktop.
 */
export const MOBILE_AUTO_MAX_WIDTH = 640;

export function isMobileModeEnabled(width = null) {
  const stored = localStorage.getItem(MOBILE_PREF_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  const viewport = Number.isFinite(width) ? width : window.innerWidth;
  return viewport <= MOBILE_AUTO_MAX_WIDTH;
}

export function setMobileModeEnabled(enabled) {
  localStorage.setItem(MOBILE_PREF_KEY, enabled ? "1" : "0");
  _applyBodyClass(enabled);
}

function _applyBodyClass(enabled) {
  document.body.classList.toggle("mobile-loop-active", !!enabled);
  // The deck is a full-screen replacement, so it owns the viewport outright.
  // Dismiss the CANON-041 nav drawer rather than leaving it open underneath —
  // otherwise exiting via "Full View" reveals an already-open drawer the player
  // never asked for.
  if (enabled) document.body.classList.remove("mobile-nav-open");
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
  const needs       = (d.rosterNeeds || [])
    .slice(0, 4)
    .map((need) => need?.pos || need?.position || (typeof need === "string" ? need : null))
    .filter(Boolean)
    .join(", ");

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
    pendingDecision: state.mobilePendingDecision || null,
    pendingChoice: state.mobilePendingDecisionChoice || null
  });

  const blockingCommand = hasBlockingFranchiseCommand(decisionDeck);
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

      <section class="ml-trophy-road" aria-label="Trophy Road"><div id="mobileTrophyRoadContent"></div></section>

      <div class="ml-pressure-stack" aria-label="Franchise pressure stack">
        ${pressureStack.map((item, index) => `
          <button class="ml-pressure-card ${_escAttr(item.tone)}" data-mobile-pressure-index="${index}" data-target-tab="${_escAttr(item.targetTab || "")}" data-target-id="${_escAttr(item.targetId || "")}">
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
        <button class="ml-btn primary" id="mlAdvanceWeekBtn" ${blockingCommand ? "disabled aria-disabled=\"true\"" : ""}>${blockingCommand ? "Resolve Decision First" : state.mobilePendingDecisionChoice ? "Commit Plan & Advance" : "⏭ Advance Week"}</button>
        <button class="ml-btn" id="mlFullViewBtn">Full View</button>
      </div>
    </div>
  `;

  renderTrophyRoad({ dashboard: d, recentBoxScores: state.recentBoxScores || [] });

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
          year: decision.year,
          week: decision.week,
          occurrenceKey: decision.occurrenceKey
        }
      }));
    });
  });

  overlay.querySelectorAll("[data-mobile-pressure-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.mobilePressureIndex || 0);
      const pressure = pressureStack[index];
      if (!pressure) return;
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

/**
 * Apply the current gate verdict to the overlay.
 * Exported so the resize listener and the Settings toggle share one path.
 */
export function syncMobileMode(state, onAdvanceWeek) {
  const overlay = document.getElementById("mobileLoopOverlay");
  if (!overlay) return false;
  const active = isMobileModeEnabled();
  _applyBodyClass(active);
  if (active) {
    overlay.classList.remove("hidden");
    renderMobileOverlay(state, onAdvanceWeek);
  } else {
    overlay.classList.add("hidden");
  }
  return active;
}

export function initMobileLoop(state, onAdvanceWeek) {
  const overlay = document.getElementById("mobileLoopOverlay");
  if (!overlay) return;
  syncMobileMode(state, onAdvanceWeek);

  // Re-evaluate on viewport change. The gate used to run only at boot, so
  // rotating a tablet or resizing a window left the player in whichever mode
  // they happened to load in.
  if (!overlay.dataset.resizeWired && typeof window.addEventListener === "function") {
    overlay.dataset.resizeWired = "1";
    let frame = null;
    window.addEventListener("resize", () => {
      if (frame) return;
      frame = setTimeout(() => {
        frame = null;
        syncMobileMode(state, onAdvanceWeek);
      }, 150);
    });
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
      targetId: "ownerUltimatumBanner",
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
      targetId: "overviewTeamSpotlight",
      tone: heat != null && heat >= 75 ? "danger" : heat != null && heat >= 55 ? "warning" : "neutral"
    });
  }

  if (Number.isFinite(fan.approval)) {
    cards.push({
      kicker: "Fan pulse",
      title: fan.label || "Fan approval",
      detail: `${Math.round(fan.approval)}/100${fan.trend ? `, ${fan.trend}` : ""}${fan.reasons?.[0] ? `: ${fan.reasons[0]}` : ""}.`,
      targetTab: "overviewTab",
      targetId: "fanSentimentCard",
      tone: fan.approval < 45 ? "danger" : fan.approval < 65 ? "warning" : "positive"
    });
  }

  if (capSpace != null && capSpace < 0) {
    cards.push({
      kicker: "Cap pressure",
      title: "Over the cap",
      detail: `${_fmtMoney(capSpace)} space. Fix contracts before simulating too far.`,
      targetTab: "contractsTab",
      targetId: "contractsSpotlight",
      tone: "danger"
    });
  }

  if (injuries.length) {
    cards.push({
      kicker: "Trainer report",
      title: `${injuries.length} controlled-team ${injuries.length === 1 ? "injury" : "injuries"}`,
      detail: "Check depth before advancing the week.",
      targetTab: "rosterTab",
      targetId: "depthTable",
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
      targetId: "tradeDeadlineFrenzy",
      tone: "warning"
    });
  }

  if (!cards.length && newsHead) {
    cards.push({
      kicker: "League pulse",
      title: "Latest headline",
      detail: newsHead,
      targetTab: "overviewTab",
      targetId: "newsTable",
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

export function buildMobileDecisionDeck(input = {}) {
  return buildFranchiseCommandStack(input);
}
function renderDecisionCard(card, index) {
  const common = `
    <span class="ml-decision-kicker">${_esc(card.kicker)}</span>
    <strong>${_esc(card.title)}</strong>
    <span>${_esc(card.detail)}</span>
  `;
  if (card.action === "choose-gm-decision" && card.choices?.length) {
    return `
      <article class="ml-decision-card ${_escAttr(card.tone)} ml-decision-card-with-options" data-action="${_escAttr(card.action)}">
        ${common}
        <div class="ml-decision-options" aria-label="GM decision options">
          ${card.choices.map((choice, choiceIndex) => `
            <button class="ml-decision-option-btn ${card.selectedChoiceId === choice.id ? "selected" : ""}" aria-pressed="${card.selectedChoiceId === choice.id}" data-mobile-decision-choice-index="${index}" data-mobile-decision-choice-option="${choiceIndex}">
              <span>${_esc(choice.label)}</span>
              ${choice.effect ? `<small>${_esc(choice.effect)}</small>` : ""}
              ${renderChoiceBoundary(choice.preview || choice.boundary)}
            </button>
          `).join("")}
        </div>
      </article>
    `;
  }
  return `
    <button class="ml-decision-card ${_escAttr(card.tone)}" data-mobile-decision-index="${index}" data-action="${_escAttr(card.action)}" data-target-tab="${_escAttr(card.targetTab || "")}">
      ${common}
    </button>
  `;
}

function renderChoiceBoundary(preview = null) {
  if (!preview) return "";
  const rows = [
    preview.subject?.name ? `Who: ${preview.subject.name}${preview.subject.position ? ` (${preview.subject.position})` : ""}` : null,
    preview.timing ? `When: ${preview.timing}` : null,
    preview.exactAction ? `Action: ${preview.exactAction}` : null,
    preview.successRule ? `Receipt: ${preview.successRule}` : null
  ].filter(Boolean);
  if (preview.availability === "unavailable") rows.push("Availability: no eligible immediate candidate; fails closed or becomes the declared promise.");
  return rows.length
    ? `<span class="ml-decision-boundary">${rows.map((row) => `<small>${_esc(row)}</small>`).join("")}</span>`
    : "";
}

function _esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _escAttr(s) {
  return _esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function _fmtMoney(value) {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${prefix}$${(abs / 1_000).toFixed(0)}K`;
  return `${prefix}$${abs}`;
}
