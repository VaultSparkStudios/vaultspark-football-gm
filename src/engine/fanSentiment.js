/**
 * Fan Sentiment Engine
 * Computes crowd approval (0–100) per team each week based on performance,
 * owner context, and recent transactions. Stored in league.fanSentiment[teamId].
 */

export function initFanSentiment(league) {
  if (!league.fanSentiment) league.fanSentiment = {};
}

/**
 * Compute raw fan approval for one team this moment.
 * @param {object} team
 * @param {object[]} [standings] latestStandings array
 * @returns {number} 0–100
 */
export function computeFanApproval(team, standings = []) {
  // Base: owner's tracked fan interest (already updated weekly by processOwnerFinances)
  const base = Number(team?.owner?.fanInterest ?? 70);
  // Win% modifier: ±15 points
  const row = standings.find((r) => r.team === (team.abbrev || team.id));
  const w = row?.wins ?? 0;
  const l = row?.losses ?? 0;
  const gp = w + l;
  const winPct = gp > 0 ? w / gp : 0.5;
  const winMod = Math.round((winPct - 0.5) * 30);
  // Personality bias: win-now owners have higher fan expectations (more volatile)
  const personality = team?.owner?.personality || "balanced";
  const personalityMod = personality === "win-now" ? 4 : personality === "profit-first" ? -3 : 0;
  return Math.max(0, Math.min(100, base + winMod + personalityMod));
}

/**
 * Update fan sentiment for every team after a week resolves.
 * @param {object} league
 * @param {object} weekResult  { week, games: [{homeTeamId, awayTeamId, homeScore, awayScore}] }
 * @param {number} year
 */
export function updateFanSentiment(league, weekResult, year) {
  initFanSentiment(league);
  const standings = league.latestStandings || league.standings || [];

  for (const team of league.teams) {
    const prev = league.fanSentiment[team.id] || { approval: 70, trend: "stable", reasons: [] };
    const newApproval = computeFanApproval(team, standings);
    const delta = newApproval - prev.approval;
    const trend = delta > 3 ? "rising" : delta < -3 ? "falling" : "stable";

    const reasons = [];
    const game = (weekResult?.games || []).find(
      (g) => g.homeTeamId === team.id || g.awayTeamId === team.id
    );
    if (game) {
      const won =
        (game.homeTeamId === team.id && game.homeScore > game.awayScore) ||
        (game.awayTeamId === team.id && game.awayScore > game.homeScore);
      reasons.push(won ? "won this week" : "lost this week");
    }
    if (Number(team?.owner?.fanInterest ?? 70) < 58) reasons.push("fan base restless");
    if (trend === "rising") reasons.push("momentum building");
    if (trend === "falling") reasons.push("fan patience wearing thin");

    league.fanSentiment[team.id] = {
      approval: newApproval,
      trend,
      delta,
      reasons: reasons.slice(0, 2),
      week: weekResult?.week ?? 0,
      year
    };
  }
}

/**
 * Get fan sentiment for a single team.
 * @param {object} league
 * @param {string} teamId
 * @returns {{ approval: number, trend: string, delta: number, reasons: string[] }}
 */
export function getFanSentiment(league, teamId) {
  return league.fanSentiment?.[teamId] ?? { approval: 70, trend: "stable", delta: 0, reasons: [] };
}

/**
 * Narrative label for a given approval score.
 * @param {number} approval 0–100
 * @returns {string}
 */
export function fanApprovalLabel(approval) {
  if (approval >= 88) return "Electric";
  if (approval >= 75) return "Energized";
  if (approval >= 62) return "Steady";
  if (approval >= 50) return "Restless";
  if (approval >= 38) return "Frustrated";
  return "Booing";
}
