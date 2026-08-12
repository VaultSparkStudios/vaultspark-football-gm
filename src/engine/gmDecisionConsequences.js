import { initGmLegacy } from "./gmLegacyScore.js";
import { buildGmDecisionBoundary, GM_DECISION_CATALOG } from "./gmDecisionAuthority.js";

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

function immediateCandidate(session, consequence, teamId) {
  if (consequence.choiceId === "start-backup") {
    const chart = session.getDepthChart(teamId)?.QB || [];
    const qbs = teamPlayers(session, teamId).filter((player) => player.position === "QB");
    const available = qbs.filter((player) => !player.injury || player.injury.weeksRemaining <= 0);
    const currentStarter = chart[0];
    const player = available.find((candidate) => candidate.id !== currentStarter) || available[0] || null;
    return player ? { player, detail: `${player.name} becomes QB1.` } : null;
  }
  if (consequence.choiceId === "fa-qb") {
    const player = session.getFreeAgents({ position: "QB", limit: 40 })
      .sort((a, b) => (b.overall || 0) - (a.overall || 0))[0] || null;
    return player ? { player, detail: `${player.name} is the highest-rated viable veteran target.` } : null;
  }
  if (consequence.choiceId === "restructure") {
    const player = teamPlayers(session, teamId)
      .filter((candidate) => Number(candidate.contract?.yearsRemaining || 0) > 1 && Number(candidate.contract?.capHit || 0) > 0)
      .sort((a, b) => Number(b.contract?.capHit || 0) - Number(a.contract?.capHit || 0))[0] || null;
    return player ? { player, detail: `${player.name} owns the largest eligible cap hit.` } : null;
  }
  if (["deny", "ceremony", "feature-role", "quiet-exit", "shop", "extend"].includes(consequence.choiceId)) {
    const playerId = contextKeyFromOccurrence(consequence.occurrenceKey);
    const player = teamPlayers(session, teamId).find((candidate) => candidate.id === playerId) || null;
    return player ? { player, detail: `This boundary is tied to ${player.name}.` } : null;
  }
  return null;
}

export function buildGmDecisionOptionPreview(session, payload = {}) {
  const normalized = normalizePayload(payload);
  if (!normalized || !session?.league) return null;
  const definition = GM_DECISION_CATALOG[normalized.decisionId]?.choices?.[normalized.choiceId];
  if (!definition) return null;
  const consequence = { ...normalized, ...definition };
  const boundary = buildGmDecisionBoundary(
    { ...definition, id: normalized.choiceId },
    { currentYear: session.currentYear, currentWeek: session.currentWeek }
  );
  const candidate = immediateCandidate(session, consequence, session.controlledTeamId);
  const addressTargets = normalized.choiceId === "address-room"
    ? teamPlayers(session, session.controlledTeamId)
        .filter((player) => Number.isFinite(player.morale))
        .sort((left, right) => left.morale - right.morale)
        .slice(0, 5)
        .map((player) => ({ playerId: player.id, name: player.name }))
    : [];
  return {
    ...boundary,
    exactAction: candidate?.detail || (
      addressTargets.length
        ? `Team meeting targets ${addressTargets.map((player) => player.name).join(", ")}.`
        : definition.effect
    ),
    subject: candidate?.player
      ? {
          playerId: candidate.player.id,
          name: candidate.player.name,
          position: candidate.player.position || candidate.player.pos || null
        }
      : null,
    subjects: addressTargets,
    availability: (["start-backup", "fa-qb", "restructure"].includes(normalized.choiceId) && !candidate)
      ? "unavailable"
      : "ready"
  };
}

export function enrichGmDecisionQueue(session, decisions = []) {
  return decisions.map((decision) => ({
    ...decision,
    options: (decision.options || []).map((option) => ({
      ...option,
      preview: buildGmDecisionOptionPreview(session, {
        decisionId: decision.id,
        choiceId: option.id,
        type: decision.type,
        week: decision.week,
        occurrenceKey: decision.occurrenceKey
      })
    }))
  }));
}

function attemptImmediateAction(session, consequence, teamId) {
  if (consequence.choiceId === "start-backup") {
    const candidate = immediateCandidate(session, consequence, teamId);
    const chart = session.getDepthChart(teamId)?.QB || [];
    const qbs = teamPlayers(session, teamId).filter((player) => player.position === "QB");
    const backup = candidate?.player || null;
    if (!backup) return { ok: false, error: "No available backup quarterback can be promoted." };
    const ordered = [backup.id, ...chart.filter((id) => id !== backup.id), ...qbs.map((player) => player.id)]
      .filter((id, index, all) => all.indexOf(id) === index);
    const result = session.setDepthChart({ teamId, position: "QB", playerIds: ordered });
    return result.ok ? { ...result, summary: `${backup.name} is now QB1.`, playerName: backup.name } : result;
  }
  if (consequence.choiceId === "fa-qb") {
    const candidate = immediateCandidate(session, consequence, teamId)?.player || null;
    if (!candidate) return { ok: false, error: "No veteran quarterback is available." };
    const result = session.signFreeAgent({ teamId, playerId: candidate.id });
    if (result.ok) {
      return { ...result, summary: `${candidate.name} signed as the veteran quarterback response.`, playerName: candidate.name };
    }
    if (result.reasonCode === "market-pursuit") {
      // Premium QBs route through the competing-offer market (S62): the
      // decision becomes a commitment backed by a real submitted bid.
      const bid = session.submitFreeAgencyOffer?.({ teamId, playerId: candidate.id, years: 2 });
      return {
        ok: false,
        error: bid?.ok
          ? `${candidate.name} is weighing market offers — your bid is in; the market resolves on the next advance.`
          : result.error
      };
    }
    return result;
  }
  if (consequence.choiceId === "restructure") {
    const candidate = immediateCandidate(session, consequence, teamId)?.player || null;
    if (!candidate) return { ok: false, error: "No eligible multi-year contract can be restructured." };
    const result = session.restructurePlayerContract({ teamId, playerId: candidate.id });
    return result.ok ? { ...result, summary: `${candidate.name}'s contract was restructured.`, playerName: candidate.name } : result;
  }
  // ── S62 narrative-decision consequences — bounded, deterministic, visible ──
  const clampMorale = (value) => Math.max(0, Math.min(100, value));
  const subjectPlayer = () => {
    const playerId = contextKeyFromOccurrence(consequence.occurrenceKey);
    return teamPlayers(session, teamId).find((player) => player.id === playerId) || null;
  };
  if (consequence.choiceId === "deny") {
    const player = subjectPlayer();
    if (!player) return { ok: false, error: "The requesting player is no longer on the roster." };
    player.morale = clampMorale(Number(player.morale ?? 60) - 4);
    session.logNews?.(`${player.name}'s trade request denied — front office holds the line.`, {
      type: "gm-decision-deny-star", teamId, playerId: player.id
    });
    return { ok: true, summary: `${player.name} stays — morale absorbed a visible hit (now ${player.morale}).`, playerName: player.name };
  }
  if (consequence.choiceId === "address-room") {
    const steadied = teamPlayers(session, teamId)
      .filter((player) => Number.isFinite(player.morale))
      .sort((a, b) => (a.morale || 0) - (b.morale || 0))
      .slice(0, 5);
    if (!steadied.length) return { ok: false, error: "No roster morale to address." };
    for (const player of steadied) player.morale = clampMorale(Number(player.morale ?? 60) + 2);
    session.logNews?.("Players-only meeting held — the room's lowest voices were heard.", {
      type: "gm-decision-culture-address", teamId
    });
    return { ok: true, summary: `Team meeting steadied ${steadied.length} lowest-morale players (+2 each).` };
  }
  if (consequence.choiceId === "back-staff") {
    session.logNews?.("Front office publicly backs the coaching staff through the culture crisis.", {
      type: "gm-decision-culture-back-staff", teamId
    });
    return { ok: true, summary: "The staff was publicly backed; the standings pressure is now yours to carry." };
  }
  if (consequence.choiceId === "ceremony" || consequence.choiceId === "feature-role" || consequence.choiceId === "quiet-exit") {
    const player = subjectPlayer();
    const label =
      consequence.choiceId === "ceremony"
        ? "farewell ceremony season announced"
        : consequence.choiceId === "feature-role"
          ? "featured one-last-ride role committed"
          : "quiet exit — no farewell tour";
    if (player && consequence.choiceId !== "quiet-exit") {
      player.morale = clampMorale(Number(player.morale ?? 60) + 3);
    }
    session.logNews?.(`${player ? `${player.name}: ` : ""}${label}.`, {
      type: consequence.transactionType, teamId, playerId: player?.id || null
    });
    return { ok: true, summary: `${player ? `${player.name} — ` : ""}${label}.`, playerName: player?.name };
  }
  return { ok: false, error: "This choice requires a follow-through action." };
}

function contextKeyFromOccurrence(occurrenceKey) {
  const raw = String(occurrenceKey || "").split(":").pop() || "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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
    baselineCapSpace: Number(session.getTeamCapSummary?.(teamId)?.capSpace || 0), immediateError,
    subjectPlayerId: contextKeyFromOccurrence(consequence.occurrenceKey) || null
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
  if (commitment.choiceId === "fa-qb" && newQb && has("signing", "fa-signing", "waiver-award")) return { status: "succeeded", evidence: `${newQb.name} joined the quarterback room.` };
  if (commitment.choiceId === "trade-qb" && newQb && has("trade")) return { status: "succeeded", evidence: `${newQb.name} was acquired by trade.` };
  if (commitment.choiceId === "restructure" && has("restructure")) return { status: "succeeded", evidence: "A contract restructure created a cap response." };
  if (commitment.choiceId === "release" && has("release")) return { status: "succeeded", evidence: "A player release completed the cap mandate." };
  if (commitment.choiceId === "wait" && atDeadline && Number(session.getTeamCapSummary?.(commitment.teamId)?.capSpace || 0) >= 0) return { status: "succeeded", evidence: "Cap space returned to a non-negative position." };
  if (commitment.choiceId === "shop") {
    const subject = String(commitment.subjectPlayerId || "");
    const shipped = tx.some((entry) => {
      if (entry.type !== "trade") return false;
      const flow = tradeFlow(entry, commitment.teamId);
      return flow ? flow.outgoingPlayers.some((row) => (row?.id || row?.playerId || row) === subject) : false;
    });
    if (shipped) return { status: "succeeded", evidence: "The requesting player was traded while his value was elevated." };
    if (atDeadline) return { status: "failed", evidence: `No trade moved the requesting player by Week ${commitment.deadlineWeek}.` };
    return null;
  }
  if (commitment.choiceId === "extend") {
    const subject = String(commitment.subjectPlayerId || "");
    const repaired = tx.some(
      (entry) => ["resign", "re-sign", "restructure", "extension"].includes(entry.type) && (entry.playerId === subject || !subject)
    );
    if (repaired) return { status: "succeeded", evidence: "A new deal repaired the trade request." };
    if (atDeadline) return { status: "failed", evidence: `No extension or restructure landed by Week ${commitment.deadlineWeek}.` };
    return null;
  }
  if (commitment.choiceId === "shake-up") {
    if (has("trade", "release")) return { status: "succeeded", evidence: "A roster move answered the culture crisis." };
    if (atDeadline) return { status: "failed", evidence: `No shake-up move landed by Week ${commitment.deadlineWeek}.` };
    return null;
  }
  if (commitment.choiceId === "owner-ultimatum") {
    const team = session.league.teams?.find((entry) => entry.id === commitment.teamId);
    const wins = Number(team?.season?.wins || 0);
    const target = Number(commitment.targetWins || 0);
    if (target > 0 && wins >= target) {
      return { status: "succeeded", evidence: `The club reached ${wins} wins against the owner's ${target}-win demand.` };
    }
    if (atDeadline) {
      return {
        status: "failed",
        evidence: `The season ended at ${wins} wins, short of the owner's ${target}-win demand — consequence: ${commitment.consequence || "major changes"}.`
      };
    }
    return null;
  }
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
    : commitment
      ? { status: "committed", summary: `${consequence.effect}; due Week ${commitment.deadlineWeek}.` }
      : { status: "failed", summary: execution?.error || "The immediate action could not be completed." };
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
