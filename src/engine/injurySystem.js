/**
 * Injury System — Position Contact Rates & Recovery Tracking
 *
 * Adds weekly injury probability to game simulation.
 * Injury state lives on player.injury: { type, weeksRemaining }.
 * Recovery is tracked across weeks and can feed into depth-chart
 * vulnerability alerts (Cap Casualty / Depth tab).
 *
 * Integration points:
 *   - Call rollInjuryChecks() after each simulated game
 *   - Call advanceInjuryRecovery() each week start
 *   - Call getInjuryReport() to surface to UI
 */

// ── Contact rates by position (per game) ─────────────────────────────────────

const CONTACT_RATES = {
  QB:  0.04,
  RB:  0.10,
  WR:  0.07,
  TE:  0.06,
  OL:  0.04,
  DL:  0.06,
  LB:  0.07,
  DB:  0.06,
  K:   0.01,
  P:   0.01
};

// ── Severity distribution ─────────────────────────────────────────────────────

const SEVERITY_TABLE = [
  { type: "Questionable", weeksRemaining: 0,  weight: 0.38 },
  { type: "Out 1W",       weeksRemaining: 1,  weight: 0.28 },
  { type: "Out 2-3W",     weeksRemaining: 2,  weight: 0.18 },
  { type: "IR (4W)",      weeksRemaining: 4,  weight: 0.10 },
  { type: "IR-Long (8W)", weeksRemaining: 8,  weight: 0.06 }
];

export const REHAB_PLANS = Object.freeze({
  protect: Object.freeze({
    id: "protect",
    label: "Protect the Player",
    recoveryDelta: 0,
    reinjuryDelta: -0.04,
    summary: "No forced acceleration. Prioritize lowering modeled re-injury risk."
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard Protocol",
    recoveryDelta: 0,
    reinjuryDelta: -0.02,
    summary: "Use the staff and facility recovery rate without adding risk."
  }),
  accelerate: Object.freeze({
    id: "accelerate",
    label: "Accelerate Return",
    recoveryDelta: 1,
    reinjuryDelta: 0.04,
    summary: "Gain one modeled recovery week now and accept higher re-injury risk."
  })
});

export function normalizeRehabPlan(plan) {
  return REHAB_PLANS[plan] ? plan : "standard";
}

export function setPlayerRehabPlan(player, plan) {
  if (!player?.injury || Number(player.injury.weeksRemaining || 0) <= 0) {
    return { ok: false, error: "Player does not have an active multi-week injury." };
  }
  const normalized = normalizeRehabPlan(plan);
  player.rehabPlan = normalized;
  return { ok: true, plan: normalized, policy: REHAB_PLANS[normalized] };
}

function ageRiskMultiplier(player) {
  return (player?.age || 25) >= 30 ? 1.25 : 1;
}

export function injuryProbability(player, { multiplier = 1, injuryChanceDelta = 0 } = {}) {
  const base = CONTACT_RATES[player?.position] || 0.05;
  const reinjuryMod = 1 + Math.min(0.5, Math.max(0, Number(player?.reinjuryRisk || 0)));
  const safeMultiplier = Number.isFinite(Number(multiplier)) ? Number(multiplier) : 1;
  return Math.max(0, Math.min(0.95, (base + Number(injuryChanceDelta || 0)) * ageRiskMultiplier(player) * reinjuryMod * safeMultiplier));
}

// ── Roll injury check for a single player ────────────────────────────────────

export function rollInjuryCheck(player, rng, options = {}) {
  if (player.injury?.weeksRemaining > 0) return false; // already out
  return rng.next() < injuryProbability(player, options);
}

// ── Sample injury severity ────────────────────────────────────────────────────

export function getSeverity(rng) {
  let roll = rng.next();
  for (const s of SEVERITY_TABLE) {
    roll -= s.weight;
    if (roll <= 0) return { type: s.type, weeksRemaining: s.weeksRemaining };
  }
  return { type: "Out 1W", weeksRemaining: 1 };
}

// ── Apply injury to player ────────────────────────────────────────────────────

export function applyInjury(player, severity) {
  player.injury = { type: severity.type, weeksRemaining: severity.weeksRemaining };
  // Accumulate re-injury risk slightly with each injury
  player.reinjuryRisk = Math.min(0.5, (player.reinjuryRisk || 0) + 0.04);
}

// ── Batch roll for all active players in a game ───────────────────────────────

export function rollGameInjuries(teamAPlayers, teamBPlayers, rng, multiplier = 1.0, options = {}) {
  const injured = [];
  for (const player of [...teamAPlayers, ...teamBPlayers]) {
    if (!player || player.status !== "active") continue;
    const modifiers = options.getTeamModifiers?.(player.teamId, player) || {};
    if (!rollInjuryCheck(player, rng, {
      multiplier,
      injuryChanceDelta: modifiers.injuryChanceDelta || 0
    })) continue;
    const severity = getSeverity(rng);
    applyInjury(player, severity);
    player.rehabPlan = "standard";
    injured.push({
      player,
      severity,
      probability: injuryProbability(player, {
        multiplier,
        injuryChanceDelta: modifiers.injuryChanceDelta || 0
      })
    });
  }
  return injured;
}

// ── Advance recovery (call once per week) ─────────────────────────────────────

export function projectRehab(player, { extraRecoveryWeeks = 0 } = {}) {
  const planId = normalizeRehabPlan(player?.rehabPlan);
  const policy = REHAB_PLANS[planId];
  const weeksRemaining = Math.max(0, Number(player?.injury?.weeksRemaining || 0));
  const weeklyRecovery = Math.max(1, 1 + Math.max(0, Number(extraRecoveryWeeks || 0)) + policy.recoveryDelta);
  return {
    plan: planId,
    label: policy.label,
    summary: policy.summary,
    weeksRemaining,
    weeklyRecovery,
    estimatedAdvances: weeksRemaining ? Math.ceil(weeksRemaining / weeklyRecovery) : 0,
    reinjuryRisk: Number(Math.max(0, Number(player?.reinjuryRisk || 0)).toFixed(2))
  };
}

export function advanceInjuryRecovery(league, options = {}) {
  let recovered = 0;
  const receipts = [];
  for (const player of league.players) {
    if (!player.injury || player.injury.weeksRemaining <= 0) {
      if (player.injury?.weeksRemaining === 0) {
        player.injury = null; // clear questionable status
      }
      continue;
    }
    const modifiers = options.getTeamModifiers?.(player.teamId, player) || {};
    const projection = projectRehab(player, modifiers);
    const before = Number(player.injury.weeksRemaining || 0);
    const injuryType = player.injury.type;
    player.injury.weeksRemaining = Math.max(0, before - projection.weeklyRecovery);
    const policy = REHAB_PLANS[projection.plan];
    player.reinjuryRisk = Math.max(0, Math.min(0.55, Number(player.reinjuryRisk || 0) + policy.reinjuryDelta));
    if (player.injury.weeksRemaining === 0) {
      recovered++;
      player.injury = null;
      const receipt = {
        playerId: player.id,
        player: player.name,
        teamId: player.teamId,
        pos: player.position,
        injuryType,
        plan: projection.plan,
        planLabel: projection.label,
        weeksAdvanced: before,
        reinjuryRisk: Number(player.reinjuryRisk.toFixed(2))
      };
      receipts.push(receipt);
      options.onRecovered?.(receipt, player);
    }
  }
  return { recovered, receipts };
}

// ── Injury report for UI ──────────────────────────────────────────────────────

export function getInjuryReport(league, teamId = null, options = {}) {
  return league.players
    .filter((p) => p.status === "active" && p.injury?.weeksRemaining > 0)
    .filter((p) => !teamId || p.teamId === teamId)
    .map((p) => {
      const modifiers = options.getTeamModifiers?.(p.teamId, p) || {};
      const projection = projectRehab(p, modifiers);
      return {
        id: p.id,
        playerId: p.id,
        name: p.name,
        player: p.name,
        position: p.position,
        pos: p.position,
        teamId: p.teamId,
        overall: p.overall,
        injuryType: p.injury.type,
        injury: { ...p.injury },
        weeksRemaining: p.injury.weeksRemaining,
        reinjuryRisk: Number((p.reinjuryRisk || 0).toFixed(2)),
        rehabPlan: projection.plan,
        rehabLabel: projection.label,
        rehabSummary: projection.summary,
        weeklyRecovery: projection.weeklyRecovery,
        estimatedAdvances: projection.estimatedAdvances
      };
    })
    .sort((a, b) => b.weeksRemaining - a.weeksRemaining);
}

// ── Depth vulnerability alert ─────────────────────────────────────────────────

export function getDepthVulnerabilities(league, teamId, depthChart = null) {
  const injured = getInjuryReport(league, teamId);
  if (!injured.length) return [];

  return injured
    .filter((p) => p.weeksRemaining >= 2)
    .map((p) => ({
      position:  p.position,
      player:    p.name,
      weeksOut:  p.weeksRemaining,
      alert:     `${p.name} (${p.position}) is out ${p.weeksRemaining}w — check depth at ${p.position}`
    }));
}
