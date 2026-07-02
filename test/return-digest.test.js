import test from "node:test";
import assert from "node:assert/strict";
import { buildReturnDigest, formatElapsed, ABSENCE_THRESHOLD_MS } from "../public/lib/returnDigest.js";

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
  const prior = { timestamp: now - 1000, year: 2026, week: 5, record: { wins: 3, losses: 1 } };
  assert.equal(buildReturnDigest(dashboard(), prior, now), null);
});

test("digest fires once the absence threshold is crossed even with no week change", () => {
  const now = 1_000_000_000_000;
  const prior = { timestamp: now - ABSENCE_THRESHOLD_MS - 1, year: 2026, week: 5, record: { wins: 3, losses: 1 } };
  const digest = buildReturnDigest(dashboard(), prior, now);
  assert.ok(digest);
  assert.equal(digest.weekAdvanced, false);
  assert.equal(digest.recordDelta.wins, 0);
});

test("digest fires immediately when the week advanced, even before the time threshold", () => {
  const now = 1_000_000_000_000;
  const prior = { timestamp: now - 1000, year: 2026, week: 3, record: { wins: 2, losses: 1 } };
  const digest = buildReturnDigest(dashboard({ currentWeek: 5 }), prior, now);
  assert.ok(digest);
  assert.equal(digest.weekAdvanced, true);
  assert.equal(digest.fromWeek, 3);
  assert.equal(digest.toWeek, 5);
  assert.equal(digest.recordDelta.wins, 1);
  assert.equal(digest.recordDelta.losses, 0);
});

test("digest computes an honest win/loss delta since the last visit", () => {
  const now = 1_000_000_000_000;
  const prior = { timestamp: now - ABSENCE_THRESHOLD_MS - 1, year: 2026, week: 2, record: { wins: 0, losses: 2 } };
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
