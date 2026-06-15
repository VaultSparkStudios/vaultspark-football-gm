/**
 * weekDigest.js — Post-week summary banner
 *
 * After advancing a week, shows a dismissible card with:
 *   - Controlled team game result
 *   - Top narrative (if any)
 *   - First CRITICAL news item with a tab deeplink
 *   - "Next Best Move" from the decision deck
 *
 * Pure data function (buildWeekDigestData) is testable without DOM.
 * DOM rendering (renderWeekDigestBanner) expects #weekDigestBanner in the page.
 */

const DIGEST_KEY_PREFIX = "vsfgm-wdigest-seen";

export function getDigestKey(year, week) {
  return `${DIGEST_KEY_PREFIX}-${year}-${week}`;
}

// ── Classification ────────────────────────────────────────────────────────────

function _isCritical(item) {
  const type = (item.type || "").toLowerCase();
  const headline = (item.headline || "").toLowerCase();
  if (type === "injury" && (headline.includes("out for season") || headline.includes("severe"))) return true;
  if (type === "cap-alert" || type === "cap_alert") return true;
  return false;
}

const _ACTION_TAB = {
  "cap-alert":  "contractsTab",
  "cap_alert":  "contractsTab",
  "injury":     "rosterTab",
  "trade":      "contractsTab",
};

// ── Pure data builder ─────────────────────────────────────────────────────────

/**
 * Build the data for a week digest card.
 *
 * @param {object} newState  - dashboard state returned after advancing
 * @param {number} completedWeek - the week number that just finished
 * @returns {object|null} digest data, or null if there is nothing to show
 */
export function buildWeekDigestData(newState, completedWeek) {
  if (!newState || !completedWeek) return null;
  if (newState.phase !== "regular-season") return null;

  const myTeamId = newState.controlledTeamId;
  const year = newState.currentYear;

  // Find my team's game in the archived box scores
  const game = (newState.recentBoxScores || []).find(
    (g) => g.year === year && g.week === completedWeek &&
      (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
  ) || null;

  // First CRITICAL news item for the controlled team this week
  const criticalNews = (newState.newsLog || []).find(
    (item) => _isCritical(item) && item.teamId === myTeamId
  ) || null;

  // Top narrative event (most recent from this week, prefer controlled-team events)
  const allNarratives = newState.narrativeLog || [];
  const weekNarratives = allNarratives.filter(
    (n) => n.year === year && n.week === completedWeek
  );
  const topNarrative =
    weekNarratives.find((n) => (n.teamIds || []).includes(myTeamId)) ||
    weekNarratives[0] ||
    null;

  // Decision deck next move: derive inline from new state (no DOM deps needed)
  const nextMove = _buildNextMove(newState);

  // Nothing useful to show
  if (!game && !criticalNews && !topNarrative && !nextMove) return null;

  return {
    completedWeek,
    year,
    myTeamId,
    game,
    criticalNews,
    topNarrative,
    nextMove,
    digestKey: getDigestKey(year, completedWeek),
  };
}

function _buildNextMove(dashboard) {
  const phase = String(dashboard.phase || "").toLowerCase();
  const capSpace = dashboard.cap?.capSpace ?? 0;
  const myTeamId = dashboard.controlledTeamId;
  const injuries = (dashboard.injuryReport || []).filter((e) => e.teamId === myTeamId);
  const week = Number(dashboard.currentWeek || 0);
  const needs = (dashboard.rosterNeeds || []).map((n) => n.pos || n.position || n).filter(Boolean);
  const topNeed = needs[0] || "depth";

  if (capSpace < 0) {
    return { title: "Clear cap pressure", detail: `${_fmtMoney(capSpace)} space`, targetTab: "contractsTab" };
  }
  if (injuries.length) {
    return { title: "Check the injury report", detail: `${injuries.length} player${injuries.length === 1 ? "" : "s"} hurt`, targetTab: "rosterTab" };
  }
  if (week >= 8 && week <= 10) {
    return { title: "Scout the trade market", detail: `Deadline window — shop ${topNeed} help`, targetTab: "contractsTab" };
  }
  return null;
}

// ── DOM rendering ─────────────────────────────────────────────────────────────

export function renderWeekDigestBanner(containerId, data, { onTabActivate } = {}) {
  const container = document.getElementById(containerId);
  if (!container || !data) return;

  const { game, criticalNews, topNarrative, nextMove, completedWeek, myTeamId, digestKey } = data;

  // Game result block
  let gameHtml = "";
  if (game) {
    const isHome = game.homeTeamId === myTeamId;
    const myScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    const oppId = isHome ? game.awayTeamId : game.homeTeamId;
    const won = myScore > oppScore;
    const tied = game.isTie === true;
    const label = tied ? "TIE" : won ? "WIN" : "LOSS";
    const cls = tied ? "neutral" : won ? "positive" : "negative";
    gameHtml = `
      <div class="wd-game">
        <span class="wd-result tone-${_esc(cls)}">${label}</span>
        <span class="wd-score">${myScore}–${oppScore}</span>
        <span class="wd-opp">vs ${_esc(oppId)}</span>
      </div>`;
  }

  // CRITICAL alert block
  let critHtml = "";
  if (criticalNews) {
    const tab = _ACTION_TAB[(criticalNews.type || "").toLowerCase()];
    critHtml = `
      <div class="wd-critical" role="alert">
        <span class="wd-critical-dot"></span>
        <span class="wd-critical-text">${_esc(criticalNews.headline || "Critical alert")}</span>
        ${tab ? `<button class="wd-chip" data-tab="${_esc(tab)}">Take Action</button>` : ""}
      </div>`;
  }

  // Top narrative block
  let narrativeHtml = "";
  if (topNarrative && !criticalNews) {
    narrativeHtml = `<div class="wd-narrative">${_esc(topNarrative.text || topNarrative.note || "")}</div>`;
  }

  // Next move block
  let moveHtml = "";
  if (nextMove) {
    moveHtml = `
      <div class="wd-next-move">
        <span class="wd-move-label">Next move</span>
        <span class="wd-move-title">${_esc(nextMove.title)}</span>
        <span class="wd-move-detail">${_esc(nextMove.detail)}</span>
        ${nextMove.targetTab ? `<button class="wd-chip" data-tab="${_esc(nextMove.targetTab)}">Go</button>` : ""}
      </div>`;
  }

  container.innerHTML = `
    <div class="wd-bar">
      <span class="wd-week-label">Week ${completedWeek} Recap</span>
      ${gameHtml}
      ${critHtml}
      ${narrativeHtml}
      ${moveHtml}
      <button class="wd-dismiss" aria-label="Dismiss week recap">×</button>
    </div>
  `;
  container.hidden = false;

  const dismiss = () => {
    try { sessionStorage.setItem(digestKey, "1"); } catch { /* quota */ }
    container.hidden = true;
  };

  container.querySelector(".wd-dismiss")?.addEventListener("click", dismiss);
  container.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      if (tabId && typeof onTabActivate === "function") onTabActivate(tabId);
      dismiss();
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _fmtMoney(v) {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${abs}`;
}
