export const COMMUNITY_EVENT_SCHEMA_VERSION = "1.0";
export const COMMUNITY_SNAPSHOT_SCHEMA_VERSION = "1.0";
export const COMMUNITY_RAW_RETENTION_DAYS = 30;
export const COMMUNITY_SUPPRESSION_THRESHOLD = 5;
export const COMMUNITY_BATCH_LIMIT = 24;
export const COMMUNITY_RETURN_GAPS = Object.freeze(["same-day", "1-6", "7-29", "30-plus"]);

const TYPE_RULES = Object.freeze({
  league_started: {
    dimensions: ["runtime", "mode", "team", "era", "archetype", "rules", "difficulty", "challenge"],
    metrics: ["ownerMode", "narratives", "compPicks", "chemistry"]
  },
  weeks_managed: {
    dimensions: ["runtime", "phase", "tactic", "difficulty", "decision"],
    metrics: ["weeks", "wins", "losses", "ties", "seasonsCompleted", "playoffBerths", "championships"]
  },
  trade_completed: {
    dimensions: ["runtime", "counterparty", "balance"],
    metrics: ["playersSent", "playersReceived", "picksSent", "picksReceived"]
  },
  draft_pick: {
    dimensions: ["runtime", "position", "round", "verdict"],
    metrics: ["pickNumber", "overallBand", "potentialBand"]
  },
  free_agent_signed: {
    dimensions: ["runtime", "position", "contractBand"],
    metrics: ["years", "annualValueBand"]
  },
  contract_completed: {
    dimensions: ["runtime", "action", "position", "contractBand"],
    metrics: ["years", "annualValueBand"]
  },
  staff_changed: {
    dimensions: ["runtime", "role", "action"],
    metrics: []
  },
  settings_changed: {
    dimensions: ["runtime", "difficulty", "adaptive", "era", "mode"],
    metrics: []
  },
  challenge_completed: {
    dimensions: ["runtime", "challenge", "resultBand"],
    metrics: ["weeks", "score"]
  },
  rare_feat: {
    dimensions: ["runtime", "feat"],
    metrics: ["count"]
  },
  // Coarse first-steps milestones. Each carries no metrics; `values` pins a
  // dimension to a closed list, so anything else is dropped, never stored.
  setup_finished: { dimensions: ["runtime"], metrics: [] },
  first_advance: { dimensions: ["runtime"], metrics: [] },
  first_season_finished: { dimensions: ["runtime"], metrics: [] },
  return_visit: { dimensions: ["runtime", "gap"], metrics: [], values: { gap: COMMUNITY_RETURN_GAPS } }
});

export const COMMUNITY_EVENT_TYPES = Object.freeze(Object.keys(TYPE_RULES));
export const COMMUNITY_FUNNEL_EVENT_TYPES = Object.freeze(["setup_finished", "first_advance", "first_season_finished", "return_visit"]);

/** Days since the previous visit, as one of four fixed buckets. */
export function returnVisitGap(days) {
  const whole = Math.floor(Number(days));
  if (!Number.isFinite(whole) || whole < 1) return COMMUNITY_RETURN_GAPS[0];
  return COMMUNITY_RETURN_GAPS[whole < 7 ? 1 : whole < 30 ? 2 : 3];
}

function compactToken(value, maxLength = 48) {
  if (value == null || value === "") return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return normalized || null;
}

function boundedNumber(value, key) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const whole = Math.round(parsed);
  const ranges = {
    weeks: [0, 40], wins: [0, 40], losses: [0, 40], ties: [0, 40],
    seasonsCompleted: [0, 8], playoffBerths: [0, 8], championships: [0, 8],
    playersSent: [0, 12], playersReceived: [0, 12], picksSent: [0, 12], picksReceived: [0, 12],
    pickNumber: [1, 512], overallBand: [0, 10], potentialBand: [0, 10],
    years: [0, 10], annualValueBand: [0, 20], ownerMode: [0, 1], narratives: [0, 1],
    compPicks: [0, 1], chemistry: [0, 1], score: [0, 1000000], count: [1, 20]
  };
  const [min, max] = ranges[key] || [0, 1000];
  return Math.max(min, Math.min(max, whole));
}

export function normalizeCommunityEvent(input, { now = Date.now() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const type = compactToken(input.type, 32);
  const rules = TYPE_RULES[type];
  if (!rules) return null;
  const eventId = String(input.eventId || "").trim();
  if (!/^[a-zA-Z0-9_-]{12,96}$/.test(eventId)) return null;
  const occurredMs = Date.parse(input.occurredAt || "");
  const maxSkew = 7 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(occurredMs) || Math.abs(occurredMs - now) > maxSkew) return null;

  const dimensions = {};
  for (const key of rules.dimensions) {
    const value = compactToken(input.dimensions?.[key]);
    const allowed = rules.values?.[key];
    if (value != null && (!allowed || allowed.includes(value))) dimensions[key] = value;
  }
  const metrics = {};
  for (const key of rules.metrics) {
    const value = boundedNumber(input.metrics?.[key], key);
    if (value != null) metrics[key] = value;
  }
  return {
    schemaVersion: COMMUNITY_EVENT_SCHEMA_VERSION,
    eventId,
    type,
    occurredAt: new Date(occurredMs).toISOString(),
    dimensions,
    metrics,
    evidenceTier: input.evidenceTier === "server-runtime" ? "server-runtime" : "browser-receipt"
  };
}

export function band(value, size, maximum = 20) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(maximum, Math.floor(number / size));
}

export function publicStat({ id, label, value = null, unit = "count", period, sampleSize = 0, computedAt, interpretation, status = "live", distribution = null }) {
  return {
    id,
    label,
    value: value != null && Number.isFinite(Number(value)) ? Number(value) : null,
    unit,
    period,
    sampleSize: Math.max(0, Number(sampleSize) || 0),
    computedAt,
    interpretation,
    status,
    ...(distribution ? { distribution } : {})
  };
}
