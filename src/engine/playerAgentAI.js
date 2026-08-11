/**
 * Contract-year agent intelligence.
 *
 * This module never owns a contract mutation. It derives a stable persona and
 * source-based leverage, then records bounded negotiation receipts for the
 * canonical GameSession.negotiateAndSign authority.
 */
import { clamp, derivedRng } from "../utils/rng.js";

const AGENT_PERSONALITIES = ["maximizer", "loyalist", "balanced", "opportunist"];
const MAX_HISTORY = 8;
const PERSONALITY_CONFIG = Object.freeze({
  maximizer: { label: "Maximizer", demandMultiplier: 1.12, walkAwayFloor: 0.94, leverageBonus: 0.035, counterDrop: 0.02, flavor: "Top-of-market value matters more than a quick signature." },
  loyalist: { label: "Loyalist", demandMultiplier: 1.02, walkAwayFloor: 0.82, leverageBonus: 0.015, counterDrop: 0.05, flavor: "Continuity matters. A fair offer from the current club can end talks fast." },
  balanced: { label: "Balanced", demandMultiplier: 1.06, walkAwayFloor: 0.88, leverageBonus: 0.025, counterDrop: 0.035, flavor: "Security, role, and fair market value all carry weight." },
  opportunist: { label: "Opportunist", demandMultiplier: 1.09, walkAwayFloor: 0.9, leverageBonus: 0.05, counterDrop: 0.015, flavor: "Outside demand is leverage. The market will decide the price." }
});

function boundedHistory(agent, entry) {
  agent.demandHistory = [...(agent.demandHistory || []), entry].slice(-MAX_HISTORY);
}

function sourceDerivedInterest(player) {
  const overall = Number(player?.overall || 0);
  const potential = Number(player?.potential || overall);
  const age = Number(player?.age || 30);
  return clamp((overall >= 82 ? 1 : 0) + (overall >= 89 ? 1 : 0) + (potential >= 90 && age <= 27 ? 1 : 0), 0, 3);
}

function interestReason(signals) {
  if (signals >= 3) return "Several cap-ready rivals project this player as a priority starter.";
  if (signals === 2) return "Multiple rival depth charts create credible outside demand.";
  if (signals === 1) return "One rival market projects meaningful starting-role interest.";
  return "The current market is quiet; continuity gives your club leverage.";
}

export function ensureContractAgent(player, { currentYear, baseSalary, baseYears, guaranteed, capHardLimit = 224_800_000 } = {}) {
  const seasonKey = `${Number(currentYear) || 0}:${Number(player?.contract?.yearsRemaining) || 0}`;
  if (player?.agentState?.seasonKey === seasonKey) return player.agentState;
  const rng = derivedRng(`contract-agent|${player?.id || player?.name || "player"}|${seasonKey}`);
  const personality = rng.pick(AGENT_PERSONALITIES);
  const config = PERSONALITY_CONFIG[personality];
  const leverageSignals = sourceDerivedInterest(player);
  const marketSalary = Math.max(850_000, Math.round(Number(baseSalary) || capHardLimit * clamp((Number(player?.overall || 70) - 65) * 0.012, 0.018, 0.26)));
  const openingDemand = Math.round(marketSalary * config.demandMultiplier * (1 + leverageSignals * config.leverageBonus));
  const state = {
    schemaVersion: 2, seasonKey, personality, personalityLabel: config.label, flavor: config.flavor,
    marketSalary, currentDemand: openingDemand, openingDemand,
    preferredYears: clamp(Number(baseYears) || 3, 1, 5),
    guaranteed: Math.max(0, Math.round(Number(guaranteed) || openingDemand * 0.45)),
    walkAwayFloor: Math.round(openingDemand * config.walkAwayFloor),
    leverageSignals, leverageReason: interestReason(leverageSignals), deadline: "Before free agency opens",
    teamOffersReceived: 0, negotiationStatus: "active", demandHistory: []
  };
  boundedHistory(state, { round: 0, outcome: "opening", demand: openingDemand, years: state.preferredYears, label: `Opening position: ${state.preferredYears} years at $${(openingDemand / 1e6).toFixed(2)}M per year.` });
  player.agentState = state;
  return state;
}

export function evaluateCanonicalAgentOffer(player, offeredSalary, offeredYears) {
  const agent = player?.agentState;
  if (!agent || agent.negotiationStatus !== "active") return { status: agent?.negotiationStatus || "inactive" };
  const config = PERSONALITY_CONFIG[agent.personality] || PERSONALITY_CONFIG.balanced;
  const salary = Math.max(0, Math.round(Number(offeredSalary) || 0));
  const years = clamp(Number(offeredYears) || 1, 1, 5);
  agent.teamOffersReceived += 1;
  if (salary >= agent.walkAwayFloor && years >= Math.max(1, agent.preferredYears - 1)) return { status: "accepted" };
  if (agent.teamOffersReceived >= 3 && salary < agent.walkAwayFloor * 0.8) {
    agent.negotiationStatus = "walked";
    boundedHistory(agent, { round: agent.teamOffersReceived, outcome: "walked", demand: agent.currentDemand, years, label: `Talks ended after a $${(salary / 1e6).toFixed(2)}M offer left the gap too wide.` });
    return { status: "walked", message: `${player.name}'s agent ended talks. Free agency is now the plan.` };
  }
  const drop = agent.leverageSignals === 0 ? Math.round(agent.currentDemand * config.counterDrop) : Math.round(agent.currentDemand * config.counterDrop * 0.5);
  agent.currentDemand = Math.max(agent.walkAwayFloor, agent.currentDemand - drop);
  const counterYears = Math.max(years, agent.preferredYears);
  boundedHistory(agent, { round: agent.teamOffersReceived, outcome: "countered", demand: agent.currentDemand, years: counterYears, label: `Counter: ${counterYears} years at $${(agent.currentDemand / 1e6).toFixed(2)}M after a $${(salary / 1e6).toFixed(2)}M offer.` });
  return { status: "counter", counterDemand: agent.currentDemand, counterYears, message: `${player.name}'s agent countered at $${(agent.currentDemand / 1e6).toFixed(2)}M for ${counterYears} years.` };
}

export function recordCanonicalAgentAcceptance(player, contract) {
  const agent = player?.agentState;
  if (!agent) return null;
  agent.negotiationStatus = "signed";
  const salary = Number(contract?.salary || 0);
  const years = Number(contract?.yearsRemaining || 0);
  boundedHistory(agent, { round: agent.teamOffersReceived, outcome: "accepted", demand: salary, years, label: `Accepted: ${years} years at $${(salary / 1e6).toFixed(2)}M per year.` });
  return agent;
}

export function agentSummary(player) {
  const agent = player?.agentState;
  if (!agent) return null;
  return {
    playerId: player.id, name: player.name, pos: player.position, position: player.position, overall: player.overall,
    personality: agent.personalityLabel, flavor: agent.flavor, marketSalary: agent.marketSalary,
    askingSalary: agent.currentDemand, currentDemand: agent.currentDemand, askingYears: agent.preferredYears,
    guaranteed: agent.guaranteed, walkAwayFloor: agent.walkAwayFloor, status: agent.negotiationStatus,
    leverageSignals: agent.leverageSignals, leverageReason: agent.leverageReason, deadline: agent.deadline,
    negotiationHistory: [...(agent.demandHistory || [])], history: [...(agent.demandHistory || [])]
  };
}
