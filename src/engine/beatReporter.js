/**
 * Beat Reporter — Sim-derived league news feed
 *
 * Generates headline-style items from real simulation events.
 * All output is derived from world-state; no random flavour text is injected.
 * Items attach to league.newsLog (rolling 50-item window, newest first).
 */

import { getRivalGmPersona, recordRivalGmMemory } from "./rivalGmPersona.js";
import { formatRecord } from "../stats/teamRecord.js";

const MAX_NEWS_LOG = 50;

export function initNewsLog(league) {
  if (!Array.isArray(league.newsLog)) league.newsLog = [];
}

function slugPart(value) {
  return String(value ?? "na").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "na";
}

function newsId(item, ordinal) {
  const teams = (item.teamIds || []).map(slugPart).join("-");
  const players = (item.playerIds || []).map(slugPart).join("-");
  return [
    "news",
    slugPart(item.type),
    slugPart(item.year),
    slugPart(item.week),
    teams || players || "league",
    ordinal
  ].join("-");
}

function push(league, item) {
  league.newsLog.unshift({ ...item, id: newsId(item, league.newsLog.length) });
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

const PLAYER_MILESTONES = [
  { key: "passing-yards-4000", positions: ["QB"], group: "passing", stat: "yards", threshold: 4000,
    headline: (p) => `${p.name} surpasses 4,000 passing yards on the season` },
  { key: "passing-td-30", positions: ["QB"], group: "passing", stat: "td", threshold: 30,
    headline: (p) => `${p.name} throws his 30th TD pass of the year — elite season taking shape` },
  { key: "rushing-yards-1000", positions: ["RB"], group: "rushing", stat: "yards", threshold: 1000,
    headline: (p) => `${p.name} hits 1,000 rushing yards — on pace for a Pro Bowl season` },
  { key: "receiving-yards-1000", positions: ["WR", "TE"], group: "receiving", stat: "yards", threshold: 1000,
    headline: (p) => `${p.name} eclipses 1,000 receiving yards — commanding target in the passing game` },
  { key: "defense-sacks-10", positions: ["DL", "LB"], group: "defense", stat: "sacks", threshold: 10,
    headline: (p) => `${p.name} records his 10th sack — one of the most disruptive pass-rushers in the league` }
];

// Capture only the five counters used by the reporter, before simulation mutates
// the canonical season buckets. A missing bucket means no stats this season.
export function capturePlayerMilestoneStats(players, year) {
  return {
    year,
    players: new Map(players.map((player) => [player.id, Object.fromEntries(
      PLAYER_MILESTONES.map((milestone) => [
        milestone.key,
        Number(player.seasonStats?.[year]?.[milestone.group]?.[milestone.stat] ?? 0)
      ])
    )]))
  };
}

export function reportPlayerMilestones(league, players, year, week, previous = null) {
  initNewsLog(league);
  // Without a pre-week observation, a total proves achievement but not that it
  // happened this week. In particular, never backfill invented news on old saves.
  if (previous?.year !== year || !(previous.players instanceof Map)) return;

  // The league is persisted verbatim by GameSession. Keep this season's receipts
  // independently of the rolling news feed, so eviction/reload cannot re-award.
  if (league.playerMilestoneReceipts?.year !== year) {
    league.playerMilestoneReceipts = { year, keys: [] };
  }
  const receipts = league.playerMilestoneReceipts;
  const reported = new Set(receipts.keys || []);
  for (const player of players) {
    const before = previous.players.get(player.id);
    const season = player.seasonStats?.[year];
    if (!before || !season) continue;
    for (const milestone of PLAYER_MILESTONES) {
      if (!milestone.positions.includes(player.position)) continue;
      const total = Number(season[milestone.group]?.[milestone.stat]);
      const prior = before[milestone.key];
      const key = JSON.stringify([player.id, milestone.key]);
      if (!Number.isFinite(prior) || !Number.isFinite(total) ||
          prior >= milestone.threshold || total < milestone.threshold || reported.has(key)) continue;
      push(league, {
        type: "milestone", week, year, headline: milestone.headline(player),
        playerIds: [player.id], teamIds: [player.teamId],
        milestone: { key: milestone.key, threshold: milestone.threshold, previous: prior, total }
      });
      reported.add(key);
    }
  }
  receipts.keys = [...reported];
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

/**
 * Publish a completed rehab plan into the same source-derived stream that
 * powers the Priority Inbox. The receipt is produced by injurySystem; this
 * function adds presentation metadata only and never invents an outcome.
 */
export function reportRehabClearance(league, receipt, year, week) {
  if (!receipt?.playerId || !receipt?.teamId) return null;
  initNewsLog(league);
  const item = {
    type: "rehab-clearance",
    week,
    year,
    headline: `${receipt.player} cleared the ${receipt.plan} rehab plan`,
    detail: `Modeled re-injury risk at clearance: ${Math.round(Number(receipt.reinjuryRisk || 0) * 100)}%.`,
    playerIds: [receipt.playerId],
    teamIds: [receipt.teamId],
    rehabPlan: receipt.plan,
    reinjuryRisk: Number(receipt.reinjuryRisk || 0)
  };
  push(league, item);
  return league.newsLog[0];
}

// ── Trades ───────────────────────────────────────────────────────────────────

export function reportOwnerUltimatum(league, { teamId, message, targetWins, consequence, year, week }) {
  initNewsLog(league);
  push(league, {
    type: "owner-ultimatum",
    year,
    week,
    teamIds: [teamId],
    headline: `Ownership issues ultimatum to ${teamId}`,
    detail: `${message} Consequence on the table: ${consequence || "major changes"} (target: ${targetWins} wins).`
  });
  return league.newsLog[0];
}

export function reportInboundTradeOffer(league, offer) {
  initNewsLog(league);
  const assets = [
    ...(offer.offeredPlayers || []).map((row) => `${row.name} (${row.pos})`),
    ...(offer.offeredPicks || []).map((row) => `${row.year} R${row.round} pick`)
  ].join(" + ") || "assets";
  push(league, {
    type: "trade-offer",
    year: offer.year,
    week: offer.week,
    teamIds: [offer.fromTeamId, offer.toTeamId],
    playerIds: offer.requestedPlayerIds || [],
    headline: `${offer.fromTeamId} call${offer.deadlineWindow ? " before the deadline" : ""}: they want ${offer.requestedPlayers?.[0]?.name || "your player"}`,
    detail: `${offer.rationale} On the table: ${assets}. The offer expires after Week ${offer.expiresWeek}.`
  });
  return league.newsLog[0];
}

export function reportMilestone(league, { type, year, week = 0, teamIds = [], playerIds = [], headline, detail }) {
  initNewsLog(league);
  push(league, { type, year, week, teamIds, playerIds, headline, detail });
  return league.newsLog[0];
}

export function reportFreeAgencyOutbid(league, {
  playerName, playerId, winnerTeamId, winningYears, winningSalary,
  losingYears, losingSalary, year, week
}) {
  initNewsLog(league);
  const winnerGm = getRivalGmPersona(league, winnerTeamId);
  recordRivalGmMemory(league, winnerTeamId, {
    type: "outbid-you",
    year,
    week,
    summary: `${winnerGm.name} outbid you for ${playerName}.`
  });
  push(league, {
    type: "fa-outbid",
    year,
    week,
    teamIds: [winnerTeamId],
    playerIds: playerId ? [playerId] : [],
    headline: `Outbid: ${playerName} signs with ${winnerTeamId}`,
    detail: `Your offer (${losingYears}yr / $${Math.round(losingSalary / 1_000_000)}M) lost to ${winnerTeamId}'s ${winningYears}yr / $${Math.round(winningSalary / 1_000_000)}M — ${winnerGm.name} worked the phones while you slept on it.`
  });
  return league.newsLog[0];
}

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
    const record = formatRecord(team.season);
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
        headline: `${team.id} (${record}) is closing in on a playoff berth with a strong late-season push`,
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
