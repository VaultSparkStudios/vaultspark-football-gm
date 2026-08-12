import { extractCommunityEvents } from "./extractCommunityEvents.js";
import { COMMUNITY_BATCH_LIMIT } from "./communityEventContract.js";
import { observeBackgroundTask } from "./clientDiagnostics.js";

export const COMMUNITY_CONSENT_KEY = "fa:community-participation:v1";
export const COMMUNITY_PARTICIPANT_KEY = "fa:community-participant:v1";
export const COMMUNITY_QUEUE_KEY = "fa:community-queue:v1";
export const COMMUNITY_LOCAL_LEDGER_KEY = "fa:community-local-ledger:v1";
export const COMMUNITY_PENDING_DELETION_KEY = "fa:community-pending-deletion:v1";
export const COMMUNITY_ENDPOINT = "https://api-franchise-architect-football.vaultsparkstudios.com/community/v1";
const MAX_QUEUE = 240;
const CAPABILITY_EXPIRY_SKEW_MS = 5_000;
const DELETION_RETRY_MIN_MS = 5_000;
const DELETION_RETRY_MAX_MS = 5 * 60_000;

let capabilityLease = null;
let capabilityRequest = null;
let pendingDeletionRequest = null;
let pendingDeletionRetryTimer = null;
let pendingDeletionRetryCount = 0;
let volatilePendingDeletion = "";

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
  try { storage()?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function remove(key) {
  try { storage()?.removeItem(key); } catch { /* local storage is optional */ }
}

export function getCommunityParticipation() {
  try { return storage()?.getItem(COMMUNITY_CONSENT_KEY) === "participating"; } catch { return false; }
}

function participantId({ create = false } = {}) {
  try {
    let value = storage()?.getItem(COMMUNITY_PARTICIPANT_KEY) || "";
    if (!value && create) {
      value = globalThis.crypto?.randomUUID?.() || `browser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      storage()?.setItem(COMMUNITY_PARTICIPANT_KEY, value);
    }
    return value;
  } catch { return ""; }
}

function statsEndpoint(path) {
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
  try { return storage()?.getItem(COMMUNITY_PENDING_DELETION_KEY) || volatilePendingDeletion; } catch { return volatilePendingDeletion; }
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

function clearPendingCommunityDeletion() {
  remove(COMMUNITY_PENDING_DELETION_KEY);
  volatilePendingDeletion = "";
  pendingDeletionRetryCount = 0;
  if (pendingDeletionRetryTimer) clearTimeout(pendingDeletionRetryTimer);
  pendingDeletionRetryTimer = null;
}

function clearCapability() {
  capabilityLease = null;
  capabilityRequest = null;
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

async function requestCapability(browserId) {
  const response = await fetch(statsEndpoint("capability"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: "1.0", participantId: browserId }),
    mode: "cors",
    credentials: "omit"
  });
  if (!response.ok) throw new Error(`Community participation capability unavailable (HTTP ${response.status}).`);
  const body = await response.json();
  if (!body?.capability || !Number.isFinite(Date.parse(body.expiresAt))) throw new Error("Community participation capability response is invalid.");
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
  if (force) clearCapability();
  if (!capabilityRequest) {
    capabilityRequest = requestCapability(browserId)
      .then((lease) => { capabilityLease = lease; return lease; })
      .finally(() => { capabilityRequest = null; });
  }
  return capabilityRequest;
}

async function capabilityMutation(path, browserId, payload, init = {}) {
  let response = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const lease = await ensureCapability(browserId, { force: attempt > 0 });
    lease.remainingUses = Math.max(0, lease.remainingUses - 1);
    response = await fetch(statsEndpoint(path), {
      ...init,
      method: init.method || "POST",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      body: JSON.stringify({ ...payload, capability: lease.capability }),
      mode: "cors",
      credentials: "omit"
    });
    if (response.status !== 401) return response;
    clearCapability();
  }
  return response;
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
      const response = await capabilityMutation("participation", browserId, {
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
      let receipt = {};
      try {
        receipt = await response.json();
      } catch {
        // A successful DELETE acknowledgement is authoritative even when an
        // intermediary strips the optional JSON count receipt.
      }
      const outcome = { status: "success", deleted: Math.max(0, Number(receipt.deleted) || 0) };
      clearPendingCommunityDeletion();
      clearCapability();
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
  if (participating) {
    try { storage()?.setItem(COMMUNITY_CONSENT_KEY, "participating"); } catch { /* non-persistent consent stays false */ }
    const browserId = participantId({ create: true });
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

  try { storage()?.setItem(COMMUNITY_CONSENT_KEY, "declined"); } catch { /* ignore */ }
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
  const queued = readJson(COMMUNITY_QUEUE_KEY, []);
  const next = [...queued, ...events].slice(-MAX_QUEUE);
  writeJson(COMMUNITY_QUEUE_KEY, next);
}

let flushing = null;
export async function flushCommunityQueue() {
  if (flushing) return flushing;
  if (!getCommunityParticipation() || typeof fetch !== "function") return { sent: 0 };
  const browserId = participantId({ create: true });
  if (!browserId) return { sent: 0 };
  flushing = (async () => {
    let sent = 0;
    while (getCommunityParticipation()) {
      const queue = readJson(COMMUNITY_QUEUE_KEY, []);
      if (!queue.length) break;
      const batch = queue.slice(0, COMMUNITY_BATCH_LIMIT);
      let response;
      try {
        response = await capabilityMutation("events", browserId, { schemaVersion: "1.0", participantId: browserId, events: batch }, {
          keepalive: batch.length <= 8
        });
      } catch { break; }
      if (!response.ok) break;
      const latest = readJson(COMMUNITY_QUEUE_KEY, []);
      const ids = new Set(batch.map((row) => row.eventId));
      writeJson(COMMUNITY_QUEUE_KEY, latest.filter((row) => !ids.has(row.eventId)));
      sent += batch.length;
    }
    return { sent };
  })().finally(() => { flushing = null; });
  return flushing;
}

export function observeCommunityApiReceipt({ method, path, body, response, runtime }) {
  const events = extractCommunityEvents({ method, path, body, response, runtime });
  if (!events.length) return events;
  recordLocally(events);
  queueEvents(events);
  if (getCommunityParticipation() && (typeof navigator === "undefined" || navigator.onLine !== false)) void flushCommunityQueue();
  return events;
}

export function initCommunityTelemetry() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    if (getPendingCommunityDeletion()) void retryPendingCommunityDeletion();
    if (getCommunityParticipation()) void flushCommunityQueue();
  });
  if (getPendingCommunityDeletion()) queueMicrotask(() => void retryPendingCommunityDeletion());
  if (getCommunityParticipation()) queueMicrotask(() => void flushCommunityQueue());
}
