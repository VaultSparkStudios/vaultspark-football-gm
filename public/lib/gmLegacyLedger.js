// S133: a general manager's legacy that outlives one save. Each franchise
// this browser has run keeps one row (seasons, record, playoff berths,
// titles, the club), updated whenever GM Profile renders, and the profile
// shows the totals across every franchise. Stored in this browser only and
// never sent anywhere; deleting a save does not delete its row, which is the
// point: a career is longer than any one league.

import { franchiseScopeFromDashboard } from "./franchiseScope.js";

export const GM_LEGACY_LEDGER_KEY = "fa:gm-legacy-ledger:v1";
const MAX_FRANCHISES = 60;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function readGmLegacyLedger(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(GM_LEGACY_LEDGER_KEY) || "null");
    return parsed && typeof parsed === "object" && parsed.franchises && typeof parsed.franchises === "object"
      ? parsed : { schemaVersion: 1, franchises: {} };
  } catch { return { schemaVersion: 1, franchises: {} }; }
}

/**
 * Record this franchise's current career line. Pure apart from storage; a row
 * only ever moves forward (a rewind never erases a title already won).
 */
export function recordFranchiseCareer({ dashboard, career, storage = globalThis.localStorage, now = new Date() } = {}) {
  if (!dashboard || !career) return null;
  const scope = franchiseScopeFromDashboard(dashboard);
  const ledger = readGmLegacyLedger(storage);
  const prior = ledger.franchises[scope] || {};
  const [wins, losses, ties] = String(career.record || "0-0").split("-").map(finite);
  const row = {
    team: String(dashboard.controlledTeam?.name || dashboard.controlledTeamId || prior.team || "Club").slice(0, 60),
    startYear: finite(dashboard.startYear) || prior.startYear || null,
    seasons: Math.max(finite(prior.seasons), finite(career.seasons)),
    wins: Math.max(finite(prior.wins), wins),
    losses: Math.max(finite(prior.losses), losses),
    ties: Math.max(finite(prior.ties), ties),
    playoffs: Math.max(finite(prior.playoffs), finite(career.playoffBerths)),
    titles: Math.max(finite(prior.titles), finite(career.titles)),
    updatedAt: now.toISOString().slice(0, 10)
  };
  ledger.franchises[scope] = row;
  const keys = Object.keys(ledger.franchises);
  if (keys.length > MAX_FRANCHISES) {
    keys.sort((a, b) => String(ledger.franchises[a].updatedAt).localeCompare(String(ledger.franchises[b].updatedAt)));
    for (const key of keys.slice(0, keys.length - MAX_FRANCHISES)) delete ledger.franchises[key];
  }
  try { storage?.setItem(GM_LEGACY_LEDGER_KEY, JSON.stringify(ledger)); } catch { /* the totals still show for this visit */ }
  return ledger;
}

/** Totals across every franchise, and the single best one by titles then wins. */
export function summarizeGmLegacy(ledger) {
  const rows = Object.values(ledger?.franchises || {});
  const sum = (key) => rows.reduce((total, row) => total + finite(row[key]), 0);
  const best = [...rows].sort((a, b) => finite(b.titles) - finite(a.titles) || finite(b.wins) - finite(a.wins))[0] || null;
  return {
    franchises: rows.length,
    seasons: sum("seasons"),
    wins: sum("wins"),
    losses: sum("losses"),
    ties: sum("ties"),
    playoffs: sum("playoffs"),
    titles: sum("titles"),
    best
  };
}

export function gmLegacyMarkup(summary, { escapeHtml, card }) {
  if (!summary || summary.franchises < 2) {
    return `<p class="small">Start another franchise and your career here counts toward one legacy across every league you run.</p>`;
  }
  const record = summary.ties ? `${summary.wins}-${summary.losses}-${summary.ties}` : `${summary.wins}-${summary.losses}`;
  const best = summary.best ? `${escapeHtml(summary.best.team)}${summary.best.startYear ? ` (from ${escapeHtml(summary.best.startYear)})` : ""}: ${escapeHtml(summary.best.titles)} title${summary.best.titles === 1 ? "" : "s"}, ${escapeHtml(summary.best.wins)} wins` : "";
  return `<div class="control-spotlight-grid" data-testid="gm-legacy-all-franchises">
    ${card("Franchises", summary.franchises)}${card("Seasons", summary.seasons)}${card("Record", record)}${card("Playoff berths", summary.playoffs)}${card("Titles", summary.titles)}
  </div>${best ? `<p class="small">Best franchise: ${best}.</p>` : ""}`;
}
