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

// ── Roll injury check for a single player ────────────────────────────────────

export function rollInjuryCheck(player, rng) {
  if (player.injury?.weeksRemaining > 0) return false; // already out
  const base = CONTACT_RATES[player.position] || 0.05;
  const ageMod = (player.age || 25) >= 30 ? 1.25 : 1.0;
  const reinjuryMod = 1 + Math.min(0.5, player.reinjuryRisk || 0);
  return rng.next() < base * ageMod * reinjuryMod;
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

export function rollGameInjuries(teamAPlayers, teamBPlayers, rng, multiplier = 1.0) {
  const injured = [];
  for (const player of [...teamAPlayers, ...teamBPlayers]) {
    if (!player || player.status !== "active") continue;
    // Adjust rate by league multiplier
    const adjustedRng = { next: () => rng.next() };
    const rollHit = rng.next() < (CONTACT_RATES[player.position] || 0.05) * multiplier;
    if (!rollHit) continue;
    if (player.injury?.weeksRemaining > 0) continue;
    const severity = getSeverity(rng);
    applyInjury(player, severity);
    injured.push({ player, severity });
  }
  return injured;
}

// ── Advance recovery (call once per week) ─────────────────────────────────────

export function advanceInjuryRecovery(league) {
  let recovered = 0;
  for (const player of league.players) {
    if (!player.injury || player.injury.weeksRemaining <= 0) {
      if (player.injury?.weeksRemaining === 0) {
        player.injury = null; // clear questionable status
      }
      continue;
    }
    player.injury.weeksRemaining = Math.max(0, player.injury.weeksRemaining - 1);
    if (player.injury.weeksRemaining === 0) recovered++;
  }
  return recovered;
}

// ── Injury report for UI ──────────────────────────────────────────────────────

export function getInjuryReport(league, teamId = null) {
  return league.players
    .filter((p) => p.status === "active" && p.injury?.weeksRemaining > 0)
    .filter((p) => !teamId || p.teamId === teamId)
    .map((p) => ({
      id:             p.id,
      name:           p.name,
      position:       p.position,
      teamId:         p.teamId,
      overall:        p.overall,
      injuryType:     p.injury.type,
      weeksRemaining: p.injury.weeksRemaining,
      reinjuryRisk:   Number((p.reinjuryRisk || 0).toFixed(2))
    }))
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
