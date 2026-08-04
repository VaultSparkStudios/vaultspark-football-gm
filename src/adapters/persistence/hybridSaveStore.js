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
import { decodeSnapshot, encodeSnapshot } from "./snapshotCodec.js";
import { createBrowserSaveStore } from "./browserSaveStore.js";

/**
 * Hybrid browser save store (S70) — IndexedDB capacity, localStorage truth.
 *
 * Snapshot BYTES move to IndexedDB (~hundreds of MB of quota vs localStorage's
 * 5-10 MB ceiling); the small slot META records — including the integrity
 * stamp over the exact encoded bytes — stay in localStorage so slot listing
 * remains synchronous for the existing runtime call sites.
 *
 * Fail-closed: any IndexedDB failure permanently drops this session back to
 * the proven localStorage store for writes, and reads always fall back to a
 * legacy localStorage payload when one exists. Migration is per-slot
 * copy-forward: a legacy slot is copied to IndexedDB on load, VERIFIED by
 * readback against its integrity stamp, and only then released from
 * localStorage. Nothing is deleted before its copy has been proven.
 */

const IDB_NAME = "fa_saves_v2";
const IDB_VERSION = 1;
const IDB_STORE = "slots";

// With IndexedDB active the backup runway grows from an undo ledge to a real
// season-scale history, still bounded by count and bytes.
export const IDB_MAX_BACKUPS = 12;
export const IDB_MAX_BACKUP_BYTES = 64 * 1024 * 1024;

export function isIndexedDbUsable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "slot" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const request = run(tx.objectStore(IDB_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
      })
  );
}

export function createHybridBrowserSaveStore({
  storage,
  namespace = "vsfgm",
  backupPrefix = getDefaultBackupPrefix(),
  now = () => new Date().toISOString(),
  onDegrade = null
} = {}) {
  const base = createBrowserSaveStore({ storage, namespace, backupPrefix, now });
  const dataPrefix = `${namespace}:save:`;
  const metaPrefix = `${namespace}:meta:`;
  let idbHealthy = isIndexedDbUsable();

  function degrade(reason) {
    if (!idbHealthy) return;
    idbHealthy = false;
    try {
      if (typeof onDegrade === "function") onDegrade(reason);
    } catch {
      // The degradation itself must never throw.
    }
  }

  function metaKey(slot) {
    return `${metaPrefix}${safeSlotName(slot)}`;
  }

  function dataKey(slot) {
    return `${dataPrefix}${safeSlotName(slot)}`;
  }

  function readMeta(slot) {
    try {
      const raw = storage.getItem(metaKey(slot));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeMeta(slot, meta) {
    storage.setItem(metaKey(slot), JSON.stringify(meta));
  }

  function metaSlots() {
    const slots = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(metaPrefix)) slots.push(key.slice(metaPrefix.length));
    }
    return slots;
  }

  function listSaveSlots({ includeBackups = false } = {}) {
    const seen = new Set();
    const records = [];
    for (const slot of metaSlots()) {
      if (!includeBackups && isBackupSlot(slot, backupPrefix)) continue;
      const meta = readMeta(slot) || {};
      const legacyRaw = storage.getItem(dataKey(slot));
      if (meta.store !== "idb" && !legacyRaw) continue; // meta orphan
      seen.add(slot);
      records.push(
        buildSlotRecord({
          slot,
          updatedAt: meta.updatedAt || now(),
          sizeBytes: meta.store === "idb" ? Number(meta.sizeBytes) || 0 : (legacyRaw || "").length,
          meta,
          serializedSnapshot: meta.store === "idb" ? null : legacyRaw
        })
      );
    }
    // Legacy data rows written before any meta existed.
    for (const record of base.listSaveSlots({ includeBackups })) {
      if (!seen.has(safeSlotName(record.slot))) records.push(record);
    }
    return records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  function listBackupSlots() {
    return listSaveSlots({ includeBackups: true }).filter((entry) => isBackupSlot(entry.slot, backupPrefix));
  }

  function backupBytes() {
    let bytes = 0;
    for (const backup of listBackupSlots()) bytes += Number(backup.sizeBytes) || 0;
    return bytes;
  }

  function clearOldestBackups(count = 1, { exclude = [] } = {}) {
    const excluded = new Set((exclude || []).map((slot) => safeSlotName(slot)));
    const candidates = listBackupSlots()
      .filter((entry) => !excluded.has(safeSlotName(entry.slot)))
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    let removed = 0;
    for (const backup of candidates.slice(0, count)) {
      if (deleteSaveSlot(backup.slot)) removed += 1;
    }
    return removed;
  }

  async function saveSessionToSlot(slot, snapshot) {
    if (!idbHealthy) return base.saveSessionToSlot(slot, snapshot);
    assertSnapshotCompatibility(snapshot);
    const safe = safeSlotName(slot);
    if (!safe) throw new Error("Invalid save slot name.");
    const serialized = await encodeSnapshot(snapshot);
    const updatedAt = now();
    try {
      await idbRequest("readwrite", (store) => store.put({ slot: safe, data: serialized, updatedAt }));
      writeMeta(safe, {
        ...(extractSnapshotMeta(snapshot) || {}),
        updatedAt,
        integrity: buildIntegrityStamp(serialized),
        store: "idb",
        sizeBytes: serialized.length
      });
      // The bytes now live in IndexedDB; any legacy localStorage copy is stale.
      storage.removeItem(dataKey(safe));
      return { slot: safe, key: `idb:${safe}`, store: "idb" };
    } catch (error) {
      degrade(error?.message || "IndexedDB write failed");
      return base.saveSessionToSlot(slot, snapshot);
    }
  }

  async function loadSessionFromSlot(slot) {
    const safe = safeSlotName(slot);
    const meta = readMeta(safe);
    if (meta?.store === "idb" && idbHealthy) {
      try {
        const record = await idbRequest("readonly", (store) => store.get(safe));
        if (record?.data != null) {
          if (!verifyIntegrityStamp(record.data, meta.integrity || null)) {
            throw new Error(
              `Save slot "${safe}" failed integrity verification — the stored data is corrupt. ` +
                "Restore from a rolling backup (Settings → Saves → Backups)."
            );
          }
          const snapshot = await decodeSnapshot(record.data);
          assertSnapshotCompatibility(snapshot);
          return snapshot;
        }
      } catch (error) {
        if (/integrity verification/.test(error?.message || "")) throw error;
        degrade(error?.message || "IndexedDB read failed");
      }
    }
    // Legacy localStorage payload (or fallback after degradation).
    const snapshot = await base.loadSessionFromSlot(slot);
    if (snapshot && idbHealthy) {
      // Copy-forward migration: prove the IndexedDB copy by readback against a
      // fresh integrity stamp BEFORE releasing the localStorage bytes.
      try {
        const serialized = await encodeSnapshot(snapshot);
        const stamp = buildIntegrityStamp(serialized);
        await idbRequest("readwrite", (store) => store.put({ slot: safe, data: serialized, updatedAt: now() }));
        const readback = await idbRequest("readonly", (store) => store.get(safe));
        if (readback?.data != null && verifyIntegrityStamp(readback.data, stamp)) {
          writeMeta(safe, {
            ...(extractSnapshotMeta(snapshot) || {}),
            updatedAt: readMeta(safe)?.updatedAt || now(),
            integrity: stamp,
            store: "idb",
            sizeBytes: serialized.length,
            migratedAt: now()
          });
          storage.removeItem(dataKey(safe));
        }
      } catch (error) {
        degrade(error?.message || "IndexedDB migration failed");
      }
    }
    return snapshot;
  }

  function deleteSaveSlot(slot) {
    const safe = safeSlotName(slot);
    const meta = readMeta(safe);
    const existedLegacy = storage.getItem(dataKey(safe)) != null;
    const existedIdb = meta?.store === "idb";
    storage.removeItem(dataKey(safe));
    storage.removeItem(metaKey(safe));
    if (existedIdb && idbHealthy) {
      // Sync signature at the call sites; the byte removal completes in the
      // background and a failure only leaves an orphan the next save sweeps.
      idbRequest("readwrite", (store) => store.delete(safe)).catch((error) => {
        degrade(error?.message || "IndexedDB delete failed");
      });
    }
    return existedLegacy || existedIdb;
  }

  async function saveRollingBackup(
    snapshot,
    {
      reason = "checkpoint",
      year = 0,
      week = 0,
      phase = "unknown",
      maxBackups = idbHealthy ? IDB_MAX_BACKUPS : undefined,
      maxBackupBytes = idbHealthy ? IDB_MAX_BACKUP_BYTES : undefined
    } = {}
  ) {
    if (!idbHealthy) {
      return base.saveRollingBackup(snapshot, { reason, year, week, phase });
    }
    const resolvedMax = maxBackups ?? IDB_MAX_BACKUPS;
    const resolvedBytes = maxBackupBytes ?? IDB_MAX_BACKUP_BYTES;
    const stamp = now().replace(/[:.]/g, "-");
    const slot = safeSlotName(`${backupPrefix}${reason}-y${year}-w${week}-${phase}-${stamp}`);
    const existing = listBackupSlots();
    if (existing.length >= resolvedMax) {
      clearOldestBackups(existing.length - resolvedMax + 1, { exclude: [slot] });
    }
    const saved = await saveSessionToSlot(slot, snapshot);
    while (backupBytes() > resolvedBytes && listBackupSlots().length > 1) {
      if (clearOldestBackups(1, { exclude: [slot] }) === 0) break;
    }
    return saved;
  }

  return {
    kind: "browser-hybrid",
    isHighCapacity: () => idbHealthy,
    listSaveSlots,
    listBackupSlots,
    saveSessionToSlot,
    saveRollingBackup,
    loadSessionFromSlot,
    deleteSaveSlot
  };
}
