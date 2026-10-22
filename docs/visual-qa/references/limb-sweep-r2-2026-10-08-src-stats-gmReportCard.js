/**
 * GM Report Card
 *
 * Produces an A–F letter grade for each management dimension at season end.
 * All inputs are derived from session state — no external data required.
 *
 * Dimensions:
 *   rosterConstruction  — overall depth, positional balance, top-player quality
 *   capManagement       — cap space used efficiently, dead cap ratio, restructures
 *   draftROI            — AV produced by players acquired via draft in last 4 years
 *   tradeOutcomes       — net AV gained/lost via trades in the season
 *   schemeFitExecution  — average scheme-fit score of starters vs. team scheme
 */

function letterGrade(score) {
  if (score >= 93) return "A+";
  if (score >= 87) return "A";
  if (score >= 80) return "A-";
  if (score >= 77) return "B+";
  if (score >= 70) return "B";
  if (score >= 63) return "B-";
  if (score >= 57) return "C+";
  if (score >= 50) return "C";
  if (score >= 43) return "C-";
  if (score >= 37) return "D+";
  if (score >= 30) return "D";
  return "F";
}

function gradeColor(letter) {
  if (letter.startsWith("A")) return "positive";
  if (letter.startsWith("B")) return "info";
  if (letter.startsWith("C")) return "warning";
  return "negative";
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Roster Construction ───────────────────────────────────────────────────────

function scoreRosterConstruction(teamPlayers) {
  if (!teamPlayers.length) return 50;
  const actives = teamPlayers.filter((p) => p.rosterSlot === "active" || !p.rosterSlot);
  if (!actives.length) return 50;

  const overalls = actives.map((p) => p.overall || 65).sort((a, b) => b - a);
  const top10Avg = overalls.slice(0, 10).reduce((s, v) => s + v, 0) / Math.min(10, overalls.length);
  const rosterAvg = overalls.reduce((s, v) => s + v, 0) / overalls.length;

  // Top 10 average: baseline 75 = 60pts, 85 = 90pts
  const topScore = clamp((top10Avg - 72) * 3, 0, 100);
  // Roster depth: average 70 = 55pts, 78 = 85pts
  const depthScore = clamp((rosterAvg - 66) * 4, 0, 100);

  return Math.round(topScore * 0.6 + depthScore * 0.4);
}

// ── Cap Management ────────────────────────────────────────────────────────────

function scoreCapManagement(capSummary = {}) {
  const capHardLimit = Number(capSummary.salaryCap || 0);
  const usedCap = Number(capSummary.usedCap || 0);
  const deadCap = Number(capSummary.deadCap || 0);
  const totalCommitted = usedCap + deadCap;
  const deadCapRatio = totalCommitted > 0 ? deadCap / totalCommitted : 0;
  const capUtilization = capHardLimit > 0 ? usedCap / capHardLimit : 0;

  // Dead cap penalty: 0% = 0pts loss, 20%+ = heavy penalty
  const deadCapPenalty = clamp(deadCapRatio * 250, 0, 50);

  // Cap utilization reward: using 85–98% is ideal; below 70% or above 100% penalizes
  let utilScore;
  if (capUtilization >= 0.85 && capUtilization <= 0.98) utilScore = 100;
  else if (capUtilization > 0.98) utilScore = clamp(100 - (capUtilization - 0.98) * 1000, 0, 100);
  else if (capUtilization >= 0.70) utilScore = 70 + (capUtilization - 0.70) * 200;
  else utilScore = clamp(capUtilization * 100, 0, 70);

  return clamp(Math.round(utilScore - deadCapPenalty), 0, 100);
}

// ── Draft ROI ─────────────────────────────────────────────────────────────────

function scoreDraftROI(teamPlayers, year, seasonAvByPlayerId = {}, lookbackYears = 4) {
  const draftees = teamPlayers.filter((p) => {
    if (!["generated-draft", "draft-prospect", "drafted"].includes(p.profile?.source)) return false;
    const draftYear = Number(p.profile?.draftYear || String(p.id || "").match(/^P(\d{4})-/)?.[1] || 0);
    return draftYear >= year - lookbackYears && draftYear <= year;
  });
  if (!draftees.length) return 50;

  const avFor = (id) => Number(seasonAvByPlayerId instanceof Map ? seasonAvByPlayerId.get(id) : seasonAvByPlayerId[id]) || 0;
  const totalAV = draftees.reduce((sum, player) => sum + avFor(player.id), 0);
  const avgAV = totalAV / draftees.length;

  // Average draft pick: ~6 AV over 4 years = 50pts; 10+ = 80+; 16+ = 100
  return clamp(Math.round(avgAV * 5.5), 0, 100);
}

// ── Trade Outcomes ────────────────────────────────────────────────────────────

function playerIds(rows = []) {
  return rows.map((row) => typeof row === "string" ? row : row?.playerId).filter(Boolean);
}

export function computeObservedTradeNetAv(teamId, year, transactions = [], seasonAvByPlayerId = {}) {
  const trades = transactions.filter((transaction) =>
    transaction.type === "trade" && Number(transaction.year) === Number(year) &&
    (transaction.teamA === teamId || transaction.teamB === teamId)
  );
  const avFor = (id) => Number(seasonAvByPlayerId instanceof Map ? seasonAvByPlayerId.get(id) : seasonAvByPlayerId[id]) || 0;
  const receipts = trades.map((trade) => {
    const receivedIds = trade.teamA === teamId ? playerIds(trade.details?.fromB) : playerIds(trade.details?.fromA);
    const sentIds = trade.teamA === teamId ? playerIds(trade.details?.fromA) : playerIds(trade.details?.fromB);
    const receivedAv = receivedIds.reduce((sum, id) => sum + avFor(id), 0);
    const sentAv = sentIds.reduce((sum, id) => sum + avFor(id), 0);
    return { transactionId: trade.id, receivedIds, sentIds, receivedAv, sentAv, netAv: receivedAv - sentAv };
  });
  return {
    tradeCount: receipts.length,
    receivedAv: receipts.reduce((sum, receipt) => sum + receipt.receivedAv, 0),
    sentAv: receipts.reduce((sum, receipt) => sum + receipt.sentAv, 0),
    netAv: receipts.reduce((sum, receipt) => sum + receipt.netAv, 0),
    receipts,
    boundary: "Observed regular-season Approximate Value after each receipted trade; descriptive, not causal."
  };
}

function scoreTradeOutcomes(tradeReceipt) {
  const trades = tradeReceipt.receipts || [];
  if (!trades.length) return 65; // no trades = neutral grade
  // +5 net AV per trade = 80pts; -5 = 40pts
  const perTradeNet = tradeReceipt.netAv / trades.length;
  return clamp(Math.round(60 + perTradeNet * 4), 0, 100);
}

// ── Scheme Fit Execution ──────────────────────────────────────────────────────

function scoreSchemeFitExecution(teamPlayers) {
  const starters = teamPlayers.filter(
    (p) => (p.rosterSlot === "active" || !p.rosterSlot) && (p.depthChartOrder || 99) <= 2
  );
  if (!starters.length) return 60;
  const avgFit = starters.reduce((s, p) => s + (p.schemeFit || 65), 0) / starters.length;
  // 58 = 40pts, 80 = 90pts
  return clamp(Math.round((avgFit - 55) * 2.2), 0, 100);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate the full report card for a team.
 *
 * @param {object} team       — team object from league.teams
 * @param {Array}  teamPlayers — filtered player list for this team
 * @param {number} year
 * @returns {object} report card
 */
export function generateGMReportCard(team, teamPlayers, year, {
  capSummary = {},
  transactions = [],
  seasonAvByPlayerId = {}
} = {}) {
  const tradeReceipt = computeObservedTradeNetAv(team.id, year, transactions, seasonAvByPlayerId);
  const scores = {
    rosterConstruction: scoreRosterConstruction(teamPlayers),
    capManagement: scoreCapManagement(capSummary),
    draftROI: scoreDraftROI(teamPlayers, year, seasonAvByPlayerId),
    tradeOutcomes: scoreTradeOutcomes(tradeReceipt),
    schemeFitExecution: scoreSchemeFitExecution(teamPlayers)
  };

  const overallScore = Math.round(
    scores.rosterConstruction * 0.25 +
    scores.capManagement     * 0.20 +
    scores.draftROI          * 0.25 +
    scores.tradeOutcomes     * 0.15 +
    scores.schemeFitExecution * 0.15
  );

  const grades = {};
  const colors = {};
  for (const [k, v] of Object.entries(scores)) {
    grades[k] = letterGrade(v);
    colors[k] = gradeColor(grades[k]);
  }
  grades.overall = letterGrade(overallScore);
  colors.overall = gradeColor(grades.overall);

  const LABELS = {
    rosterConstruction: "Roster Construction",
    capManagement: "Cap Management",
    draftROI: "Draft ROI",
    tradeOutcomes: "Trade Outcomes",
    schemeFitExecution: "Scheme Fit Execution",
    overall: "Overall GM Grade"
  };

  return {
    schemaVersion: "1.0",
    year,
    teamId: team.id,
    overallScore,
    scores,
    grades,
    colors,
    labels: LABELS,
    capReceipt: {
      salaryCap: Number(capSummary.salaryCap || 0),
      usedCap: Number(capSummary.usedCap || 0),
      deadCap: Number(capSummary.deadCap || 0),
      capSpace: Number(capSummary.capSpace || 0),
      source: "ContractService.getCapSummary"
    },
    tradeReceipt,
    evidenceBoundary: "Grades summarize canonical roster, cap, draft, transaction and season-stat authorities; they do not prove that a single decision caused an outcome.",
    dimensions: Object.keys(scores).map((k) => ({
      key: k,
      label: LABELS[k],
      score: scores[k],
      grade: grades[k],
      color: colors[k]
    }))
  };
}

/**
 * Compare this season's report card against the previous season's (if stored).
 */
export function attachTrend(current, previous) {
  if (!previous) return current;
  const trends = {};
  for (const k of Object.keys(current.scores)) {
    const delta = current.scores[k] - (previous.scores[k] || 50);
    trends[k] = delta > 3 ? "up" : delta < -3 ? "down" : "flat";
  }
  return { ...current, trends };
}
