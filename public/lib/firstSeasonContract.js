/**
 * firstSeasonContract.js — five things a first-year GM gets judged on (S109).
 *
 * The tutorial is three modal steps and then the full shell. This strip sits on
 * the Desk for the first season only: five objectives derived from the owner's
 * mandate and the club's state, marked from the player's own actions and from
 * dashboard truth, never from a timer. Completing all five fires one
 * achievement event; the season-close result remains on the Desk. Nothing
 * here grants an in-game edge or draws from the seeded stream. State is
 * franchise-scoped in localStorage, so a new league gets a fresh contract.
 */

import { franchiseStorageKey } from "./franchiseScope.js";
import { findTeamStanding, normalizeTeamRecord } from "./teamRecord.js";

export const FIRST_SEASON_CONTRACT_PREFIX = "first-season-contract:v1";
export const COLLAPSE_AFTER_WEEK = 6;

const LATE_PHASES = new Set(["postseason", "season-awards", "offseason"]);

export const OBJECTIVES = Object.freeze([
  Object.freeze({
    id: "sign-starter",
    title: "Sign a free agent",
    detail: "Put one name on a contract the market was not going to hand you.",
    source: "action"
  }),
  Object.freeze({
    id: "depth-chart",
    title: "Set a depth chart yourself",
    detail: "Save one position's order and snap shares instead of letting the coordinators guess.",
    source: "action"
  }),
  Object.freeze({
    id: "answer-the-phone",
    title: "Work the trade desk",
    detail: "Answer a rival's offer, or evaluate a real package you built. You never have to accept a bad trade.",
    source: "action"
  }),
  Object.freeze({
    id: "owner-floor",
    title: "Reach the owner's win target",
    detail: "Finish the regular season at or above the number the mandate names.",
    source: "dashboard"
  }),
  Object.freeze({
    id: "cap-compliant",
    title: "Carry a legal cap into the offseason",
    detail: "Be under the cap when the season closes; the release path is not a plan.",
    source: "dashboard"
  })
]);

export function contractStorageKey(dashboard = {}) {
  return franchiseStorageKey(FIRST_SEASON_CONTRACT_PREFIX, dashboard);
}

export function readContractState(dashboard = {}, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(contractStorageKey(dashboard));
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      marks: { ...(parsed?.marks || {}) },
      dismissed: Boolean(parsed?.dismissed),
      completedAt: parsed?.completedAt || null,
      startYear: parsed?.startYear ?? null,
      finalized: parsed?.finalized || null
    };
  } catch {
    return { marks: {}, dismissed: false, completedAt: null, startYear: null, finalized: null };
  }
}

export function writeContractState(dashboard = {}, next = {}, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(contractStorageKey(dashboard), JSON.stringify(next));
  } catch {
    // Storage can be full or blocked; the strip re-derives on the next render.
  }
  return next;
}

function controlledRecord(dashboard = {}) {
  const team = dashboard.controlledTeam || { id: dashboard.controlledTeamId };
  const row = findTeamStanding(dashboard.latestStandings, team);
  return row ? normalizeTeamRecord(row) : null;
}

function ownerTargetWins(dashboard = {}) {
  const target = Number(dashboard.controlledTeam?.owner?.expectation?.targetWins);
  return Number.isFinite(target) && target > 0 ? target : null;
}

function seasonIsClosed(dashboard = {}) {
  return LATE_PHASES.has(String(dashboard.phase || "")) || Number(dashboard.seasonsSimulated || 0) >= 1;
}

/**
 * Objective status from the two sources of truth: the player's marked actions
 * and the dashboard. Dashboard-derived objectives can only pass; they never
 * fail early, because a first season is judged at its end.
 */
export function evaluateObjectives(dashboard = {}, contractState = { marks: {} }) {
  const marks = contractState?.marks || {};
  const target = ownerTargetWins(dashboard);
  const record = controlledRecord(dashboard);
  const closed = seasonIsClosed(dashboard);
  const capSpace = dashboard.cap?.capSpace == null ? NaN : Number(dashboard.cap.capSpace);
  return OBJECTIVES.map((objective) => {
    let done = false;
    let progress = "";
    if (objective.source === "action") {
      done = Boolean(marks[objective.id]);
    } else if (objective.id === "owner-floor") {
      if (target && record) {
        done = closed && record.wins >= target;
        progress = `${record.wins} of ${target} wins`;
      } else if (target) {
        progress = `${target} wins asked`;
      } else {
        progress = "no target named";
      }
    } else if (objective.id === "cap-compliant") {
      done = closed && Number.isFinite(capSpace) && capSpace >= 0;
      if (Number.isFinite(capSpace)) progress = capSpace >= 0 ? "under the cap" : "over the cap";
    }
    return { ...objective, done, progress };
  });
}

export function contractSummary(dashboard = {}, contractState = { marks: {} }) {
  const rows = evaluateObjectives(dashboard, contractState);
  const done = rows.filter((row) => row.done).length;
  return { rows, done, total: rows.length, complete: done === rows.length };
}

export function isDeliberateTradeEvaluation(payload = {}) {
  const controlled = String(payload.controlledTeamId || "").toUpperCase();
  const a = String(payload.teamA || "").toUpperCase();
  const b = String(payload.teamB || "").toUpperCase();
  return Boolean(controlled && a && b && a !== b && (a === controlled || b === controlled) &&
    ["teamAPlayerIds", "teamBPlayerIds", "teamAPickIds", "teamBPickIds"]
      .some((key) => Array.isArray(payload[key]) && payload[key].length > 0));
}

/** Freeze the first-season evidence at the season-awards boundary, before the
 * offseason can replace the standings or cap reading. Reopening is idempotent.
 */
export function finalizeFirstSeasonContract(dashboard = {}, storage = globalThis.localStorage) {
  const current = readContractState(dashboard, storage);
  if (current.finalized) return current.finalized;
  const year = Number(dashboard.seasonAwardsStage?.year ?? dashboard.currentYear);
  if (!Number.isFinite(year) || (current.startYear != null && Number(current.startYear) !== year) ||
      (current.startYear == null && Number(dashboard.seasonsSimulated || 0) > 0)) return null;
  const hasRecord = Boolean(controlledRecord(dashboard));
  const hasTarget = ownerTargetWins(dashboard) != null;
  const hasCap = dashboard.cap?.capSpace != null && Number.isFinite(Number(dashboard.cap.capSpace));
  const rows = evaluateObjectives(dashboard, current).map(({ id, title, detail, done, progress }) => ({
    id, title, detail, done, progress,
    status: done ? "met" :
      (id === "owner-floor" && (!hasRecord || !hasTarget)) || (id === "cap-compliant" && !hasCap)
        ? "unverified" : "not-met"
  }));
  const done = rows.filter((row) => row.done).length;
  const unverified = rows.filter((row) => row.status === "unverified").length;
  const finalized = {
    year,
    done,
    total: rows.length,
    rows,
    verdict: done === rows.length ? "All five first-season objectives met." :
      `${done} of ${rows.length} first-season objectives met.${unverified ? ` ${unverified} could not be verified.` : ""}`,
    evidenceBoundary: "Based on marked GM actions and the season-close dashboard; this does not alter the owner's separate verdict."
  };
  writeContractState(dashboard, { ...current, startYear: current.startYear ?? year, finalized }, storage);
  return finalized;
}

/**
 * The strip shows during the first season of a franchise, collapses after
 * week 6 so it stops competing with the Week Room. The active strip can be
 * dismissed; its recorded season-close result remains available afterward.
 */
export function contractVisibility(dashboard = {}, contractState = {}) {
  const firstSeason = Number(dashboard.seasonsSimulated || 0) === 0
    || (contractState.startYear != null && Number(dashboard.currentYear) === Number(contractState.startYear));
  if (!dashboard?.controlledTeamId) return "hidden";
  if (contractState.finalized) return "closed";
  if (contractState.dismissed) return "hidden";
  if (!firstSeason && !contractState.completedAt) return "hidden";
  if (contractState.completedAt) return "hidden";
  return Number(dashboard.currentWeek || 0) > COLLAPSE_AFTER_WEEK ? "compact" : "open";
}

export function markObjective(dashboard = {}, id, storage = globalThis.localStorage) {
  if (!OBJECTIVES.some((objective) => objective.id === id)) return readContractState(dashboard, storage);
  const current = readContractState(dashboard, storage);
  if (current.marks[id]) return current;
  const next = {
    ...current,
    startYear: current.startYear ?? dashboard.currentYear ?? null,
    marks: { ...current.marks, [id]: true }
  };
  return writeContractState(dashboard, next, storage);
}

export function dismissContract(dashboard = {}, storage = globalThis.localStorage) {
  return writeContractState(dashboard, { ...readContractState(dashboard, storage), dismissed: true }, storage);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderContractRows(summary) {
  return summary.rows.map((row) => {
    const progress = row.progress ? `<small>${escapeHtml(row.progress)}</small>` : "";
    return `<li class="first-season-objective" data-objective="${escapeHtml(row.id)}" data-done="${row.done ? "true" : "false"}">` +
      `<span class="first-season-mark" aria-hidden="true">${row.done ? "✓" : row.status === "unverified" ? "?" : "○"}</span>` +
      `<div><strong>${escapeHtml(row.title)}</strong><p class="small">${escapeHtml(row.detail)}</p>${progress}</div>` +
      `<span class="visually-hidden">${row.status || (row.done ? "done" : "open")}</span></li>`;
  }).join("");
}

export function renderContractCloseout(closeout) {
  if (!closeout) return "";
  return `<section class="sr-first-season-contract" aria-label="First Season Contract result">` +
    `<strong>First Season Contract · ${escapeHtml(String(closeout.year))}</strong>` +
    `<p>${escapeHtml(closeout.verdict)}</p>` +
    `<ul>${closeout.rows.map((row) => `<li>${row.done ? "✓" : row.status === "unverified" ? "?" : "○"} ${escapeHtml(row.title)} · ${escapeHtml(row.status || (row.done ? "met" : "not-met"))}${row.progress ? ` · ${escapeHtml(row.progress)}` : ""}</li>`).join("")}</ul>` +
    `<small>${escapeHtml(closeout.evidenceBoundary)}</small></section>`;
}

/**
 * Render into the Desk strip. Returns what happened so the caller can fire
 * the achievement exactly once, on the render that completes the contract.
 */
export function renderFirstSeasonContract({ dashboard, storage = globalThis.localStorage, documentRef = globalThis.document } = {}) {
  const panel = documentRef?.getElementById?.("firstSeasonContract");
  if (!panel || !dashboard) return { visibility: "hidden", completedNow: false };
  let contractState = readContractState(dashboard, storage);
  if (contractState.startYear == null && dashboard.currentYear != null && Number(dashboard.seasonsSimulated || 0) === 0) {
    contractState = writeContractState(dashboard, { ...contractState, startYear: dashboard.currentYear }, storage);
  }
  const summary = contractState.finalized
    ? { rows: contractState.finalized.rows, done: contractState.finalized.done, total: contractState.finalized.total, complete: contractState.finalized.done === contractState.finalized.total }
    : contractSummary(dashboard, contractState);
  let completedNow = false;
  if (summary.complete && !contractState.completedAt && !contractState.finalized) {
    contractState = writeContractState(dashboard, { ...contractState, completedAt: new Date().toISOString() }, storage);
    completedNow = true;
  }
  const visibility = completedNow ? "complete" : contractVisibility(dashboard, contractState);
  panel.hidden = visibility === "hidden";
  panel.dataset.visibility = visibility;
  const list = documentRef.getElementById("firstSeasonContractList");
  const progress = documentRef.getElementById("firstSeasonContractProgress");
  if (list) list.innerHTML = renderContractRows(summary);
  if (progress) progress.textContent = contractState.finalized
    ? `Season ${contractState.finalized.year}: ${summary.done} of ${summary.total} met`
    : completedNow ? "Contract honoured" : `${summary.done} of ${summary.total}`;
  return { visibility, completedNow, summary };
}
