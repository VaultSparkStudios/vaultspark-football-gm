import { tacticDefinition } from "../../public/lib/tacticalFilmRoom.js";

const MAX_ARCHITECT_LEDGER = 40;

function compactRecord(team = null) {
  if (!team) return null;
  return {
    wins: Number(team.wins || 0),
    losses: Number(team.losses || 0),
    ties: Number(team.ties || 0)
  };
}

function adaptationFor({ tacticalReceipt = null, gmDecision = null } = {}) {
  if (tacticalReceipt) {
    return tacticalReceipt.aligned
      ? `Film matched the declared ${tacticalReceipt.label} intent. Decide whether to reinforce it or counter the next matchup.`
      : `Film did not match the declared ${tacticalReceipt.label} intent. Review personnel, opponent, and execution before repeating it.`;
  }
  if (gmDecision?.applied) {
    return gmDecision.commitment
      ? `The ${gmDecision.decision?.label || "General Manager"} promise is committed; complete its named follow-through before the deadline.`
      : `Review the observed roster and owner response before making the next controlled commitment.`;
  }
  return "No tactic or General Manager choice was attached. Review the new league state before advancing again.";
}

export function buildArchitectLedgerEntry({
  teamId,
  command,
  started,
  completed,
  gmDecision = null,
  tacticalReceipt = null,
  teamBefore = null,
  teamAfter = null
} = {}) {
  if (!teamId || !command?.ok || !started || !completed) return null;
  const tactic = command.tactic ? tacticDefinition(command.tactic) : null;
  const decision = gmDecision?.applied ? gmDecision.decision : null;
  const id = `architect-${teamId}-${started.year}-${started.week}-${completed.year}-${completed.week}`;
  return {
    schemaVersion: "1.0",
    id,
    teamId,
    year: completed.year,
    week: completed.week,
    intent: {
      tactic: tactic ? { id: tactic.id, label: tactic.label, intent: tactic.intent } : null,
      gmDecision: decision ? {
        id: decision.id,
        label: decision.label,
        choiceId: decision.choiceId,
        summary: decision.receipt?.summary || decision.effect || "Choice committed."
      } : null
    },
    execution: {
      commandVersion: "2.0",
      started,
      completed,
      count: command.count
    },
    outcome: {
      result: tacticalReceipt?.result || null,
      score: tacticalReceipt?.score || null,
      observed: tacticalReceipt?.observed || "No tactic-specific film signal was requested.",
      aligned: tacticalReceipt?.aligned ?? null,
      recordBefore: compactRecord(teamBefore),
      recordAfter: compactRecord(teamAfter)
    },
    nextAdaptation: adaptationFor({ tacticalReceipt, gmDecision }),
    disclaimer: "This ledger joins declared intent to observed game and league receipts. It does not claim the decision or tactic alone caused the result."
  };
}

export function appendArchitectLedger(session, input = {}) {
  const entry = buildArchitectLedgerEntry(input);
  if (!entry || !session?.league) return null;
  if (!Array.isArray(session.league.architectLedger)) session.league.architectLedger = [];
  const existing = session.league.architectLedger.findIndex((candidate) => candidate.id === entry.id);
  if (existing >= 0) session.league.architectLedger.splice(existing, 1);
  session.league.architectLedger.unshift(entry);
  session.league.architectLedger = session.league.architectLedger.slice(0, MAX_ARCHITECT_LEDGER);
  return entry;
}

export function architectLedgerForTeam(league = {}, teamId, limit = 12) {
  return (league.architectLedger || [])
    .filter((entry) => entry.teamId === teamId)
    .slice(0, Math.max(1, Math.min(MAX_ARCHITECT_LEDGER, Number(limit) || 12)));
}
