export const ARCHITECT_THESIS_SCHEMA_VERSION = "1.0";
export const ARCHITECT_FOCUS_PATHS = Object.freeze(["results", "stewardship", "promise", "identity"]);
export const ARCHITECT_ADAPTATION_MODES = Object.freeze(["reinforce", "counter", "investigate"]);

const MODE_LABELS = Object.freeze({ reinforce: "Reinforce", counter: "Counter", investigate: "Investigate" });
const MAX_RESOLUTIONS = 20;

function thesisStore(league) {
  if (!league.architectTheses || typeof league.architectTheses !== "object") league.architectTheses = {};
  return league.architectTheses;
}

function latestObservedEntry(league, teamId) {
  return (league.architectLedger || []).find((entry) => entry.teamId === teamId && entry.outcome) || null;
}

export function auditArchitectThesisLineage(league = {}, teamId = null) {
  const stored = teamId ? league.architectTheses?.[teamId] : null;
  const entries = new Map((league.architectLedger || [])
    .filter((entry) => entry.teamId === teamId)
    .map((entry) => [entry.id, entry]));
  const issues = [];
  if (stored?.pendingAdaptation && !entries.has(stored.pendingAdaptation.sourceEntryId)) {
    issues.push({ code: "THESIS_PENDING_SOURCE_MISSING", entryId: stored.pendingAdaptation.sourceEntryId });
  }
  const seen = new Set();
  for (const resolution of stored?.resolutions || []) {
    if (seen.has(resolution.id)) issues.push({ code: "THESIS_RESOLUTION_DUPLICATE", entryId: resolution.id });
    seen.add(resolution.id);
    const source = entries.get(resolution.sourceEntryId);
    const resolved = entries.get(resolution.resolvedByEntryId);
    if (!source) issues.push({ code: "THESIS_RESOLUTION_SOURCE_MISSING", entryId: resolution.sourceEntryId });
    if (!resolved) issues.push({ code: "THESIS_RESOLUTION_RECEIPT_MISSING", entryId: resolution.resolvedByEntryId });
    if (resolved && resolution.observed !== (resolved.outcome?.observed || "No tactic-specific film signal was recorded.")) {
      issues.push({ code: "THESIS_RESOLUTION_OBSERVATION_DRIFT", entryId: resolution.resolvedByEntryId });
    }
  }
  return {
    schemaVersion: ARCHITECT_THESIS_SCHEMA_VERSION,
    valid: issues.length === 0,
    pendingCount: stored?.pendingAdaptation ? 1 : 0,
    resolutionCount: Array.isArray(stored?.resolutions) ? stored.resolutions.length : 0,
    issues
  };
}

export function getArchitectThesis(league = {}, teamId = null) {
  const stored = teamId ? league.architectTheses?.[teamId] : null;
  return {
    schemaVersion: ARCHITECT_THESIS_SCHEMA_VERSION,
    teamId,
    revision: Number(stored?.revision || 0),
    focusPathId: stored?.focusPathId || null,
    focusBaseline: stored?.focusBaseline || null,
    pendingAdaptation: stored?.pendingAdaptation || null,
    resolutions: Array.isArray(stored?.resolutions) ? stored.resolutions.slice(0, MAX_RESOLUTIONS) : [],
    updatedAt: stored?.updatedAt || null,
    lineage: auditArchitectThesisLineage(league, teamId),
    disclaimer: "This is a player-authored review lens. It grants no hidden bonus and does not claim a decision caused a result."
  };
}

export function setArchitectThesis(league, input = {}) {
  const { teamId, year = null, week = null } = input;
  const hasFocus = Object.prototype.hasOwnProperty.call(input, "focusPathId");
  const hasAdaptation = Object.prototype.hasOwnProperty.call(input, "adaptationMode");
  const focusPathId = hasFocus ? input.focusPathId : null;
  const adaptationMode = hasAdaptation ? input.adaptationMode : null;
  if (!league || !teamId || !(league.teams || []).some((team) => team.id === teamId)) {
    return { ok: false, status: 404, reasonCode: "ARCHITECT_THESIS_TEAM_NOT_FOUND", error: "The controlled team could not be found." };
  }
  if (hasFocus && focusPathId !== null && !ARCHITECT_FOCUS_PATHS.includes(focusPathId)) {
    return { ok: false, status: 400, reasonCode: "ARCHITECT_THESIS_UNKNOWN_FOCUS", error: "Choose a recognized Architect mastery path." };
  }
  if (hasAdaptation && adaptationMode !== null && !ARCHITECT_ADAPTATION_MODES.includes(adaptationMode)) {
    return { ok: false, status: 400, reasonCode: "ARCHITECT_THESIS_UNKNOWN_ADAPTATION", error: "Choose Reinforce, Counter, or Investigate." };
  }
  const store = thesisStore(league);
  const previous = store[teamId] || {};
  const currentRevision = Number(previous.revision || 0);
  if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== currentRevision) {
    return {
      ok: false,
      status: 409,
      reasonCode: "ARCHITECT_THESIS_REVISION_CONFLICT",
      error: "The Architect thesis changed in another view. Reload its current authority before saving.",
      thesis: getArchitectThesis(league, teamId)
    };
  }
  let pendingAdaptation = previous.pendingAdaptation || null;
  if (hasAdaptation && adaptationMode) {
    const source = latestObservedEntry(league, teamId);
    if (!source) {
      return { ok: false, status: 409, reasonCode: "ARCHITECT_THESIS_NEEDS_FILM", error: "Commit one weekly receipt before declaring an adaptation hypothesis." };
    }
    pendingAdaptation = {
      mode: adaptationMode,
      label: MODE_LABELS[adaptationMode],
      sourceEntryId: source.id,
      sourceObserved: source.outcome?.observed || "No tactic-specific film signal was recorded.",
      sourceAligned: source.outcome?.aligned ?? null,
      declaredAt: { year, week }
    };
  } else if (hasAdaptation && adaptationMode === null) {
    pendingAdaptation = null;
  }
  store[teamId] = {
    schemaVersion: ARCHITECT_THESIS_SCHEMA_VERSION,
    teamId,
    revision: currentRevision + 1,
    focusPathId: hasFocus ? focusPathId : previous.focusPathId || null,
    focusBaseline: hasFocus ? input.focusBaseline || null : previous.focusBaseline || null,
    pendingAdaptation,
    resolutions: Array.isArray(previous.resolutions) ? previous.resolutions.slice(0, MAX_RESOLUTIONS) : [],
    updatedAt: { year, week }
  };
  return { ok: true, thesis: getArchitectThesis(league, teamId) };
}

export function resolveArchitectThesis(league, teamId, architectEntry) {
  const stored = league?.architectTheses?.[teamId];
  const pending = stored?.pendingAdaptation;
  if (!stored || !pending || !architectEntry) return null;
  const observed = architectEntry.outcome?.observed || "No tactic-specific film signal was recorded.";
  const aligned = architectEntry.outcome?.aligned;
  const resolution = {
    schemaVersion: ARCHITECT_THESIS_SCHEMA_VERSION,
    id: `thesis-${architectEntry.id}`,
    mode: pending.mode,
    label: pending.label,
    sourceEntryId: pending.sourceEntryId,
    declaredRevision: Number(stored.revision || 0),
    resolvedByEntryId: architectEntry.id,
    observed,
    aligned: aligned ?? null,
    summary: `${pending.label} was the declared review lens. New film observed: ${observed}`,
    disclaimer: "This resolution describes declaration and observation in sequence; it does not infer causation."
  };
  stored.pendingAdaptation = null;
  stored.resolutions = [resolution, ...(stored.resolutions || []).filter((item) => item.id !== resolution.id)].slice(0, MAX_RESOLUTIONS);
  stored.revision = Number(stored.revision || 0) + 1;
  stored.updatedAt = { year: architectEntry.year ?? null, week: architectEntry.week ?? null };
  return resolution;
}
