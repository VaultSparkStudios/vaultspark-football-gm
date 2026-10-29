import { browserStorage } from "./browserStorage.js";
import { buildPlaytestJourneySummary, loadPlaytestJourney } from "./playtestJourney.js";

export const PLAYTEST_RECEIPT_SCHEMA_VERSION = "1.0";
export const PLAYTEST_RECEIPT_STORAGE_KEY = "vsfgm:playtest-receipts:v1";
const PLAYTEST_RECEIPT_LIMIT = 20;
const RATING_METRICS = ["clarity", "agency", "pace", "returnIntent"];

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Treat persisted notes as untrusted input. Copy only the fields disclosed by
// this feature, including at nested boundaries, rather than forwarding storage.
export function normalizeLocalPlaytestReceipt(value) {
  if (!record(value) || value.schemaVersion !== PLAYTEST_RECEIPT_SCHEMA_VERSION || value.kind !== "local-playtest-receipt") return null;
  if (!record(value.ratings) || RATING_METRICS.some((metric) => !Number.isInteger(value.ratings[metric]) || value.ratings[metric] < 1 || value.ratings[metric] > 5)) return null;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return null;
  if (value.note != null && typeof value.note !== "string") return null;
  const context = record(value.context) ? value.context : {};
  const text = (entry, fallback, limit) => typeof entry === "string" ? publicSafeNote(entry).slice(0, limit) || fallback : fallback;
  const teamId = text(context.teamId, "unknown", 12);
  const createdAt = new Date(value.createdAt).toISOString();
  const integer = (entry) => Number.isSafeInteger(entry) && entry >= 0 ? entry : null;
  return {
    schemaVersion: PLAYTEST_RECEIPT_SCHEMA_VERSION,
    kind: "local-playtest-receipt",
    receiptId: `playtest-${createdAt}-${teamId}`,
    createdAt,
    context: {
      year: integer(context.year), week: integer(context.week),
      phase: text(context.phase, "unknown", 32), teamId,
      openingContractStatus: text(context.openingContractStatus, "not-observed", 24),
      evidenceMoment: text(context.evidenceMoment, "manual", 48)
    },
    ratings: Object.fromEntries(RATING_METRICS.map((metric) => [metric, value.ratings[metric]])),
    note: publicSafeNote(value.note),
    privacy: { localOnlyUntilShared: true, personalIdentifiersCollected: false, savePayloadIncluded: false }
  };
}

function validReceipts(values) {
  return Array.isArray(values) ? values.map(normalizeLocalPlaytestReceipt).filter(Boolean).slice(0, PLAYTEST_RECEIPT_LIMIT) : [];
}

function boundedRating(value, label) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error(`${label} must be rated from 1 to 5.`);
  return rating;
}

function publicSafeNote(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
}

export function buildLocalPlaytestReceipt(input = {}, context = {}) {
  const receipt = normalizeLocalPlaytestReceipt({
    schemaVersion: PLAYTEST_RECEIPT_SCHEMA_VERSION,
    kind: "local-playtest-receipt",
    createdAt: input.createdAt || new Date().toISOString(),
    context,
    ratings: Object.fromEntries(RATING_METRICS.map((metric) => [metric, boundedRating(input[metric], metric)])),
    note: publicSafeNote(input.note)
  });
  if (!receipt) throw new Error("A valid playtest note is required.");
  return receipt;
}

export function loadLocalPlaytestReceipts(storage = browserStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(PLAYTEST_RECEIPT_STORAGE_KEY) || "[]");
    return validReceipts(parsed);
  } catch {
    return [];
  }
}

export function saveLocalPlaytestReceipt(receipt, storage = browserStorage()) {
  const safe = normalizeLocalPlaytestReceipt(receipt);
  if (!safe) {
    throw new Error("A valid playtest note is required.");
  }
  if (typeof storage?.setItem !== "function") throw new Error("Browser storage is unavailable. This note was not saved.");
  const receipts = [safe, ...loadLocalPlaytestReceipts(storage).filter((entry) => entry.receiptId !== safe.receiptId)].slice(0, PLAYTEST_RECEIPT_LIMIT);
  storage?.setItem?.(PLAYTEST_RECEIPT_STORAGE_KEY, JSON.stringify(receipts));
  return receipts;
}

export function buildLocalPlaytestTrend(receipts = []) {
  const valid = validReceipts(receipts);
  const warning = "Small, self-selected local sample; ratings describe recorded moments and do not prove player-wide impact or causality.";
  if (valid.length < 3) return { available: false, count: valid.length, minimum: 3, warning };
  const metrics = RATING_METRICS;
  const averages = Object.fromEntries(metrics.map((metric) => [
    metric,
    Number((valid.reduce((sum, entry) => sum + Number(entry.ratings?.[metric] || 0), 0) / valid.length).toFixed(1))
  ]));
  const strongest = [...metrics].sort((left, right) => averages[right] - averages[left] || left.localeCompare(right))[0];
  const friction = [...metrics].sort((left, right) => averages[left] - averages[right] || left.localeCompare(right))[0];
  return { available: true, count: valid.length, averages, strongest, friction, warning };
}
export function buildLocalPlaytestExport(receipts = [], journey = loadPlaytestJourney()) {
  const valid = validReceipts(receipts);
  return {
    schemaVersion: PLAYTEST_RECEIPT_SCHEMA_VERSION,
    kind: "local-playtest-receipt-pack",
    count: valid.length,
    receipts: valid,
    journey: buildPlaytestJourneySummary(journey),
    privacy: "Only the playtest notes you saved and relative play-progress checkpoints; no account identifier or save payload is included; no token or absolute journey timestamp is included. This small, self-selected sample cannot support cohort, retention, comprehension, or causal claims."
  };
}
