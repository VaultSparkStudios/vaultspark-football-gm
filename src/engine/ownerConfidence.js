/**
 * Owner Confidence (S62) — patience becomes a live, receipted loop.
 *
 * Before this authority, `owner.patience` was written once at league setup and
 * once by the Opening Contract, then never moved: two of the three opening
 * plans could never reach the ultimatum gate (patience <= 0.35), making the
 * Owner Ultimatum banner permanently dead UI for them.
 *
 * Every regular-season week, each owner's patience drifts deterministically
 * from observable results only — this week's result, pace against the owner's
 * target, and (for any team with resolutions this week) kept or missed GM
 * commitments. The drift is bounded, clamped, and every controlled-team move
 * carries a receipt naming exactly why it moved. No randomness, no hidden
 * bonuses, no outcome prediction.
 */

const WEEKLY_DELTA_CAP = 0.03;
const PATIENCE_FLOOR = 0.05;
const PATIENCE_CEILING = 0.95;
const LOG_LIMIT = 24;

const clampNumber = (value, low, high) => Math.min(high, Math.max(low, value));

function round4(value) {
  return Number(value.toFixed(4));
}

/**
 * Pure drift computation for one team-week. Exported for direct testing.
 * @returns {{ delta: number, reasons: string[] }}
 */
export function computeOwnerConfidenceDrift({
  won = null,
  tied = false,
  paceGap = 0,
  commitmentsKept = 0,
  commitmentsMissed = 0
} = {}) {
  const reasons = [];
  let delta = 0;
  if (won === true) {
    delta += 0.01;
    reasons.push("won this week (+1.0)");
  } else if (won === false && !tied) {
    delta -= 0.014;
    reasons.push("lost this week (-1.4)");
  } else if (tied) {
    reasons.push("tied this week (0.0)");
  }
  const pace = clampNumber(Number(paceGap) * 0.004, -0.012, 0.008);
  if (pace !== 0) {
    delta += pace;
    reasons.push(
      pace > 0
        ? `ahead of the owner's win target (+${(pace * 100).toFixed(1)})`
        : `behind the owner's win target (${(pace * 100).toFixed(1)})`
    );
  }
  if (commitmentsKept > 0) {
    delta += 0.012 * commitmentsKept;
    reasons.push(`kept ${commitmentsKept} GM commitment${commitmentsKept === 1 ? "" : "s"} (+${(1.2 * commitmentsKept).toFixed(1)})`);
  }
  if (commitmentsMissed > 0) {
    delta -= 0.02 * commitmentsMissed;
    reasons.push(`missed ${commitmentsMissed} GM commitment${commitmentsMissed === 1 ? "" : "s"} (-${(2 * commitmentsMissed).toFixed(1)})`);
  }
  delta = clampNumber(delta, -WEEKLY_DELTA_CAP, WEEKLY_DELTA_CAP);
  if (!reasons.length) reasons.push("no confidence-moving events this week");
  return { delta: round4(delta), reasons };
}

function commitmentTallies(league, teamId, year, week) {
  let kept = 0;
  let missed = 0;
  for (const receipt of league.gmCommitmentReceipts || []) {
    if (receipt.teamId !== teamId || receipt.year !== year || receipt.week !== week) continue;
    if (receipt.status === "succeeded") kept += 1;
    else if (receipt.status === "failed" || receipt.status === "missed") missed += 1;
  }
  return { kept, missed };
}

/**
 * Apply weekly patience drift for every team that played this week.
 * Mutates `team.owner.patience` and appends a bounded receipt log.
 * Returns the controlled team's receipt (or null when it did not play).
 */
export function applyWeeklyOwnerConfidence({
  league,
  weekResult,
  currentYear,
  commitmentWeek,
  controlledTeamId = null
}) {
  if (!league || !Array.isArray(weekResult?.games)) return null;
  let controlledReceipt = null;
  for (const game of weekResult.games) {
    for (const side of ["home", "away"]) {
      const teamId = side === "home" ? game.homeTeamId : game.awayTeamId;
      const team = league.teams?.find((entry) => entry.id === teamId);
      if (!team?.owner) continue;
      const won = game.winnerId === null ? null : game.winnerId === teamId;
      const tied = game.winnerId === null;
      const paceGap = Number(team.owner.expectation?.paceGap || 0);
      const { kept, missed } = commitmentTallies(league, teamId, currentYear, commitmentWeek);
      const { delta, reasons } = computeOwnerConfidenceDrift({
        won,
        tied,
        paceGap,
        commitmentsKept: kept,
        commitmentsMissed: missed
      });
      const before = clampNumber(Number(team.owner.patience ?? 0.55), PATIENCE_FLOOR, PATIENCE_CEILING);
      const after = round4(clampNumber(before + delta, PATIENCE_FLOOR, PATIENCE_CEILING));
      team.owner.patience = after;
      const receipt = {
        year: currentYear,
        week: Number(weekResult.week) || commitmentWeek,
        delta: round4(after - before),
        patience: after,
        reasons
      };
      if (!Array.isArray(team.owner.confidenceLog)) team.owner.confidenceLog = [];
      team.owner.confidenceLog.unshift(receipt);
      team.owner.confidenceLog = team.owner.confidenceLog.slice(0, LOG_LIMIT);
      if (teamId === controlledTeamId) controlledReceipt = receipt;
    }
  }
  return controlledReceipt;
}

/**
 * Player-facing confidence summary for the dashboard — descriptive only.
 */
export function getOwnerConfidenceSummary(team) {
  const owner = team?.owner;
  if (!owner) return null;
  const patience = clampNumber(Number(owner.patience ?? 0.55), PATIENCE_FLOOR, PATIENCE_CEILING);
  const latest = Array.isArray(owner.confidenceLog) ? owner.confidenceLog[0] || null : null;
  return {
    patience: round4(patience),
    percent: Math.round(patience * 100),
    band: patience <= 0.2 ? "critical" : patience <= 0.35 ? "strained" : patience <= 0.6 ? "steady" : "secure",
    latest
  };
}
