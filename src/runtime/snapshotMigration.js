export const LATEST_SNAPSHOT_SCHEMA_VERSION = 2;

export class SnapshotCompatibilityError extends Error {
  constructor(reasonCode, message, { status = 400, details = null } = {}) {
    super(message);
    this.name = "SnapshotCompatibilityError";
    this.reasonCode = reasonCode;
    this.status = status;
    this.details = details;
  }
}

export function snapshotErrorPayload(error) {
  return {
    ok: false,
    error: error?.message || "Snapshot compatibility verification failed.",
    reasonCode: error?.reasonCode || "SNAPSHOT_COMPATIBILITY_FAILED",
    recovery: "The active league was not replaced. Choose a compatible save or restore a verified backup.",
    ...(error?.details ? { details: error.details } : {})
  };
}

export function inspectSnapshotCompatibility(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, status: 400, reasonCode: "SNAPSHOT_INVALID_ROOT", error: "Snapshot must be a JSON object." };
  }
  const version = snapshot.schemaVersion == null ? 1 : Number(snapshot.schemaVersion);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, status: 400, reasonCode: "SNAPSHOT_INVALID_VERSION", error: "Snapshot schemaVersion must be a positive integer." };
  }
  if (version > LATEST_SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false,
      status: 409,
      reasonCode: "SNAPSHOT_FUTURE_VERSION",
      error: `Snapshot schema ${version} is newer than supported schema ${LATEST_SNAPSHOT_SCHEMA_VERSION}.`,
      details: { declaredVersion: version, latestSupportedVersion: LATEST_SNAPSHOT_SCHEMA_VERSION }
    };
  }
  const missing = [];
  if (!snapshot.league || typeof snapshot.league !== "object" || Array.isArray(snapshot.league)) missing.push("league");
  if (!Array.isArray(snapshot.league?.teams)) missing.push("league.teams");
  if (!Array.isArray(snapshot.league?.players)) missing.push("league.players");
  if (!Number.isFinite(Number(snapshot.rngSeed))) missing.push("rngSeed");
  if (!Number.isFinite(Number(snapshot.currentYear))) missing.push("currentYear");
  if (!Number.isFinite(Number(snapshot.currentWeek))) missing.push("currentWeek");
  if (typeof snapshot.phase !== "string" || !snapshot.phase.trim()) missing.push("phase");
  if (missing.length) {
    return {
      ok: false,
      status: 400,
      reasonCode: "SNAPSHOT_INVALID_SHAPE",
      error: `Snapshot is missing required franchise fields: ${missing.join(", ")}.`,
      details: { missing }
    };
  }
  return { ok: true, version, targetVersion: LATEST_SNAPSHOT_SCHEMA_VERSION, legacy: version < LATEST_SNAPSHOT_SCHEMA_VERSION };
}

export function assertSnapshotCompatibility(snapshot) {
  const inspection = inspectSnapshotCompatibility(snapshot);
  if (!inspection.ok) {
    throw new SnapshotCompatibilityError(inspection.reasonCode, inspection.error, {
      status: inspection.status,
      details: inspection.details
    });
  }
  return inspection;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function migrateV1ToV2(snapshot) {
  const next = clone(snapshot);
  if (!next.league) next.league = {};
  if (!Array.isArray(next.league.transactionLog)) next.league.transactionLog = [];
  if (!Number.isFinite(next.league.transactionSeq)) next.league.transactionSeq = next.league.transactionLog.length;
  if (!Array.isArray(next.league.history)) next.league.history = [];
  next.league.history = next.league.history.map((entry) => ({
    ...entry,
    playoffBracket: entry.playoffBracket || null
  }));
  next.schemaVersion = 2;
  return next;
}

export function migrateSnapshot(snapshot) {
  assertSnapshotCompatibility(snapshot);
  const initial = clone(snapshot || {});
  let version = Number(initial.schemaVersion || 1);
  let current = initial;
  while (version < LATEST_SNAPSHOT_SCHEMA_VERSION) {
    if (version === 1) {
      current = migrateV1ToV2(current);
      version = 2;
      continue;
    }
    break;
  }
  current.schemaVersion = LATEST_SNAPSHOT_SCHEMA_VERSION;
  assertSnapshotCompatibility(current);
  return current;
}
