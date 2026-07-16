const TACTICS = {
  "run-heavy": {
    label: "Run-Heavy",
    intent: "control possession and force the defense to fit the run",
    tradeoff: "Fewer downfield attempts if the box stays light.",
    target: "rush share"
  },
  "pass-heavy": {
    label: "Pass-Heavy",
    intent: "stress coverage horizontally and vertically",
    tradeoff: "More dropbacks expose protection and turnover risk.",
    target: "pass share"
  },
  "blitz-heavy": {
    label: "Blitz Package",
    intent: "speed up the opposing quarterback",
    tradeoff: "Extra rushers leave fewer defenders behind the pressure.",
    target: "pressure outcomes"
  },
  prevent: {
    label: "Prevent Defense",
    intent: "limit explosive passes and keep the game in front",
    tradeoff: "Short completions and long drives remain available.",
    target: "explosive passes allowed"
  }
};

function teamId(team = {}) {
  return team.id || team.teamId || team.abbrev || null;
}

export function buildTacticalMatchupBrief(dashboard = {}) {
  const controlled = dashboard.controlledTeamId || teamId(dashboard.controlledTeam);
  const game = (dashboard.currentWeekSchedule?.games || []).find(
    (entry) => entry.homeTeamId === controlled || entry.awayTeamId === controlled
  );
  if (!game) {
    return {
      available: false,
      headline: "No controlled-team game is scheduled this week.",
      read: "A tactical override would have no matchup to affect.",
      options: Object.entries(TACTICS).map(([id, tactic]) => ({ id, ...tactic, matchup: tactic.intent }))
    };
  }
  const opponentId = game.homeTeamId === controlled ? game.awayTeamId : game.homeTeamId;
  const opponent = (dashboard.teams || []).find((entry) => teamId(entry) === opponentId) || { id: opponentId };
  const passRate = Number(opponent.scheme?.passRate ?? 0.54);
  const aggression = Number(opponent.scheme?.aggression ?? 0.5);
  const injured = (dashboard.injuryReport || []).filter((entry) => entry.teamId === opponentId).length;
  const identity = passRate >= 0.59 ? "pass-forward" : passRate <= 0.47 ? "run-forward" : "balanced";
  const pressure = aggression >= 0.62 ? "aggressive" : aggression <= 0.4 ? "conservative" : "measured";
  const opponentName = opponent.name || opponent.nickname || opponentId;
  const optionReads = {
    "run-heavy": passRate >= 0.59
      ? `Keep ${opponentId}'s pass-forward offense on the sideline.`
      : `Test a ${identity} opponent's front and control variance.`,
    "pass-heavy": Number(opponent.overallRating || 0) >= 84
      ? `Create scoring volume against an ${opponent.overallRating} OVR opponent.`
      : `Attack an opponent without an elite overall rating through space.`,
    "blitz-heavy": aggression >= 0.62
      ? `Challenge an aggressive offense before longer concepts develop.`
      : `Force a ${pressure} offense to make faster decisions.`,
    prevent: passRate >= 0.59
      ? `Prioritize explosive-pass prevention against a ${Math.round(passRate * 100)}% pass tendency.`
      : `Trade short gains for lower explosive-play exposure.`
  };
  return {
    available: true,
    opponentId,
    headline: `Week ${dashboard.currentWeek ?? "?"}: ${dashboard.controlledTeam?.abbrev || controlled} vs ${opponentName}`,
    read: `${opponentId} profiles as ${identity}, ${pressure}, ${opponent.overallRating ?? "?"} OVR${injured ? `, with ${injured} listed injur${injured === 1 ? "y" : "ies"}` : ""}.`,
    options: Object.entries(TACTICS).map(([id, tactic]) => ({ id, ...tactic, matchup: optionReads[id] }))
  };
}

function controlledGame(results = [], controlledTeamId) {
  for (let resultIndex = results.length - 1; resultIndex >= 0; resultIndex -= 1) {
    const result = results[resultIndex];
    const game = (result?.games || []).find(
      (entry) => entry.homeTeamId === controlledTeamId || entry.awayTeamId === controlledTeamId
    );
    if (game) return { result, game };
  }
  return null;
}

export function buildTacticalFilmReceipt({ tactic, results = [], controlledTeamId, year = null } = {}) {
  const meta = TACTICS[tactic];
  const located = controlledGame(results, controlledTeamId);
  if (!meta || !located) return null;
  const { result, game } = located;
  const isHome = game.homeTeamId === controlledTeamId;
  const box = game.boxScore || {};
  const own = isHome ? box.homeTeam : box.awayTeam;
  const opponent = isHome ? box.awayTeam : box.homeTeam;
  const ownScore = Number(isHome ? game.homeScore : game.awayScore) || 0;
  const opponentScore = Number(isHome ? game.awayScore : game.homeScore) || 0;
  const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
  const passPlays = Number(own?.passPlays || 0);
  const rushPlays = Number(own?.rushPlays || 0);
  const playTotal = Math.max(1, passPlays + rushPlays);
  const passShare = passPlays / playTotal;
  const rushShare = rushPlays / playTotal;
  const defensiveSacks = Number(opponent?.sacks || 0);
  const forcedTurnovers = Number(opponent?.turnovers || 0);
  const explosivePassesAllowed = (box.playByPlay || []).filter(
    (play) => play.offenseTeamId === opponentId && play.type === "pass" && Number(play.yards || 0) >= 20
  ).length;
  let aligned = false;
  let observed = "No matching box-score signal was recorded.";
  if (tactic === "run-heavy") {
    aligned = rushShare >= 0.48;
    observed = `${Math.round(rushShare * 100)}% rush share · ${Number(own?.rushingYards || 0)} rushing yards`;
  } else if (tactic === "pass-heavy") {
    aligned = passShare >= 0.58;
    observed = `${Math.round(passShare * 100)}% pass share · ${Number(own?.passingYards || 0)} passing yards`;
  } else if (tactic === "blitz-heavy") {
    aligned = defensiveSacks >= 3 || forcedTurnovers >= 2;
    observed = `${defensiveSacks} sacks · ${forcedTurnovers} forced turnovers`;
  } else if (tactic === "prevent") {
    aligned = explosivePassesAllowed <= 2;
    observed = `${explosivePassesAllowed} explosive passes allowed · ${Number(opponent?.passingYards || 0)} opponent passing yards`;
  }
  return {
    id: `film-${year ?? result.year ?? "?"}-${result.week ?? "?"}-${controlledTeamId}-${tactic}`,
    tactic,
    label: meta.label,
    intent: meta.intent,
    target: meta.target,
    teamId: controlledTeamId,
    opponentId,
    year: year ?? result.year ?? null,
    week: result.week ?? null,
    result: ownScore > opponentScore ? "win" : ownScore < opponentScore ? "loss" : "tie",
    score: `${ownScore}-${opponentScore}`,
    aligned,
    observed,
    disclaimer: "Alignment compares the chosen intent with observed game telemetry; it does not claim the tactic alone caused the result."
  };
}

export function tacticDefinition(id) {
  return TACTICS[id] ? { id, ...TACTICS[id] } : null;
}
