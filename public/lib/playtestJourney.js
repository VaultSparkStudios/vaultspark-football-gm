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

export function loadPlaytestJourney(storage = globalThis.sessionStorage) {
  try {
    return safeLedger(JSON.parse(storage?.getItem?.(PLAYTEST_JOURNEY_STORAGE_KEY) || "{}"));
  } catch {
    return safeLedger();
  }
}

export function startPlaytestJourney(storage = globalThis.sessionStorage, now = Date.now()) {
  const existing = loadPlaytestJourney(storage);
  if (existing.startedAt) return existing;
  const ledger = safeLedger({ startedAt: now, events: [{ name: "session-start", atMs: 0 }] });
  storage?.setItem?.(PLAYTEST_JOURNEY_STORAGE_KEY, JSON.stringify(ledger));
  return ledger;
}

export function recordPlaytestJourneyCheckpoint(name, {
  storage = globalThis.sessionStorage,
  now = Date.now()
} = {}) {
  if (!ALLOWED_CHECKPOINTS.has(name)) return loadPlaytestJourney(storage);
  const ledger = startPlaytestJourney(storage, now);
  if (ledger.events.some((event) => event.name === name) || ledger.events.length >= PLAYTEST_JOURNEY_EVENT_LIMIT) return ledger;
  const next = safeLedger({
    ...ledger,
    events: [...ledger.events, { name, atMs: Math.max(0, now - ledger.startedAt) }]
  });
  storage?.setItem?.(PLAYTEST_JOURNEY_STORAGE_KEY, JSON.stringify(next));
  return next;
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
