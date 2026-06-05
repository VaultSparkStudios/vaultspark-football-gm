const DEFAULT_BACKUP_PREFIX = "auto-";
const SNAPSHOT_PREVIEW_BYTES = 16_384;

/**
 * FNV-1a 32-bit checksum over a serialized snapshot string (S14 integrity guard).
 * Catches silent corruption that still parses as valid JSON — the failure mode
 * that destroys long dynasties without any visible error.
 */
export function computeSnapshotChecksum(serialized) {
  const str = String(serialized);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildIntegrityStamp(serialized) {
  return {
    algo: "fnv1a32",
    checksum: computeSnapshotChecksum(serialized),
    length: String(serialized).length
  };
}

export function verifyIntegrityStamp(serialized, integrity) {
  if (!integrity || integrity.algo !== "fnv1a32") return true; // legacy saves: no stamp to verify
  const str = String(serialized);
  return integrity.length === str.length && integrity.checksum === computeSnapshotChecksum(str);
}

export function safeSlotName(slot) {
  return String(slot || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 64);
}

export function isBackupSlot(slot, backupPrefix = DEFAULT_BACKUP_PREFIX) {
  return String(slot || "").startsWith(backupPrefix);
}

function readJsonStringValue(serialized, key) {
  const match = serialized.match(new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`));
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function readJsonNumberValue(serialized, key) {
  const match = serialized.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+)`));
  return match ? Number(match[1]) : null;
}

export function extractSnapshotMeta(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const teams = snapshot.league?.teams || [];
  const controlled = teams.find((team) => team.id === snapshot.controlledTeamId);
  return {
    schemaVersion: snapshot.schemaVersion ?? 1,
    currentYear: snapshot.currentYear ?? null,
    currentWeek: snapshot.currentWeek ?? null,
    phase: snapshot.phase ?? null,
    controlledTeamId: snapshot.controlledTeamId ?? null,
    controlledTeamName: snapshot.controlledTeamName ?? controlled?.name ?? null,
    controlledTeamAbbrev: snapshot.controlledTeamAbbrev ?? controlled?.abbrev ?? controlled?.id ?? null,
    seasonsSimulated: snapshot.seasonsSimulated ?? 0
  };
}

export function extractSnapshotMetaFromSerialized(serialized) {
  const preview = String(serialized || "").slice(0, SNAPSHOT_PREVIEW_BYTES);
  if (!preview) return null;
  return {
    schemaVersion: readJsonNumberValue(preview, "schemaVersion") ?? 1,
    currentYear: readJsonNumberValue(preview, "currentYear"),
    currentWeek: readJsonNumberValue(preview, "currentWeek"),
    phase: readJsonStringValue(preview, "phase"),
    controlledTeamId: readJsonStringValue(preview, "controlledTeamId"),
    controlledTeamName: readJsonStringValue(preview, "controlledTeamName"),
    controlledTeamAbbrev: readJsonStringValue(preview, "controlledTeamAbbrev"),
    seasonsSimulated: readJsonNumberValue(preview, "seasonsSimulated") ?? 0
  };
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const hasSnapshotFields = [
    "schemaVersion",
    "currentYear",
    "currentWeek",
    "phase",
    "controlledTeamId",
    "controlledTeamName",
    "controlledTeamAbbrev",
    "seasonsSimulated"
  ].some((key) => meta[key] != null);
  if (!hasSnapshotFields) return null;
  return {
    schemaVersion: meta.schemaVersion ?? 1,
    currentYear: meta.currentYear ?? null,
    currentWeek: meta.currentWeek ?? null,
    phase: meta.phase ?? null,
    controlledTeamId: meta.controlledTeamId ?? null,
    controlledTeamName: meta.controlledTeamName ?? null,
    controlledTeamAbbrev: meta.controlledTeamAbbrev ?? meta.controlledTeamId ?? null,
    seasonsSimulated: meta.seasonsSimulated ?? 0
  };
}

export function buildSlotRecord({ slot, updatedAt, sizeBytes, snapshot = null, meta = null, serializedSnapshot = null }) {
  const derivedMeta = normalizeMeta(meta) || extractSnapshotMeta(snapshot) || extractSnapshotMetaFromSerialized(serializedSnapshot);
  return {
    slot,
    updatedAt,
    sizeBytes,
    meta: derivedMeta
  };
}

export function createPersistenceDescriptor(kind, available, notes) {
  return { kind, available, notes };
}

export function getDefaultBackupPrefix() {
  return DEFAULT_BACKUP_PREFIX;
}
