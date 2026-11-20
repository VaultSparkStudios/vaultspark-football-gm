/**
 * The weekly challenge's goal, score and shared board, as pure functions.
 *
 * The browser uses these to pick the week's goal, score a finished first
 * season and build the share text. The community service imports the same file
 * (src/community/challengeContract.js) and re-applies it on arrival, so a
 * score the browser could not have produced for that week's goal is refused,
 * and the board both sides read is built one way.
 *
 * What a browser may send for the board is exactly { week, objective, score }.
 */
import { fnv1a } from "./challengeCodes.js";
import { isoWeek, weeklyChallengeForLeague, weeklySeed } from "./weeklyChallenge.js";
import { COMMUNITY_SUPPRESSION_THRESHOLD } from "./communityEventContract.js";

export const CHALLENGE_SCORE_SCHEMA_VERSION = "1.0";
export const CHALLENGE_SEASON_GAMES = 17;
export const CHALLENGE_WEEKS_OPEN = 5; // this week and the four before it
export const CHALLENGE_BOARD_MIN_GMS = COMMUNITY_SUPPRESSION_THRESHOLD;
const WEEK_KEY_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
const DAY_MS = 86_400_000;
const BLOCKS = 5;

/**
 * Every goal is "higher is better" and scored as a whole number inside
 * [min, max]. `par` is the range the five share blocks are drawn over and
 * `bucket` is the starting width of a board bucket.
 */
export const CHALLENGE_OBJECTIVES = Object.freeze([
  Object.freeze({ id: "most-wins", goal: "Win the most games with this club in one season.", min: 0, max: CHALLENGE_SEASON_GAMES * 2, par: Object.freeze([8, 28]), bucket: 2 }),
  Object.freeze({ id: "cap-room", goal: "Finish the season with a winning record and the most cap space left.", min: 0, max: 3000, par: Object.freeze([0, 600]), bucket: 50 }),
  Object.freeze({ id: "point-margin", goal: "Finish the season with the best point differential.", min: -700, max: 700, par: Object.freeze([-150, 200]), bucket: 25 }),
  Object.freeze({ id: "most-points", goal: "Score the most points in one season.", min: 0, max: 1100, par: Object.freeze([250, 550]), bucket: 25 })
]);

export function challengeObjective(id) {
  return CHALLENGE_OBJECTIVES.find((objective) => objective.id === id) || null;
}

export function isChallengeWeekKey(value) {
  return typeof value === "string" && WEEK_KEY_RE.test(value);
}

/** The goal for a week such as "2026-W47", chosen from that week's league seed. */
export function weeklyObjective(weekKey) {
  if (!isChallengeWeekKey(weekKey)) return null;
  return CHALLENGE_OBJECTIVES[fnv1a(`vsfa-weekly-objective:${weeklySeed(weekKey)}`) % CHALLENGE_OBJECTIVES.length];
}

function count(value) {
  const number = Number(value);
  return value != null && value !== "" && Number.isInteger(number) && number >= 0 ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Score one finished season for a goal. `result` is the club's regular-season
 * record, points and cap space: { wins, losses, ties, pointsFor, pointsAgainst,
 * capSpace }. Returns a whole number inside the goal's range, or null when the
 * result is missing something the goal needs or could not have happened.
 *
 *   most-wins     2 per win + 1 per tie                         0..34
 *   cap-room      cap space in $100,000 steps, 0 without a
 *                 winning record or when over the cap           0..3000
 *   point-margin  points scored minus points allowed         -700..700
 *   most-points   points scored                                 0..1100
 */
export function scoreWeeklyChallenge(objectiveId, result) {
  const objective = challengeObjective(objectiveId);
  if (!objective || !result || typeof result !== "object") return null;
  const wins = count(result.wins);
  const losses = count(result.losses);
  const ties = count(result.ties ?? 0);
  if (wins == null || losses == null || ties == null) return null;
  const games = wins + losses + ties;
  if (games < 1 || games > CHALLENGE_SEASON_GAMES) return null;
  let raw;
  if (objective.id === "most-wins") raw = wins * 2 + ties;
  else if (objective.id === "cap-room") {
    const capSpace = Number(result.capSpace);
    if (result.capSpace == null || !Number.isFinite(capSpace)) return null;
    raw = wins > losses ? Math.floor(capSpace / 100_000) : 0;
  } else {
    const pointsFor = count(result.pointsFor);
    const pointsAgainst = count(result.pointsAgainst);
    if (pointsFor == null || pointsAgainst == null) return null;
    raw = objective.id === "point-margin" ? pointsFor - pointsAgainst : pointsFor;
  }
  return clamp(raw, objective.min, objective.max);
}

/**
 * Where a league in play stands in its weekly challenge. `league` is what the
 * game reports about itself: { seed, startYear, controlledTeamId, currentYear,
 * firstSeason }, where `firstSeason` is the club's finished first season or
 * null. Returns null when the league is not an open weekly challenge, else
 * { week, objective, state, score } with state one of:
 *   "other-setup"  a weekly league, but not with the challenge's club and year
 *   "playing"      the first season is still being played
 *   "unscored"     the first season ended without what the goal needs
 *   "scored"       `score` is final
 */
export function weeklyChallengeStanding(league, teamIds = [], now = Date.now()) {
  const week = weeklyChallengeForLeague(league, teamIds, new Date(now instanceof Date ? now.getTime() : Number(now)));
  const objective = week ? weeklyObjective(week.key) : null;
  if (!objective) return null;
  const standing = { week: { year: week.year, week: week.week, key: week.key }, objective, state: "other-setup", score: null };
  if (!week.asSetUp) return standing;
  const season = league.firstSeason;
  if (!season) return { ...standing, state: Number(league.currentYear) > Number(league.startYear) ? "unscored" : "playing" };
  const score = String(season.teamId || "").toUpperCase() === week.teamId ? scoreWeeklyChallenge(objective.id, season) : null;
  return score == null ? { ...standing, state: "unscored" } : { ...standing, state: "scored", score };
}

/** A score in words, for the panel and the share text. */
export function formatChallengeScore(objectiveId, score) {
  const value = Number(score);
  if (!challengeObjective(objectiveId) || !Number.isFinite(value)) return "";
  if (objectiveId === "most-wins") return `${value / 2} ${value === 2 ? "win" : "wins"}`;
  if (objectiveId === "cap-room") return `$${(value / 10).toFixed(1)}M in cap space`;
  if (objectiveId === "point-margin") return `${value > 0 ? "+" : ""}${value} point differential`;
  return `${value} points scored`;
}

/** Five blocks: how far the score sits through the goal's usual range. */
export function challengeScoreBlocks(objectiveId, score) {
  const objective = challengeObjective(objectiveId);
  const value = Number(score);
  if (!objective || !Number.isFinite(value)) return "";
  const [low, high] = objective.par;
  const filled = clamp(Math.round(((value - low) / (high - low)) * BLOCKS), 0, BLOCKS);
  return "\u{1F7E9}".repeat(filled) + "⬜".repeat(BLOCKS - filled);
}

/** The weeks a score may still be posted for: this one and the four before it. */
export function openChallengeWeeks(now = Date.now()) {
  const time = now instanceof Date ? now.getTime() : Number(now);
  const keys = [];
  // One day ahead as well, so a browser whose clock runs fast is not refused.
  for (const offset of [1, 0, -7, -14, -21, -28]) {
    const key = isoWeek(time + offset * DAY_MS)?.key;
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * The storable board entry, or null. The goal must be the one that week's seed
 * picks and the score must be a whole number that goal can produce. Anything
 * else on the input is dropped.
 */
export function normalizeChallengeScore(input, { now = Date.now() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const week = input.week;
  if (!isChallengeWeekKey(week) || !openChallengeWeeks(now).includes(week)) return null;
  const objective = weeklyObjective(week);
  if (!objective || input.objective !== objective.id) return null;
  if (typeof input.score !== "number" || !Number.isInteger(input.score)) return null;
  if (input.score < objective.min || input.score > objective.max) return null;
  return { week, objective: objective.id, score: input.score };
}

/**
 * The shared board for one week, from every browser's best score. Nothing about
 * the scores is returned until five browsers are counted. Buckets are widened
 * until each one counts at least five browsers too, and no single score is
 * ever published. The board is the same for every caller.
 */
export function summarizeChallengeBoard(weekKey, scores) {
  const objective = weeklyObjective(weekKey);
  if (!objective) return null;
  const base = { schemaVersion: CHALLENGE_SCORE_SCHEMA_VERSION, week: weekKey, objective: objective.id };
  const sorted = (Array.isArray(scores) ? scores : [])
    .filter((score) => typeof score === "number" && Number.isInteger(score) && score >= objective.min && score <= objective.max)
    .sort((a, b) => a - b);
  const gms = sorted.length;
  if (gms < CHALLENGE_BOARD_MIN_GMS) return { ...base, status: "not-enough-scores" };

  const cells = new Map();
  for (const score of sorted) {
    const index = Math.floor((score - objective.min) / objective.bucket);
    cells.set(index, (cells.get(index) || 0) + 1);
  }
  const buckets = [];
  let open = null;
  for (const [index, cellCount] of [...cells].sort((a, b) => a[0] - b[0])) {
    const max = Math.min(objective.max, objective.min + (index + 1) * objective.bucket - 1);
    open = { max, count: (open?.count || 0) + cellCount };
    if (open.count >= CHALLENGE_BOARD_MIN_GMS) { buckets.push(open); open = null; }
  }
  if (open) buckets[buckets.length - 1].count += open.count;
  // Buckets cover the whole range with no gaps, so an edge is never one browser's score.
  buckets.forEach((bucket, index) => {
    bucket.min = index === 0 ? objective.min : buckets[index - 1].max + 1;
    if (index === buckets.length - 1) bucket.max = objective.max;
  });

  // No median or top-tenth cut is published: an order statistic is one
  // browser's exact score, and scores that only move up would let a few
  // throwaway entries walk it across every real one.
  return { ...base, status: "live", gms, buckets: buckets.map(({ min, max, count: gmsInBucket }) => ({ min, max, count: gmsInBucket })) };
}

/**
 * The share of GMs a score beat, as a whole percent from 0 to 99, read off the
 * board's buckets. Null when the board has no figures yet.
 */
export function challengePercentile(board, score) {
  const value = Number(score);
  if (board?.status !== "live" || !Array.isArray(board.buckets) || !(board.gms > 0) || !Number.isFinite(value)) return null;
  let beaten = 0;
  for (const bucket of board.buckets) {
    if (bucket.max < value) beaten += bucket.count;
    else if (bucket.min <= value) beaten += bucket.count * ((value - bucket.min) / (bucket.max - bucket.min + 1));
  }
  return clamp(Math.floor((beaten / board.gms) * 100), 0, 99);
}

/**
 * The text a player shares: the week, the goal, the score, five blocks and the
 * link to the same league. It never carries a player, club or league name.
 */
export function buildChallengeShareText({ week, objectiveId, score, link = "", percentile = null } = {}) {
  const objective = challengeObjective(objectiveId);
  if (!objective || !Number.isFinite(Number(score))) return "";
  const weekNumber = Number(String(week || "").split("-W")[1]);
  const lines = [
    `Franchise Architect: Football — Week ${Number.isFinite(weekNumber) ? weekNumber : "?"} Challenge`,
    `Goal: ${objective.goal}`,
    `My score: ${formatChallengeScore(objective.id, score)}`,
    challengeScoreBlocks(objective.id, score)
  ];
  if (Number.isInteger(percentile)) lines.push(`Beat ${percentile}% of GMs`);
  if (link) lines.push(`Same league, same club: ${link}`);
  return lines.join("\n");
}
