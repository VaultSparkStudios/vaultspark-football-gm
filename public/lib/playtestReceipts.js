export const PLAYTEST_RECEIPT_SCHEMA_VERSION = "1.0";
export const PLAYTEST_RECEIPT_STORAGE_KEY = "vsfgm:playtest-receipts:v1";
const PLAYTEST_RECEIPT_LIMIT = 20;

function boundedRating(value, label) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error(`${label} must be rated from 1 to 5.`);
  return rating;
}

function publicSafeNote(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
}

export function buildLocalPlaytestReceipt(input = {}, context = {}) {
  const createdAt = input.createdAt || new Date().toISOString();
  const teamId = String(context.teamId || "unknown").slice(0, 12);
  return {
    schemaVersion: PLAYTEST_RECEIPT_SCHEMA_VERSION,
    kind: "local-playtest-receipt",
    receiptId: `playtest-${createdAt}-${teamId}`,
    createdAt,
    context: {
      year: Number(context.year) || null,
      week: Number(context.week) || null,
      phase: String(context.phase || "unknown").slice(0, 32),
      teamId,
      openingContractStatus: String(context.openingContractStatus || "not-observed").slice(0, 24),
      evidenceMoment: String(context.evidenceMoment || "manual").slice(0, 48)
    },
    ratings: {
      clarity: boundedRating(input.clarity, "Clarity"),
      agency: boundedRating(input.agency, "Agency"),
      pace: boundedRating(input.pace, "Pace"),
      returnIntent: boundedRating(input.returnIntent, "Return intent")
    },
    note: publicSafeNote(input.note),
    privacy: {
      localOnlyUntilShared: true,
      personalIdentifiersCollected: false,
      savePayloadIncluded: false
    }
  };
}

export function loadLocalPlaytestReceipts(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(PLAYTEST_RECEIPT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry?.schemaVersion === PLAYTEST_RECEIPT_SCHEMA_VERSION && entry?.kind === "local-playtest-receipt").slice(0, PLAYTEST_RECEIPT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalPlaytestReceipt(receipt, storage = globalThis.localStorage) {
  if (receipt?.schemaVersion !== PLAYTEST_RECEIPT_SCHEMA_VERSION || receipt?.kind !== "local-playtest-receipt") {
    throw new Error("A valid local playtest receipt is required.");
  }
  const receipts = [receipt, ...loadLocalPlaytestReceipts(storage).filter((entry) => entry.receiptId !== receipt.receiptId)].slice(0, PLAYTEST_RECEIPT_LIMIT);
  storage?.setItem?.(PLAYTEST_RECEIPT_STORAGE_KEY, JSON.stringify(receipts));
  return receipts;
}

export function buildLocalPlaytestTrend(receipts = []) {
  const valid = receipts
    .filter((entry) => entry?.schemaVersion === PLAYTEST_RECEIPT_SCHEMA_VERSION && entry?.kind === "local-playtest-receipt")
    .slice(0, PLAYTEST_RECEIPT_LIMIT);
  const warning = "Small, self-selected local sample; ratings describe recorded moments and do not prove player-wide impact or causality.";
  if (valid.length < 3) return { available: false, count: valid.length, minimum: 3, warning };
  const metrics = ["clarity", "agency", "pace", "returnIntent"];
  const averages = Object.fromEntries(metrics.map((metric) => [
    metric,
    Number((valid.reduce((sum, entry) => sum + Number(entry.ratings?.[metric] || 0), 0) / valid.length).toFixed(1))
  ]));
  const strongest = [...metrics].sort((left, right) => averages[right] - averages[left] || left.localeCompare(right))[0];
  const friction = [...metrics].sort((left, right) => averages[left] - averages[right] || left.localeCompare(right))[0];
  return { available: true, count: valid.length, averages, strongest, friction, warning };
}
export function buildLocalPlaytestExport(receipts = []) {
  const valid = receipts.filter((entry) => entry?.schemaVersion === PLAYTEST_RECEIPT_SCHEMA_VERSION && entry?.kind === "local-playtest-receipt").slice(0, PLAYTEST_RECEIPT_LIMIT);
  return {
    schemaVersion: PLAYTEST_RECEIPT_SCHEMA_VERSION,
    kind: "local-playtest-receipt-pack",
    count: valid.length,
    receipts: valid,
    privacy: "Explicit local receipts only; no account identifier or save payload is included."
  };
}