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
 * the proven localStorage store for writes. Existing IndexedDB saves remain
 * readable after write degradation. Migration is per-slot
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

function openDb(timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("IndexedDB open timed out.")), timeoutMs);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "slot" });
      }
    };
    request.onsuccess = () => {
      if (settled) return request.result.close();
      settled = true;
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => fail(request.error || new Error("IndexedDB open failed."));
    request.onblocked = () => fail(new Error("IndexedDB open is blocked by another tab."));
  });
}

function idbRequest(mode, run, timeoutMs) {
  return openDb(timeoutMs).then(
    (db) =>
      new Promise((resolve, reject) => {
        let tx;
        let request;
        let result;
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          db.close();
          if (error) reject(error);
          else resolve(result);
        };
        const timer = setTimeout(() => {
          try { tx?.abort(); } catch { /* Already finished. */ }
          finish(new Error("IndexedDB transaction timed out."));
        }, timeoutMs);
        try {
          tx = db.transaction(IDB_STORE, mode);
          tx.oncomplete = () => finish();
          tx.onabort = () => finish(tx.error || request?.error || new Error("IndexedDB transaction aborted."));
          tx.onerror = () => finish(tx.error || request?.error || new Error("IndexedDB transaction failed."));
          request = run(tx.objectStore(IDB_STORE));
          // A successful request can still be rolled back by a later abort.
          request.onsuccess = () => { result = request.result; };
          request.onerror = () => finish(request.error || new Error("IndexedDB request failed."));
        } catch (error) {
          try { tx?.abort(); } catch { /* No active transaction. */ }
          finish(error);
        }
      })
  );
}

export function createHybridBrowserSaveStore({
  storage,
  namespace = "vsfgm",
  backupPrefix = getDefaultBackupPrefix(),
  now = () => new Date().toISOString(),
  onDegrade = null,
  idbTimeoutMs = 5000
} = {}) {
  const slotOperations = new Map();
  const base = createBrowserSaveStore({ storage, namespace, backupPrefix, now,
    isSlotBusy: (slot) => slotOperations.has(slot) });
  function withSlot(slot, run) {
    const safe = safeSlotName(slot);
    if (!safe) return Promise.reject(new Error("Invalid save slot name."));
    const operation = (slotOperations.get(safe) || Promise.resolve()).then(() => run(safe));
    const release = () => {
      if (slotOperations.get(safe) === tail) slotOperations.delete(safe);
    };
    const tail = operation.then(release, release);
    slotOperations.set(safe, tail);
    return operation;
  }
  const dataPrefix = `${namespace}:save:`;
  const metaPrefix = `${namespace}:meta:`;
  let idbHealthy = isIndexedDbUsable();
  const timeoutMs = Number.isFinite(idbTimeoutMs) && idbTimeoutMs > 0 ? idbTimeoutMs : 5000;
  const request = (mode, run) => idbRequest(mode, run, timeoutMs);
  const setItem = (key, value) => typeof storage.setItemAsync === "function"
    ? storage.setItemAsync(key, value) : storage.setItem(key, value);
  const removeItem = (key) => typeof storage.removeItemAsync === "function"
    ? storage.removeItemAsync(key) : storage.removeItem(key);

  async function restoreItem(key, previous) {
    if (storage.getItem(key) === previous) return;
    if (previous == null) await removeItem(key);
    else await setItem(key, previous);
  }

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
    return setItem(metaKey(slot), JSON.stringify(meta));
  }

  async function publishCopy(safe, serialized, meta) {
    // The index is the commit pointer. Never overwrite its current record
    // before a replacement index has been acknowledged by durable storage.
    const previous = readMeta(safe);
    const version = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const recordKey = `${safe}:${version}`;
    let published = false;
    try {
      await request("readwrite", (store) => store.put({ slot: recordKey, data: serialized, updatedAt: meta.updatedAt }));
      const readback = await request("readonly", (store) => store.get(recordKey));
      if (readback?.data !== serialized || !verifyIntegrityStamp(readback.data, meta.integrity)) {
        throw new Error("IndexedDB save readback failed verification.");
      }
      await writeMeta(safe, { ...meta, store: "idb", recordKey, sizeBytes: serialized.length });
      published = true;
    } finally {
      if (!published) {
        try { await request("readwrite", (store) => store.delete(recordKey)); }
        catch (error) { degrade(error?.message || "IndexedDB candidate cleanup failed"); }
      }
    }
    // Cleanup happens after publication. A failed cleanup can leave extra
    // bytes, but cannot invalidate the new save or erase its predecessor.
    try {
      await removeItem(dataKey(safe));
      if (previous?.store === "idb") {
        await request("readwrite", (store) => store.delete(previous.recordKey || safe));
      }
    } catch (error) {
      degrade(error?.message || "Saved copy cleanup failed");
    }
    return { slot: safe, key: `idb:${recordKey}`, store: "idb" };
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

  async function clearOldestBackups(count = 1, { exclude = [] } = {}) {
    const excluded = new Set((exclude || []).map((slot) => safeSlotName(slot)));
    const candidates = listBackupSlots()
      .filter((entry) => !excluded.has(safeSlotName(entry.slot)) && !slotOperations.has(safeSlotName(entry.slot)))
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    let removed = 0;
    for (const backup of candidates.slice(0, count)) {
      if (await deleteSaveSlot(backup.slot)) removed += 1;
    }
    return removed;
  }

  async function saveSessionToSlotUnlocked(slot, snapshot) {
    if (!idbHealthy) return base.saveSessionToSlot(slot, snapshot);
    assertSnapshotCompatibility(snapshot);
    const safe = safeSlotName(slot);
    if (!safe) throw new Error("Invalid save slot name.");
    const serialized = await encodeSnapshot(snapshot);
    const updatedAt = now();
    try {
      return await publishCopy(safe, serialized, {
        ...(extractSnapshotMeta(snapshot) || {}),
        updatedAt,
        integrity: buildIntegrityStamp(serialized)
      });
    } catch (error) {
      degrade(error?.message || "IndexedDB write failed");
      return base.saveSessionToSlot(slot, snapshot);
    }
  }

  async function loadSessionFromSlotUnlocked(slot) {
    const safe = safeSlotName(slot);
    const meta = readMeta(safe);
    if (meta?.store === "idb") {
      try {
        const record = await request("readonly", (store) => store.get(meta.recordKey || safe));
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
        throw new Error(`Save slot "${safe}" is missing its IndexedDB record.`);
      } catch (error) {
        if (/integrity verification/.test(error?.message || "")) throw error;
        degrade(error?.message || "IndexedDB read failed");
        if (storage.getItem(dataKey(safe)) == null) throw error;
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
        await publishCopy(safe, serialized, {
          ...(extractSnapshotMeta(snapshot) || {}),
          updatedAt: readMeta(safe)?.updatedAt || now(),
          integrity: stamp,
          migratedAt: now()
        });
      } catch (error) {
        degrade(error?.message || "IndexedDB migration failed");
      }
    }
    return snapshot;
  }

  async function deleteSaveSlotUnlocked(slot) {
    const safe = safeSlotName(slot);
    const meta = readMeta(safe);
    if (meta?.store !== "idb") return base.deleteSaveSlot(safe);
    const previousMeta = storage.getItem(metaKey(safe));
    const previousData = storage.getItem(dataKey(safe));
    try {
      // Unpublish durably before removing the authoritative bytes. All local
      // failures happen while the previous IndexedDB record is still intact.
      await removeItem(metaKey(safe));
      await removeItem(dataKey(safe));
      await request("readwrite", (store) => store.delete(meta.recordKey || safe));
    } catch (error) {
      degrade(error?.message || "IndexedDB delete failed");
      try {
        await restoreItem(dataKey(safe), previousData);
        await restoreItem(metaKey(safe), previousMeta);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Delete failed and the previous save could not be restored.", { cause: error });
      }
      throw error;
    }
    return true;
  }

  // Migration holds the same slot queue from its initial read through index
  // publication and cleanup, so an old load cannot republish over a new save.
  const saveSessionToSlot = (slot, snapshot) => withSlot(slot, (safe) => saveSessionToSlotUnlocked(safe, snapshot));
  const loadSessionFromSlot = (slot) => withSlot(slot, loadSessionFromSlotUnlocked);
  const deleteSaveSlot = (slot) => withSlot(slot, deleteSaveSlotUnlocked);

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
    // Even fallback backups must use this adapter's slot queue; delegating
    // the whole operation would bypass an in-flight migration or deletion.
    const resolvedMax = maxBackups ?? (idbHealthy ? IDB_MAX_BACKUPS : 6);
    const resolvedBytes = maxBackupBytes ?? (idbHealthy ? IDB_MAX_BACKUP_BYTES : 2 * 1024 * 1024);
    const stamp = now().replace(/[:.]/g, "-");
    const slot = safeSlotName(`${backupPrefix}${reason}-y${year}-w${week}-${phase}-${stamp}`);
    const saved = await saveSessionToSlot(slot, snapshot);
    const excess = listBackupSlots().length - Math.max(1, resolvedMax);
    if (excess > 0) await clearOldestBackups(excess, { exclude: [slot] });
    while (backupBytes() > resolvedBytes && listBackupSlots().length > 1) {
      if (await clearOldestBackups(1, { exclude: [slot] }) === 0) break;
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
