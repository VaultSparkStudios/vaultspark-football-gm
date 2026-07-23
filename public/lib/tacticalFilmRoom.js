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

function tacticalIdentityTier(repetitions) {
  return repetitions >= 6 ? "Signature" : repetitions >= 3 ? "Established" : "Installing";
}

export function previewTacticalIdentity(receipts = [], tactic) {
  const definition = TACTICS[tactic];
  if (!definition) return null;
  const valid = receipts.filter((receipt) => receipt && TACTICS[receipt.tactic]).slice(0, 12);
  const currentRepetitions = valid.filter((receipt) => receipt.tactic === tactic).length;
  const projectedRepetitions = Math.min(12, currentRepetitions + 1);
  const currentTier = tacticalIdentityTier(currentRepetitions);
  const projectedTier = tacticalIdentityTier(projectedRepetitions);
  const nextThreshold = projectedRepetitions < 3 ? 3 : projectedRepetitions < 6 ? 6 : null;
  return {
    tactic,
    label: definition.label,
    currentRepetitions,
    projectedRepetitions,
    currentTier,
    projectedTier,
    tierChange: currentRepetitions > 0 && currentTier !== projectedTier,
    remainingToNext: nextThreshold == null ? 0 : nextThreshold - projectedRepetitions,
    copy: currentRepetitions === 0
      ? `First recorded ${definition.label} call would begin an Installing identity.`
      : currentTier !== projectedTier
        ? `If executed, this call would move ${definition.label} from ${currentTier} to ${projectedTier}.`
        : nextThreshold == null
          ? `If executed, this call would reinforce a Signature ${definition.label} identity.`
          : `If executed, ${nextThreshold - projectedRepetitions} more ${definition.label} call${nextThreshold - projectedRepetitions === 1 ? "" : "s"} would remain before ${tacticalIdentityTier(nextThreshold)}.`,
    disclaimer: "Only an executed call updates the identity ledger; the preview does not predict results."
  };
}
export function buildTacticalIdentityLedger(receipts = []) {
  const valid = receipts
    .filter((receipt) => receipt && TACTICS[receipt.tactic])
    .slice(0, 12);
  if (!valid.length) return null;

  const counts = new Map();
  for (const receipt of valid) {
    const current = counts.get(receipt.tactic) || { tactic: receipt.tactic, count: 0, aligned: 0, firstIndex: valid.length };
    current.count += 1;
    current.aligned += receipt.aligned === true ? 1 : 0;
    current.firstIndex = Math.min(current.firstIndex, valid.indexOf(receipt));
    counts.set(receipt.tactic, current);
  }
  const ranked = [...counts.values()].sort((left, right) =>
    right.count - left.count || left.firstIndex - right.firstIndex || left.tactic.localeCompare(right.tactic)
  );
  const dominant = ranked[0];
  const definition = TACTICS[dominant.tactic];
  const tier = tacticalIdentityTier(dominant.count);
  return {
    version: 1,
    tactic: dominant.tactic,
    label: definition.label,
    tier,
    repetitions: dominant.count,
    alignedRepetitions: dominant.aligned,
    sampleSize: valid.length,
    variety: ranked.length,
    ledger: ranked.map((entry) => ({
      tactic: entry.tactic,
      label: TACTICS[entry.tactic].label,
      repetitions: entry.count,
      alignedRepetitions: entry.aligned
    })),
    summary: `${tier} ${definition.label} identity · ${dominant.count} of ${valid.length} recent calls`,
    disclaimer: "Identity reflects repeated tactical choices and observed alignment. It does not claim those choices caused game results."
  };
}
export function tacticDefinition(id) {
  return TACTICS[id] ? { id, ...TACTICS[id] } : null;
}
