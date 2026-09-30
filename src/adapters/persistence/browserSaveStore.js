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
  now = () => new Date().toISOString(),
  isSlotBusy = () => false
} = {}) {
  if (!storage) {
    throw new Error("Browser save store requires a storage implementation.");
  }

  const dataPrefix = `${namespace}:save:`;
  const metaPrefix = `${namespace}:meta:`;
  const slotOperations = new Map();
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
  const setItem = (key, value) => typeof storage.setItemAsync === "function"
    ? storage.setItemAsync(key, value) : storage.setItem(key, value);
  const removeItem = (key) => typeof storage.removeItemAsync === "function"
    ? storage.removeItemAsync(key) : storage.removeItem(key);

  async function restoreItem(key, previous) {
    if (storage.getItem(key) === previous) return;
    if (previous == null) await removeItem(key);
    else await setItem(key, previous);
  }

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

  async function clearOldestBackups(count = 1, { exclude = [] } = {}) {
    const excluded = new Set((exclude || []).map((slot) => safeSlotName(slot)));
    // Never acquire a second occupied slot while holding a save's slot lock.
    // Two quota retries could otherwise wait forever while evicting each other.
    const candidates = listBackupSlots().filter((entry) => {
      const slot = safeSlotName(entry.slot);
      return !excluded.has(slot) && !slotOperations.has(slot) && !isSlotBusy(slot);
    });
    let removed = 0;
    for (const backup of candidates.slice().reverse().slice(0, count)) {
      if (await deleteSaveSlot(backup.slot)) removed += 1;
    }
    return removed;
  }

  async function saveSessionToSlotUnlocked(slot, snapshot) {
    assertSnapshotCompatibility(snapshot);
    const safe = safeSlotName(slot);
    const updatedAt = now();
    // Compressed before stamping, so the integrity stamp continues to describe
    // exactly the bytes that land in storage (see ./snapshotCodec.js).
    const serialized = await encodeSnapshot(snapshot);
    const write = async () => {
      const previousData = storage.getItem(dataKey(safe));
      const previousMeta = storage.getItem(metaKey(safe));
      try {
        await setItem(dataKey(safe), serialized);
        await setItem(
          metaKey(safe),
          JSON.stringify({ ...(extractSnapshotMeta(snapshot) || {}), updatedAt, integrity: buildIntegrityStamp(serialized) })
        );
        return { slot: safe, key: dataKey(safe) };
      } catch (error) {
        // setItem itself is atomic, but the payload/meta pair is not. Restore
        // only changed keys: a rejected first write must never delete a save.
        try {
          await restoreItem(dataKey(safe), previousData);
          await restoreItem(metaKey(safe), previousMeta);
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], "Save failed and the previous save could not be restored.", { cause: error });
        }
        throw error;
      }
    };
    try {
      return await write();
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
      while (await clearOldestBackups(1, { exclude: [safe] }) > 0) {
        try {
          return await write();
        } catch (retryError) {
          if (!isQuotaExceededError(retryError)) throw retryError;
        }
      }
      throw new Error("Browser storage is full. Delete old saves/backups or clear site data, then try again.", { cause: error });
    }
  }

  async function loadSessionFromSlotUnlocked(slot) {
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

  async function deleteSaveSlotUnlocked(slot) {
    const safe = safeSlotName(slot);
    const key = dataKey(safe);
    const previousData = storage.getItem(key);
    const previousMeta = storage.getItem(metaKey(safe));
    try {
      // A metadata NACK must not destroy the payload. If payload removal then
      // fails, republish the old metadata before reporting the failed delete.
      await removeItem(metaKey(safe));
      await removeItem(key);
    } catch (error) {
      try {
        await restoreItem(key, previousData);
        await restoreItem(metaKey(safe), previousMeta);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Delete failed and the previous save could not be restored.", { cause: error });
      }
      throw error;
    }
    return previousData != null;
  }

  // Reserve the slot before encoding or reading any prior state. A failed
  // older operation can then never roll back an acknowledged newer save.
  const saveSessionToSlot = (slot, snapshot) => withSlot(slot, (safe) => saveSessionToSlotUnlocked(safe, snapshot));
  const loadSessionFromSlot = (slot) => withSlot(slot, loadSessionFromSlotUnlocked);
  const deleteSaveSlot = (slot) => withSlot(slot, deleteSaveSlotUnlocked);

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
    const saved = await saveSessionToSlot(slot, snapshot);

    const backups = listBackupSlots();
    if (backups.length > maxBackups) {
      for (const old of backups.slice(maxBackups)) {
        await deleteSaveSlot(old.slot);
      }
    }

    // A count-based cap alone cannot bound storage, because a backup's size
    // grows with the franchise. Evict oldest until the backups fit their byte
    // budget, always keeping the one just written.
    while (backupBytes() > maxBackupBytes && listBackupSlots().length > 1) {
      if (await clearOldestBackups(1, { exclude: [slot] }) === 0) break;
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
