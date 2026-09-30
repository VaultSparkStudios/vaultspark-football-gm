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
function createFakeIndexedDB(options = {}) {
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
    close() { fake.closes += 1; },
    transaction(_name, mode) {
      if (options.throwTransaction) throw new Error("synthetic transaction setup failure");
      const tx = {};
      let commit = () => {};
      let failed = false;
      tx.abort = () => { failed = true; tx.onabort?.(); };
      const makeTxRequest = (executor) => {
        const request = {};
        queueMicrotask(() => {
          try {
            request.result = executor();
            request.onsuccess?.();
            options.afterSuccess?.({ mode, tx, records });
            if (options.stallTransactions) return;
            queueMicrotask(() => {
              if (failed) return;
              if (options.abortWrites && mode === "readwrite") {
                tx.error = new Error("synthetic abort after request success");
                tx.abort();
              } else {
                commit();
                tx.oncomplete?.();
              }
            });
          } catch (error) {
            failed = true;
            request.error = error;
            request.onerror?.();
            tx.error = error;
            tx.onabort?.();
          }
        });
        return request;
      };
      tx.objectStore = () => ({
        put: (record) => makeTxRequest(() => {
          if (options.failWrites) throw new Error("synthetic IndexedDB failure");
          commit = () => records.set(record.slot, { ...record });
          return record.slot;
        }),
        get: (slot) => makeTxRequest(() => {
          if (options.failReads) throw new Error("synthetic read failure");
          return options.corruptReads ? { ...records.get(slot), data: "corrupt" } : records.get(slot);
        }),
        delete: (slot) => makeTxRequest(() => {
          if (options.failDeletes) throw new Error("synthetic delete failure");
          commit = () => records.delete(slot);
        })
      });
      return tx;
    }
  };
  const fake = {
    records, closes: 0,
    open: () => {
      if (!options.blockOpen && !options.stallOpen) return makeRequest(() => db);
      const request = {};
      fake.lateOpen = () => { request.result = db; request.onsuccess?.(); };
      if (options.blockOpen) queueMicrotask(() => request.onblocked?.());
      return request;
    }
  };
  return fake;
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
    assert.ok(fake.records.has(JSON.parse(storage.getItem("vsfgm:meta:primary")).recordKey), "snapshot bytes live in IndexedDB");
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

    assert.equal(await store.deleteSaveSlot("primary"), true);
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
    assert.ok(fake.records.has(JSON.parse(storage.getItem("vsfgm:meta:dynasty")).recordKey), "bytes copied forward to IndexedDB");
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

test("request success is not publication when the transaction later aborts", async () => {
  const storage = createMemoryStorage();
  const options = {
    abortWrites: true,
    afterSuccess: ({ mode }) => {
      if (mode === "readwrite") assert.equal(storage.getItem("vsfgm:meta:primary"), null);
    }
  };
  const fake = createFakeIndexedDB(options);
  await withFakeIdb(fake, async () => {
    const store = createHybridBrowserSaveStore({ storage });
    const saved = await store.saveSessionToSlot("primary", SNAPSHOT);
    assert.notEqual(saved.store, "idb", "aborted writes use the durable fallback");
    assert.equal(store.isHighCapacity(), false);
    assert.equal(fake.records.size, 0);
    assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
    assert.notEqual(JSON.parse(storage.getItem("vsfgm:meta:primary")).store, "idb");
  });
});

for (const mode of ["abortWrites", "corruptReads"]) {
  test(`migration preserves legacy bytes and metadata on ${mode}`, async () => {
    const storage = createMemoryStorage();
    await createBrowserSaveStore({ storage }).saveSessionToSlot("legacy", SNAPSHOT);
    const oldData = storage.getItem("vsfgm:save:legacy");
    const oldMeta = storage.getItem("vsfgm:meta:legacy");
    const fake = createFakeIndexedDB({ [mode]: true });
    await withFakeIdb(fake, async () => {
      const store = createHybridBrowserSaveStore({ storage });
      assert.equal((await store.loadSessionFromSlot("legacy")).currentWeek, 3);
      assert.equal(storage.getItem("vsfgm:save:legacy"), oldData);
      assert.equal(storage.getItem("vsfgm:meta:legacy"), oldMeta);
      assert.equal(store.isHighCapacity(), false);
      assert.equal(fake.records.size, 0);
    });
  });
}

test("failed metadata promotion and failed local fallback preserve the previous IDB version", async () => {
  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const store = createHybridBrowserSaveStore({ storage, now: () => "2026-09-30T00:00:00Z" });
    await store.saveSessionToSlot("primary", SNAPSHOT);
    const oldMeta = storage.getItem("vsfgm:meta:primary");
    const oldRecordKey = JSON.parse(oldMeta).recordKey;
    const oldRecord = fake.records.get(oldRecordKey);
    storage.setItemAsync = async () => { throw new Error("page storage denied"); };
    await assert.rejects(store.saveSessionToSlot("primary", { ...SNAPSHOT, currentWeek: 4 }), /page storage denied/);
    assert.equal(storage.getItem("vsfgm:meta:primary"), oldMeta);
    assert.deepEqual(fake.records.get(oldRecordKey), oldRecord);
    assert.equal(fake.records.size, 1, "failed version is cleaned up, last good version remains");
    assert.equal(store.isHighCapacity(), false);
    assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3, "write degradation does not suppress IDB reads");
  });
});

test("same-timestamp overwrites publish unique versions and clean old bytes only after ACK", async () => {
  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const store = createHybridBrowserSaveStore({ storage, now: () => "2026-09-30T00:00:00Z" });
    await store.saveSessionToSlot("primary", SNAPSHOT);
    const oldRecordKey = JSON.parse(storage.getItem("vsfgm:meta:primary")).recordKey;
    storage.setItemAsync = async (key, value) => {
      assert.ok(fake.records.has(oldRecordKey), "last good record retained until metadata commit");
      assert.equal(JSON.parse(storage.getItem(key)).recordKey, oldRecordKey);
      await Promise.resolve();
      storage.setItem(key, value);
    };
    storage.removeItemAsync = async (key) => { storage.removeItem(key); };
    await store.saveSessionToSlot("primary", { ...SNAPSHOT, currentWeek: 4 });
    const newRecordKey = JSON.parse(storage.getItem("vsfgm:meta:primary")).recordKey;
    assert.notEqual(oldRecordKey, newRecordKey);
    assert.equal(fake.records.size, 1);
    assert.equal(fake.records.has(oldRecordKey), false);
    assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 4);
  });
});

test("pre-versioned IndexedDB slots stay readable after another write fails", async () => {
  const options = {};
  const fake = createFakeIndexedDB(options);
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const store = createHybridBrowserSaveStore({ storage });
    await store.saveSessionToSlot("legacy-idb", SNAPSHOT);
    const meta = JSON.parse(storage.getItem("vsfgm:meta:legacy-idb"));
    fake.records.set("legacy-idb", { ...fake.records.get(meta.recordKey), slot: "legacy-idb" });
    fake.records.delete(meta.recordKey);
    delete meta.recordKey;
    storage.setItem("vsfgm:meta:legacy-idb", JSON.stringify(meta));
    options.failWrites = true;
    await store.saveSessionToSlot("another", { ...SNAPSHOT, currentWeek: 6 });
    assert.equal(store.isHighCapacity(), false);
    assert.equal((await store.loadSessionFromSlot("legacy-idb")).currentWeek, 3);
    assert.equal((await store.loadSessionFromSlot("another")).currentWeek, 6);
    await store.deleteSaveSlot("legacy-idb");
    assert.equal(fake.records.has("legacy-idb"), false);
  });
});

for (const mode of ["blockOpen", "stallOpen"]) {
  test(`${mode} is bounded and a late open connection is closed`, async () => {
    const fake = createFakeIndexedDB({ [mode]: true });
    await withFakeIdb(fake, async () => {
      const storage = createMemoryStorage();
      const store = createHybridBrowserSaveStore({ storage, idbTimeoutMs: 10 });
      await store.saveSessionToSlot("primary", SNAPSHOT);
      assert.equal(store.isHighCapacity(), false);
      assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
      fake.lateOpen();
      assert.equal(fake.closes, 1, "late open cannot leak a blocking database connection");
    });
  });
}

test("missing or unreadable IndexedDB bytes reject instead of pretending the slot is absent", async () => {
  const options = {};
  const fake = createFakeIndexedDB(options);
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const store = createHybridBrowserSaveStore({ storage });
    await store.saveSessionToSlot("primary", SNAPSHOT);
    options.failReads = true;
    await assert.rejects(store.loadSessionFromSlot("primary"), /synthetic read failure/);
    options.failReads = false;
    assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
    fake.records.clear();
    await assert.rejects(store.loadSessionFromSlot("primary"), /missing its IndexedDB record/);
  });
});

for (const mode of ["throwTransaction", "stallTransactions"]) {
  test(`${mode} closes the database and falls back without publishing an IDB save`, async () => {
    const fake = createFakeIndexedDB({ [mode]: true });
    await withFakeIdb(fake, async () => {
      const storage = createMemoryStorage();
      const store = createHybridBrowserSaveStore({ storage, idbTimeoutMs: 10 });
      await store.saveSessionToSlot("primary", SNAPSHOT);
      assert.equal(store.isHighCapacity(), false);
      assert.ok(fake.closes > 0);
      assert.equal(fake.records.size, 0);
      assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
    });
  });
}

test("failed rolling-backup overwrite retains its last committed version", async () => {
  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const store = createHybridBrowserSaveStore({ storage, now: () => "2026-09-30T00:00:00Z" });
    const saved = await store.saveRollingBackup(SNAPSHOT, { maxBackups: 1 });
    const before = storage.getItem(`vsfgm:meta:${saved.slot}`);
    storage.setItemAsync = async () => { throw new Error("storage denied"); };
    await assert.rejects(store.saveRollingBackup({ ...SNAPSHOT, currentWeek: 4 }, { maxBackups: 1 }), /storage denied/);
    assert.equal(storage.getItem(`vsfgm:meta:${saved.slot}`), before);
    assert.equal((await store.loadSessionFromSlot(saved.slot)).currentWeek, 3);
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("a delayed migration cannot republish an old snapshot over a newer save", { timeout: 2000 }, async () => {
  const storage = createMemoryStorage();
  await createBrowserSaveStore({ storage }).saveSessionToSlot("primary", SNAPSHOT);
  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const reached = deferred();
    const acknowledgment = deferred();
    storage.setItemAsync = async (key, value) => {
      if (key === "vsfgm:meta:primary" && JSON.parse(value).migratedAt) {
        reached.resolve();
        await acknowledgment.promise;
      }
      storage.setItem(key, value);
    };
    const store = createHybridBrowserSaveStore({ storage });
    const loading = store.loadSessionFromSlot("primary");
    await reached.promise;
    let saved = false;
    const saving = store.saveSessionToSlot("primary", { ...SNAPSHOT, currentWeek: 5 })
      .then((value) => { saved = true; return value; });
    await store.saveSessionToSlot("independent", SNAPSHOT);
    assert.equal(saved, false, "a different slot can commit while the newer same-slot save waits");
    acknowledgment.resolve();
    assert.equal((await loading).currentWeek, 3);
    await saving;
    assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 5);
    const meta = JSON.parse(storage.getItem("vsfgm:meta:primary"));
    assert.equal(meta.currentWeek, 5);
    assert.equal(meta.migratedAt, undefined);
    assert.equal(storage.getItem("vsfgm:save:primary"), null);
    assert.equal(fake.records.size, 2, "only the current record of each slot remains");
  });
});

test("failed old IDB publication and fallback cannot undo a queued newer save", { timeout: 2000 }, async () => {
  const fake = createFakeIndexedDB();
  await withFakeIdb(fake, async () => {
    const storage = createMemoryStorage();
    const store = createHybridBrowserSaveStore({ storage });
    await store.saveSessionToSlot("primary", SNAPSHOT);
    const reached = deferred();
    const acknowledgment = deferred();
    storage.setItemAsync = async (key, value) => {
      if (key === "vsfgm:meta:primary" && JSON.parse(value).currentWeek === 4) {
        reached.resolve();
        await acknowledgment.promise;
        throw new Error("old metadata denied");
      }
      storage.setItem(key, value);
    };
    const older = assert.rejects(store.saveSessionToSlot("primary", { ...SNAPSHOT, currentWeek: 4 }), /old metadata denied/);
    await reached.promise;
    let saved = false;
    const newer = store.saveSessionToSlot("primary", { ...SNAPSHOT, currentWeek: 5 })
      .then((value) => { saved = true; return value; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(saved, false);
    acknowledgment.resolve();
    await older;
    await newer;
    assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 5);
    assert.equal(JSON.parse(storage.getItem("vsfgm:meta:primary")).currentWeek, 5);
  });
});

for (const failedKey of ["meta", "save", "idb", "abort"]) {
  test(`failed ${failedKey} deletion preserves the authoritative IDB save and its index`, async () => {
    const options = {};
    const fake = createFakeIndexedDB(options);
    await withFakeIdb(fake, async () => {
      const storage = createMemoryStorage();
      const store = createHybridBrowserSaveStore({ storage });
      await store.saveSessionToSlot("primary", SNAPSHOT);
      const previousMeta = storage.getItem("vsfgm:meta:primary");
      const recordKey = JSON.parse(previousMeta).recordKey;
      const previousRecord = fake.records.get(recordKey);
      // Retained legacy bytes from an earlier cleanup must also survive an
      // unsuccessful delete, and must not replace the authoritative IDB copy.
      storage.setItem("vsfgm:save:primary", previousRecord.data);
      if (failedKey === "idb") options.failDeletes = true;
      if (failedKey === "abort") options.abortWrites = true;
      let fail = true;
      storage.removeItemAsync = async (key) => {
        assert.ok(fake.records.has(recordKey), "metadata ACK precedes authoritative byte deletion");
        if (fail && key === `vsfgm:${failedKey}:primary`) {
          fail = false;
          throw new Error("page deletion denied");
        }
        storage.removeItem(key);
      };
      await assert.rejects(store.deleteSaveSlot("primary"), /deletion denied|synthetic (delete failure|abort)/);
      assert.equal(storage.getItem("vsfgm:meta:primary"), previousMeta);
      assert.equal(storage.getItem("vsfgm:save:primary"), previousRecord.data);
      assert.deepEqual(fake.records.get(recordKey), previousRecord);
      assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
      options.failDeletes = false;
      options.abortWrites = false;
      assert.equal(await store.deleteSaveSlot("primary"), true);
      assert.equal(fake.records.has(recordKey), false);
      assert.equal(store.listSaveSlots().length, 0);
    });
  });
}
