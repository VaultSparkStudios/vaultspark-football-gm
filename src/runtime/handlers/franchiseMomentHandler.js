/**
 * Transport-neutral authority for the Franchise Moment endpoint (S62).
 *
 * Both adapters previously carried an identical inline copy of the drama
 * scoring — a drift twin. One authority now owns the scoring, and the scoring
 * itself pays off more than close games: statement blowout wins, playoff
 * games, championships, and eliminations all register as moments.
 */

export function scoreDrama({ won, margin, scoringPlays, seasonType, label }) {
  const playoffs = seasonType === "playoffs";
  return (
    (won && margin < 4 ? 3 : 0) +
    (margin <= 3 ? 2 : 0) +
    (scoringPlays > 8 ? 1 : 0) +
    (won && margin >= 21 ? 2 : 0) +
    (playoffs ? 2 : 0) +
    (playoffs && label === "super-bowl" ? 3 : 0) +
    (playoffs && !won ? 2 : 0)
  );
}

export function buildFranchiseMoment(session, teamId) {
  const recentGames = session.getRecentBoxScores(teamId, 3);
  let moment = null;
  for (const game of recentGames || []) {
    const boxScore = session.getBoxScore(game.gameId);
    if (!boxScore) continue;
    const scoring = boxScore.scoringSummary || [];
    const pbp = boxScore.playByPlay || [];
    const margin = Math.abs((boxScore.homeTeam?.score || 0) - (boxScore.awayTeam?.score || 0));
    const homeIsControlled = game.homeTeamId === teamId;
    const teamScore = homeIsControlled ? boxScore.homeTeam?.score : boxScore.awayTeam?.score;
    const oppScore = homeIsControlled ? boxScore.awayTeam?.score : boxScore.homeTeam?.score;
    const won = (teamScore || 0) > (oppScore || 0);
    const dramaScore = scoreDrama({
      won,
      margin,
      scoringPlays: scoring.length,
      seasonType: game.seasonType,
      label: game.label
    });
    if (!moment || dramaScore > (moment.dramaScore || 0)) {
      const walkoff = scoring.slice(-1)[0];
      const playoffs = game.seasonType === "playoffs";
      const headline = playoffs
        ? game.label === "super-bowl"
          ? won
            ? `🏆 CHAMPIONS — ${teamScore}-${oppScore} on the biggest stage`
            : `Championship heartbreak — ${teamScore}-${oppScore}`
          : won
            ? `Playoff statement: ${teamScore}-${oppScore} — the run continues`
            : `Season ends ${teamScore}-${oppScore} — the run is over`
        : won
          ? margin <= 3
            ? `Clutch ${margin === 0 ? "tie" : `${teamScore}-${oppScore} thriller`} — your team wins it!`
            : margin >= 21
              ? `Statement made: ${teamScore}-${oppScore} demolition`
              : `Dominant ${teamScore}-${oppScore} victory`
          : `Tough ${teamScore}-${oppScore} loss — narrowly missed`;
      moment = {
        gameId: game.gameId,
        week: game.week || boxScore.week,
        year: game.year || boxScore.year,
        dramaScore,
        headline,
        highlight: walkoff
          ? `${walkoff.type} by ${walkoff.description?.split(" ")[0] || "your team"} — ${walkoff.quarterLabel}`
          : "Big moments on both sides",
        result: won ? "win" : "loss",
        score: `${teamScore}-${oppScore}`,
        shareText: `🏈 ${playoffs ? "Playoffs" : `Week ${game.week}`} ${won ? "Win" : "Loss"} — ${teamScore}-${oppScore}. Playing Franchise Architect: Football — best GM sim around! #VaultSpark`,
        topPlay:
          pbp.find(
            (p) =>
              p.description?.toLowerCase().includes("touchdown") ||
              p.description?.toLowerCase().includes("interception")
          )?.description || null
      };
    }
  }
  return moment;
}

export function handleFranchiseMomentRequest({ session, teamId }) {
  if (!session) {
    return {
      status: 404,
      body: { ok: false, reasonCode: "FRANCHISE_MOMENT_SESSION_NOT_FOUND", error: "No active franchise session exists." }
    };
  }
  const resolvedTeamId = String(teamId || session.controlledTeamId || "").toUpperCase();
  return { status: 200, body: { ok: true, moment: buildFranchiseMoment(session, resolvedTeamId) } };
}
