/**
 * Player Agent AI — Contract Negotiation Drama
 *
 * High-AV contract-year players acquire an AI agent that:
 *  - Generates an opening demand
 *  - Has a leverage window (competing interest → demands escalate)
 *  - Produces a counter-proposal after each team offer
 *  - Has a personality that shapes negotiation style
 *
 * Agent is attached to player as player.agentState when the season starts
 * for eligible players (AV >= threshold AND yearsRemaining <= 1).
 */

import { clamp } from "../utils/rng.js";

const AGENT_PERSONALITIES = ["maximizer", "loyalist", "balanced", "opportunist"];

const AV_AGENT_THRESHOLD = 8; // career AV floor to get an active agent

// ── Agent personalities ───────────────────────────────────────────────────────

const PERSONALITY_CONFIG = {
  maximizer: {
    label: "Maximizer",
    demandMultiplier: 1.22,
    walkAwayFloor: 0.94,   // won't accept below 94% of demand
    leverageBonus: 0.08,   // escalates demand by 8% per competing offer signal
    counterDrop: 0.02,     // drops demand by 2% per team offer if no leverage
    flavor: "This agent will push for top-of-market value and won't settle."
  },
  loyalist: {
    label: "Loyalist",
    demandMultiplier: 1.08,
    walkAwayFloor: 0.82,
    leverageBonus: 0.03,
    counterDrop: 0.05,
    flavor: "The player values continuity. A fair offer from the current team ends talks fast."
  },
  balanced: {
    label: "Balanced",
    demandMultiplier: 1.14,
    walkAwayFloor: 0.88,
    leverageBonus: 0.05,
    counterDrop: 0.035,
    flavor: "A pragmatic agent focused on security and fair market rate."
  },
  opportunist: {
    label: "Opportunist",
    demandMultiplier: 1.18,
    walkAwayFloor: 0.90,
    leverageBonus: 0.12,   // most reactive to competing offers
    counterDrop: 0.015,
    flavor: "Will use any outside interest to drive price up. Loyalty is not on the table."
  }
};

// ── Market salary estimator ───────────────────────────────────────────────────

function marketSalary(player, capHardLimit = 224_800_000) {
  const overall = player.overall || 70;
  // Scale: OVR 70 ≈ 3% cap, OVR 85 ≈ 12%, OVR 95 ≈ 22%
  const capPct = clamp((overall - 65) * 0.012, 0.018, 0.26);
  return Math.round(capHardLimit * capPct);
}

// ── Agent state init ──────────────────────────────────────────────────────────

export function initAgentState(player, rng, capHardLimit) {
  const personality = rng.pick(AGENT_PERSONALITIES);
  const config = PERSONALITY_CONFIG[personality];
  const market = marketSalary(player, capHardLimit);
  const demand = Math.round(market * config.demandMultiplier);

  return {
    personality,
    personalityLabel: config.label,
    flavor: config.flavor,
    marketSalary: market,
    currentDemand: demand,
    openingDemand: demand,
    walkAwayFloor: Math.round(demand * config.walkAwayFloor),
    leverageSignals: 0,     // competing offer signals this offseason
    teamOffersReceived: 0,
    negotiationStatus: "active", // active | signed | walked
    demandHistory: [{ round: 0, demand, note: "Opening position" }]
  };
}

// ── Competing offer signal ────────────────────────────────────────────────────

export function applyCompetingOffer(player, competingTeamId) {
  const agent = player.agentState;
  if (!agent || agent.negotiationStatus !== "active") return null;
  const config = PERSONALITY_CONFIG[agent.personality];

  agent.leverageSignals += 1;
  const escalation = Math.round(agent.currentDemand * config.leverageBonus);
  agent.currentDemand = Math.round(agent.currentDemand + escalation);
  agent.walkAwayFloor = Math.round(agent.currentDemand * config.walkAwayFloor);
  agent.demandHistory.push({
    round: agent.demandHistory.length,
    demand: agent.currentDemand,
    note: `Competing interest from ${competingTeamId} — demand escalated +${(config.leverageBonus * 100).toFixed(0)}%`
  });

  return {
    message: `${player.name}'s agent reports interest from ${competingTeamId}. New asking price: $${(agent.currentDemand / 1e6).toFixed(2)}M.`,
    newDemand: agent.currentDemand
  };
}

// ── Team offer evaluation ─────────────────────────────────────────────────────

export function evaluateTeamOffer(player, offeredSalary, offeredYears) {
  const agent = player.agentState;
  if (!agent || agent.negotiationStatus !== "active") return { status: "inactive" };
  const config = PERSONALITY_CONFIG[agent.personality];

  agent.teamOffersReceived += 1;

  // Accept if offer meets walk-away floor
  if (offeredSalary >= agent.walkAwayFloor && offeredYears >= 1) {
    agent.negotiationStatus = "signed";
    agent.demandHistory.push({
      round: agent.demandHistory.length,
      demand: offeredSalary,
      note: `Accepted: $${(offeredSalary / 1e6).toFixed(2)}M / ${offeredYears}yr`
    });
    return {
      status: "accepted",
      message: `${player.name}'s agent accepts the offer: $${(offeredSalary / 1e6).toFixed(2)}M / ${offeredYears} yr.`
    };
  }

  // Counter: drop demand if no leverage, otherwise hold
  const drop = agent.leverageSignals === 0
    ? Math.round(agent.currentDemand * config.counterDrop)
    : Math.round(agent.currentDemand * config.counterDrop * 0.5);

  agent.currentDemand = Math.max(agent.walkAwayFloor, agent.currentDemand - drop);
  agent.demandHistory.push({
    round: agent.demandHistory.length,
    demand: agent.currentDemand,
    note: `Counter after team offer of $${(offeredSalary / 1e6).toFixed(2)}M`
  });

  // Walk if team is 30%+ below floor after 3+ offers
  if (agent.teamOffersReceived >= 3 && offeredSalary < agent.walkAwayFloor * 0.80) {
    agent.negotiationStatus = "walked";
    return {
      status: "walked",
      message: `${player.name}'s agent breaks off talks — gap is too wide. Exploring free agency.`
    };
  }

  return {
    status: "counter",
    counterDemand: agent.currentDemand,
    counterYears: Math.max(2, offeredYears),
    message: `${player.name}'s agent counters: $${(agent.currentDemand / 1e6).toFixed(2)}M / ${Math.max(2, offeredYears)} yr.`
  };
}

// ── Attach agents at start of contract year ───────────────────────────────────

export function attachContractYearAgents(league, rng, capHardLimit = 224_800_000) {
  let agentsAttached = 0;
  for (const player of league.players) {
    if (player.status !== "active") continue;
    if (player.contract?.yearsRemaining !== 1) continue;

    const careerAV = Object.values(player.seasonStats || {})
      .reduce((s, ss) => s + (ss?.av || 0), 0);
    if (careerAV < AV_AGENT_THRESHOLD) continue;

    // Re-init each contract year (don't carry stale state)
    player.agentState = initAgentState(player, rng, capHardLimit);
    agentsAttached += 1;
  }
  return agentsAttached;
}

// ── Summary for UI ────────────────────────────────────────────────────────────

export function agentSummary(player) {
  const agent = player.agentState;
  if (!agent) return null;
  return {
    name: player.name,
    position: player.position,
    overall: player.overall,
    personality: agent.personalityLabel,
    flavor: agent.flavor,
    marketSalary: agent.marketSalary,
    currentDemand: agent.currentDemand,
    walkAwayFloor: agent.walkAwayFloor,
    status: agent.negotiationStatus,
    leverageSignals: agent.leverageSignals,
    history: agent.demandHistory
  };
}
