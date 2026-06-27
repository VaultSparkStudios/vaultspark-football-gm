/**
 * Post-Week Digest Banner
 *
 * After a week advances, surfaces a slim banner with: game result, the top
 * CRITICAL news item, and the GM's next best move. Dismissed per (year, week)
 * via sessionStorage so it never re-appears once closed.
 */

import { classifyNewsItem, getInboxActionTab } from "./engagementFeatures.js";
import { buildMobileDecisionDeck } from "./mobileLoop.js";

const DIGEST_KEY = (year, week) => `vsfgm_digest_${year}_w${week}`;

// ── Pure content builder (testable without DOM) ────────────────────────────

export function buildWeekDigestContent(newState, prevState) {
  if (!newState || !prevState) return null;

  const weekChanged =
    newState.currentWeek !== prevState.currentWeek ||
    newState.currentYear !== prevState.currentYear;
  if (!weekChanged) return null;

  const digestKey = DIGEST_KEY(newState.currentYear, newState.currentWeek);
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(digestKey) === "1") return null;

  const controlledTeamId = newState.controlledTeamId;
  const prevWeek = prevState.currentWeek;
  const prevYear = prevState.currentYear;

  // Latest game result (most recent box score, from the week that just resolved)
  const scores = newState.recentBoxScores || [];
  const lastGame =
    scores.find(
      (g) =>
        g.week === prevWeek &&
        g.year === prevYear &&
        (g.homeTeamId === controlledTeamId || g.awayTeamId === controlledTeamId)
    ) || scores[0] || null;

  let gameResult = null;
  if (lastGame && controlledTeamId) {
    const isHome = lastGame.homeTeamId === controlledTeamId;
    const myScore = isHome ? lastGame.homeScore : lastGame.awayScore;
    const oppScore = isHome ? lastGame.awayScore : lastGame.homeScore;
    const oppTeam = isHome ? lastGame.awayTeamId : lastGame.homeTeamId;
    const won = lastGame.winnerId === controlledTeamId;
    const isTie = lastGame.isTie === true;
    gameResult = { won, isTie, myScore, oppScore, oppTeam, week: lastGame.week };
  }

  // Top CRITICAL news item from the week that just resolved
  const newsLog = newState.newsLog || [];
  const criticalItem =
    newsLog.find((item) => classifyNewsItem(item) === "CRITICAL" && item.week === prevWeek && item.year === prevYear) ||
    newsLog.find((item) => classifyNewsItem(item) === "CRITICAL") ||
    null;

  // Next best move card (skip the "advance week" card itself)
  const deck = buildMobileDecisionDeck({ dashboard: newState, newsRows: newsLog });
  const nextMove = deck.find((c) => c.action !== "advance-week") || deck[0] || null;

  return { digestKey, year: newState.currentYear, week: prevWeek, gameResult, criticalItem, nextMove };
}

// ── DOM render ─────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderWeekDigestBanner(newState, prevState, { onActivateTab } = {}) {
  const el = document.getElementById("weekDigestBanner");
  if (!el) return;

  const content = buildWeekDigestContent(newState, prevState);
  if (!content) {
    el.classList.add("hidden");
    return;
  }

  const { digestKey, year, week, gameResult, criticalItem, nextMove } = content;

  // ── Game result pill ──────────────────────────────────────────────────────
  let gameHtml = "";
  if (gameResult) {
    let label, cls;
    if (gameResult.isTie) {
      label = `TIE ${_esc(gameResult.myScore)}–${_esc(gameResult.oppScore)} vs ${_esc(gameResult.oppTeam)}`;
      cls = "digest-pill-tie";
    } else if (gameResult.won) {
      label = `WIN ${_esc(gameResult.myScore)}–${_esc(gameResult.oppScore)} vs ${_esc(gameResult.oppTeam)}`;
      cls = "digest-pill-win";
    } else {
      label = `LOSS ${_esc(gameResult.myScore)}–${_esc(gameResult.oppScore)} vs ${_esc(gameResult.oppTeam)}`;
      cls = "digest-pill-loss";
    }
    gameHtml = `<span class="digest-pill ${cls}">${label}</span>`;
  }

  // ── Critical alert ────────────────────────────────────────────────────────
  let criticalHtml = "";
  if (criticalItem) {
    const actionTab = getInboxActionTab(criticalItem);
    const actionBtn = actionTab
      ? `<button class="digest-fix-btn" data-digest-tab="${_esc(actionTab)}">Fix it</button>`
      : "";
    criticalHtml = `
      <div class="digest-critical">
        <span class="digest-critical-dot"></span>
        <span class="digest-critical-text">${_esc(criticalItem.headline)}</span>
        ${actionBtn}
      </div>`;
  }

  // ── Next best move ────────────────────────────────────────────────────────
  let nextMoveHtml = "";
  if (nextMove && nextMove.targetTab) {
    nextMoveHtml = `
      <div class="digest-next">
        <span class="digest-next-kicker">Next Move</span>
        <button class="digest-move-btn" data-digest-tab="${_esc(nextMove.targetTab)}">${_esc(nextMove.title)}</button>
      </div>`;
  }

  el.innerHTML = `
    <div class="digest-inner">
      <span class="digest-label">Week ${_esc(String(week))} · ${_esc(String(year))}</span>
      <div class="digest-body">
        ${gameHtml}
        ${criticalHtml}
        ${nextMoveHtml}
      </div>
      <button class="digest-close" data-digest-key="${_esc(digestKey)}" aria-label="Dismiss digest">✕</button>
    </div>
  `;

  el.classList.remove("hidden");

  // Wire dismiss
  el.querySelector(".digest-close")?.addEventListener("click", () => {
    sessionStorage.setItem(digestKey, "1");
    el.classList.add("hidden");
  });

  // Wire action tab buttons
  el.querySelectorAll("[data-digest-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.digestTab;
      if (tabId && typeof onActivateTab === "function") {
        onActivateTab(tabId);
      }
      sessionStorage.setItem(digestKey, "1");
      el.classList.add("hidden");
    });
  });
}
