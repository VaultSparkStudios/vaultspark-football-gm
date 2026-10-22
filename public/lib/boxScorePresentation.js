function addImpact(map, row, team, category, score, summary) {
  if (!row?.playerId || !Number.isFinite(score) || score <= 0) return;
  const current = map.get(row.playerId) || {
    playerId: row.playerId,
    player: row.player,
    pos: row.pos,
    team,
    score: 0,
    moments: []
  };
  current.score += score;
  current.moments.push({ category, score, summary });
  map.set(row.playerId, current);
}

export function buildBoxScoreImpactLeaders(boxScore = {}) {
  const impact = new Map();
  const ingest = (groups = {}, team = "Team") => {
    for (const row of groups.passing || []) {
      addImpact(
        impact,
        row,
        team,
        "Passing",
        (row.yds || 0) / 25 + (row.td || 0) * 4 - (row.int || 0) * 2 + (row.cmpPct || 0) / 40,
        `${row.yds || 0} pass yds · ${row.td || 0} TD · ${row.rate || 0} rate`
      );
    }
    for (const row of groups.rushing || []) {
      addImpact(
        impact,
        row,
        team,
        "Rushing",
        (row.yds || 0) / 10 + (row.td || 0) * 6 + (row.firstDowns || 0) * 0.6,
        `${row.yds || 0} rush yds · ${row.td || 0} TD · ${row.firstDowns || 0} first downs`
      );
    }
    for (const row of groups.receiving || []) {
      addImpact(
        impact,
        row,
        team,
        "Receiving",
        (row.yds || 0) / 10 + (row.td || 0) * 6 + (row.rec || 0) * 0.45 - (row.drops || 0),
        `${row.rec || 0} rec · ${row.yds || 0} yds · ${row.td || 0} TD`
      );
    }
    for (const row of groups.defense || []) {
      addImpact(
        impact,
        row,
        team,
        "Defense",
        (row.tkl || 0) * 0.45 + (row.sacks || 0) * 2.5 + (row.int || 0) * 4 + (row.ff || 0) * 2 + (row.fr || 0) * 2,
        `${row.tkl || 0} tackles · ${row.sacks || 0} sacks · ${row.int || 0} INT`
      );
    }
    for (const row of groups.kicking || []) {
      addImpact(
        impact,
        row,
        team,
        "Kicking",
        (row.fgm || 0) * 3 + (row.xpm || 0) + (row.lng || 0) / 25,
        `${row.fgm || 0}/${row.fga || 0} FG · long ${row.lng || 0}`
      );
    }
    for (const row of groups.punting || []) {
      addImpact(
        impact,
        row,
        team,
        "Punting",
        (row.in20 || 0) * 1.5 + (row.avg || 0) / 12 - (row.tb || 0),
        `${row.punts || 0} punts · ${row.avg || 0} avg · ${row.in20 || 0} inside 20`
      );
    }
  };

  ingest(boxScore.playerStats?.away, boxScore.awayTeamName || boxScore.awayTeam?.teamId || "Away");
  ingest(boxScore.playerStats?.home, boxScore.homeTeamName || boxScore.homeTeam?.teamId || "Home");
  return [...impact.values()]
    .map((entry) => {
      const signature = entry.moments.sort((a, b) => b.score - a.score)[0];
      return {
        ...entry,
        score: Number(entry.score.toFixed(1)),
        category: signature?.category || "Impact",
        summary: signature?.summary || "Game contribution"
      };
    })
    .sort((a, b) => b.score - a.score || a.player.localeCompare(b.player))
    .slice(0, 3);
}

export function buildQuarterScoreboard(boxScore = {}) {
  const home = Array.isArray(boxScore.quarterScores?.home) ? boxScore.quarterScores.home : [];
  const away = Array.isArray(boxScore.quarterScores?.away) ? boxScore.quarterScores.away : [];
  // Initial arrays include an unused fifth slot. Show actual overtime from
  // scoring, logged plays or extended period arrays, including scoreless OT.
  let periods = Math.max(4, home.length > 5 ? home.length : 4, away.length > 5 ? away.length : 4);
  // Completed playoff games extend the score arrays to the winning period;
  // regular scoreless ties retain an explicit receipt after archive trimming.
  // Log/receipt metadata may not invent periods outside those actual arrays.
  const reportedPeriods = Math.max(5, home.length, away.length);
  const overtime = boxScore.overtime;
  if ([600, 900].includes(overtime?.periodSeconds) && Number.isFinite(overtime?.elapsedSeconds) &&
      overtime.elapsedSeconds > 0 && overtime.elapsedSeconds <= overtime.periodSeconds * (reportedPeriods - 4)) {
    periods = Math.max(periods, 4 + Math.ceil(overtime.elapsedSeconds / overtime.periodSeconds));
  }
  for (let index = 4; index < Math.max(home.length, away.length); index += 1) {
    if (Number(home[index] || 0) !== 0 || Number(away[index] || 0) !== 0) periods = Math.max(periods, index + 1);
  }
  const plays = Array.isArray(boxScore.playByPlay) ? boxScore.playByPlay : [];
  const scores = Array.isArray(boxScore.scoringSummary) ? boxScore.scoringSummary : [];
  for (const entry of [...plays, ...scores]) {
    if (Number.isInteger(entry?.quarter) && entry.quarter >= 5 && entry.quarter <= reportedPeriods) periods = Math.max(periods, entry.quarter);
  }
  const labels = Array.from({ length: periods }, (_, index) => index < 4 ? `Q${index + 1}` : index === 4 ? "OT" : `OT${index - 3}`);
  return {
    labels,
    rows: [
      {
        side: "away",
        team: boxScore.awayTeamName || boxScore.awayTeam?.teamId || "Away",
        quarters: labels.map((_, index) => Number(away[index] || 0)),
        total: Number(boxScore.awayTeam?.score || 0)
      },
      {
        side: "home",
        team: boxScore.homeTeamName || boxScore.homeTeam?.teamId || "Home",
        quarters: labels.map((_, index) => Number(home[index] || 0)),
        total: Number(boxScore.homeTeam?.score || 0)
      }
    ]
  };
}
