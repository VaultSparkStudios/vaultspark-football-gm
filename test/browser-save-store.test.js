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

test("browser save store supports save, list, load, backup pruning, and delete", () => {
  const storage = createMemoryStorage();
  let tick = 0;
  const store = createBrowserSaveStore({
    storage,
    now: () => `2026-03-06T12:00:${String(tick++).padStart(2, "0")}.000Z`
  });

  const snapshot = {
    schemaVersion: 3,
    currentYear: 2026,
    currentWeek: 4,
    phase: "regular-season",
    controlledTeamId: "BUF",
    seasonsSimulated: 1,
    league: { teams: [{ id: "BUF", abbrev: "AGU", name: "Austin Guardians" }] }
  };

  const saved = store.saveSessionToSlot("primary", snapshot);
  assert.equal(saved.slot, "primary");
  assert.equal(store.loadSessionFromSlot("primary").currentWeek, 4);

  const saves = store.listSaveSlots();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].meta.controlledTeamName, "Austin Guardians");
  assert.equal(saves[0].meta.controlledTeamAbbrev, "AGU");

  storage.setItem("vsfgm:save:primary", "{ definitely-not-json");
  const metaOnlySaves = store.listSaveSlots();
  assert.equal(metaOnlySaves[0].meta.controlledTeamName, "Austin Guardians");
  assert.equal(metaOnlySaves[0].meta.controlledTeamAbbrev, "AGU");

  store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 4, phase: "regular", maxBackups: 2 });
  store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 5, phase: "regular", maxBackups: 2 });
  store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 6, phase: "regular", maxBackups: 2 });
  assert.equal(store.listSaveSlots().length, 1);
  assert.equal(store.listBackupSlots().length, 2);

  assert.equal(store.deleteSaveSlot("primary"), true);
  assert.equal(store.loadSessionFromSlot("primary"), null);
});

test("browser save store prunes old backups before failing on quota", () => {
  const storage = createQuotaStorage(1200);
  let tick = 0;
  const store = createBrowserSaveStore({
    storage,
    now: () => `2026-03-06T12:01:${String(tick++).padStart(2, "0")}.000Z`
  });

  const snapshot = {
    schemaVersion: 3,
    currentYear: 2026,
    currentWeek: 4,
    phase: "regular-season",
    controlledTeamId: "BUF",
    seasonsSimulated: 1,
    notes: "x".repeat(140),
    league: { teams: [{ id: "BUF", abbrev: "AGU", name: "Austin Guardians" }] }
  };

  store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 4, phase: "regular", maxBackups: 2 });
  store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 5, phase: "regular", maxBackups: 2 });
  store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week: 6, phase: "regular", maxBackups: 2 });

  const backups = store.listBackupSlots();
  assert.equal(backups.length, 2);
  assert.ok(backups.some((entry) => entry.slot.includes("w6")));
});

test("browser save store surfaces a helpful quota message when storage cannot recover", () => {
  const storage = createQuotaStorage(80);
  const store = createBrowserSaveStore({ storage });
  const snapshot = {
    schemaVersion: 3,
    currentYear: 2026,
    currentWeek: 4,
    phase: "regular-season",
    controlledTeamId: "BUF",
    notes: "x".repeat(140),
    league: { teams: [{ id: "BUF", abbrev: "AGU", name: "Austin Guardians" }] }
  };

  assert.throws(() => store.saveSessionToSlot("primary", snapshot), /Browser storage is full/);
});
