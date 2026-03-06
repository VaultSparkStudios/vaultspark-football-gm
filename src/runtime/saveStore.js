import fs from "node:fs";
import path from "node:path";

const SAVE_DIR = path.resolve(process.env.VSFGM_SAVE_DIR || "saves");
const BACKUP_PREFIX = "auto-";

function safeSlotName(slot) {
  return String(slot || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 64);
}

function isBackupSlot(slot) {
  return String(slot || "").startsWith(BACKUP_PREFIX);
}

function slotPath(slot) {
  const safe = safeSlotName(slot);
  if (!safe) throw new Error("Invalid save slot name.");
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  return path.join(SAVE_DIR, `${safe}.json`);
}

function extractSnapshotMeta(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const teams = snapshot.league?.teams || [];
  const controlled = teams.find((team) => team.id === snapshot.controlledTeamId);
  return {
    schemaVersion: snapshot.schemaVersion ?? 1,
    currentYear: snapshot.currentYear ?? null,
    currentWeek: snapshot.currentWeek ?? null,
    phase: snapshot.phase ?? null,
    controlledTeamId: snapshot.controlledTeamId ?? null,
    controlledTeamName: controlled?.name || null,
    seasonsSimulated: snapshot.seasonsSimulated ?? 0
  };
}

function readSlotMeta(name) {
  const full = path.join(SAVE_DIR, name);
  const stat = fs.statSync(full);
  let meta = null;
  try {
    const snapshot = JSON.parse(fs.readFileSync(full, "utf8"));
    meta = extractSnapshotMeta(snapshot);
  } catch {
    meta = null;
  }
  return {
    slot: name.replace(/\.json$/i, ""),
    updatedAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    meta
  };
}

export function listSaveSlots({ includeBackups = false } = {}) {
  if (!fs.existsSync(SAVE_DIR)) return [];
  return fs
    .readdirSync(SAVE_DIR)
    .filter((name) => name.endsWith(".json"))
    .map(readSlotMeta)
    .filter((slot) => (includeBackups ? true : !isBackupSlot(slot.slot)))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function listBackupSlots() {
  return listSaveSlots({ includeBackups: true }).filter((slot) => isBackupSlot(slot.slot));
}

export function saveSessionToSlot(slot, snapshot) {
  const file = slotPath(slot);
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { slot: safeSlotName(slot), path: file };
}

export function saveRollingBackup(snapshot, { reason = "checkpoint", year = 0, week = 0, phase = "unknown", maxBackups = 40 } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slot = safeSlotName(`${BACKUP_PREFIX}${reason}-y${year}-w${week}-${phase}-${stamp}`);
  const saved = saveSessionToSlot(slot, snapshot);

  const backups = listBackupSlots();
  if (backups.length > maxBackups) {
    for (const old of backups.slice(maxBackups)) {
      try {
        fs.unlinkSync(slotPath(old.slot));
      } catch {
        // Ignore pruning errors and continue.
      }
    }
  }
  return saved;
}

export function loadSessionFromSlot(slot) {
  const file = slotPath(slot);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function deleteSaveSlot(slot) {
  const file = slotPath(slot);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}
