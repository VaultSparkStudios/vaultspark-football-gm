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

function storageKeys(storage) {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return [];
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * Rolling-backup retention (S65).
 *
 * The previous default kept **40 full snapshots**. At a full-season size that is
 * hundreds of megabytes against a 5-10 MB localStorage budget, and it was the
 * dominant reason "Browser storage is full" appeared in normal play. Backups
 * are a short undo runway, not an archive: a handful of recent checkpoints,
 * bounded by bytes as well as by count so the cap holds as a franchise grows.
 */
const DEFAULT_MAX_BACKUPS = 6;
const DEFAULT_MAX_BACKUP_BYTES = 2 * 1024 * 1024;

function isQuotaExceededError(error) {
  return error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014;
}

export function createBrowserSaveStore({
  storage,
  namespace = "vsfgm",
  backupPrefix = getDefaultBackupPrefix(),
  now = () => new Date().toISOString()
} = {}) {
  if (!storage) {
    throw new Error("Browser save store requires a storage implementation.");
  }

  const dataPrefix = `${namespace}:save:`;
  const metaPrefix = `${namespace}:meta:`;

  function dataKey(slot) {
    const safe = safeSlotName(slot);
    if (!safe) throw new Error("Invalid save slot name.");
    return `${dataPrefix}${safe}`;
  }

  function metaKey(slot) {
    const safe = safeSlotName(slot);
    if (!safe) throw new Error("Invalid save slot name.");
    return `${metaPrefix}${safe}`;
  }

  function listSaveSlots({ includeBackups = false } = {}) {
    return storageKeys(storage)
      .filter((key) => key.startsWith(dataPrefix))
      .filter((key) => {
        if (includeBackups) return true;
        return !isBackupSlot(key.slice(dataPrefix.length), backupPrefix);
      })
      .map((key) => {
        const slot = key.slice(dataPrefix.length);
        const rawSnapshot = storage.getItem(key);
        const rawMeta = storage.getItem(metaKey(slot));
        let metaRecord = {};
        try {
          metaRecord = rawMeta ? JSON.parse(rawMeta) : {};
        } catch {
          metaRecord = {};
        }
        return buildSlotRecord({
          slot,
          updatedAt: metaRecord.updatedAt || now(),
          sizeBytes: rawSnapshot ? rawSnapshot.length : 0,
          meta: metaRecord,
          serializedSnapshot: rawSnapshot
        });
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  function listBackupSlots() {
    return listSaveSlots({ includeBackups: true }).filter((slot) => isBackupSlot(slot.slot, backupPrefix));
  }

  function clearOldestBackups(count = 1, { exclude = [] } = {}) {
    const excluded = new Set((exclude || []).map((slot) => safeSlotName(slot)));
    const candidates = listBackupSlots().filter((entry) => !excluded.has(safeSlotName(entry.slot)));
    let removed = 0;
    for (const backup of candidates.slice().reverse().slice(0, count)) {
      if (deleteSaveSlot(backup.slot)) removed += 1;
    }
    return removed;
  }

  async function saveSessionToSlot(slot, snapshot) {
    assertSnapshotCompatibility(snapshot);
    const safe = safeSlotName(slot);
    const updatedAt = now();
    // Compressed before stamping, so the integrity stamp continues to describe
    // exactly the bytes that land in storage (see ./snapshotCodec.js).
    const serialized = await encodeSnapshot(snapshot);
    const write = () => {
      try {
        storage.setItem(dataKey(safe), serialized);
        storage.setItem(
          metaKey(safe),
          JSON.stringify({ ...(extractSnapshotMeta(snapshot) || {}), updatedAt, integrity: buildIntegrityStamp(serialized) })
        );
        return { slot: safe, key: dataKey(safe) };
      } catch (error) {
        storage.removeItem(dataKey(safe));
        storage.removeItem(metaKey(safe));
        throw error;
      }
    };
    try {
      return write();
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
      let recovered = false;
      while (clearOldestBackups(1, { exclude: [safe] }) > 0) {
        try {
          const saved = write();
          recovered = true;
          return saved;
        } catch (retryError) {
          if (!isQuotaExceededError(retryError)) throw retryError;
        }
      }
      if (!recovered) {
        throw new Error("Browser storage is full. Delete old saves/backups or clear site data, then try again.");
      }
    }
  }

  async function loadSessionFromSlot(slot) {
    const raw = storage.getItem(dataKey(slot));
    if (!raw) return null;
    let integrity = null;
    try {
      const rawMeta = storage.getItem(metaKey(slot));
      integrity = rawMeta ? JSON.parse(rawMeta)?.integrity || null : null;
    } catch {
      integrity = null;
    }
    if (!verifyIntegrityStamp(raw, integrity)) {
      throw new Error(
        `Save slot "${safeSlotName(slot)}" failed integrity verification — the stored data is corrupt. ` +
          "Restore from a rolling backup (Settings → Saves → Backups)."
      );
    }
    const snapshot = await decodeSnapshot(raw);
    assertSnapshotCompatibility(snapshot);
    return snapshot;
  }

  function deleteSaveSlot(slot) {
    const safe = safeSlotName(slot);
    const key = dataKey(safe);
    const exists = storage.getItem(key) != null;
    storage.removeItem(key);
    storage.removeItem(metaKey(safe));
    return exists;
  }

  /** Total bytes currently held by rolling backups. */
  function backupBytes() {
    let bytes = 0;
    for (const backup of listBackupSlots()) {
      bytes += (storage.getItem(dataKey(backup.slot)) || "").length;
    }
    return bytes;
  }

  async function saveRollingBackup(
    snapshot,
    {
      reason = "checkpoint",
      year = 0,
      week = 0,
      phase = "unknown",
      maxBackups = DEFAULT_MAX_BACKUPS,
      maxBackupBytes = DEFAULT_MAX_BACKUP_BYTES
    } = {}
  ) {
    const stamp = now().replace(/[:.]/g, "-");
    const slot = safeSlotName(`${backupPrefix}${reason}-y${year}-w${week}-${phase}-${stamp}`);
    const retainCount = Math.max(0, maxBackups - 1);
    const existingBackups = listBackupSlots();
    if (existingBackups.length > retainCount) {
      clearOldestBackups(existingBackups.length - retainCount);
    }
    const saved = await saveSessionToSlot(slot, snapshot);

    const backups = listBackupSlots();
    if (backups.length > maxBackups) {
      for (const old of backups.slice(maxBackups)) {
        deleteSaveSlot(old.slot);
      }
    }

    // A count-based cap alone cannot bound storage, because a backup's size
    // grows with the franchise. Evict oldest until the backups fit their byte
    // budget, always keeping the one just written.
    while (backupBytes() > maxBackupBytes && listBackupSlots().length > 1) {
      if (clearOldestBackups(1, { exclude: [slot] }) === 0) break;
    }
    return saved;
  }

  return {
    kind: "browser",
    listSaveSlots,
    listBackupSlots,
    saveSessionToSlot,
    saveRollingBackup,
    loadSessionFromSlot,
    deleteSaveSlot
  };
}
