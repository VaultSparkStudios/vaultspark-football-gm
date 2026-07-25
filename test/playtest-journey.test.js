import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLAYTEST_JOURNEY_STORAGE_KEY,
  buildPlaytestJourneySummary,
  loadPlaytestJourney,
  recordPlaytestJourneyCheckpoint,
  startPlaytestJourney
} from "../public/lib/playtestJourney.js";
import { buildLocalPlaytestExport, buildLocalPlaytestReceipt } from "../public/lib/playtestReceipts.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    raw: values
  };
}

test("journey checkpoints are allowlisted, relative, deduplicated, and local", () => {
  const storage = memoryStorage();
  startPlaytestJourney(storage, 10_000);
  recordPlaytestJourneyCheckpoint("weekly-plan-opened", { storage, now: 12_500 });
  recordPlaytestJourneyCheckpoint("weekly-plan-opened", { storage, now: 19_000 });
  recordPlaytestJourneyCheckpoint("secret-token-read", { storage, now: 20_000 });
  const ledger = loadPlaytestJourney(storage);
  assert.deepEqual(ledger.events, [
    { name: "session-start", atMs: 0 },
    { name: "weekly-plan-opened", atMs: 2500 }
  ]);
  assert.ok(storage.raw.has(PLAYTEST_JOURNEY_STORAGE_KEY));
});

test("journey storage is tab-scoped and captures the opening contract boundary", () => {
  const source = readFileSync(new URL("../public/lib/playtestJourney.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(source, /storage = globalThis\.sessionStorage/g);
  assert.doesNotMatch(source, /storage = globalThis\.localStorage/);
  assert.match(source, /"opening-contract-committed"/);
  assert.match(app, /recordPlaytestJourneyCheckpoint\("opening-contract-committed"\)/);
});

test("explicit receipt pack joins safe journey summary without absolute or save data", () => {
  const receipt = buildLocalPlaytestReceipt({ clarity: 4, agency: 5, pace: 3, returnIntent: 4 }, {
    teamId: "BUF", year: 2026, week: 2, phase: "regular-season"
  });
  const journey = { startedAt: 50_000, events: [
    { name: "session-start", atMs: 0 },
    { name: "weekly-plan-committed", atMs: 6000 }
  ] };
  const pack = buildLocalPlaytestExport([receipt], journey);
  assert.equal(pack.journey.eventCount, 2);
  assert.equal(pack.journey.durationMs, 6000);
  assert.equal("startedAt" in pack.journey, false);
  assert.equal(pack.journey.privacy.savePayloadIncluded, false);
  assert.equal(JSON.stringify(pack).includes("50_000"), false);
  assert.match(pack.privacy, /no account identifier or save payload/);
  assert.match(pack.privacy, /no token or absolute journey timestamp/);
  assert.deepEqual(buildPlaytestJourneySummary(journey).events.at(-1), { name: "weekly-plan-committed", atMs: 6000 });
});
