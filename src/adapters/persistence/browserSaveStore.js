import {
  buildSlotRecord,
  extractSnapshotMeta,
  getDefaultBackupPrefix,
  isBackupSlot,
  safeSlotName
} from "./saveStoreShared.js";

function storageKeys(storage) {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return [];
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
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

  function saveSessionToSlot(slot, snapshot) {
    const safe = safeSlotName(slot);
    const updatedAt = now();
    const serialized = JSON.stringify(snapshot);
    storage.setItem(dataKey(safe), serialized);
    storage.setItem(metaKey(safe), JSON.stringify({ ...(extractSnapshotMeta(snapshot) || {}), updatedAt }));
    return { slot: safe, key: dataKey(safe) };
  }

  function loadSessionFromSlot(slot) {
    const raw = storage.getItem(dataKey(slot));
    return raw ? JSON.parse(raw) : null;
  }

  function deleteSaveSlot(slot) {
    const safe = safeSlotName(slot);
    const key = dataKey(safe);
    const exists = storage.getItem(key) != null;
    storage.removeItem(key);
    storage.removeItem(metaKey(safe));
    return exists;
  }

  function saveRollingBackup(
    snapshot,
    { reason = "checkpoint", year = 0, week = 0, phase = "unknown", maxBackups = 40 } = {}
  ) {
    const stamp = now().replace(/[:.]/g, "-");
    const slot = safeSlotName(`${backupPrefix}${reason}-y${year}-w${week}-${phase}-${stamp}`);
    const saved = saveSessionToSlot(slot, snapshot);

    const backups = listBackupSlots();
    if (backups.length > maxBackups) {
      for (const old of backups.slice(maxBackups)) {
        deleteSaveSlot(old.slot);
      }
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
