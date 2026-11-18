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

import { DIFFICULTY_PRESETS } from "../config/leagueSetup.js";

const WEEKLY_DELTA_CAP = 0.03;
const PATIENCE_FLOOR = 0.05;
const PATIENCE_CEILING = 0.95;
const LOG_LIMIT = 24;
const LINE_EPSILON = 1e-9;

const clampNumber = (value, low, high) => Math.min(high, Math.max(low, value));

function round4(value) {
  return Number(value.toFixed(4));
}

export const OWNER_PATIENCE_FLOOR = PATIENCE_FLOOR;

/**
 * Challenge modes that switch career stakes off. Empty on purpose: "open" is
 * the default challenge selection of every league (its label is "Open
 * Sandbox", but it only means "no extra restrictions"), so exempting it would
 * switch firing off for nearly every franchise. The ruleset decides instead.
 * Add an id here to exempt a challenge mode.
 */
export const CAREER_STAKES_EXEMPT_CHALLENGES = Object.freeze([]);

/**
 * What a general manager stands to lose in this league — resolved from the
 * league's own rules in exactly one place, and read by the season review, the
 * command boundary and the dashboard alike.
 *
 * - Sandbox rules (and a live commissioner lobby): no firing, free choice of
 *   club at any time.
 * - Relaxed difficulty: the owner never fires; he delivers a stern warning.
 * - Standard: the owner acts once patience has run out (the patience floor).
 * - Hard / Brutal: the owner acts sooner. The line moves up by exactly as much
 *   as that difficulty already shortens the owner's starting patience, so no
 *   new tuning number is introduced.
 */
export function resolveCareerStakes(settings = {}, { commissionerLobby = false } = {}) {
  const sandbox =
    settings?.rulesPreset === "sandbox" ||
    commissionerLobby === true ||
    CAREER_STAKES_EXEMPT_CHALLENGES.includes(settings?.challengeMode);
  const difficulty = Object.hasOwn(DIFFICULTY_PRESETS, settings?.difficultyPreset) ? settings.difficultyPreset : "standard";
  const shift = DIFFICULTY_PRESETS.standard.patch.ownerPatience - DIFFICULTY_PRESETS[difficulty].patch.ownerPatience;
  const line = round4(PATIENCE_FLOOR + shift);
  const ownerMode = settings?.enableOwnerMode !== false;
  const lineReachable = line >= PATIENCE_FLOOR - LINE_EPSILON;
  const firing = !sandbox && ownerMode && lineReachable;
  return {
    firing,
    // Relaxed: the same grounds are judged against the floor, but the owner only warns.
    sternWarningOnly: !sandbox && ownerMode && !lineReachable,
    freeTeamSwitch: sandbox,
    dismissalLine: lineReachable ? clampNumber(line, PATIENCE_FLOOR, PATIENCE_CEILING) : PATIENCE_FLOOR,
    difficulty
  };
}

export function patienceAtDismissalLine(patience, stakes) {
  // Only a real number can be "at the line". `Number(null)` is 0 — a missing
  // patience must never read as patience that has run out.
  if (typeof patience !== "number" || !Number.isFinite(patience)) return false;
  const line = typeof stakes?.dismissalLine === "number" && Number.isFinite(stakes.dismissalLine)
    ? stakes.dismissalLine
    : PATIENCE_FLOOR;
  return patience <= line + LINE_EPSILON;
}

/**
 * The owner's verdict at the season review. Pure; exported for direct testing.
 *
 * Grounds for a change: patience is at the dismissal line AND either this
 * season's ultimatum was failed, or patience already sat at the line through
 * the previous season review and the win target was missed again.
 *
 * A dismissal additionally requires all of: firing is on under these rules, the
 * general manager has completed more than one season at this club, and at
 * least one warning was put in front of them beforehand. Anything short of
 * that is a warning, never a surprise.
 *
 * @returns {{ action: "none"|"warning"|"final-warning"|"dismiss", reason: string|null, atLine: boolean }}
 */
export function decideOwnerVerdict({
  stakes,
  patience,
  tenureSeasons = 0,
  ultimatumFailed = false,
  targetMissed = false,
  warned = false,
  flooredAtLastReview = false
} = {}) {
  const active = stakes?.firing === true || stakes?.sternWarningOnly === true;
  const atLine = active && patienceAtDismissalLine(patience, stakes);
  if (!active || !atLine) return { action: "none", reason: null, atLine: false };
  const reason = ultimatumFailed === true
    ? "ultimatum-failed"
    : flooredAtLastReview === true && targetMissed === true
      ? "patience-exhausted"
      : null;
  if (!reason) {
    // First review spent at the line with the target missed: say so out loud.
    return { action: targetMissed === true ? "final-warning" : "none", reason: targetMissed === true ? "patience-at-floor" : null, atLine };
  }
  if (stakes.firing !== true) return { action: "warning", reason, atLine };
  if (!(Number(tenureSeasons) > 1)) return { action: "final-warning", reason, atLine };
  if (warned !== true) return { action: "final-warning", reason, atLine };
  return { action: "dismiss", reason, atLine };
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
