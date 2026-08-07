import { buildFranchiseCommandStack } from "./franchiseCommandCenter.js";

export const CO_GM_BRIEFING_SCHEMA_VERSION = "1.0";
const MAX_RECEIPTS = 3;
const MAX_NEEDS = 4;

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function numberOrNull(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function commandShape(card = {}) {
  return {
    rank: numberOrNull(card.rank),
    lane: text(card.lane, "Optional"),
    title: text(card.title, "Review the live franchise"),
    detail: text(card.detail),
    reasonCode: text(card.reasonCode, "league-pulse"),
    blocking: card.blocking === true,
    action: text(card.action, "open-tab"),
    targetTab: text(card.targetTab) || null,
    choices: (Array.isArray(card.choices) ? card.choices : []).slice(0, 4).map((choice) => ({
      id: text(choice.id),
      label: text(choice.label, choice.id),
      effect: text(choice.effect)
    }))
  };
}

function receiptShape(entry = {}) {
  const intent = entry.intent || {};
  const outcome = entry.outcome || {};
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
  dashboard = {},
  newsRows = [],
  pendingDecision = null,
  pendingChoice = null
} = {}) {
  const team = dashboard.controlledTeam || {};
  const owner = team.owner?.expectation || dashboard.owner?.expectation || dashboard.ownerState?.expectation || {};
  const commands = buildFranchiseCommandStack({ dashboard, newsRows, pendingDecision, pendingChoice });
  const currentCommand = commands.find((card) => card.blocking) || commands[0] || {};
  const controlledTeamId = text(dashboard.controlledTeamId || team.id, "unknown");
  const injuries = (Array.isArray(dashboard.injuryReport) ? dashboard.injuryReport : [])
    .filter((entry) => !entry.teamId || entry.teamId === controlledTeamId);
  const needs = (Array.isArray(dashboard.rosterNeeds) ? dashboard.rosterNeeds : [])
    .map((need) => text(need.pos || need.position || need))
    .filter(Boolean)
    .slice(0, MAX_NEEDS);
  const ledger = (Array.isArray(dashboard.architectLedger) ? dashboard.architectLedger : [])
    .filter((entry) => !entry.teamId || entry.teamId === controlledTeamId)
    .slice(-MAX_RECEIPTS)
    .reverse()
    .map(receiptShape);
  const thesis = dashboard.architectThesis || {};
  const newsHeadline = text(newsRows[0]?.headline || dashboard.newsLog?.[0]?.headline);

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
    currentCommand: commandShape(currentCommand),
    pressure: {
      ownerMandate: text(owner.mandate, "No explicit owner mandate surfaced"),
      ownerTrend: text(owner.trend, "watch"),
      ownerHeat: numberOrNull(owner.heat),
      capSpace: numberOrNull(dashboard.cap?.capSpace),
      controlledTeamInjuries: injuries.length,
      rosterNeeds: needs,
      leagueHeadline: newsHeadline || "No current league headline"
    },
    architectThesis: {
      focusPathId: text(thesis.focusPathId) || null,
      revision: numberOrNull(thesis.revision) ?? 0,
      pendingAdaptation: thesis.pendingAdaptation ? {
        mode: text(thesis.pendingAdaptation.mode),
        label: text(thesis.pendingAdaptation.label),
        sourceEntryId: text(thesis.pendingAdaptation.sourceEntryId) || null
      } : null
    },
    recentDecisionReceipts: ledger,
    disclosure: {
      bounded: true,
      included: ["current franchise authority", "ranked command", "pressure summary", "architect thesis", `up to ${MAX_RECEIPTS} decision receipts`],
      excluded: ["save payload", "full roster ratings", "credentials", "personal identifiers", "hidden simulation state"],
      note: "Player-created export from visible franchise authority. Descriptive context is not causal proof."
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
