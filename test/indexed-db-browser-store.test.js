/**
 * Tests for indexedDbBrowserStore (S68).
 *
 * IndexedDB is not available in Node.js, so we patch the global with a
 * minimal in-memory implementation before importing the module under test.
 *
 * All tests are wrapped in a describe() so the after() hook that restores
 * globalThis.indexedDB is scoped to this suite rather than the process.
 * With --test-isolation=none a top-level after() fires only after every test
 * in every file completes, which would leave the mock IDB installed for the
 * rest of the shard (including local-api-runtime.test.js which now
 * auto-detects IDB).
 */
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";

// ── In-memory IndexedDB mock ──────────────────────────────────────────────────

function createMockIndexedDb() {
  const stores = new Map(); // dbName -> Map<slot, record>

  function makeObjectStore(data, tx) {
    return {
      put(record) {
        const req = {};
        Promise.resolve().then(() => {
          data.set(record.slot, record);
          req.result = record;
          req.onsuccess?.();
          tx?.oncomplete?.();
        });
        return req;
      },
      get(slot) {
        const req = {};
        Promise.resolve().then(() => {
          req.result = data.get(slot) ?? undefined;
          req.onsuccess?.();
          tx?.oncomplete?.();
        });
        return req;
      },
      delete(slot) {
        const req = {};
        Promise.resolve().then(() => {
          data.delete(slot);
          req.result = undefined;
          req.onsuccess?.();
          tx?.oncomplete?.();
        });
        return req;
      },
      getAll() {
        const req = {};
        Promise.resolve().then(() => {
          req.result = [...data.values()];
          req.onsuccess?.();
          tx?.oncomplete?.();
        });
        return req;
      }
    };
  }

  return {
    open(name, _version) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      const req  = {};
      Promise.resolve().then(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          transaction(_storeName, _mode) {
            const tx = { oncomplete: null, onerror: null, onabort: null };
            tx.objectStore = () => makeObjectStore(data, tx);
            return tx;
          }
        };
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    }
  };
}

// Install mock before the module loads; save the original so after() can
// restore it for sibling test files running in the same process.
const _origIndexedDB = globalThis.indexedDB;
globalThis.indexedDB = createMockIndexedDb();

// ── Import module under test ──────────────────────────────────────────────────

const { createIndexedDbBrowserStore, migrateLocalStorageToIndexedDb } = await import(
  "../src/adapters/persistence/indexedDbBrowserStore.js"
);

// ── Helper snapshot ───────────────────────────────────────────────────────────

function makeSnapshot(overrides = {}) {
  return {
    schemaVersion:      2,
    rngSeed:            42,
    currentYear:        2026,
    currentWeek:        4,
    phase:              "regular-season",
    controlledTeamId:   "BUF",
    controlledTeamName: "Buffalo Bills",
    seasonsSimulated:   1,
    league: {
      teams: [{ id: "BUF", abbrev: "BUF", name: "Buffalo Bills" }],
      players: []
    },
    ...overrides
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("indexedDbBrowserStore", () => {
  after(() => {
    // Restore the original so --test-isolation=none doesn't expose the mock
    // IDB to sibling files (e.g. local-api-runtime.test.js, which now
    // auto-detects IDB via isIndexedDbAvailable()).
    globalThis.indexedDB = _origIndexedDB;
  });

  test("indexedDbBrowserStore: save and load roundtrip", async () => {
    const store    = createIndexedDbBrowserStore();
    const snapshot = makeSnapshot({ currentWeek: 7 });

    const saved = await store.saveSessionToSlot("test-save", snapshot);
    assert.equal(saved.slot, "test-save");
    assert.ok(saved.savedAt);

    const loaded = await store.loadSessionFromSlot("test-save");
    assert.ok(loaded, "expected a loaded snapshot");
    assert.equal(loaded.currentWeek, 7);
    assert.equal(loaded.controlledTeamId, "BUF");
  });

  test("indexedDbBrowserStore: listSaveSlots returns saved slots", async () => {
    const store = createIndexedDbBrowserStore();
    await store.saveSessionToSlot("franchise-a", makeSnapshot({ currentWeek: 1 }));
    await store.saveSessionToSlot("franchise-b", makeSnapshot({ currentWeek: 2 }));

    const slots = await store.listSaveSlots();
    const names = slots.map((s) => s.slot);
    assert.ok(names.includes("franchise-a"), `expected franchise-a in ${JSON.stringify(names)}`);
    assert.ok(names.includes("franchise-b"), `expected franchise-b in ${JSON.stringify(names)}`);
  });

  test("indexedDbBrowserStore: deleteSaveSlot removes the slot", async () => {
    const store = createIndexedDbBrowserStore();
    await store.saveSessionToSlot("to-delete", makeSnapshot());

    const deleted = await store.deleteSaveSlot("to-delete");
    assert.equal(deleted, true);

    const loaded = await store.loadSessionFromSlot("to-delete");
    assert.equal(loaded, null);
  });

  test("indexedDbBrowserStore: listSaveSlots excludes backup slots", async () => {
    const store = createIndexedDbBrowserStore({ backupPrefix: "auto-" });
    await store.saveSessionToSlot("primary", makeSnapshot({ currentWeek: 3 }));
    await store.saveSessionToSlot("auto-checkpoint-y2026-w3-regular-season-ts", makeSnapshot());

    const saves = await store.listSaveSlots();
    const names = saves.map((s) => s.slot);
    assert.ok(names.includes("primary"), "primary slot should be in listSaveSlots");
    assert.ok(!names.some((n) => n.startsWith("auto-")), "backup slots must not appear in listSaveSlots");
  });

  test("indexedDbBrowserStore: listBackupSlots returns only backups", async () => {
    const store = createIndexedDbBrowserStore({ backupPrefix: "auto-" });
    await store.saveSessionToSlot("primary", makeSnapshot());
    await store.saveSessionToSlot("auto-ckpt", makeSnapshot());

    const backups = await store.listBackupSlots();
    const names   = backups.map((b) => b.slot);
    assert.ok(names.includes("auto-ckpt"), "backup slot should appear in listBackupSlots");
    assert.ok(!names.includes("primary"), "primary slot must not appear in listBackupSlots");
  });

  test("indexedDbBrowserStore: saveRollingBackup keeps count within maxBackups", async () => {
    let tick = 0;
    // Use a distinct prefix so the 2 "auto-" backup slots left by the
    // listBackupSlots tests (which are always newer) don't count toward
    // maxBackups and escape eviction, inflating the final count.
    // now() is called twice per saveRollingBackup: once for the slot-name stamp
    // and once inside saveSessionToSlot for savedAt. 8 rounds = 16 calls, so
    // zero-pad to two digits to keep valid ISO-8601 dates past call 9.
    const store = createIndexedDbBrowserStore({
      backupPrefix: "ckpt-",
      now: () => `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`
    });

    for (let i = 0; i < 8; i++) {
      await store.saveRollingBackup(makeSnapshot({ currentWeek: i }), {
        reason: "checkpoint", year: 2026, week: i, phase: "regular-season", maxBackups: 4
      });
    }

    const backups = await store.listBackupSlots();
    assert.ok(
      backups.length <= 4,
      `expected ≤4 backups after 8 saves, got ${backups.length}`
    );
  });

  test("indexedDbBrowserStore: loadSessionFromSlot returns null for missing slot", async () => {
    const store  = createIndexedDbBrowserStore();
    const result = await store.loadSessionFromSlot("no-such-slot");
    assert.equal(result, null);
  });

  test("indexedDbBrowserStore: deleteSaveSlot returns false for missing slot", async () => {
    const store  = createIndexedDbBrowserStore();
    const result = await store.deleteSaveSlot("ghost-slot");
    assert.equal(result, false);
  });

  test("indexedDbBrowserStore: slot records include snapshot metadata", async () => {
    const store = createIndexedDbBrowserStore();
    const snap  = makeSnapshot({ currentYear: 2029, currentWeek: 12 });
    await store.saveSessionToSlot("meta-test", snap);

    const slots = await store.listSaveSlots();
    const entry = slots.find((s) => s.slot === "meta-test");
    assert.ok(entry, "slot entry should exist");
    assert.equal(entry.meta?.currentYear,  2029);
    assert.equal(entry.meta?.currentWeek,  12);
    assert.equal(entry.meta?.controlledTeamId, "BUF");
  });

  test("migrateLocalStorageToIndexedDb: copies LS saves to IDB", async () => {
    // Populate a minimal localStorage mock
    const ls = new Map();
    const lsIface = {
      get length()   { return ls.size; },
      key(i)         { return [...ls.keys()][i] ?? null; },
      getItem(k)     { return ls.has(k) ? ls.get(k) : null; },
      setItem(k, v)  { ls.set(String(k), String(v)); },
      removeItem(k)  { ls.delete(String(k)); }
    };

    // Write a plain-JSON save to the LS mock (pre-compression format)
    const snap = makeSnapshot({ currentWeek: 5 });
    lsIface.setItem("vsfgm:save:migrated-slot", JSON.stringify(snap));
    lsIface.setItem("vsfgm:meta:migrated-slot", JSON.stringify({ updatedAt: "2026-01-01T00:00:00.000Z" }));

    // Fresh IDB store (separate call to get a clean instance)
    const idbStore = createIndexedDbBrowserStore();
    await migrateLocalStorageToIndexedDb(lsIface, idbStore);

    // Slot should now live in IDB
    const loaded = await idbStore.loadSessionFromSlot("migrated-slot");
    assert.ok(loaded, "migrated slot should be readable from IDB");
    assert.equal(loaded.currentWeek, 5);

    // Slot should be removed from localStorage after migration
    assert.equal(lsIface.getItem("vsfgm:save:migrated-slot"), null, "LS save key should be removed after migration");
    assert.equal(lsIface.getItem("vsfgm:meta:migrated-slot"), null, "LS meta key should be removed after migration");
  });
});
