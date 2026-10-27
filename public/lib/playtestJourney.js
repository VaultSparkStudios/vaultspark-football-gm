export const PLAYTEST_JOURNEY_SCHEMA_VERSION = "1.1";
export const PLAYTEST_JOURNEY_STORAGE_KEY = "vsfgm:playtest-journey:v1";
export const PLAYTEST_JOURNEY_EVENT_LIMIT = 12;

const ALLOWED_CHECKPOINTS = new Set([
  "session-start",
  "opening-contract-committed",
  "weekly-plan-opened",
  "gm-decision-resolved",
  "tactic-resolved",
  "weekly-plan-reviewed",
  "weekly-plan-revision-requested",
  "weekly-plan-deferred",
  "weekly-plan-committed",
  "weekly-debrief-ready"
]);

function safeLedger(value = {}) {
  const startedAt = Number(value.startedAt);
  const events = Array.isArray(value.events)
    ? value.events.filter((event) => ALLOWED_CHECKPOINTS.has(event?.name) && Number.isFinite(Number(event?.atMs)))
    : [];
  return {
    schemaVersion: PLAYTEST_JOURNEY_SCHEMA_VERSION,
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0,
    events: events.slice(0, PLAYTEST_JOURNEY_EVENT_LIMIT).map((event) => ({
      name: event.name,
      atMs: Math.max(0, Math.round(Number(event.atMs)))
    }))
  };
}

const journeys = new WeakMap();
const unavailableStorage = {};
const tabStorage = {
  getItem(key) { return globalThis.sessionStorage.getItem(key); },
  setItem(key, value) { globalThis.sessionStorage.setItem(key, value); }
};
function memoryFor(storage) {
  const key = storage && typeof storage === "object" ? storage : unavailableStorage;
  if (!journeys.has(key)) journeys.set(key, { ledger: safeLedger(), pending: false });
  return journeys.get(key);
}
function saveJourney(storage, ledger) {
  const memory = memoryFor(storage);
  memory.ledger = safeLedger(ledger);
  memory.pending = true;
  try {
    if (typeof storage?.setItem === "function") {
      storage.setItem(PLAYTEST_JOURNEY_STORAGE_KEY, JSON.stringify(memory.ledger));
      memory.pending = false;
    }
  } catch { /* Optional instrumentation must never interrupt play. */ }
  return safeLedger(memory.ledger);
}

export function loadPlaytestJourney(storage = tabStorage) {
  const memory = memoryFor(storage);
  if (memory.pending) return safeLedger(memory.ledger);
  try {
    if (typeof storage?.getItem === "function") memory.ledger = safeLedger(JSON.parse(storage.getItem(PLAYTEST_JOURNEY_STORAGE_KEY) || "{}"));
  } catch { /* Retain this tab's last observed checkpoints. */ }
  return safeLedger(memory.ledger);
}

export function startPlaytestJourney(storage = tabStorage, now = Date.now()) {
  const existing = loadPlaytestJourney(storage);
  if (existing.startedAt) return existing;
  const ledger = safeLedger({ startedAt: now, events: [{ name: "session-start", atMs: 0 }] });
  return saveJourney(storage, ledger);
}

export function recordPlaytestJourneyCheckpoint(name, {
  storage = tabStorage,
  now = Date.now()
} = {}) {
  if (!ALLOWED_CHECKPOINTS.has(name)) return loadPlaytestJourney(storage);
  const ledger = startPlaytestJourney(storage, now);
  if (ledger.events.some((event) => event.name === name) || ledger.events.length >= PLAYTEST_JOURNEY_EVENT_LIMIT) return ledger;
  const next = safeLedger({
    ...ledger,
    events: [...ledger.events, { name, atMs: Math.max(0, now - ledger.startedAt) }]
  });
  return saveJourney(storage, next);
}

export function buildPlaytestJourneySummary(ledger = loadPlaytestJourney()) {
  const safe = safeLedger(ledger);
  const events = safe.events.map((event) => ({ ...event }));
  const byName = new Map(events.map((event) => [event.name, event]));
  const openedAt = byName.get("weekly-plan-opened")?.atMs ?? null;
  const reviewedAt = byName.get("weekly-plan-reviewed")?.atMs ?? null;
  const revisedAt = byName.get("weekly-plan-revision-requested")?.atMs ?? null;
  const deferredAt = byName.get("weekly-plan-deferred")?.atMs ?? null;
  const committedAt = byName.get("weekly-plan-committed")?.atMs ?? null;
  const debriefAt = byName.get("weekly-debrief-ready")?.atMs ?? null;
  return {
    schemaVersion: PLAYTEST_JOURNEY_SCHEMA_VERSION,
    kind: "local-playtest-journey",
    eventCount: events.length,
    durationMs: events.length ? events.at(-1).atMs : 0,
    events,
    planningFriction: {
      status: debriefAt != null ? "debrief-ready" : committedAt != null ? "committed" : deferredAt != null ? "deferred" : openedAt != null ? "incomplete" : "not-observed",
      reviewed: reviewedAt != null,
      revisionRequested: revisedAt != null,
      deferred: deferredAt != null,
      elapsedToReviewMs: openedAt != null && reviewedAt != null ? Math.max(0, reviewedAt - openedAt) : null,
      elapsedToCommitMs: openedAt != null && committedAt != null ? Math.max(0, committedAt - openedAt) : null,
      elapsedToDebriefMs: openedAt != null && debriefAt != null ? Math.max(0, debriefAt - openedAt) : null,
      evidenceBoundary: "Local, self-selected instrumentation only; this does not prove cohort behavior, retention, comprehension, or causality."
    },
    privacy: {
      localOnlyUntilShared: true,
      relativeTimeOnly: true,
      accountIdentifierIncluded: false,
      savePayloadIncluded: false,
      cohortClaimPermitted: false
    }
  };
}
