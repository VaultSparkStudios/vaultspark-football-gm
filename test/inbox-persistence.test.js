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

test("an id-only damaged cache cannot suppress a fresh critical source message", () => {
  const storage = new MemoryStorage();
  const scope = inboxScopeFromDashboard(franchiseA);
  storage.setItem(`fa-inbox-v1:${scope}`, JSON.stringify({ version: 1, scope, items: [{ id: "evt-1" }] }));
  resetInboxForTests();
  syncInboxScope(franchiseA, storage);
  assert.deepEqual(getInboxSnapshot().items, []);
  assert.equal(ingestNewsIntoInbox([severeInjury], { dashboard: franchiseA, storage, now: () => 100 }), 1);
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 1);
  assert.equal(getInboxSnapshot().items[0].headline, severeInjury.headline);
  assert.equal(resolveInboxItem("id:evt-1", { storage, now: () => 120 }), true);
  resetInboxForTests();
  syncInboxScope(franchiseA, storage);
  assert.equal(getInboxSnapshot().items[0].resolvedAt, 120);
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

function cachedInbox(storage, items, lastSeen = 0, dashboard = franchiseA) {
  const scope = inboxScopeFromDashboard(dashboard);
  storage.setItem(`fa-inbox-v1:${scope}`, JSON.stringify({ version: 1, scope, items, lastSeen }));
}

test("mixed damaged Inbox rows recover without losing valid read and resolved history", () => {
  const storage = new MemoryStorage();
  const valid = { ...severeInjury, receivedAt: 100, resolvedAt: 120, quote: "We will adapt.", tier: "CRITICAL" };
  cachedInbox(storage, [null, [], "bad", 4, true, {}, valid, { ...valid, inboxKey: "forged-duplicate" }], 110);
  resetInboxForTests();
  assert.doesNotThrow(() => syncInboxScope(franchiseA, storage));
  const snapshot = getInboxSnapshot();
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.lastSeen, 110);
  assert.equal(snapshot.items[0].id, "evt-1");
  assert.equal(snapshot.items[0].quote, valid.quote);
  assert.equal(snapshot.items[0].resolvedAt, 120);
  assert.equal(snapshot.items[0].inboxKey, "id:evt-1");
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 0);
  // Source replay must not reopen a resolved message after cache repair.
  assert.equal(ingestNewsIntoInbox([severeInjury], { dashboard: franchiseA, storage, now: () => 200 }), 0);
  assert.equal(getInboxSnapshot().items[0].resolvedAt, 120);
});

test("malformed presentation, priority and timestamps cannot poison Inbox rendering or unread state", () => {
  const storage = new MemoryStorage();
  cachedInbox(storage, [
    { ...severeInjury, quote: { private: "bad shape" }, tier: {}, receivedAt: 100, resolvedAt: -1, inboxKey: "wrong" },
    { id: "not-critical", type: "news", headline: "League notes", tier: "CRITICAL", receivedAt: "bad", resolvedAt: "bad", detail: [], quote: 8 },
    { id: "bad-id", type: "trade", headline: {}, detail: { text: "invalid" }, receivedAt: -50 }
  ], "not-a-timestamp");
  resetInboxForTests();
  syncInboxScope(franchiseA, storage);
  const { items, lastSeen } = getInboxSnapshot();
  assert.equal(lastSeen, 0);
  assert.equal(items[0].tier, "CRITICAL");
  assert.equal(items[0].inboxKey, "id:evt-1");
  assert.equal(items[0].resolvedAt, null);
  assert.equal(items[0].quote.slice(0, 100), "");
  assert.equal(items[1].tier.toLowerCase(), "flavor");
  assert.equal(items[1].receivedAt, 0);
  assert.equal(items[1].resolvedAt, null);
  assert.equal(items[1].detail, "");
  assert.equal(items[2].headline, "");
  assert.equal(items[2].receivedAt, 0);
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 1);
});

test("repair admits fresh authoritative news and keeps action resolution and scope isolation", () => {
  const storage = new MemoryStorage();
  cachedInbox(storage, [null]);
  resetInboxForTests();
  const fresh = { ...severeInjury, id: "fresh", quote: 42, tier: {}, resolvedAt: 900 };
  assert.equal(ingestNewsIntoInbox([null, [], "bad", fresh], { dashboard: franchiseA, storage, now: () => 200 }), 1);
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 1);
  assert.equal(getInboxSnapshot().items[0].resolvedAt, null);
  assert.equal(getInboxSnapshot().items[0].quote, "");
  assert.equal(resolveInboxItem("id:fresh", { storage, now: () => 220 }), true);
  resetInboxForTests();
  syncInboxScope(franchiseA, storage);
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 0);
  assert.equal(getInboxSnapshot().items[0].resolvedAt, 220);
  assert.equal(getUnreadCount({ dashboard: franchiseB, storage }), 0);
  assert.equal(getInboxSnapshot().items.length, 0);
  assert.doesNotThrow(() => ingestNewsIntoInbox({ unexpected: "shape" }, { dashboard: franchiseB, storage }));
});

test("nonfinite cache timestamps and invalid source IDs stay safe without hiding the next real event", () => {
  const storage = new MemoryStorage();
  const scope = inboxScopeFromDashboard(franchiseA);
  storage.setItem(`fa-inbox-v1:${scope}`, `{"version":1,"scope":"${scope}","lastSeen":1e400,"items":[{"id":"old","type":"trade","receivedAt":1e400,"resolvedAt":1e400}]}`);
  resetInboxForTests();
  syncInboxScope(franchiseA, storage);
  assert.equal(getInboxSnapshot().lastSeen, 0);
  assert.equal(getInboxSnapshot().items[0].receivedAt, 0);
  assert.equal(getInboxSnapshot().items[0].resolvedAt, null);
  assert.equal(ingestNewsIntoInbox([{ id: {}, type: "injury", headline: "Severe injury", quote: [] }], { dashboard: franchiseA, storage, now: () => 300 }), 1);
  const fresh = getInboxSnapshot().items[0];
  assert.equal("id" in fresh, false);
  assert.equal(fresh.inboxKey, "event:injury:?:?:Severe injury");
  assert.equal(getUnreadCount({ dashboard: franchiseA, storage }), 1);
});
