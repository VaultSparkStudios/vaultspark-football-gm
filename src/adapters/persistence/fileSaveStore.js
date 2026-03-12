import fs from "node:fs";
import path from "node:path";
import {
  buildSlotRecord,
  extractSnapshotMeta,
  extractSnapshotMetaFromSerialized,
  getDefaultBackupPrefix,
  isBackupSlot,
  safeSlotName
} from "./saveStoreShared.js";

export function createFileSaveStore({
  saveDir = path.resolve(process.env.VSFGM_SAVE_DIR || "saves"),
  backupPrefix = getDefaultBackupPrefix()
} = {}) {
  function slotPath(slot) {
    const safe = safeSlotName(slot);
    if (!safe) throw new Error("Invalid save slot name.");
    fs.mkdirSync(saveDir, { recursive: true });
    return path.join(saveDir, `${safe}.json`);
  }

  function metaPath(slot) {
    const safe = safeSlotName(slot);
    if (!safe) throw new Error("Invalid save slot name.");
    fs.mkdirSync(saveDir, { recursive: true });
    return path.join(saveDir, `${safe}.meta.json`);
  }

  function readSnapshotPreview(file, bytes = 16_384) {
    const fd = fs.openSync(file, "r");
    try {
      const buffer = Buffer.alloc(bytes);
      const count = fs.readSync(fd, buffer, 0, bytes, 0);
      return buffer.toString("utf8", 0, count);
    } finally {
      fs.closeSync(fd);
    }
  }

  function readStoredMeta(slot) {
    const file = metaPath(slot);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }

  function writeStoredMeta(slot, snapshot, updatedAt = new Date().toISOString()) {
    const file = metaPath(slot);
    const meta = extractSnapshotMeta(snapshot);
    fs.writeFileSync(file, `${JSON.stringify({ ...(meta || {}), updatedAt }, null, 2)}\n`, "utf8");
    return meta;
  }

  function readSlotMeta(name) {
    const full = path.join(saveDir, name);
    const stat = fs.statSync(full);
    const slot = name.replace(/\.json$/i, "");
    const storedMeta = readStoredMeta(slot);
    const previewMeta = storedMeta ? null : extractSnapshotMetaFromSerialized(readSnapshotPreview(full));
    return buildSlotRecord({
      slot,
      updatedAt: storedMeta?.updatedAt || stat.mtime.toISOString(),
      sizeBytes: stat.size,
      meta: storedMeta || previewMeta
    });
  }

  function listSaveSlots({ includeBackups = false } = {}) {
    if (!fs.existsSync(saveDir)) return [];
    return fs
      .readdirSync(saveDir)
      .filter((name) => name.endsWith(".json") && !name.endsWith(".meta.json"))
      .filter((name) => {
        if (includeBackups) return true;
        return !isBackupSlot(name.replace(/\.json$/i, ""), backupPrefix);
      })
      .map(readSlotMeta)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  function listBackupSlots() {
    return listSaveSlots({ includeBackups: true }).filter((slot) => isBackupSlot(slot.slot, backupPrefix));
  }

  function saveSessionToSlot(slot, snapshot) {
    const file = slotPath(slot);
    const safe = safeSlotName(slot);
    const updatedAt = new Date().toISOString();
    fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    writeStoredMeta(safe, snapshot, updatedAt);
    return { slot: safe, path: file };
  }

  function loadSessionFromSlot(slot) {
    const file = slotPath(slot);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  function deleteSaveSlot(slot) {
    const file = slotPath(slot);
    const metaFile = metaPath(slot);
    const exists = fs.existsSync(file);
    if (exists) fs.unlinkSync(file);
    if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
    return exists;
  }

  function saveRollingBackup(
    snapshot,
    { reason = "checkpoint", year = 0, week = 0, phase = "unknown", maxBackups = 40 } = {}
  ) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slot = safeSlotName(`${backupPrefix}${reason}-y${year}-w${week}-${phase}-${stamp}`);
    const saved = saveSessionToSlot(slot, snapshot);

    const backups = listBackupSlots();
    if (backups.length > maxBackups) {
      for (const old of backups.slice(maxBackups)) {
        try {
          deleteSaveSlot(old.slot);
        } catch {
          // Ignore pruning errors and continue.
        }
      }
    }
    return saved;
  }

  return {
    kind: "file",
    listSaveSlots,
    listBackupSlots,
    saveSessionToSlot,
    saveRollingBackup,
    loadSessionFromSlot,
    deleteSaveSlot
  };
}

export const defaultFileSaveStore = createFileSaveStore();
