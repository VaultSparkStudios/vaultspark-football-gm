import { FOOTBALL_STAT_SCHEMA } from "../sport/football/statSchema.js";

// This format's default counter dictionary is the football stat schema. Bump
// the format and retain its decoder if that dictionary ever changes. Unknown
// fields and partial legacy buckets use raw mode and are never zero-filled.
export const LEGACY_STAT_STORAGE_FORMAT = "football-zero-counters-v1";
export const STAT_STORAGE_FORMAT = "football-zero-counters-v2";
const SEASON_TEMPLATE = FOOTBALL_STAT_SCHEMA.zeroedSeasonStats();
const CAREER_TEMPLATE = FOOTBALL_STAT_SCHEMA.zeroedCareerStats();
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function completeCounters(value, template) {
  if (!object(value)) return false;
  return Object.entries(template).every(([key, fallback]) => owns(value, key)
    && (object(fallback) ? completeCounters(value[key], fallback) : typeof value[key] === "number" && Number.isFinite(value[key])));
}

function removeKnownZeros(value, template) {
  return Object.fromEntries(Object.entries(value).flatMap(([key, counter]) => {
    if (!owns(template, key)) return [[key, counter]];
    if (object(template[key])) {
      const nested = removeKnownZeros(counter, template[key]);
      return Object.keys(nested).length ? [[key, nested]] : [];
    }
    return counter === 0 ? [] : [[key, counter]];
  }));
}

function restoreKnownZeros(value, template) {
  const result = { ...template, ...value };
  for (const [key, fallback] of Object.entries(template)) {
    if (object(fallback)) result[key] = restoreKnownZeros(value[key] || {}, fallback);
  }
  return result;
}

function packBucket(bucket, template) {
  const complete = completeCounters(bucket, template);
  const data = complete ? removeKnownZeros(bucket, template) : object(bucket) ? { ...bucket } : bucket;
  if (object(data?.splits)) data.splits = Object.fromEntries(Object.entries(data.splits).map(([key, split]) => [key, packBucket(split, SEASON_TEMPLATE)]));
  // The wrapper prevents reserved-name collisions in original stat metadata.
  return { mode: complete ? "zero" : "raw", data };
}

function encodingError(path, message) {
  const error = new Error(`Invalid stored statistics at ${path}: ${message}`);
  error.reasonCode = "SNAPSHOT_STAT_ENCODING_INVALID";
  error.status = 400;
  return error;
}

function unpackBucket(bucket, template, path) {
  if (!object(bucket) || !owns(bucket, "data") || !["zero", "raw"].includes(bucket.mode)) throw encodingError(path, "expected a versioned stat bucket");
  if (Object.keys(bucket).some(key => key !== "mode" && key !== "data")) throw encodingError(path, "unknown wrapper fields");
  if (bucket.mode === "zero" && !object(bucket.data)) throw encodingError(path, "zero-counter data must be an object");
  if (bucket.mode === "zero") validateSparseCounters(bucket.data, template, path);
  const data = bucket.mode === "zero" ? restoreKnownZeros(bucket.data, template) : object(bucket.data) ? { ...bucket.data } : bucket.data;
  if (object(data?.splits)) data.splits = Object.fromEntries(Object.entries(data.splits).map(([key, split]) => [key, unpackBucket(split, SEASON_TEMPLATE, `${path}.splits.${key}`)]));
  return data;
}

function validateSparseCounters(data, template, path) {
  for (const [key, value] of Object.entries(data)) {
    if (!owns(template, key)) continue;
    if (object(template[key])) {
      if (!object(value)) throw encodingError(`${path}.${key}`, "counter group must be an object");
      validateSparseCounters(value, template[key], `${path}.${key}`);
    } else if (typeof value !== "number" || !Number.isFinite(value)) {
      throw encodingError(`${path}.${key}`, "counter must be finite numeric data");
    }
  }
}

function transformPlayers(players, transform, path) {
  if (!Array.isArray(players)) return players;
  return players.map((player, index) => {
    if (!object(player)) return player;
    const next = { ...player };
    if (owns(player, "careerStats")) next.careerStats = transform(player.careerStats, CAREER_TEMPLATE, `${path}[${index}].careerStats`);
    if (object(player.seasonStats)) next.seasonStats = Object.fromEntries(Object.entries(player.seasonStats).map(([year, bucket]) => [year,
      transform(bucket, SEASON_TEMPLATE, `${path}[${index}].seasonStats.${year}`)]));
    return next;
  });
}

function transformSnapshot(snapshot, transform, includeProspects = false) {
  return { ...snapshot, league: { ...snapshot.league,
    players: transformPlayers(snapshot.league.players, transform, "league.players"),
    ...(Array.isArray(snapshot.league.retiredPlayers) ? { retiredPlayers: transformPlayers(snapshot.league.retiredPlayers, transform, "league.retiredPlayers") } : {}),
    ...(includeProspects && Array.isArray(snapshot.league.pendingDraft?.available) ? {pendingDraft:{...snapshot.league.pendingDraft,
      available:transformPlayers(snapshot.league.pendingDraft.available,transform,"league.pendingDraft.available")}} : {})
  } };
}

export function compactSnapshotStats(snapshot) {
  if ([STAT_STORAGE_FORMAT, LEGACY_STAT_STORAGE_FORMAT].includes(snapshot.statStorage)) return snapshot;
  if ((snapshot.league?.sportId || "football") !== "football") return snapshot;
  return { ...transformSnapshot(snapshot, packBucket, true), statStorage: STAT_STORAGE_FORMAT };
}

export function expandSnapshotStats(snapshot) {
  if (snapshot.statStorage == null) return snapshot;
  if (![STAT_STORAGE_FORMAT, LEGACY_STAT_STORAGE_FORMAT].includes(snapshot.statStorage) || (snapshot.league?.sportId || "football") !== "football") {
    throw encodingError("statStorage", `unsupported format ${String(snapshot.statStorage)}`);
  }
  const next = transformSnapshot(snapshot, unpackBucket, snapshot.statStorage === STAT_STORAGE_FORMAT);
  delete next.statStorage;
  return next;
}
