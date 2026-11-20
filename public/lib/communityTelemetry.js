import { extractCommunityEvents } from "./extractCommunityEvents.js";
import { COMMUNITY_BATCH_LIMIT, COMMUNITY_FUNNEL_EVENT_TYPES, normalizeCommunityEvent, returnVisitGap } from "./communityEventContract.js";
import { buildDiagnosticReport, diagnosticSignatureSource, DIAGNOSTIC_BATCH_LIMIT } from "./communityFeedbackContract.js";
import { observeBackgroundTask, subscribeClientDiagnostics } from "./clientDiagnostics.js";

export const COMMUNITY_CONSENT_KEY = "fa:community-participation:v1";
export const COMMUNITY_PARTICIPANT_KEY = "fa:community-participant:v1";
export const COMMUNITY_QUEUE_KEY = "fa:community-queue:v1";
export const COMMUNITY_LOCAL_LEDGER_KEY = "fa:community-local-ledger:v1";
export const COMMUNITY_PENDING_DELETION_KEY = "fa:community-pending-deletion:v1";
export const COMMUNITY_ENDPOINT = "https://api-franchise-architect-football.vaultsparkstudios.com/community/v1";
// Which first-steps milestones this browser has already reported, and the day
// it last played. Written only while sharing is on; never sent as-is.
export const COMMUNITY_FUNNEL_KEY = "fa:community-funnel:v1";
// One sentence for every place that offers the sharing choice, so the wording
// cannot drift from what this module sends.
export const COMMUNITY_SHARING_SUMMARY = "Share game choices and results, plus short error reports when something breaks, without sharing your save, names, notes, or private details.";
const DAY_MS = 24 * 60 * 60 * 1000;
const DIAGNOSTIC_FLUSH_DELAY_MS = 3_000;
const MAX_QUEUE = 240;
const CAPABILITY_EXPIRY_SKEW_MS = 5_000;
const DELETION_RETRY_MIN_MS = 5_000;
const DELETION_RETRY_MAX_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

let capabilityLease = null;
let capabilityRequest = null;
let pendingDeletionRequest = null;
let pendingDeletionRetryTimer = null;
let pendingDeletionRetryCount = 0;
let volatilePendingDeletion = null;
let participationBlocked = false;
let consentGeneration = 0;
let discardStoredQueue = false;
const eventRequests = new Set();

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function readJson(key, fallback) {
  try {
    const value = storage()?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
}

function writeJson(key, value) {
  try {
    const saved = storage(), serialized = JSON.stringify(value);
    saved?.setItem(key, serialized);
    return Boolean(saved) && saved.getItem(key) === serialized;
  } catch { return false; }
}

function remove(key) {
  try { storage()?.removeItem(key); } catch { /* local storage is optional */ }
}

function persistDecline() {
  try { storage()?.setItem(COMMUNITY_CONSENT_KEY, "declined"); } catch { remove(COMMUNITY_CONSENT_KEY); }
}

export function getCommunityParticipation() {
  if (participationBlocked) return false;
  try { return storage()?.getItem(COMMUNITY_CONSENT_KEY) === "participating"; } catch { return false; }
}

export function participantId({ create = false } = {}) {
  try {
    let value = storage()?.getItem(COMMUNITY_PARTICIPANT_KEY) || "";
    if (create && (!value || value === getPendingCommunityDeletion())) {
      value = globalThis.crypto?.randomUUID?.() || `browser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      storage()?.setItem(COMMUNITY_PARTICIPANT_KEY, value);
      if (storage()?.getItem(COMMUNITY_PARTICIPANT_KEY) !== value) return "";
    }
    return value;
  } catch { return ""; }
}

export function statsEndpoint(path) {
  const meta = typeof document !== "undefined" ? document.querySelector('meta[name="fa-community-api"]')?.content?.trim() : "";
  const base = meta || COMMUNITY_ENDPOINT;
  return `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function emitParticipationChange(participating) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fa:community-participation", { detail: { participating } }));
}

function emitDeletionChange(deletion) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fa:community-deletion", { detail: deletion }));
}

export function getPendingCommunityDeletion() {
  if (volatilePendingDeletion !== null) return volatilePendingDeletion;
  try { return storage()?.getItem(COMMUNITY_PENDING_DELETION_KEY) || ""; } catch { return ""; }
}

function writePendingCommunityDeletion(browserId) {
  if (!browserId) return false;
  volatilePendingDeletion = browserId;
  try {
    // Purpose-bound tombstone: the anonymous identifier is the entire value.
    // No event, save, capability, timestamp, or personal data is retained.
    storage()?.setItem(COMMUNITY_PENDING_DELETION_KEY, browserId);
    return true;
  } catch { return false; }
}

function clearPendingCommunityDeletion(browserId) {
  if (getPendingCommunityDeletion() !== browserId) return;
  remove(COMMUNITY_PENDING_DELETION_KEY);
  volatilePendingDeletion = "";
  pendingDeletionRetryCount = 0;
  if (pendingDeletionRetryTimer) clearTimeout(pendingDeletionRetryTimer);
  pendingDeletionRetryTimer = null;
}

function clearCapability(browserId) {
  if (!browserId || capabilityLease?.participantId === browserId) capabilityLease = null;
  if (!browserId || capabilityRequest?.participantId === browserId) capabilityRequest = null;
}

function schedulePendingDeletionRetry() {
  if (pendingDeletionRetryTimer || !getPendingCommunityDeletion()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const delay = Math.min(DELETION_RETRY_MAX_MS, DELETION_RETRY_MIN_MS * (2 ** Math.min(6, pendingDeletionRetryCount)));
  pendingDeletionRetryTimer = setTimeout(() => {
    pendingDeletionRetryTimer = null;
    void retryPendingCommunityDeletion();
  }, delay);
}

async function request(path, init, eventRequest = false) {
  const controller = new AbortController();
  if (eventRequest) eventRequests.add(controller);
  const stopped = new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Community request stopped or timed out.")), { once: true }));
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await Promise.race([stopped, (async () => {
      const response = await fetch(statsEndpoint(path), { ...init, signal: controller.signal });
      let body = null;
      if (response.ok) {
        try { body = await response.json(); } catch { /* mutation count receipts are optional */ }
      }
      return { response, body };
    })()]);
  } finally {
    clearTimeout(timeout);
    eventRequests.delete(controller);
    controller.abort();
  }
}

async function requestCapability(browserId) {
  const { response, body } = await request("capability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: "1.0", participantId: browserId }),
    mode: "cors",
    credentials: "omit"
  });
  if (!response.ok) throw new Error(`Community participation capability unavailable (HTTP ${response.status}).`);
  if (typeof body?.capability !== "string" || !body.capability || !(Date.parse(body.expiresAt) > Date.now())) throw new Error("Community participation capability response is invalid.");
  return {
    participantId: browserId,
    capability: body.capability,
    expiresAt: body.expiresAt,
    remainingUses: Math.max(1, Number(body.remainingUses ?? body.useLimit) || 1)
  };
}

async function ensureCapability(browserId, { force = false } = {}) {
  const current = capabilityLease;
  if (!force && current?.participantId === browserId && current.remainingUses > 0 &&
      Date.parse(current.expiresAt) - Date.now() > CAPABILITY_EXPIRY_SKEW_MS) return current;
  if (force) clearCapability(browserId);
  if (capabilityRequest?.participantId !== browserId) {
    const pending = { participantId: browserId };
    pending.promise = requestCapability(browserId)
      .then((lease) => { if (capabilityRequest === pending) capabilityLease = lease; return lease; })
      .finally(() => { if (capabilityRequest === pending) capabilityRequest = null; });
    capabilityRequest = pending;
  }
  return capabilityRequest.promise;
}

export async function capabilityMutation(path, browserId, payload, init = {}, admitted = null) {
  let result = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (admitted && !admitted()) throw new Error("Community sharing stopped.");
    const lease = await ensureCapability(browserId, { force: attempt > 0 });
    if (admitted && !admitted()) throw new Error("Community sharing stopped.");
    lease.remainingUses = Math.max(0, lease.remainingUses - 1);
    result = await request(path, {
      ...init,
      method: init.method || "POST",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      body: JSON.stringify({ ...payload, capability: lease.capability }),
      mode: "cors",
      credentials: "omit"
    }, Boolean(admitted));
    if (result.response.status !== 401) return result;
    clearCapability(browserId);
  }
  return result;
}

export async function retryPendingCommunityDeletion() {
  if (pendingDeletionRequest) return pendingDeletionRequest;
  const browserId = getPendingCommunityDeletion();
  if (!browserId) return { status: "not-needed", deleted: 0 };
  if (typeof fetch !== "function" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    const outcome = { status: "pending", deleted: null, reason: "offline" };
    emitDeletionChange(outcome);
    return outcome;
  }

  pendingDeletionRequest = (async () => {
    try {
      const { response, body } = await capabilityMutation("participation", browserId, {
        schemaVersion: "1.0",
        participantId: browserId
      }, { method: "DELETE", keepalive: true });
      if (!response?.ok) {
        pendingDeletionRetryCount += 1;
        const outcome = { status: "failed", deleted: null, reason: `http-${response?.status || "unknown"}` };
        emitDeletionChange(outcome);
        schedulePendingDeletionRetry();
        return outcome;
      }
      // HTTP acknowledgement remains authoritative when its optional count is absent.
      const outcome = { status: "success", deleted: Math.max(0, Number(body?.deleted) || 0) };
      clearPendingCommunityDeletion(browserId);
      clearCapability(browserId);
      schedulePendingDeletionRetry();
      emitDeletionChange(outcome);
      return outcome;
    } catch {
      pendingDeletionRetryCount += 1;
      const outcome = { status: "failed", deleted: null, reason: "unavailable" };
      emitDeletionChange(outcome);
      schedulePendingDeletionRetry();
      return outcome;
    } finally {
      pendingDeletionRequest = null;
    }
  })();
  return pendingDeletionRequest;
}

export async function setCommunityParticipation(participating) {
  const wasParticipating = getCommunityParticipation();
  const existingId = participantId();
  consentGeneration += 1;
  participationBlocked = true;
  for (const controller of eventRequests) controller.abort();
  if (participating) {
    if (!wasParticipating) discardStoredQueue = true;
    if (getPendingCommunityDeletion()) {
      // Finish this identifier first; deletion state retains only one identifier.
      discardStoredQueue = true;
      persistDecline();
      const deletion = { status: "pending", deleted: null, reason: "deletion-pending" };
      emitParticipationChange(false);
      emitDeletionChange(deletion);
      return { participating: false, deletion };
    }
    try {
      const saved = storage();
      saved?.setItem(COMMUNITY_CONSENT_KEY, "participating");
      participationBlocked = !saved || saved.getItem(COMMUNITY_CONSENT_KEY) !== "participating";
    } catch { /* failed persistence stays off */ }
    if (participationBlocked) {
      persistDecline();
      emitParticipationChange(false);
      return { participating: false, deletion: { status: "not-requested", deleted: null } };
    }
    const browserId = participantId({ create: true });
    if (!browserId) {
      participationBlocked = true;
      persistDecline();
      emitParticipationChange(false);
      return { participating: false, deletion: { status: "not-requested", deleted: null } };
    }
    emitParticipationChange(true);
    if (browserId && typeof fetch === "function") {
      observeBackgroundTask(
        () => ensureCapability(browserId).then(() => flushCommunityQueue()),
        {
          surface: "community-telemetry",
          operation: "prewarm-participation-capability",
          authorityKey: browserId,
          severity: "degraded"
        }
      );
    }
    return { participating: true, deletion: { status: "not-requested", deleted: null } };
  }

  discardStoredQueue = true;
  pendingDiagnostics.length = 0;
  persistDecline();
  // Decline is immediate and collection stays off even if remote deletion is
  // temporarily unavailable. Only the identifier moves into a retry tombstone.
  if (existingId) writePendingCommunityDeletion(existingId);
  remove(COMMUNITY_PARTICIPANT_KEY);
  remove(COMMUNITY_QUEUE_KEY);
  emitParticipationChange(false);
  const deletion = (wasParticipating || getPendingCommunityDeletion())
    ? await retryPendingCommunityDeletion()
    : { status: "not-needed", deleted: 0 };
  return { participating: false, deletion };
}

export function emptyLocalCommunityLedger() {
  return {
    schemaVersion: "1.0",
    updatedAt: null,
    totals: { franchises: 0, weeks: 0, seasons: 0, wins: 0, losses: 0, ties: 0, trades: 0, draftPicks: 0, freeAgents: 0, contracts: 0, staffMoves: 0, challenges: 0, championships: 0, decisions: 0 },
    choices: { tactics: {}, teams: {}, difficulties: {}, archetypes: {}, positions: {} }
  };
}

function increment(record, key, value = 1) {
  if (!key) return;
  record[key] = Number(record[key] || 0) + Number(value || 0);
}

export function applyEventsToLocalLedger(current, events, now = new Date().toISOString()) {
  const ledger = current?.schemaVersion === "1.0" ? JSON.parse(JSON.stringify(current)) : emptyLocalCommunityLedger();
  for (const row of events || []) {
    const m = row.metrics || {};
    const d = row.dimensions || {};
    if (row.type === "league_started") {
      increment(ledger.totals, "franchises"); increment(ledger.choices.teams, d.team); increment(ledger.choices.difficulties, d.difficulty); increment(ledger.choices.archetypes, d.archetype);
    } else if (row.type === "weeks_managed") {
      increment(ledger.totals, "weeks", m.weeks); increment(ledger.totals, "seasons", m.seasonsCompleted);
      increment(ledger.totals, "wins", m.wins); increment(ledger.totals, "losses", m.losses); increment(ledger.totals, "ties", m.ties);
      increment(ledger.totals, "championships", m.championships); if (d.decision && d.decision !== "none") increment(ledger.totals, "decisions");
      if (d.tactic && d.tactic !== "none") increment(ledger.choices.tactics, d.tactic, m.weeks || 1);
    } else if (row.type === "trade_completed") increment(ledger.totals, "trades");
    else if (row.type === "draft_pick") { increment(ledger.totals, "draftPicks"); increment(ledger.choices.positions, d.position); }
    else if (row.type === "free_agent_signed") increment(ledger.totals, "freeAgents");
    else if (row.type === "contract_completed") increment(ledger.totals, "contracts");
    else if (row.type === "staff_changed") increment(ledger.totals, "staffMoves");
    else if (row.type === "challenge_completed") increment(ledger.totals, "challenges");
  }
  ledger.updatedAt = now;
  return ledger;
}

export function getLocalCommunityLedger() {
  return applyEventsToLocalLedger(readJson(COMMUNITY_LOCAL_LEDGER_KEY, null), []);
}

function recordLocally(events) {
  if (!events.length) return;
  writeJson(COMMUNITY_LOCAL_LEDGER_KEY, applyEventsToLocalLedger(readJson(COMMUNITY_LOCAL_LEDGER_KEY, null), events));
}

function queueEvents(events) {
  if (!events.length || !getCommunityParticipation()) return;
  const queued = readQueue();
  const next = [...queued, ...events].slice(-MAX_QUEUE);
  if (writeJson(COMMUNITY_QUEUE_KEY, next)) discardStoredQueue = false;
}

function readQueue() {
  const queue = discardStoredQueue ? [] : readJson(COMMUNITY_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

let flushing = null;
export async function flushCommunityQueue() {
  if (flushing?.generation === consentGeneration) return flushing.promise;
  if (!getCommunityParticipation() || typeof fetch !== "function") return { sent: 0 };
  const browserId = participantId({ create: true });
  if (!browserId) return { sent: 0 };
  const generation = consentGeneration;
  const admitted = () => generation === consentGeneration && getCommunityParticipation() && participantId() === browserId;
  const pending = { generation };
  pending.promise = (async () => {
    let sent = 0;
    while (admitted()) {
      const queue = readQueue();
      if (!queue.length) break;
      const batch = queue.slice(0, COMMUNITY_BATCH_LIMIT);
      let response;
      try {
        ({ response } = await capabilityMutation("events", browserId, { schemaVersion: "1.0", participantId: browserId, events: batch }, {
          keepalive: batch.length <= 8
        }, admitted));
      } catch { break; }
      if (admitted() && response.status === 400) {
        // A service that predates the first-steps milestones refuses the whole
        // batch because of them. Drop only those and send the rest, so game
        // stats never queue up behind an event the service will not take.
        const milestones = new Set(batch.filter((row) => COMMUNITY_FUNNEL_EVENT_TYPES.includes(row.type)).map((row) => row.eventId));
        if (milestones.size && writeJson(COMMUNITY_QUEUE_KEY, readQueue().filter((row) => !milestones.has(row.eventId)))) continue;
      }
      if (!admitted() || !response.ok) break;
      const latest = readQueue();
      const ids = new Set(batch.map((row) => row.eventId));
      sent += batch.length;
      if (!writeJson(COMMUNITY_QUEUE_KEY, latest.filter((row) => !ids.has(row.eventId)))) break;
    }
    return { sent };
  })().finally(() => { if (flushing === pending) flushing = null; });
  flushing = pending;
  return pending.promise;
}

let returnVisitChecked = false;

function funnelEvent(type, runtime, dimensions = {}) {
  const occurredAt = new Date().toISOString();
  return normalizeCommunityEvent({
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`,
    type,
    occurredAt,
    dimensions: { runtime, ...dimensions }
  }, { now: Date.parse(occurredAt) });
}

/**
 * Coarse first-steps milestones, derived from the events a game action already
 * produced: finishing setup, the first advance, the first finished season, and
 * a return visit bucketed by days away. Each "first" is reported once per
 * browser. Nothing is derived, remembered or queued unless sharing is on.
 */
function deriveFunnelEvents(events, runtime) {
  if (!getCommunityParticipation()) return [];
  const saved = readJson(COMMUNITY_FUNNEL_KEY, null);
  const seen = saved && typeof saved === "object" && !Array.isArray(saved) ? { ...saved } : {};
  const rows = [];
  const once = (flag, type) => { if (!seen[flag]) { seen[flag] = 1; rows.push(funnelEvent(type, runtime)); } };
  if (!returnVisitChecked) {
    const today = Math.floor(Date.now() / DAY_MS);
    const last = Number(seen.day);
    if (Number.isFinite(last) && last > 0 && last <= today) rows.push(funnelEvent("return_visit", runtime, { gap: returnVisitGap(today - last) }));
    seen.day = today;
  }
  for (const row of events) {
    if (row.type === "league_started") once("setup", "setup_finished");
    if (row.type === "weeks_managed") {
      once("advance", "first_advance");
      if (Number(row.metrics?.seasonsCompleted) > 0) once("season", "first_season_finished");
    }
  }
  // If the marker cannot be saved, report nothing rather than report it twice.
  if (!writeJson(COMMUNITY_FUNNEL_KEY, seen)) return [];
  returnVisitChecked = true;
  return rows.filter(Boolean);
}

const pendingDiagnostics = [];
const reportedDiagnostics = new Set();
let diagnosticFlushTimer = null;
let buildIdRequest = null;

/** The deployed build's revision, read once from this site's own health file. */
function buildId() {
  if (!buildIdRequest) {
    buildIdRequest = (async () => {
      try {
        const response = await fetch(new URL("./_health", document.baseURI).href, { credentials: "omit" });
        return response.ok ? String((await response.json())?.sourceRevision || "") : "";
      } catch { return ""; }
    })();
  }
  return buildIdRequest;
}
export { buildId as getCommunityBuildId };

/**
 * Queue one error report. This is the consent boundary for error reports:
 * with sharing off the error is not even reduced to a report, so nothing
 * exists to send later. Returns whether a report was queued.
 */
export function reportClientError(error, { screen = null } = {}) {
  if (!getCommunityParticipation() || typeof location === "undefined") return false;
  const report = buildDiagnosticReport(error, {
    origin: location.origin,
    screen: screen || (typeof document !== "undefined" ? document.querySelector(".tab-panel.active")?.id : null)
  });
  if (!report) return false;
  const signature = diagnosticSignatureSource(report);
  if (reportedDiagnostics.has(signature) || reportedDiagnostics.size >= 40) return false;
  reportedDiagnostics.add(signature);
  pendingDiagnostics.push(report);
  if (pendingDiagnostics.length > DIAGNOSTIC_BATCH_LIMIT) pendingDiagnostics.shift();
  if (!diagnosticFlushTimer) {
    diagnosticFlushTimer = setTimeout(() => { diagnosticFlushTimer = null; void flushCommunityDiagnostics(); }, DIAGNOSTIC_FLUSH_DELAY_MS);
    diagnosticFlushTimer?.unref?.();
  }
  return true;
}

/** Send queued error reports. A failed send is dropped, never retried or stored. */
export async function flushCommunityDiagnostics() {
  if (!getCommunityParticipation() || !pendingDiagnostics.length || typeof fetch !== "function") return { sent: 0 };
  const browserId = participantId();
  if (!browserId) return { sent: 0 };
  const generation = consentGeneration;
  const admitted = () => generation === consentGeneration && getCommunityParticipation() && participantId() === browserId;
  const batch = pendingDiagnostics.splice(0, DIAGNOSTIC_BATCH_LIMIT);
  try {
    const build = await buildId();
    if (!admitted()) return { sent: 0 };
    const reports = batch.map((report) => (build ? { ...report, build } : report));
    const { response } = await capabilityMutation("diagnostics", browserId, { schemaVersion: "1.0", participantId: browserId, reports }, {}, admitted);
    return { sent: response.ok ? batch.length : 0 };
  } catch { return { sent: 0 }; }
}

export function observeCommunityApiReceipt({ method, path, body, response, runtime }) {
  const events = extractCommunityEvents({ method, path, body, response, runtime });
  if (!events.length) return events;
  events.push(...deriveFunnelEvents(events, runtime));
  recordLocally(events);
  queueEvents(events);
  if (getCommunityParticipation() && (typeof navigator === "undefined" || navigator.onLine !== false)) void flushCommunityQueue();
  return events;
}

export function initCommunityTelemetry() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (event) => {
    if (event.key === COMMUNITY_PENDING_DELETION_KEY) volatilePendingDeletion = null;
    if (event.key === COMMUNITY_CONSENT_KEY || event.key === COMMUNITY_PARTICIPANT_KEY) {
      consentGeneration += 1;
      discardStoredQueue = true;
      for (const controller of eventRequests) controller.abort();
    }
  });
  // Error reports ride on the sharing choice. reportClientError() discards
  // everything while sharing is off, so these listeners are inert until then.
  window.addEventListener("error", (event) => {
    reportClientError(event.error || { name: "Error", message: event.message, stack: `${event.filename}:${event.lineno}:${event.colno}` });
  });
  window.addEventListener("unhandledrejection", (event) => { reportClientError(event.reason); });
  subscribeClientDiagnostics((snapshot) => {
    for (const entry of snapshot.entries) {
      if (entry.surface !== "community-telemetry") reportClientError({ name: "BackgroundTask", message: entry.message }, { screen: `${entry.surface}:${entry.operation}` });
    }
  });
  window.addEventListener("online", () => {
    if (getPendingCommunityDeletion()) void retryPendingCommunityDeletion();
    if (getCommunityParticipation()) void flushCommunityQueue();
  });
  if (getPendingCommunityDeletion()) queueMicrotask(() => void retryPendingCommunityDeletion());
  if (getCommunityParticipation()) queueMicrotask(() => void flushCommunityQueue());
}
