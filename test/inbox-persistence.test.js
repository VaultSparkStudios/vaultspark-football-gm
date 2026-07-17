import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyNewsItem,
  getInboxSnapshot,
  getUnreadCount,
  inboxItemKey,
  inboxScopeFromDashboard,
  ingestNewsIntoInbox,
  resetInboxForTests,
  resolveInboxItem,
  syncInboxScope
} from "../public/lib/engagementFeatures.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const franchiseA = { franchiseId: "fa-2026-BUF", controlledTeamId: "BUF" };
const franchiseB = { franchiseId: "fa-2027-MIA", controlledTeamId: "MIA" };
const severeInjury = { id: "evt-1", type: "injury", headline: "QB out for season", week: 4, year: 2026 };

test("source-derived rehab clearance is an important inbox event", () => {
  assert.equal(classifyNewsItem({ type: "rehab-clearance", headline: "Player cleared rehab" }), "IMPORTANT");
});

test("inbox scope is stable per franchise and team", () => {
  assert.equal(inboxScopeFromDashboard(franchiseA), "fa-2026-buf");
  assert.notEqual(inboxScopeFromDashboard(franchiseA), inboxScopeFromDashboard(franchiseB));
  assert.equal(inboxItemKey(severeInjury), "id:evt-1");
});

test("priority inbox reconstructs idempotently after reload", () => {
  const storage = new MemoryStorage();
  resetInboxForTests();
  assert.equal(ingestNewsIntoInbox([severeInjury], { dashboard: franchiseA, storage, now: () => 100 }), 1);
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 1);
  resetInboxForTests();
  syncInboxScope(franchiseA, storage);
  assert.equal(getInboxSnapshot().items.length, 1);
  assert.equal(ingestNewsIntoInbox([severeInjury], { dashboard: franchiseA, storage, now: () => 200 }), 0);
  assert.equal(getInboxSnapshot().items.length, 1);
});

test("read and resolution state never leaks between franchises", () => {
  const storage = new MemoryStorage();
  resetInboxForTests();
  ingestNewsIntoInbox([severeInjury], { dashboard: franchiseA, storage, now: () => 100 });
  assert.equal(resolveInboxItem("id:evt-1", { storage, now: () => 120 }), true);
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 0);

  ingestNewsIntoInbox([{ ...severeInjury, id: "evt-2" }], { dashboard: franchiseB, storage, now: () => 200 });
  assert.equal(getInboxSnapshot().scope, "fa-2027-mia");
  assert.equal(getUnreadCount({ dashboard: franchiseB, storage }), 1);

  syncInboxScope(franchiseA, storage);
  assert.equal(getInboxSnapshot().items[0].resolvedAt, 120);
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 0);
});
