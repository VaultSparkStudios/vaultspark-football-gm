export const TRADE_PLAN_SCHEMA_VERSION = "1.0";

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function stableList(values = []) {
  return [...new Set(values.map(String))].sort();
}

export function buildTradePlan(session, input = {}) {
  const teamA = String(input.teamA || "");
  const teamB = String(input.teamB || "");
  const playerIds = stableList([
    ...(input.teamAPlayerIds || []),
    ...(input.teamBPlayerIds || [])
  ]);
  const pickIds = stableList([
    ...(input.teamAPickIds || []),
    ...(input.teamBPickIds || [])
  ]);
  const authority = {
    teams: [teamA, teamB],
    players: playerIds.map((id) => {
      const player = session.getPlayerById(id);
      return { id, teamId: player?.teamId || null, capHit: Number(player?.contract?.capHit || 0) };
    }),
    picks: pickIds.map((id) => {
      const pick = session.getDraftPickById(id);
      return { id, ownerTeamId: pick?.ownerTeamId || null };
    }),
    capSpace: {
      [teamA]: session.getTeamById(teamA) ? Number(session.getTeamCapSummary(teamA).capSpace) : null,
      [teamB]: session.getTeamById(teamB) ? Number(session.getTeamCapSummary(teamB).capSpace) : null
    },
    challengeMode: session.getLeagueSettings().challengeMode || null,
    cpuTradeAggression: Number(session.getLeagueSettings().cpuTradeAggression),
    checkpoint: {
      year: session.currentYear ?? null,
      week: session.currentWeek ?? null,
      phase: session.phase || null
    }
  };
  const canonical = JSON.stringify(authority);
  return {
    schemaVersion: TRADE_PLAN_SCHEMA_VERSION,
    fingerprint: `trade-${fnv1a(canonical)}`,
    authority,
    instruction: "Commit with expectedPlanFingerprint to reject any roster, pick, cap, rule, or checkpoint drift."
  };
}
