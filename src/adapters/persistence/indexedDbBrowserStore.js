/**
 * IndexedDB Browser Store (S68)
 *
 * Wraps IndexedDB as the primary browser save layer with the same interface as
 * browserSaveStore, providing ~250 MB capacity vs the 5–10 MB localStorage ceiling.
 *
 * Wire-in: pass as the saveStore option to createLocalApiRuntime. Falls back
 * gracefully — isIndexedDbAvailable() returns false in private browsing and
 * Node.js environments, so callers can select the appropriate store.
 *
 * Migration: migrateLocalStorageToIndexedDb copies existing localStorage saves
 * into IDB and removes them so in-progress franchises carry over silently.
 *
 * List methods return Promises. Call sites that already use `await` work
 * transparently; `await someArray` also resolves without error for callers
 * that have not yet been updated.
 */

import { decodeSnapshot, encodeSnapshot } from "./snapshotCodec.js";
import {
  buildIntegrityStamp,
  buildSlotRecord,
  extractSnapshotMeta,
  getDefaultBackupPrefix,
  isBackupSlot,
  safeSlotName,
  verifyIntegrityStamp
} from "./saveStoreShared.js";
import { assertSnapshotCompatibility } from "../../runtime/snapshotMigration.js";
import { isIndexedDbAvailable } from "./indexedDbSaveStore.js";

export { isIndexedDbAvailable };

const DB_NAME    = "vsfgm_saves_idb";
const DB_VERSION = 2; // v2: adds meta + integrity fields

// ── IDB helpers ───────────────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains("saves")) {
        db.createObjectStore("saves", { keyPath: "slot" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

function idbRun(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx    = db.transaction("saves", mode);
        const store = tx.objectStore("saves");
        const req   = fn(store);
        let result;
        req.onsuccess = () => { result = req.result; };
        req.onerror   = () => reject(req.error ?? new Error("IDB request failed"));
        tx.oncomplete = () => resolve(result);
        tx.onerror    = () => reject(tx.error   ?? new Error("IDB transaction failed"));
        tx.onabort    = () => reject(new Error("IDB transaction aborted"));
      })
  );
}

function idbPut(record)  { return idbRun("readwrite", (s) => s.put(record)); }
function idbGet(slot)    { return idbRun("readonly",  (s) => s.get(slot));   }
function idbDel(slot)    { return idbRun("readwrite", (s) => s.delete(slot)); }

function idbGetAll() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx  = db.transaction("saves", "readonly");
        const req = tx.objectStore("saves").getAll();
        let result;
        req.onsuccess = () => { result = req.result; };
        req.onerror   = () => reject(req.error ?? new Error("IDB request failed"));
        tx.oncomplete = () => resolve(result);
        tx.onerror    = () => reject(tx.error   ?? new Error("IDB transaction failed"));
        tx.onabort    = () => reject(new Error("IDB transaction aborted"));
      })
  );
}

// ── Store factory ─────────────────────────────────────────────────────────────

export function createIndexedDbBrowserStore({
  backupPrefix = getDefaultBackupPrefix(),
  now = () => new Date().toISOString()
} = {}) {
  async function listAll() {
    const records = await idbGetAll();
    return records.sort(
      (a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime()
    );
  }

  async function listSaveSlots() {
    const records = await listAll();
    return records
      .filter((r) => !isBackupSlot(r.slot, backupPrefix))
      .map((r) =>
        buildSlotRecord({ slot: r.slot, updatedAt: r.savedAt || now(), sizeBytes: r.size || 0, meta: r.meta || null })
      );
  }

  async function listBackupSlots() {
    const records = await listAll();
    return records
      .filter((r) => isBackupSlot(r.slot, backupPrefix))
      .map((r) =>
        buildSlotRecord({ slot: r.slot, updatedAt: r.savedAt || now(), sizeBytes: r.size || 0, meta: r.meta || null })
      );
  }

  async function saveSessionToSlot(slot, snapshot) {
    assertSnapshotCompatibility(snapshot);
    const safe       = safeSlotName(slot);
    const savedAt    = now();
    const serialized = await encodeSnapshot(snapshot);
    const meta       = extractSnapshotMeta(snapshot);
    const integrity  = buildIntegrityStamp(serialized);
    await idbPut({ slot: safe, data: serialized, savedAt, size: serialized.length, meta, integrity });
    return { slot: safe, savedAt, size: serialized.length };
  }

  async function loadSessionFromSlot(slot) {
    const record = await idbGet(safeSlotName(slot));
    if (!record) return null;
    if (!verifyIntegrityStamp(record.data, record.integrity || null)) {
      throw new Error(
        `Save slot "${safeSlotName(slot)}" failed integrity verification — the stored data is corrupt. ` +
          "Restore from a rolling backup (Settings → Saves → Backups)."
      );
    }
    const snapshot = await decodeSnapshot(record.data);
    assertSnapshotCompatibility(snapshot);
    return snapshot;
  }

  async function deleteSaveSlot(slot) {
    const safe     = safeSlotName(slot);
    const existing = await idbGet(safe);
    if (!existing) return false;
    await idbDel(safe);
    return true;
  }

  async function saveRollingBackup(snapshot, {
    reason         = "checkpoint",
    year           = 0,
    week           = 0,
    phase          = "unknown",
    maxBackups     = 6,
    maxBackupBytes = 2 * 1024 * 1024
  } = {}) {
    const stamp = now().replace(/[:.]/g, "-");
    const slot  = safeSlotName(`${backupPrefix}${reason}-y${year}-w${week}-${phase}-${stamp}`);

    // Count-based eviction: drop oldest backup(s) before writing the new one
    let backups = await listBackupSlots();
    while (backups.length >= maxBackups) {
      await idbDel(safeSlotName(backups[backups.length - 1].slot));
      backups = backups.slice(0, -1);
    }

    const saved = await saveSessionToSlot(slot, snapshot);

    // Byte-budget enforcement — always keep the slot just written
    backups = await listBackupSlots();
    let totalBytes = backups.reduce((s, b) => s + (b.sizeBytes || 0), 0);
    for (const old of backups.slice().reverse()) {
      if (totalBytes <= maxBackupBytes) break;
      if (safeSlotName(old.slot) === slot) continue;
      totalBytes -= old.sizeBytes || 0;
      await idbDel(safeSlotName(old.slot));
    }

    return saved;
  }

  return {
    kind: "indexeddb",
    listSaveSlots,
    listBackupSlots,
    saveSessionToSlot,
    loadSessionFromSlot,
    deleteSaveSlot,
    saveRollingBackup,

    async storageEstimate() {
      if (!navigator?.storage?.estimate) return null;
      const { usage, quota } = await navigator.storage.estimate();
      return {
        usedMb:  (usage  / 1_048_576).toFixed(1),
        quotaMb: (quota  / 1_048_576).toFixed(1),
        pct:     Math.round((usage / quota) * 100)
      };
    }
  };
}

// ── localStorage → IndexedDB migration ───────────────────────────────────────

/**
 * One-time migration: copies vsfgm localStorage saves into IndexedDB, then
 * removes them from localStorage so the 5–10 MB ceiling no longer applies.
 *
 * Safe to call multiple times — migrated slots are absent from localStorage, so
 * the loop is a no-op after the first run.
 */
export async function migrateLocalStorageToIndexedDb(storage, idbStore) {
  if (!storage || typeof storage.length !== "number") return;
  const savePrefix = "vsfgm:save:";
  const metaPrefix = "vsfgm:meta:";

  const saveKeys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(savePrefix)) saveKeys.push(key);
  }

  for (const key of saveKeys) {
    const slot = key.slice(savePrefix.length);
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const snapshot = await decodeSnapshot(raw);
      await idbStore.saveSessionToSlot(slot, snapshot);
      // Remove from localStorage only after successful IDB write
      storage.removeItem(key);
      const metaKey = `${metaPrefix}${slot}`;
      if (storage.getItem(metaKey) !== null) storage.removeItem(metaKey);
    } catch {
      // Leave the slot in localStorage — it remains usable as a fallback
    }
  }
}
