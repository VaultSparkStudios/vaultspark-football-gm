import { initGmLegacy } from "./gmLegacyScore.js";
import { GM_DECISION_CATALOG } from "./gmDecisionAuthority.js";

function normalizePayload(payload = {}) {
  const decisionId = String(payload.decisionId || payload.id || "").trim().toLowerCase();
  const choiceId = String(payload.choiceId || payload.choice || "").trim().toLowerCase();
  if (!decisionId || !choiceId) return null;
  return {
    decisionId,
    choiceId,
    type: payload.type ? String(payload.type).trim() : null,
    week: Number.isFinite(Number(payload.week)) ? Number(payload.week) : null,
    occurrenceKey: payload.occurrenceKey ? String(payload.occurrenceKey) : null
  };
}

function teamPlayers(session, teamId) {
  return (session.league.players || []).filter((player) => player.teamId === teamId && player.status === "active");
}

function deadlineFor(session, consequence) {
  if (Number.isFinite(consequence.deadlineWeek)) return { year: session.currentYear, week: consequence.deadlineWeek };
  const week = Math.min(18, session.currentWeek + (consequence.deadlineOffset || 2));
  return { year: session.currentYear, week };
}

function attemptImmediateAction(session, consequence, teamId) {
  if (consequence.choiceId === "start-backup") {
    const chart = session.getDepthChart(teamId)?.QB || [];
    const qbs = teamPlayers(session, teamId).filter((player) => player.position === "QB");
    const available = qbs.filter((player) => !player.injury || player.injury.weeksRemaining <= 0);
    const currentStarter = chart[0];
    const backup = available.find((player) => player.id !== currentStarter) || available[0];
    if (!backup) return { ok: false, error: "No available backup quarterback can be promoted." };
    const ordered = [backup.id, ...chart.filter((id) => id !== backup.id), ...qbs.map((player) => player.id)]
      .filter((id, index, all) => all.indexOf(id) === index);
    const result = session.setDepthChart({ teamId, position: "QB", playerIds: ordered });
    return result.ok ? { ...result, summary: `${backup.name} is now QB1.`, playerName: backup.name } : result;
  }
  if (consequence.choiceId === "fa-qb") {
    const candidate = session.getFreeAgents({ position: "QB", limit: 40 })
      .sort((a, b) => (b.overall || 0) - (a.overall || 0))[0];
    if (!candidate) return { ok: false, error: "No veteran quarterback is available." };
    const result = session.signFreeAgent({ teamId, playerId: candidate.id });
    return result.ok ? { ...result, summary: `${candidate.name} signed as the veteran quarterback response.`, playerName: candidate.name } : result;
  }
  if (consequence.choiceId === "restructure") {
    const candidate = teamPlayers(session, teamId)
      .filter((player) => Number(player.contract?.yearsRemaining || 0) > 1 && Number(player.contract?.capHit || 0) > 0)
      .sort((a, b) => Number(b.contract?.capHit || 0) - Number(a.contract?.capHit || 0))[0];
    if (!candidate) return { ok: false, error: "No eligible multi-year contract can be restructured." };
    const result = session.restructurePlayerContract({ teamId, playerId: candidate.id });
    return result.ok ? { ...result, summary: `${candidate.name}'s contract was restructured.`, playerName: candidate.name } : result;
  }
  return { ok: false, error: "This choice requires a follow-through action." };
}

export function resolveGmDecisionConsequence(payload = {}) {
  const normalized = normalizePayload(payload);
  if (!normalized) return null;
  const definition = GM_DECISION_CATALOG[normalized.decisionId]?.choices?.[normalized.choiceId];
  return definition ? { ...normalized, ...definition, appliedAt: Date.now() } : null;
}

function createCommitment(session, consequence, teamId, entryId, immediateError = null) {
  if (!Array.isArray(session.league.gmCommitments)) session.league.gmCommitments = [];
  const deadline = deadlineFor(session, consequence);
  const baselineQbIds = teamPlayers(session, teamId).filter((player) => player.position === "QB").map((player) => player.id);
  const commitment = {
    id: `${entryId}-C`, decisionEntryId: entryId, teamId, decisionId: consequence.decisionId, choiceId: consequence.choiceId,
    label: consequence.label, promise: consequence.effect, status: "active", createdYear: session.currentYear,
    createdWeek: session.currentWeek, deadlineYear: deadline.year, deadlineWeek: deadline.week,
    baselineTransactionSeq: Number(session.league.transactionSeq || 0), baselineQbIds,
    baselineCapSpace: Number(session.getTeamCapSummary?.(teamId)?.capSpace || 0), immediateError
  };
  session.league.gmCommitments.push(commitment);
  session.league.gmCommitments = session.league.gmCommitments.slice(-120);
  return commitment;
}

function relevantTransactions(session, commitment) {
  return (session.league.transactionLog || []).filter((tx) =>
    Number(tx.seq || 0) > commitment.baselineTransactionSeq &&
    (tx.teamId === commitment.teamId || tx.teamA === commitment.teamId || tx.teamB === commitment.teamId)
  );
}

function tradeFlow(entry, teamId) {
  if (entry.type !== "trade" || (entry.teamA !== teamId && entry.teamB !== teamId)) return null;
  const controlsA = entry.teamA === teamId;
  const details = entry.details || {};
  return {
    incomingPlayers: controlsA ? (details.fromB || []) : (details.fromA || []),
    outgoingPlayers: controlsA ? (details.fromA || []) : (details.fromB || []),
    incomingPicks: controlsA ? (details.picksFromB || []) : (details.picksFromA || []),
    outgoingPicks: controlsA ? (details.picksFromA || []) : (details.picksFromB || [])
  };
}

function evaluateCommitment(session, commitment) {
  const tx = relevantTransactions(session, commitment);
  const atDeadline = session.currentYear > commitment.deadlineYear ||
    (session.currentYear === commitment.deadlineYear && session.currentWeek >= commitment.deadlineWeek);
  const has = (...types) => tx.some((entry) => types.includes(entry.type));
  const tradeFlows = tx.map((entry) => tradeFlow(entry, commitment.teamId)).filter(Boolean);
  const newQb = teamPlayers(session, commitment.teamId).find((player) => player.position === "QB" && !commitment.baselineQbIds.includes(player.id));
  if (commitment.choiceId === "buy" && (tradeFlows.some((flow) => flow.incomingPlayers.length > 0) || has("signing", "waiver-award"))) return { status: "succeeded", evidence: "A roster acquisition was completed before the deadline." };
  if (commitment.choiceId === "sell" && tradeFlows.some((flow) => flow.incomingPicks.length > 0)) return { status: "succeeded", evidence: "Future draft capital was acquired before the deadline." };
  if (commitment.choiceId === "hold" && has("trade")) return { status: "failed", evidence: "A trade broke the hold mandate." };
  if (commitment.choiceId === "hold" && atDeadline) return { status: "succeeded", evidence: "The roster was held through the deadline." };
  if (commitment.choiceId === "fa-qb" && newQb && has("signing", "waiver-award")) return { status: "succeeded", evidence: `${newQb.name} joined the quarterback room.` };
  if (commitment.choiceId === "trade-qb" && newQb && has("trade")) return { status: "succeeded", evidence: `${newQb.name} was acquired by trade.` };
  if (commitment.choiceId === "restructure" && has("restructure")) return { status: "succeeded", evidence: "A contract restructure created a cap response." };
  if (commitment.choiceId === "release" && has("release")) return { status: "succeeded", evidence: "A player release completed the cap mandate." };
  if (commitment.choiceId === "wait" && atDeadline && Number(session.getTeamCapSummary?.(commitment.teamId)?.capSpace || 0) >= 0) return { status: "succeeded", evidence: "Cap space returned to a non-negative position." };
  if (atDeadline) return { status: "failed", evidence: `The promised action was not completed by Week ${commitment.deadlineWeek}.` };
  return null;
}

function recordResolution(session, commitment, outcome) {
  commitment.status = outcome.status;
  commitment.resolvedYear = session.currentYear;
  commitment.resolvedWeek = session.currentWeek;
  commitment.evidence = outcome.evidence;
  const success = outcome.status === "succeeded";
  const team = session.league.teams?.find((entry) => entry.id === commitment.teamId);
  if (team?.owner?.expectation && Number.isFinite(team.owner.expectation.heat)) {
    team.owner.expectation.heat = Math.max(0, Math.min(100, team.owner.expectation.heat + (success ? -3 : 5)));
  }
  if (team?.owner && Number.isFinite(team.owner.fanInterest)) {
    team.owner.fanInterest = Math.max(0, Math.min(100, team.owner.fanInterest + (success ? 2 : -3)));
  }
  const sentiment = session.league.fanSentiment?.[commitment.teamId];
  if (sentiment && Number.isFinite(sentiment.approval)) {
    const delta = success ? 2 : -3;
    sentiment.approval = Math.max(0, Math.min(100, sentiment.approval + delta));
    sentiment.delta = Number(sentiment.delta || 0) + delta;
    sentiment.trend = success ? "rising" : "falling";
    sentiment.reasons = [`GM promise ${success ? "kept" : "missed"}`, ...(sentiment.reasons || [])].slice(0, 2);
  }
  const legacy = initGmLegacy(session.league);
  if (legacy) {
    const key = success ? "commitmentsKept" : "commitmentsMissed";
    legacy[key] = Number(legacy[key] || 0) + 1;
    legacy.lastCommitment = {
      id: commitment.id, label: commitment.label, status: outcome.status,
      year: session.currentYear, week: session.currentWeek
    };
  }
  for (const player of teamPlayers(session, commitment.teamId).slice(0, 12)) {
    if (Number.isFinite(player.morale)) player.morale = Math.max(0, Math.min(100, player.morale + (success ? 1 : -1)));
  }
  const receipt = { id: `${commitment.id}-R`, commitmentId: commitment.id, teamId: commitment.teamId, label: commitment.label, status: outcome.status, evidence: outcome.evidence, year: session.currentYear, week: session.currentWeek };
  if (!Array.isArray(session.league.gmCommitmentReceipts)) session.league.gmCommitmentReceipts = [];
  session.league.gmCommitmentReceipts.unshift(receipt);
  session.league.gmCommitmentReceipts = session.league.gmCommitmentReceipts.slice(0, 120);
  session.logNews?.(`${commitment.label} mandate ${success ? "fulfilled" : "missed"}: ${outcome.evidence}`, { type: "gm-commitment-resolution", teamId: commitment.teamId, commitmentId: commitment.id, status: outcome.status });
  session.appendEvent?.("gm-commitment-resolution", receipt);
  return receipt;
}

export function resolveGmDecisionCommitments(session) {
  const active = (session?.league?.gmCommitments || []).filter((entry) => entry.status === "active");
  return active.flatMap((commitment) => {
    const outcome = evaluateCommitment(session, commitment);
    return outcome ? [recordResolution(session, commitment, outcome)] : [];
  });
}

export function getGmCommitmentState(league = {}, teamId = null) {
  const commitments = (league.gmCommitments || []).filter((entry) => !teamId || entry.teamId === teamId);
  return {
    active: commitments.filter((entry) => entry.status === "active"),
    latestReceipt: (league.gmCommitmentReceipts || []).find((entry) => !teamId || entry.teamId === teamId) || null
  };
}

export function applyGmDecisionConsequence(session, payload = {}) {
  const consequence = resolveGmDecisionConsequence(payload);
  if (!consequence || !session?.league) return { ok: false, applied: false, error: "Unknown GM decision choice." };
  const teamId = session.controlledTeamId || null;
  if (!Array.isArray(session.league.gmDecisionLedger)) session.league.gmDecisionLedger = [];
  const entry = { id: `GMD-${session.currentYear}-${session.currentWeek}-${session.league.gmDecisionLedger.length + 1}`, year: session.currentYear, week: session.currentWeek, phase: session.phase, teamId, decisionId: consequence.decisionId, choiceId: consequence.choiceId, occurrenceKey: consequence.occurrenceKey, type: consequence.type, label: consequence.label, effect: consequence.effect, momentum: consequence.momentum, risk: consequence.risk, targetTab: consequence.targetTab, appliedAt: consequence.appliedAt };
  let execution = null;
  if (consequence.mode === "immediate" || consequence.mode === "immediate-or-commitment") execution = attemptImmediateAction(session, consequence, teamId);
  const needsCommitment = consequence.mode === "commitment" || (consequence.mode === "immediate-or-commitment" && !execution?.ok);
  const commitment = needsCommitment ? createCommitment(session, consequence, teamId, entry.id, execution?.error || null) : null;
  entry.execution = execution?.ok ? { status: "completed", summary: execution.summary, playerName: execution.playerName || null } : null;
  entry.commitmentId = commitment?.id || null;
  entry.receipt = execution?.ok
    ? { status: "completed", summary: execution.summary }
    : { status: "committed", summary: `${consequence.effect}; due Week ${commitment.deadlineWeek}.` };
  session.league.gmDecisionLedger.push(entry);
  session.league.gmDecisionLedger = session.league.gmDecisionLedger.slice(-120);
  session.logTransaction?.({ type: consequence.transactionType, teamId, details: { decisionId: consequence.decisionId, choiceId: consequence.choiceId, label: consequence.label, effect: consequence.effect, momentum: consequence.momentum, risk: consequence.risk, execution: entry.execution, commitmentId: entry.commitmentId } });
  session.logNews?.(`${consequence.headline}: ${entry.receipt.summary}`, { type: "gm-decision", teamId, decisionId: consequence.decisionId, choiceId: consequence.choiceId, targetTab: consequence.targetTab });
  session.appendEvent?.("gm-decision", entry);
  return { ok: true, applied: true, decision: entry, commitment };
}

export function latestGmDecision(league = {}) {
  const ledger = Array.isArray(league.gmDecisionLedger) ? league.gmDecisionLedger : [];
  return ledger.length ? ledger[ledger.length - 1] : null;
}
