import test from "node:test";
import assert from "node:assert/strict";
import { buildReturnChapterAction, buildReturnDigest, formatElapsed, formatSeasonThesisContinuation, ABSENCE_THRESHOLD_MS } from "../public/lib/returnDigest.js";

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

test("digest fires once the absence threshold is crossed even with no week change", () => {
  const now = 1_000_000_000_000;
  const prior = { scope: "legacy-buf-2026", timestamp: now - ABSENCE_THRESHOLD_MS - 1, year: 2026, week: 5, record: { wins: 3, losses: 1 } };
  const digest = buildReturnDigest(dashboard(), prior, now);
  assert.ok(digest);
  assert.equal(digest.weekAdvanced, false);
  assert.equal(digest.recordDelta.wins, 0);
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
