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

const contractStores = new WeakMap();
const unavailableStorage = {};
const tabStorage = {
  getItem(key) { return globalThis.localStorage.getItem(key); },
  setItem(key, value) { globalThis.localStorage.setItem(key, value); }
};
function contractMemory(dashboard, storage) {
  const context = storage && typeof storage === "object" ? storage : unavailableStorage;
  if (!contractStores.has(context)) contractStores.set(context, new Map());
  const records = contractStores.get(context), key = contractStorageKey(dashboard);
  if (!records.has(key)) records.set(key, { value: null, pending: false });
  return records.get(key);
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validYear(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 9999;
}

function completionDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value.slice(0, 10) ? value : null;
}

const CLOSEOUT_EVIDENCE_BOUNDARY = "Based on marked GM actions and the season-close dashboard; this does not alter the owner's separate verdict.";

function closeoutVerdict(rows) {
  const done = rows.filter((row) => row.done).length;
  const unverified = rows.filter((row) => row.status === "unverified").length;
  return done === rows.length ? "All five first-season objectives met." :
    `${done} of ${rows.length} first-season objectives met.${unverified ? ` ${unverified} could not be verified.` : ""}`;
}

// Saved summaries are optional evidence, not an authority to invent completed
// objectives. Accept complete, internally consistent current/legacy receipts;
// discard a damaged receipt while retaining separately valid action marks.
function validatedCloseout(value) {
  if (!isRecord(value) || !validYear(value.year) || !Array.isArray(value.rows) ||
      value.rows.length !== OBJECTIVES.length || value.total !== OBJECTIVES.length) return null;
  const ids = new Set();
  const rows = [];
  for (const row of value.rows) {
    if (!isRecord(row) || ids.has(row.id) || typeof row.done !== "boolean") return null;
    const objective = OBJECTIVES.find((entry) => entry.id === row.id);
    if (!objective || (row.progress != null && typeof row.progress !== "string")) return null;
    // Before status was recorded, a boolean done was the complete row result.
    const status = row.status ?? (row.done ? "met" : "not-met");
    if (!(row.done ? status === "met" : status === "not-met" || status === "unverified")) return null;
    ids.add(row.id);
    rows.push({ id: objective.id, title: objective.title, detail: objective.detail,
      done: row.done, progress: row.progress || "", status });
  }
  const done = rows.filter((row) => row.done).length;
  if (value.done !== done) return null;
  return { year: value.year, done, total: rows.length, rows,
    verdict: closeoutVerdict(rows), evidenceBoundary: CLOSEOUT_EVIDENCE_BOUNDARY };
}

function contractValue(parsed) {
  const value = isRecord(parsed) ? parsed : {};
  const marks = {};
  for (const objective of OBJECTIVES) {
    if (objective.source === "action" && isRecord(value.marks) &&
        Object.hasOwn(value.marks, objective.id) && value.marks[objective.id] === true) marks[objective.id] = true;
  }
  const startYear = validYear(value.startYear) ? value.startYear : null;
  let finalized = validatedCloseout(value.finalized);
  if (finalized && startYear !== null && finalized.year !== startYear) finalized = null;
  const hasActionEvidence = OBJECTIVES.filter((row) => row.source === "action").every((row) => marks[row.id] === true);
  return {
    marks,
    dismissed: value.dismissed === true,
    // Legacy completed contracts predate finalized receipts. Their three action
    // marks remain necessary; a stray timestamp alone cannot hide the contract.
    completedAt: hasActionEvidence || finalized?.done === OBJECTIVES.length ? completionDate(value.completedAt) : null,
    startYear,
    finalized
  };
}

export function readContractState(dashboard = {}, storage = tabStorage) {
  const memory = contractMemory(dashboard, storage);
  if (memory.pending) return contractValue(memory.value);
  try {
    if (typeof storage?.getItem === "function") memory.value = contractValue(JSON.parse(storage.getItem(contractStorageKey(dashboard)) || "null"));
  } catch { /* Keep the last state observed in this tab. */ }
  return contractValue(memory.value);
}

export function writeContractState(dashboard = {}, next = {}, storage = tabStorage) {
  const memory = contractMemory(dashboard, storage);
  memory.value = contractValue(next);
  memory.pending = true;
  try {
    if (typeof storage?.setItem === "function") {
      storage.setItem(contractStorageKey(dashboard), JSON.stringify(memory.value));
      memory.pending = false;
    }
  } catch { /* Progress remains in this tab, not a durable save. */ }
  return contractValue(memory.value);
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

export function hasFirstSeasonSigningEvidence(dashboard = {}, contractState = {}) {
  if (contractState.finalized) return false;
  const firstYear = contractState.startYear ?? dashboard.startYear;
  const evidence = dashboard.firstSeasonEvidence;
  return firstYear != null && Number(dashboard.currentYear) === Number(firstYear) &&
    Number(evidence?.year) === Number(firstYear) &&
    Array.isArray(evidence?.playerFreeAgentSignings) && evidence.playerFreeAgentSignings.some((row) =>
      row.origin === "player" && row.offerId && row.transactionId &&
      row.teamId === dashboard.controlledTeamId && Number(row.year) === Number(firstYear));
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
      done = marks[objective.id] === true ||
        (objective.id === "sign-starter" && hasFirstSeasonSigningEvidence(dashboard, contractState));
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
export function finalizeFirstSeasonContract(dashboard = {}, storage = tabStorage) {
  const current = readContractState(dashboard, storage);
  if (current.finalized) return current.finalized;
  const year = Number(dashboard.seasonAwardsStage?.year ?? dashboard.currentYear);
  if (!validYear(year) || (current.startYear != null && Number(current.startYear) !== year) ||
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
  const finalized = {
    year,
    done,
    total: rows.length,
    rows,
    verdict: closeoutVerdict(rows),
    evidenceBoundary: CLOSEOUT_EVIDENCE_BOUNDARY
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

export function markObjective(dashboard = {}, id, storage = tabStorage) {
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

export function dismissContract(dashboard = {}, storage = tabStorage) {
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
  closeout = validatedCloseout(closeout);
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
export function renderFirstSeasonContract({ dashboard, storage = tabStorage, documentRef = globalThis.document } = {}) {
  const panel = documentRef?.getElementById?.("firstSeasonContract");
  if (!panel || !dashboard) return { visibility: "hidden", completedNow: false };
  let contractState = readContractState(dashboard, storage);
  if (contractState.startYear == null && dashboard.currentYear != null && Number(dashboard.seasonsSimulated || 0) === 0) {
    contractState = writeContractState(dashboard, { ...contractState, startYear: dashboard.currentYear }, storage);
  }
  if (!contractState.marks["sign-starter"] && hasFirstSeasonSigningEvidence(dashboard, contractState)) {
    contractState = writeContractState(dashboard, { ...contractState,
      marks: { ...contractState.marks, "sign-starter": true } }, storage);
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
  if (progress && contractMemory(dashboard, storage).pending) progress.textContent += " · this tab only";
  return { visibility, completedNow, summary };
}
