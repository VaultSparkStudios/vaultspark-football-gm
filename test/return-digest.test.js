import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReturnBoundary, buildReturnChapterAction, buildReturnDigest, formatElapsed, formatSeasonThesisContinuation, recordReturnBoundary, RETURN_BOUNDARY_SCHEMA_VERSION, ABSENCE_THRESHOLD_MS } from "../public/lib/returnDigest.js";

// buildReturnDigest is pure (no DOM) except for getUnreadCount(), which reads
// localStorage — stub a minimal global so the module under test can import
// engagementFeatures.js without throwing in Node.
globalThis.localStorage = {
  _store: new Map(),
  getItem(key) { return this._store.has(key) ? this._store.get(key) : null; },
  setItem(key, value) { this._store.set(key, String(value)); },
  removeItem(key) { this._store.delete(key); }
};
globalThis.document = globalThis.document || { getElementById: () => null, addEventListener: () => {} };

function dashboard(overrides = {}) {
  return {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 5,
    controlledTeamId: "BUF",
    controlledTeam: { abbrev: "BUF", name: "Buffalo" },
    latestStandings: [{ team: "BUF", wins: 3, losses: 1 }],
    ...overrides
  };
}

test("no digest on a first-ever visit (no prior stamp)", () => {
  assert.equal(buildReturnDigest(dashboard(), null), null);
});

test("no digest when the player was barely away and the week hasn't advanced", () => {
  const now = 1_000_000_000_000;
  const prior = { scope: "legacy-buf-2026", timestamp: now - 1000, year: 2026, week: 5, record: { wins: 3, losses: 1 } };
  assert.equal(buildReturnDigest(dashboard(), prior, now), null);
});

test("elapsed time alone cannot manufacture an empty return ceremony", () => {
  const now = 1_000_000_000_000;
  const prior = {
    ...buildReturnBoundary(dashboard(), { timestamp: now - ABSENCE_THRESHOLD_MS - 1, reason: "pagehide", sessionId: "session-1" }),
    scope: "legacy-buf-2026"
  };
  assert.equal(buildReturnDigest(dashboard(), prior, now), null);
});

test("digest fires immediately when the week advanced, even before the time threshold", () => {
  const now = 1_000_000_000_000;
  const prior = { scope: "legacy-buf-2026", timestamp: now - 1000, year: 2026, week: 3, record: { wins: 2, losses: 1 } };
  const digest = buildReturnDigest(dashboard({ currentWeek: 5 }), prior, now);
  assert.ok(digest);
  assert.equal(digest.weekAdvanced, true);
  assert.equal(digest.fromWeek, 3);
  assert.equal(digest.toWeek, 5);
  assert.equal(digest.recordDelta.wins, 1);
  assert.equal(digest.recordDelta.losses, 0);
  assert.equal(digest.seasonChapter.id, "identity-test");
});

test("digest computes an honest win/loss delta since the last visit", () => {
  const now = 1_000_000_000_000;
  const prior = { scope: "legacy-buf-2026", timestamp: now - ABSENCE_THRESHOLD_MS - 1, year: 2026, week: 2, record: { wins: 0, losses: 2 } };
  const digest = buildReturnDigest(dashboard({ currentWeek: 6, latestStandings: [{ team: "BUF", wins: 4, losses: 2 }] }), prior, now);
  assert.equal(digest.recordDelta.wins, 4);
  assert.equal(digest.recordDelta.losses, 0);
  assert.equal(digest.currentRecord.wins, 4);
  assert.equal(digest.currentRecord.losses, 2);
});

test("formatElapsed renders hours under two days, days beyond that", () => {
  assert.equal(formatElapsed(3 * 60 * 60 * 1000), "3h");
  assert.equal(formatElapsed(30 * 60 * 60 * 1000), "30h");
  assert.equal(formatElapsed(3 * 24 * 60 * 60 * 1000), "3d");
});

test("return continuation carries the exact season thesis authority", () => {
  const now = 1_000_000_000_000;
  const prior = { scope: "legacy-buf-2026", timestamp: now - ABSENCE_THRESHOLD_MS - 1, year: 2026, week: 4 };
  const digest = buildReturnDigest(dashboard({
    currentWeek: 6,
    startScenarioReceipt: {
      receiptId: "opening-2026-BUF-v1",
      effects: { identity: { id: "trench-builder", label: "Build through the trenches" } }
    }
  }), prior, now);
  const action = buildReturnChapterAction(digest);
  assert.equal(action.thesisId, "opening-2026-BUF-v1:season:2026");
  assert.equal(action.thesisCheckpoint, "identity-test");
  assert.match(formatSeasonThesisContinuation(digest.seasonChapter), /Build through the trenches.*identity-test is open/i);
});

test("legacy chapter actions keep their original shape when no thesis authority exists", () => {
  assert.deepEqual(buildReturnChapterAction({
    seasonChapter: {
      id: "deadline-pressure",
      label: "Deadline Pressure",
      targetTab: "transactionsTab",
      targetId: "tradeDeadlineFrenzy"
    }
  }), {
    kind: "continue-season-chapter",
    label: "Continue Deadline Pressure",
    targetTab: "transactionsTab",
    targetId: "tradeDeadlineFrenzy",
    chapterId: "deadline-pressure"
  });
});

test("authoritative weekly boundaries absorb the player's own prior-session actions", () => {
  const now = 1_000_000_000_000;
  const afterCommit = dashboard({ currentWeek: 8, latestStandings: [{ team: "BUF", wins: 5, losses: 2 }] });
  const boundary = {
    ...buildReturnBoundary(afterCommit, { timestamp: now - ABSENCE_THRESHOLD_MS - 1, reason: "weekly-commit", sessionId: "session-commit" }),
    scope: "legacy-buf-2026"
  };
  assert.equal(boundary.schemaVersion, RETURN_BOUNDARY_SCHEMA_VERSION);
  assert.equal(boundary.reason, "weekly-commit");
  assert.equal(buildReturnDigest(afterCommit, boundary, now), null);
});

test("boundary writes are versioned, scoped, and recoverable", () => {
  const storage = {
    value: null,
    setItem(_key, value) { this.value = value; },
    getItem() { return this.value; }
  };
  assert.equal(recordReturnBoundary(dashboard(), { timestamp: 123, reason: "pagehide", sessionId: "S" }, storage), true);
  const stored = JSON.parse(storage.value);
  assert.equal(stored.schemaVersion, RETURN_BOUNDARY_SCHEMA_VERSION);
  assert.equal(stored.kind, "return-session-boundary");
  assert.equal(stored.reason, "pagehide");
  assert.equal(stored.scope, "legacy-buf-2026");
  assert.equal(stored.chapterId, "identity-test");
});

test("weekly, fast-sim, and pagehide paths share the boundary authority", () => {
  const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const flowSource = readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  const digestSource = readFileSync(new URL("../public/lib/returnDigest.js", import.meta.url), "utf8");
  assert.match(appSource, /recordReturnBoundary\(state\.dashboard.*weekly-commit/);
  assert.equal((flowSource.match(/recordReturnBoundary\(response\.state.*fast-sim-commit/g) || []).length, 2);
  assert.match(digestSource, /addEventListener\("pagehide"/);
  assert.doesNotMatch(digestSource, /The league moved/);
});

test("return boundaries form monotonic per-franchise lineage", () => {
  const storage = {
    values: new Map(),
    setItem(key, value) { this.values.set(key, String(value)); },
    getItem(key) { return this.values.get(key) || null; }
  };
  const buffalo = dashboard();
  const dallas = dashboard({ controlledTeamId: "DAL", controlledTeam: { abbrev: "DAL", name: "Dallas" }, latestStandings: [{ team: "DAL", wins: 2, losses: 2 }] });
  recordReturnBoundary(buffalo, { timestamp: 100, reason: "weekly-commit" }, storage);
  const first = JSON.parse([...storage.values.values()][0]);
  recordReturnBoundary(buffalo, { timestamp: 200, reason: "weekly-commit" }, storage);
  const second = JSON.parse(storage.values.get([...storage.values.keys()][0]));
  recordReturnBoundary(dallas, { timestamp: 300, reason: "weekly-commit" }, storage);
  const third = JSON.parse([...storage.values.values()][1]);
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(first.sessionId, second.sessionId, "one franchise retains one in-memory session authority");
  assert.equal(third.sequence, 1);
  assert.notEqual(third.sessionId, first.sessionId, "franchises never share return-session authority");
});
