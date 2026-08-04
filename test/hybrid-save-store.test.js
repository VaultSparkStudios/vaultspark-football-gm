import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserSaveStore } from "../src/adapters/persistence/browserSaveStore.js";
import { createHybridBrowserSaveStore, IDB_MAX_BACKUPS } from "../src/adapters/persistence/hybridSaveStore.js";
import { applyArchiveRetention } from "../src/runtime/weekResultProjection.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); }
  };
}

// Minimal in-memory IndexedDB honoring exactly the surface the hybrid store
// uses (open → transaction → objectStore → put/get/delete, event callbacks).
function createFakeIndexedDB({ failWrites = false } = {}) {
  const records = new Map();
  const makeRequest = (executor) => {
    const request = {};
    queueMicrotask(() => {
      try {
        request.result = executor();
        request.onsuccess?.();
      } catch (error) {
        request.error = error;
        request.onerror?.();
      }
    });
    return request;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const tx = {};
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
      tx.objectStore = () => ({
        put: (record) => makeRequest(() => {
          if (failWrites) throw new Error("synthetic IndexedDB failure");
          records.set(record.slot, { ...record });
          return record.slot;
        }),
        get: (slot) => makeRequest(() => records.get(slot)),
        delete: (slot) => makeRequest(() => { records.delete(slot); })
      });
      return tx;
    }
  };
  return { records, open: () => makeRequest(() => db) };
}

const SNAPSHOT = {
  schemaVersion: 2,
  rngSeed: 7,
  currentYear: 2026,
  currentWeek: 3,
  phase: "regular-season",
  controlledTeamId: "BUF",
  seasonsSimulated: 0,
  league: { teams: [{ id: "BUF", abbrev: "BUF", name: "Buffalo" }], players: [] }
};

function withFakeIdb(fake, run) {
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, "indexedDB");
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = fake;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (hadOwn) globalThis.indexedDB = previous;
      else delete globalThis.indexedDB;
    });
}

test("hybrid store keeps bytes in IndexedDB and truth-meta in localStorage", async () => {
  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const store = createHybridBrowserSaveStore({ storage });
    assert.equal(store.isHighCapacity(), true);

    const saved = await store.saveSessionToSlot("primary", SNAPSHOT);
    assert.equal(saved.store, "idb");
    assert.ok(fake.records.has("primary"), "snapshot bytes live in IndexedDB");
    assert.equal(storage.getItem("vsfgm:save:primary"), null, "no byte payload in localStorage");

    const meta = JSON.parse(storage.getItem("vsfgm:meta:primary"));
    assert.equal(meta.store, "idb");
    assert.equal(meta.integrity.algo, "fnv1a32");
    assert.ok(meta.sizeBytes > 0);

    const slots = store.listSaveSlots();
    assert.equal(slots.length, 1);
    assert.equal(slots[0].meta.controlledTeamId, "BUF");
    assert.equal(slots[0].sizeBytes, meta.sizeBytes);

    const loaded = await store.loadSessionFromSlot("primary");
    assert.equal(loaded.currentWeek, 3);

    assert.equal(store.deleteSaveSlot("primary"), true);
    assert.equal(store.listSaveSlots().length, 0);
  });
});

test("legacy localStorage slot migrates copy-forward on load, verified before release", async () => {
  const storage = createMemoryStorage();
  const legacy = createBrowserSaveStore({ storage });
  await legacy.saveSessionToSlot("dynasty", SNAPSHOT);
  assert.ok(storage.getItem("vsfgm:save:dynasty"), "legacy bytes start in localStorage");

  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const store = createHybridBrowserSaveStore({ storage });
    const loaded = await store.loadSessionFromSlot("dynasty");
    assert.equal(loaded.controlledTeamId, "BUF");
    assert.ok(fake.records.has("dynasty"), "bytes copied forward to IndexedDB");
    assert.equal(storage.getItem("vsfgm:save:dynasty"), null, "localStorage bytes released only after verified copy");
    const meta = JSON.parse(storage.getItem("vsfgm:meta:dynasty"));
    assert.equal(meta.store, "idb");
    assert.ok(meta.migratedAt, "migration is receipted");

    const reloaded = await store.loadSessionFromSlot("dynasty");
    assert.equal(reloaded.currentYear, 2026, "post-migration loads come from IndexedDB");
  });
});

test("IndexedDB failure fails closed to the proven localStorage path", async () => {
  const fake = createFakeIndexedDB({ failWrites: true });
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const degradations = [];
    const store = createHybridBrowserSaveStore({ storage, onDegrade: (reason) => degradations.push(reason) });

    const saved = await store.saveSessionToSlot("primary", SNAPSHOT);
    assert.equal(saved.slot, "primary");
    assert.ok(storage.getItem("vsfgm:save:primary"), "fallback wrote bytes to localStorage");
    assert.equal(store.isHighCapacity(), false, "one failure permanently degrades the session");
    assert.equal(degradations.length, 1);

    const loaded = await store.loadSessionFromSlot("primary");
    assert.equal(loaded.currentWeek, 3);
  });
});

test("high-capacity rolling backups stay bounded by count", async () => {
  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    let tick = 0;
    const store = createHybridBrowserSaveStore({
      storage,
      now: () => `2026-03-06T12:00:${String(tick++).padStart(2, "0")}.000Z`
    });
    for (let index = 0; index < 5; index += 1) {
      await store.saveRollingBackup(SNAPSHOT, { reason: `r${index}`, year: 2026, week: index, phase: "regular-season", maxBackups: 3 });
    }
    const backups = store.listBackupSlots();
    assert.ok(backups.length <= 3, `expected ≤3 backups, saw ${backups.length}`);
    assert.ok(IDB_MAX_BACKUPS >= 6, "default high-capacity runway exceeds the localStorage default");
  });
});

test("archive retention honors the settings-derived drive-log window", () => {
  const makeLeague = (games, archiveSetting) => ({
    settings: archiveSetting == null ? {} : { archivePlayByPlayGames: archiveSetting },
    gameArchive: Array.from({ length: games }, (_, index) => ({
      gameId: `g${index}`,
      boxScore: { playByPlay: [{ play: index }] }
    }))
  });

  const defaultLeague = makeLeague(100, null);
  const defaultResult = applyArchiveRetention(defaultLeague);
  assert.equal(defaultResult.trimmed, 52, "default window still trims to 48 drive logs");

  const extendedLeague = makeLeague(100, 272);
  const extendedResult = applyArchiveRetention(extendedLeague);
  assert.equal(extendedResult.trimmed, 0, "extended window keeps every drive log");
  assert.ok(extendedLeague.gameArchive.every((entry) => entry.boxScore.playByPlay));
});
