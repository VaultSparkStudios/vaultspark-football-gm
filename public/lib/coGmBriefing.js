import { buildFranchiseCommandStack } from "./franchiseCommandCenter.js";

export const CO_GM_BRIEFING_SCHEMA_VERSION = "1.0";
const MAX_RECEIPTS = 3;
const MAX_NEEDS = 4;

function text(value, fallback = "") {
  const clean = (entry) => typeof entry === "string" || (typeof entry === "number" && Number.isFinite(entry))
    ? String(entry).trim() : "";
  return clean(value) || clean(fallback);
}

function numberOrNull(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const record = (value) => isRecord(value) ? value : {};
const records = (value) => Array.isArray(value) ? value.filter((entry) => isRecord(entry) && Object.keys(entry).length) : [];

function commandShape(card = {}, pendingDecision = null) {
  return {
    rank: numberOrNull(card.rank),
    lane: text(card.lane, "Optional"),
    title: text(card.title, "Review the live franchise"),
    detail: text(card.detail),
    reasonCode: text(card.reasonCode, "league-pulse"),
    blocking: card.blocking === true,
    action: text(card.action, "open-tab"),
    decisionId: card.action === "choose-gm-decision" ? text(pendingDecision?.id || pendingDecision?.decisionId) || null : null,
    occurrenceKey: card.action === "choose-gm-decision" ? text(pendingDecision?.occurrenceKey) || null : null,
    targetTab: text(card.targetTab) || null,
    choices: records(card.choices).slice(0, 4).map((choice) => ({
      id: text(choice.id),
      label: text(choice.label, choice.id),
      effect: text(choice.effect)
    }))
  };
}

function receiptShape(entry = {}) {
  const intent = record(entry.intent);
  const outcome = record(entry.outcome);
  return {
    id: text(entry.id),
    year: numberOrNull(entry.year),
    week: numberOrNull(entry.week),
    declared: text(intent.tactic?.label || intent.gmDecision?.label || intent.label, "No declaration recorded"),
    observed: text(outcome.observed || outcome.score || outcome.result, "Outcome pending"),
    aligned: typeof outcome.aligned === "boolean" ? outcome.aligned : null
  };
}

export function buildCoGmBriefingPacket({
  dashboard: sourceDashboard = {},
  newsRows: sourceNews = [],
  pendingDecision: sourceDecision = null,
  pendingChoice: sourceChoice = null
} = {}) {
  const source = record(sourceDashboard);
  const needs = (Array.isArray(source.rosterNeeds) ? source.rosterNeeds : [])
    .map((need) => typeof need === "string" ? text(need) : text(record(need).pos || record(need).position))
    .filter(Boolean);
  // Normalize optional collection containers before handing them to the shared
  // command builder, so one damaged row cannot suppress valid visible context.
  const dashboard = { ...source,
    injuryReport: records(source.injuryReport).filter((entry) =>
      [entry.teamId, entry.playerId, entry.name, entry.type, entry.injury?.type].some((value) => text(value))),
    rosterNeeds: needs, architectLedger: records(source.architectLedger).filter((entry) =>
      text(entry.id) || numberOrNull(entry.year) !== null || Object.keys(record(entry.intent)).length || Object.keys(record(entry.outcome)).length) };
  const newsRows = records(sourceNews).filter((entry) => text(entry.headline));
  const decisionId = text(sourceDecision?.id) || text(sourceDecision?.decisionId);
  const pendingDecision = isRecord(sourceDecision) && decisionId ? {
    id: decisionId, occurrenceKey: text(sourceDecision.occurrenceKey) || null,
    year: numberOrNull(sourceDecision.year), week: numberOrNull(sourceDecision.week),
    label: text(sourceDecision.label), prompt: text(sourceDecision.prompt), type: text(sourceDecision.type),
    options: records(sourceDecision.options).filter((option) => text(option.id)).map((option) => ({
      id: text(option.id), label: text(option.label, option.id), effect: text(option.effect)
    }))
  } : null;
  const choiceId = text(sourceChoice?.choiceId);
  const choiceMatches = pendingDecision && isRecord(sourceChoice) && choiceId &&
    text(sourceChoice.decisionId) === pendingDecision.id &&
    (!pendingDecision.occurrenceKey || text(sourceChoice.occurrenceKey) === pendingDecision.occurrenceKey) &&
    ["year", "week"].every((key) => sourceChoice[key] === undefined ||
      (numberOrNull(sourceChoice[key]) !== null && numberOrNull(sourceChoice[key]) === pendingDecision[key])) &&
    pendingDecision.options.some((option) => option.id === choiceId);
  const pendingChoice = choiceMatches ? { choiceId } : null;
  const team = record(dashboard.controlledTeam);
  const owner = [team.owner?.expectation, dashboard.owner?.expectation, dashboard.ownerState?.expectation].find(isRecord) || {};
  const controlledTeamId = text(dashboard.controlledTeamId) || text(team.id) || "unknown";
  const knownContext = controlledTeamId !== "unknown" && numberOrNull(dashboard.currentYear) !== null &&
    numberOrNull(dashboard.currentWeek) !== null && Boolean(text(dashboard.phase));
  const invalidDecision = sourceDecision !== null && (!pendingDecision ||
    (sourceDecision.occurrenceKey !== undefined && sourceDecision.occurrenceKey !== null && !text(sourceDecision.occurrenceKey)));
  const commands = knownContext && !invalidDecision
    ? buildFranchiseCommandStack({ dashboard, newsRows, pendingDecision, pendingChoice }) : [];
  const currentCommand = commands.find((card) => card.blocking) || commands[0] || (invalidDecision ? {
    blocking: true, action: "blocked", reasonCode: "decision-unavailable", title: "Review the live franchise",
    detail: "Decision context is unavailable. Reload the Desk before advancing."
  } : {});
  const injuries = dashboard.injuryReport
    .filter((entry) => !entry.teamId || entry.teamId === controlledTeamId);
  const ledger = dashboard.architectLedger
    .filter((entry) => !entry.teamId || entry.teamId === controlledTeamId)
    .slice(-MAX_RECEIPTS)
    .reverse()
    .map(receiptShape);
  const thesis = record(dashboard.architectThesis);
  const newsHeadline = text(newsRows[0]?.headline || records(dashboard.newsLog).find((entry) => text(entry.headline))?.headline);

  return {
    schemaVersion: CO_GM_BRIEFING_SCHEMA_VERSION,
    kind: "co-gm-briefing",
    authority: {
      teamId: controlledTeamId,
      teamName: text(team.name || team.fullName || dashboard.controlledTeamName, controlledTeamId),
      year: numberOrNull(dashboard.currentYear),
      week: numberOrNull(dashboard.currentWeek),
      phase: text(dashboard.phase, "unknown"),
      record: text(team.record || team.recordLabel || dashboard.controlledTeamRecord, "unavailable")
    },
    currentCommand: commandShape(currentCommand, pendingDecision),
    pressure: {
      ownerMandate: text(owner.mandate, "No explicit owner mandate surfaced"),
      ownerTrend: text(owner.trend, "watch"),
      ownerHeat: numberOrNull(owner.heat),
      capSpace: numberOrNull(dashboard.cap?.capSpace),
      controlledTeamInjuries: injuries.length,
      rosterNeeds: needs.slice(0, MAX_NEEDS),
      leagueHeadline: newsHeadline || "No current league headline"
    },
    architectThesis: {
      focusPathId: text(thesis.focusPathId) || null,
      revision: numberOrNull(thesis.revision),
      pendingAdaptation: isRecord(thesis.pendingAdaptation) ? {
        mode: text(thesis.pendingAdaptation.mode),
        label: text(thesis.pendingAdaptation.label),
        sourceEntryId: text(thesis.pendingAdaptation.sourceEntryId) || null
      } : null
    },
    recentDecisionReceipts: ledger,
    disclosure: {
      bounded: true,
      included: ["current team, season, and week", "ranked command", "pressure summary", "architect thesis", `up to ${MAX_RECEIPTS} recent decisions`],
      excluded: ["save file", "full roster ratings", "credentials", "personal identifiers", "hidden simulation state"],
      note: "Player-created export of what you can already see. It describes your situation; it does not prove what caused it."
    }
  };
}

export function serializeCoGmBriefingPacket(packet) {
  return JSON.stringify(packet, null, 2);
}

export function coGmBriefingFilename(packet = {}) {
  const team = text(packet.authority?.teamId, "franchise").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const year = packet.authority?.year ?? "year";
  const week = packet.authority?.week ?? "week";
  return `co-gm-brief-${team}-${year}-w${week}.json`;
}
