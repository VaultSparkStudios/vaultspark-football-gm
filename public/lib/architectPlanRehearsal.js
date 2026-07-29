import {
  buildTacticalMatchupBrief,
  previewTacticalIdentity,
  tacticDefinition
} from "./tacticalFilmRoom.js";

function humanize(value, fallback) {
  const text = String(value || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function authorityFor(dashboard = {}) {
  return [
    dashboard.franchiseId || "legacy-franchise",
    dashboard.controlledTeamId || "unknown-team",
    dashboard.currentYear ?? "?",
    dashboard.currentWeek ?? "?"
  ].join(":");
}

export function buildArchitectPlanRehearsal({ dashboard = {}, decisionChoice = null, tacticId = null } = {}) {
  const tactic = tacticDefinition(tacticId);
  const brief = buildTacticalMatchupBrief(dashboard);
  const matchup = brief.options?.find((option) => option.id === tacticId) || null;
  const recentFilm = (dashboard.tacticalFilmLedger || []).find((entry) => entry?.tactic === tacticId) || null;
  const latestArchitecture = dashboard.architectLedger?.[0] || null;
  const opening = dashboard.startScenarioReceipt?.effects || {};
  const identityPreview = tactic ? previewTacticalIdentity(dashboard.tacticalFilmLedger || [], tactic.id) : null;
  const thesis = dashboard.architectThesis?.pendingAdaptation || null;

  let counterSignal = {
    source: tactic ? "Declared tactic tradeoff" : "No-plan boundary",
    text: tactic?.tradeoff || "Without a declared tactic, the ledger will record no tactical intent for this week."
  };
  if (recentFilm?.aligned === false) {
    counterSignal = {
      source: "Latest matching film",
      text: `${recentFilm.label || tactic?.label || "This plan"} last missed its declared target: ${recentFilm.observed || "no matching signal was recorded"}.`
    };
  } else if (latestArchitecture?.nextAdaptation) {
    counterSignal = {
      source: "Latest Architect review",
      text: String(latestArchitecture.nextAdaptation)
    };
  }

  return {
    schemaVersion: "1.0",
    kind: "architect-plan-rehearsal",
    authority: authorityFor(dashboard),
    title: `Week ${dashboard.currentWeek ?? "?"} · Architect's Red Team`,
    decision: {
      label: decisionChoice?.choiceId
        ? humanize(decisionChoice.choiceId, "General Manager choice")
        : "No General Manager choice attached",
      source: decisionChoice?.choiceId ? "Staged controlled choice" : "Live weekly command"
    },
    tactic: {
      id: tactic?.id || null,
      label: tactic?.label || "Explicit no-plan",
      intent: tactic?.intent || "No tactical intent will be attributed.",
      matchup: matchup?.matchup || brief.read || "No scheduled matchup signal is available."
    },
    franchisePromise: opening.identity?.label || "No Opening Contract identity observed",
    activePressure: opening.pressure?.label
      || dashboard.ownerState?.owner?.expectation?.mandate
      || "No owner pressure observed",
    identityPreview: identityPreview?.copy || "No executed tactic means no identity-ledger change.",
    architectThesis: thesis ? {
      label: `${thesis.label} hypothesis`,
      text: `Declared from ${thesis.sourceEntryId}: ${thesis.sourceObserved}`
    } : null,
    counterSignal,
    disclaimer: "This rehearsal challenges the declared plan with existing receipts. It predicts no result, grants no hidden bonus, and mutates nothing until Commit Plan."
  };
}

export function planRehearsalEvidence(rehearsal = {}) {
  if (rehearsal?.schemaVersion !== "1.0" || rehearsal?.kind !== "architect-plan-rehearsal") return null;
  return {
    schemaVersion: "1.0",
    authority: String(rehearsal.authority || "unknown").slice(0, 160),
    counterSignalSource: String(rehearsal.counterSignal?.source || "unknown").slice(0, 80),
    tacticId: rehearsal.tactic?.id || null,
    reviewed: true
  };
}
