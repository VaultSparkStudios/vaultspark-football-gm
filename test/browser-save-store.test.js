import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserSaveStore } from "../src/adapters/persistence/browserSaveStore.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    }
  };
}

function createQuotaStorage(limitBytes) {
  const data = new Map();
  const usedBytes = () => [...data.values()].reduce((sum, value) => sum + String(value).length, 0);
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      const safeKey = String(key);
      const safeValue = String(value);
      const previous = data.get(safeKey);
      const nextBytes = usedBytes() - (previous ? previous.length : 0) + safeValue.length;
      if (nextBytes > limitBytes) {
        const error = new Error("Quota exceeded");
        error.name = "QuotaExceededError";
        error.code = 22;
        throw error;
      }
      data.set(safeKey, safeValue);
    },
    removeItem(key) {
      data.delete(String(key));
    }
  };
}

test("browser save store supports save, list, load, backup pruning, and delete", async () => {
  const storage = createMemoryStorage();
  let tick = 0;
  const store = createBrowserSaveStore({
    storage,
    now: () => `2026-03-06T12:00:${String(tick++).padStart(2, "0")}.000Z`
  });

  const snapshot = {
    schemaVersion: 2,
    rngSeed: 99,
    currentYear: 2026,
    currentWeek: 4,
    phase: "regular-season",
    controlledTeamId: "BUF",
    seasonsSimulated: 1,
    league: { teams: [{ id: "BUF", abbrev: "AGU", name: "Austin Guardians" }], players: [] }
  };

  const saved = await store.saveSessionToSlot("primary", snapshot);
  assert.equal(saved.slot, "primary");
  assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 4);

  const saves = store.listSaveSlots();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].meta.controlledTeamName, "Austin Guardians");
  assert.equal(saves[0].meta.controlledTeamAbbrev, "AGU");

  storage.setItem("vsfgm:save:primary", "{ definitely-not-json");
  const metaOnlySaves = store.listSaveSlots();
  assert.equal(metaOnlySaves[0].meta.controlledTeamName, "Austin Guardians");
  assert.equal(metaOnlySaves[0].meta.controlledTeamAbbrev, "AGU");

  await store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 4, phase: "regular", maxBackups: 2 });
  await store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 5, phase: "regular", maxBackups: 2 });
  await store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 6, phase: "regular", maxBackups: 2 });
  assert.equal(store.listSaveSlots().length, 1);
  assert.equal(store.listBackupSlots().length, 2);

  assert.equal(await store.deleteSaveSlot("primary"), true);
  assert.equal(await store.loadSessionFromSlot("primary"), null);
});

test("browser save store prunes old backups before failing on quota", async () => {
  // Budget fits two slot records including the S14 integrity stamp (~65 bytes each).
  const storage = createQuotaStorage(1400);
  let tick = 0;
  const store = createBrowserSaveStore({
    storage,
    now: () => `2026-03-06T12:01:${String(tick++).padStart(2, "0")}.000Z`
  });

  const snapshot = {
    schemaVersion: 2,
    rngSeed: 99,
    currentYear: 2026,
    currentWeek: 4,
    phase: "regular-season",
    controlledTeamId: "BUF",
    seasonsSimulated: 1,
    notes: "x".repeat(140),
    league: { teams: [{ id: "BUF", abbrev: "AGU", name: "Austin Guardians" }], players: [] }
  };

  await store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 4, phase: "regular", maxBackups: 2 });
  await store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 5, phase: "regular", maxBackups: 2 });
  await store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 6, phase: "regular", maxBackups: 2 });

  const backups = store.listBackupSlots();
  assert.equal(backups.length, 2);
  assert.ok(backups.some((entry) => entry.slot.includes("w6")));
});

test("browser save store surfaces a helpful quota message when storage cannot recover", async () => {
  const storage = createQuotaStorage(80);
  const store = createBrowserSaveStore({ storage });
  const snapshot = {
    schemaVersion: 2,
    rngSeed: 99,
    currentYear: 2026,
    currentWeek: 4,
    phase: "regular-season",
    controlledTeamId: "BUF",
    notes: "x".repeat(140),
    league: { teams: [{ id: "BUF", abbrev: "AGU", name: "Austin Guardians" }], players: [] }
  };

  await assert.rejects(() => store.saveSessionToSlot("primary", snapshot), /Browser storage is full/);
});

const DURABLE_SNAPSHOT = {
  schemaVersion: 2, rngSeed: 7, currentYear: 2026, currentWeek: 3,
  phase: "regular-season", controlledTeamId: "BUF",
  league: { teams: [{ id: "BUF", name: "Buffalo" }], players: [] }
};

for (const failedKey of ["save", "meta"]) {
  for (const asynchronous of [false, true]) {
    test(`failed ${failedKey} overwrite preserves original bytes and metadata (${asynchronous ? "acknowledged" : "local"})`, async () => {
      const storage = createMemoryStorage();
      const set = storage.setItem.bind(storage);
      const store = createBrowserSaveStore({ storage });
      await store.saveSessionToSlot("primary", DURABLE_SNAPSHOT);
      const oldData = storage.getItem("vsfgm:save:primary");
      const oldMeta = storage.getItem("vsfgm:meta:primary");
      let fail = true;
      const write = (key, value) => {
        if (fail && key === `vsfgm:${failedKey}:primary`) {
          fail = false;
          throw new Error(`rejected ${failedKey} write`);
        }
        set(key, value);
      };
      if (asynchronous) {
        storage.setItemAsync = async (key, value) => { await Promise.resolve(); write(key, value); };
        storage.removeItemAsync = async (key) => { storage.removeItem(key); };
        storage.setItem = () => { throw new Error("unacknowledged write"); };
      } else storage.setItem = write;
      await assert.rejects(store.saveSessionToSlot("primary", { ...DURABLE_SNAPSHOT, currentWeek: 4 }), /rejected/);
      assert.equal(storage.getItem("vsfgm:save:primary"), oldData);
      assert.equal(storage.getItem("vsfgm:meta:primary"), oldMeta);
      assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
      await store.saveSessionToSlot("primary", { ...DURABLE_SNAPSHOT, currentWeek: 5 });
      assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 5);
    });
  }
}

test("failed first metadata write removes only the new partial slot", async () => {
  const storage = createMemoryStorage();
  const set = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key.startsWith("vsfgm:meta:")) throw new Error("metadata denied");
    set(key, value);
  };
  const store = createBrowserSaveStore({ storage });
  await assert.rejects(store.saveSessionToSlot("new", DURABLE_SNAPSHOT), /metadata denied/);
  assert.equal(storage.length, 0);
});

test("quota retry preserves an overwritten slot and awaits backup eviction", async () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  await store.saveSessionToSlot("primary", DURABLE_SNAPSHOT);
  const backup = await store.saveRollingBackup(DURABLE_SNAPSHOT);
  const oldData = storage.getItem("vsfgm:save:primary");
  let quota = true;
  storage.setItemAsync = async (key, value) => {
    if (quota && key === "vsfgm:meta:primary") {
      const error = new Error("quota"); error.name = "QuotaExceededError"; throw error;
    }
    storage.setItem(key, value);
  };
  storage.removeItemAsync = async (key) => {
    await Promise.resolve();
    assert.equal(storage.getItem("vsfgm:save:primary"), oldData, "rollback finishes before any backup eviction");
    storage.removeItem(key);
    if (key === `vsfgm:meta:${backup.slot}`) quota = false;
  };
  await store.saveSessionToSlot("primary", { ...DURABLE_SNAPSHOT, currentWeek: 4 });
  assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 4);
  assert.equal(store.listBackupSlots().length, 0);
});

test("unrecoverable overwrite quota leaves the old save loadable", async () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  await store.saveSessionToSlot("primary", DURABLE_SNAPSHOT);
  const original = storage.getItem("vsfgm:save:primary");
  storage.setItem = () => { const error = new Error("quota"); error.name = "QuotaExceededError"; throw error; };
  await assert.rejects(store.saveSessionToSlot("primary", { ...DURABLE_SNAPSHOT, currentWeek: 4 }), /Browser storage is full/);
  assert.equal(storage.getItem("vsfgm:save:primary"), original);
  assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
});

test("failed rolling-backup overwrite does not prune its previous copy", async () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage, now: () => "2026-09-30T00:00:00Z" });
  const saved = await store.saveRollingBackup(DURABLE_SNAPSHOT, { maxBackups: 1 });
  const before = storage.getItem(`vsfgm:meta:${saved.slot}`);
  storage.setItemAsync = async () => { throw new Error("storage denied"); };
  await assert.rejects(store.saveRollingBackup({ ...DURABLE_SNAPSHOT, currentWeek: 4 }, { maxBackups: 1 }), /storage denied/);
  assert.equal(storage.getItem(`vsfgm:meta:${saved.slot}`), before);
  assert.equal((await store.loadSessionFromSlot(saved.slot)).currentWeek, 3);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("an older failed overwrite settles before a newer save or load can enter that slot", { timeout: 2000 }, async () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  await store.saveSessionToSlot("primary", DURABLE_SNAPSHOT);
  const reached = deferred();
  const acknowledgment = deferred();
  storage.setItemAsync = async (key, value) => {
    if (key === "vsfgm:meta:primary" && JSON.parse(value).currentWeek === 4) {
      reached.resolve();
      await acknowledgment.promise;
    }
    storage.setItem(key, value);
  };
  const older = store.saveSessionToSlot("primary", { ...DURABLE_SNAPSHOT, currentWeek: 4 });
  const rejected = assert.rejects(older, /older metadata denied/);
  await reached.promise;
  let newerFinished = false;
  let loadFinished = false;
  const newer = store.saveSessionToSlot("primary", { ...DURABLE_SNAPSHOT, currentWeek: 5 })
    .then((value) => { newerFinished = true; return value; });
  const loading = store.loadSessionFromSlot("primary").then((value) => { loadFinished = true; return value; });
  await store.saveSessionToSlot("independent", DURABLE_SNAPSHOT);
  assert.equal(newerFinished, false, "other slots run while this slot waits for acknowledgment");
  assert.equal(loadFinished, false, "reads cannot observe the partial payload/meta pair");
  acknowledgment.reject(new Error("older metadata denied"));
  await rejected;
  await newer;
  assert.equal((await loading).currentWeek, 5);
  assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 5, "late rollback cannot erase the acknowledged newer save");
});

test("deletion queues behind an in-flight save and leaves no resurrected slot", { timeout: 2000 }, async () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  await store.saveSessionToSlot("primary", DURABLE_SNAPSHOT);
  const reached = deferred();
  const acknowledgment = deferred();
  storage.setItemAsync = async (key, value) => {
    if (key === "vsfgm:meta:primary") { reached.resolve(); await acknowledgment.promise; }
    storage.setItem(key, value);
  };
  const saving = store.saveSessionToSlot("primary", { ...DURABLE_SNAPSHOT, currentWeek: 4 });
  await reached.promise;
  let deleted = false;
  const deletion = store.deleteSaveSlot("primary").then((value) => { deleted = true; return value; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deleted, false);
  acknowledgment.resolve();
  await saving;
  assert.equal(await deletion, true);
  assert.equal(await store.loadSessionFromSlot("primary"), null);
  assert.equal(storage.length, 0);
});

for (const failedKey of ["meta", "save"]) {
  for (const asynchronous of [false, true]) {
    test(`failed ${failedKey} deletion restores a loadable slot (${asynchronous ? "acknowledged" : "local"})`, async () => {
      const storage = createMemoryStorage();
      const store = createBrowserSaveStore({ storage });
      await store.saveSessionToSlot("primary", DURABLE_SNAPSHOT);
      const beforeData = storage.getItem("vsfgm:save:primary");
      const beforeMeta = storage.getItem("vsfgm:meta:primary");
      const remove = storage.removeItem.bind(storage);
      let fail = true;
      const rejectingRemove = (key) => {
        if (fail && key === `vsfgm:${failedKey}:primary`) {
          fail = false;
          throw new Error("deletion denied");
        }
        remove(key);
      };
      if (asynchronous) storage.removeItemAsync = async (key) => rejectingRemove(key);
      else storage.removeItem = rejectingRemove;
      await assert.rejects(store.deleteSaveSlot("primary"), /deletion denied/);
      assert.equal(storage.getItem("vsfgm:save:primary"), beforeData);
      assert.equal(storage.getItem("vsfgm:meta:primary"), beforeMeta);
      assert.equal((await store.loadSessionFromSlot("primary")).currentWeek, 3);
      assert.equal(await store.deleteSaveSlot("primary"), true, "failed delete releases its queue for a retry");
    });
  }
}

test("concurrent quota failures do not deadlock trying to evict each other's occupied backups", { timeout: 2000 }, async () => {
  const storage = createMemoryStorage();
  let tick = 0;
  const store = createBrowserSaveStore({ storage, now: () => `2026-09-30T00:00:0${tick++}Z` });
  const first = await store.saveRollingBackup(DURABLE_SNAPSHOT);
  const second = await store.saveRollingBackup(DURABLE_SNAPSHOT);
  const reached = deferred();
  let pending = 0;
  storage.setItemAsync = async (key, value) => {
    if (key.startsWith("vsfgm:meta:") && JSON.parse(value).currentWeek === 4) {
      if (++pending === 2) reached.resolve();
      await reached.promise;
      const error = new Error("quota"); error.name = "QuotaExceededError"; throw error;
    }
    storage.setItem(key, value);
  };
  const results = await Promise.allSettled([first, second].map(({ slot }) =>
    store.saveSessionToSlot(slot, { ...DURABLE_SNAPSHOT, currentWeek: 4 })));
  assert.ok(results.every((result) => result.status === "rejected" && /Browser storage is full/.test(result.reason.message)));
  assert.equal((await store.loadSessionFromSlot(first.slot)).currentWeek, 3);
  assert.equal((await store.loadSessionFromSlot(second.slot)).currentWeek, 3);
});
