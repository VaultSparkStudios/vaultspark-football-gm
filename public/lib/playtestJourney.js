export const PLAYTEST_JOURNEY_SCHEMA_VERSION = "1.0";
export const PLAYTEST_JOURNEY_STORAGE_KEY = "vsfgm:playtest-journey:v1";
export const PLAYTEST_JOURNEY_EVENT_LIMIT = 12;

const ALLOWED_CHECKPOINTS = new Set([
  "session-start",
  "opening-contract-committed",
  "weekly-plan-opened",
  "gm-decision-resolved",
  "tactic-resolved",
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
  return {
    schemaVersion: PLAYTEST_JOURNEY_SCHEMA_VERSION,
    kind: "local-playtest-journey",
    eventCount: events.length,
    durationMs: events.length ? events.at(-1).atMs : 0,
    events,
    privacy: {
      localOnlyUntilShared: true,
      relativeTimeOnly: true,
      accountIdentifierIncluded: false,
      savePayloadIncluded: false
    }
  };
}
