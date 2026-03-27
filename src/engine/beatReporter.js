/**
 * Beat Reporter — Sim-derived league news feed
 *
 * Generates headline-style items from real simulation events.
 * All output is derived from world-state; no random flavour text is injected.
 * Items attach to league.newsLog (rolling 50-item window, newest first).
 */

const MAX_NEWS_LOG = 50;

export function initNewsLog(league) {
  if (!Array.isArray(league.newsLog)) league.newsLog = [];
}

function push(league, item) {
  league.newsLog.unshift({ ...item, id: `news-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
  if (league.newsLog.length > MAX_NEWS_LOG) league.newsLog.length = MAX_NEWS_LOG;
}

// ── Weekly game results ──────────────────────────────────────────────────────

export function reportWeeklyResults(league, weekResults, year) {
  if (!weekResults?.games) return;
  initNewsLog(league);

  // Blowouts
  for (const g of weekResults.games) {
    const margin = Math.abs((g.homeScore ?? 0) - (g.awayScore ?? 0));
    if (margin >= 28) {
      const winner = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
      const loser  = g.homeScore > g.awayScore ? g.awayTeamId : g.homeTeamId;
      push(league, {
        type: "blowout",
        week: weekResults.week,
        year,
        headline: `${winner} demolishes ${loser} by ${margin} — dominant performance in Week ${weekResults.week}`,
        teamIds: [winner, loser]
      });
    }
  }

  // Upsets: team wins ≥4 games below league avg wins
  const avgWins = league.teams.reduce((s, t) => s + (t.season?.wins || 0), 0) / league.teams.length;
  for (const g of weekResults.games) {
    const homeTeam = league.teams.find((t) => t.id === g.homeTeamId);
    const awayTeam = league.teams.find((t) => t.id === g.awayTeamId);
    if (!homeTeam || !awayTeam) continue;
    const homeWins = homeTeam.season?.wins || 0;
    const awayWins = awayTeam.season?.wins || 0;
    if (g.homeScore > g.awayScore && awayWins - homeWins >= 3 && weekResults.week >= 4) {
      push(league, {
        type: "upset",
        week: weekResults.week,
        year,
        headline: `Upset alert: ${g.homeTeamId} knocks off division leader ${g.awayTeamId} in Week ${weekResults.week}`,
        teamIds: [g.homeTeamId, g.awayTeamId]
      });
    } else if (g.awayScore > g.homeScore && homeWins - awayWins >= 3 && weekResults.week >= 4) {
      push(league, {
        type: "upset",
        week: weekResults.week,
        year,
        headline: `Upset alert: ${g.awayTeamId} upsets ${g.homeTeamId} on the road in Week ${weekResults.week}`,
        teamIds: [g.awayTeamId, g.homeTeamId]
      });
    }
  }
}

// ── Player milestones ────────────────────────────────────────────────────────

export function reportPlayerMilestones(league, players, year, week) {
  initNewsLog(league);

  for (const p of players) {
    const s = p.seasonStats?.[year];
    if (!s) continue;

    if (p.position === "QB") {
      if (s.passing?.yards >= 4000 && s.passing?.yards - (s.passing?.yardsLast || 0) < 200) {
        push(league, {
          type: "milestone",
          week,
          year,
          headline: `${p.name} surpasses 4,000 passing yards on the season`,
          playerIds: [p.id],
          teamIds: [p.teamId]
        });
      }
      if (s.passing?.td >= 30 && (s.passing?.td - 1) < 30) {
        push(league, {
          type: "milestone",
          week,
          year,
          headline: `${p.name} throws his 30th TD pass of the year — elite season taking shape`,
          playerIds: [p.id],
          teamIds: [p.teamId]
        });
      }
    }

    if (p.position === "RB") {
      if (s.rushing?.yards >= 1000 && s.rushing?.yards - (s.rushing?.yardsLast || 0) < 120) {
        push(league, {
          type: "milestone",
          week,
          year,
          headline: `${p.name} hits 1,000 rushing yards — on pace for a Pro Bowl season`,
          playerIds: [p.id],
          teamIds: [p.teamId]
        });
      }
    }

    if (p.position === "WR" || p.position === "TE") {
      if (s.receiving?.yards >= 1000 && s.receiving?.yards - (s.receiving?.yardsLast || 0) < 120) {
        push(league, {
          type: "milestone",
          week,
          year,
          headline: `${p.name} eclipses 1,000 receiving yards — commanding target in the passing game`,
          playerIds: [p.id],
          teamIds: [p.teamId]
        });
      }
    }

    if ((p.position === "DL" || p.position === "LB") && s.defense?.sacks >= 10) {
      const prev = s.defense.sacks - (s.defense.sacksLastWeek || 0);
      if (prev < 10) {
        push(league, {
          type: "milestone",
          week,
          year,
          headline: `${p.name} records his 10th sack — one of the most disruptive pass-rushers in the league`,
          playerIds: [p.id],
          teamIds: [p.teamId]
        });
      }
    }
  }
}

// ── Injuries ─────────────────────────────────────────────────────────────────

export function reportSignificantInjury(league, player, year, week) {
  initNewsLog(league);
  if (!player.injury || player.injury.weeksRemaining < 2) return;
  const severity = player.injury.weeksRemaining >= 8 ? "season-ending" :
                   player.injury.weeksRemaining >= 4 ? "significant" : "multi-week";
  push(league, {
    type: "injury",
    week,
    year,
    headline: `${player.name} (${player.position}, ${player.teamId}) suffers ${severity} injury — out ${player.injury.weeksRemaining} weeks`,
    playerIds: [player.id],
    teamIds: [player.teamId]
  });
}

// ── Trades ───────────────────────────────────────────────────────────────────

export function reportTrade(league, fromTeamId, toTeamId, playerName, year, week) {
  initNewsLog(league);
  push(league, {
    type: "trade",
    week,
    year,
    headline: `Trade: ${playerName} dealt from ${fromTeamId} to ${toTeamId}`,
    teamIds: [fromTeamId, toTeamId]
  });
}

// ── Standings momentum ───────────────────────────────────────────────────────

export function reportStreaks(league, year, week) {
  initNewsLog(league);
  for (const team of league.teams) {
    const wins = team.season?.wins || 0;
    const losses = team.season?.losses || 0;
    const streak = team.season?.streak || 0; // positive = win streak
    if (streak >= 5) {
      push(league, {
        type: "streak",
        week,
        year,
        headline: `${team.id} has won ${streak} straight — building serious momentum entering the stretch`,
        teamIds: [team.id]
      });
    } else if (streak <= -5) {
      push(league, {
        type: "streak",
        week,
        year,
        headline: `${team.id} has dropped ${Math.abs(streak)} in a row — hot-seat pressure building`,
        teamIds: [team.id]
      });
    }
    // Clinch-possible alerts
    if (week >= 14 && wins >= 11) {
      push(league, {
        type: "standings",
        week,
        year,
        headline: `${team.id} (${wins}-${losses}) is closing in on a playoff berth with a strong late-season push`,
        teamIds: [team.id]
      });
    }
  }
}

// ── Offseason notes ──────────────────────────────────────────────────────────

export function reportRetirement(league, player, year) {
  initNewsLog(league);
  if ((player.overall || 70) >= 80 || player.seasonsPlayed >= 8) {
    push(league, {
      type: "retirement",
      week: 0,
      year,
      headline: `${player.name} announces retirement after ${player.seasonsPlayed} seasons — a key part of the ${player.teamId} era`,
      playerIds: [player.id],
      teamIds: [player.teamId]
    });
  }
}

export function reportFreeAgentSigning(league, player, toTeamId, salary, year) {
  initNewsLog(league);
  if ((player.overall || 70) >= 82) {
    const salaryM = (salary / 1_000_000).toFixed(1);
    push(league, {
      type: "signing",
      week: 0,
      year,
      headline: `${player.name} (${player.position}, ${player.overall} OVR) signs with ${toTeamId} — $${salaryM}M deal`,
      playerIds: [player.id],
      teamIds: [toTeamId]
    });
  }
}
