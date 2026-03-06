export const LATEST_SNAPSHOT_SCHEMA_VERSION = 2;

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
  return current;
}
