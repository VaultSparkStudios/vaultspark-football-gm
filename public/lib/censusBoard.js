// The Gridiron Census board: every franchise's games, seasons, titles and Hall
// of Famers, added up. Reads the public totals the community service publishes
// (GET /community/v1/pulse); sends nothing.

import { LEAGUE_PULSE_LABELS, LEAGUE_PULSE_SCENARIOS } from "./leaguePulseContract.js";
import { pulseEndpoint } from "./leaguePulse.js";

// The order a football fan reads them in; first-steps counters are for the team.
export const CENSUS_HEADLINE_METRICS = Object.freeze([
  "gamesPlayed", "seasonsCompleted", "championships", "hallOfFamers",
  "playersDrafted", "tradesMade", "leagueCreated", "activeMinutes"
]);

const ICONS = Object.freeze({
  gamesPlayed: "🏈", seasonsCompleted: "📅", championships: "🏆", hallOfFamers: "🏛️",
  playersDrafted: "📋", tradesMade: "🔁", leagueCreated: "🏟️", activeMinutes: "⏱️"
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

export function formatCensusNumber(value, metric) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (metric === "activeMinutes") {
    const hours = Math.floor(n / 60);
    return hours >= 1 ? `${hours.toLocaleString("en-US")} h` : `${n} min`;
  }
  return n.toLocaleString("en-US");
}

function labelFor(metric) {
  return metric === "activeMinutes" ? "Hours managed" : LEAGUE_PULSE_LABELS[metric];
}

/** Pure: the board's markup for a totals payload, or an honest empty state. */
export function censusMarkup(totals, { metrics = CENSUS_HEADLINE_METRICS, compact = false } = {}) {
  const allTime = totals?.allTime;
  if (!allTime || typeof allTime !== "object") {
    return `<p class="community-empty">The Census is counting. Totals appear here as franchises play.</p>`;
  }
  const last30 = totals.last30Days || {};
  const tiles = metrics.map((metric) => {
    const recent = Number(last30[metric] || 0);
    return `<article class="census-tile" data-census-metric="${escapeHtml(metric)}">
      <span class="census-icon" aria-hidden="true">${ICONS[metric] || "•"}</span>
      <strong class="census-value">${escapeHtml(formatCensusNumber(allTime[metric], metric))}</strong>
      <span class="census-label">${escapeHtml(labelFor(metric))}</span>
      ${compact ? "" : `<span class="census-recent">${escapeHtml(formatCensusNumber(recent, metric))} in the last 30 days</span>`}
    </article>`;
  });
  return `<div class="census-grid${compact ? " census-grid-compact" : ""}">${tiles.join("")}</div>`;
}

// A title rate on a handful of franchises is noise, so it waits for a sample.
export const SCENARIO_RATE_MIN_STARTS = 20;

/** Pure: the scenario board, one row per scenario archetype (however the franchise was started), all-time totals. */
export function scenarioBoardMarkup(totals) {
  const allTime = totals?.allTime;
  if (!allTime || typeof allTime !== "object") {
    return `<p class="community-empty">The scenario board fills in as franchises take these jobs.</p>`;
  }
  const rows = LEAGUE_PULSE_SCENARIOS.map((scenario) => {
    const starts = Math.max(0, Math.floor(Number(allTime[`scenario${scenario.key}Starts`]) || 0));
    const titles = Math.max(0, Math.floor(Number(allTime[`scenario${scenario.key}Titles`]) || 0));
    const rate = starts >= SCENARIO_RATE_MIN_STARTS
      ? `${(titles / starts).toFixed(2)} titles per job`
      : `rate shown from ${SCENARIO_RATE_MIN_STARTS} jobs`;
    return `<tr data-scenario-row="${escapeHtml(scenario.archetype)}"><th scope="row">${escapeHtml(scenario.label)}</th><td>${escapeHtml(formatCensusNumber(starts))}</td><td>${escapeHtml(formatCensusNumber(titles))}</td><td>${escapeHtml(rate)}</td></tr>`;
  });
  return `<div class="table-wrap"><table class="census-scenario-table"><thead><tr><th scope="col">Scenario</th><th scope="col">Jobs taken</th><th scope="col">Titles</th><th scope="col">Title rate</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export async function fetchCensusTotals({ fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  if (typeof fetchImpl !== "function") return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(pulseEndpoint(), { headers: { Accept: "application/json" }, credentials: "omit", signal: controller?.signal });
    if (!response?.ok) return null;
    const body = await response.json();
    return body && typeof body === "object" ? body : null;
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); }
}

/** Fill every [data-census-grid] on the page. */
export async function mountCensusBoards(doc = globalThis.document) {
  const hosts = [...(doc?.querySelectorAll?.("[data-census-grid]") || [])];
  const boards = [...(doc?.querySelectorAll?.("[data-scenario-board]") || [])];
  if (!hosts.length && !boards.length) return 0;
  const totals = await fetchCensusTotals();
  for (const board of boards) {
    board.innerHTML = scenarioBoardMarkup(totals);
    board.setAttribute("aria-busy", "false");
  }
  for (const host of hosts) {
    const compact = host.dataset.censusCompact === "1";
    const metrics = compact ? CENSUS_HEADLINE_METRICS.slice(0, 4) : CENSUS_HEADLINE_METRICS;
    host.innerHTML = censusMarkup(totals, { metrics, compact });
    host.setAttribute("aria-busy", "false");
  }
  return hosts.length;
}
