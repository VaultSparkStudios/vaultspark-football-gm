// The single source for how a player's ratings are grouped and summarised.
//
// Four position-relative category scores and a short list of the abilities a
// player is best at. Every screen that summarises a player (depth chart,
// roster, profile) reads this module instead of declaring its own grouping.
//
// Scores are derived from stored ratings on demand. Nothing here is saved, so
// old saves gain the scores automatically and the save payload does not grow.
import { PLAYER_ATTRIBUTE_KEYS } from "../config.js";
import { coverageDepthRating, positionRatingWeights, quarterbackDepthAccuracy } from "./ratings.js";

export const ATTRIBUTE_CATEGORIES = Object.freeze([
  Object.freeze({ id: "athleticism", label: "Athleticism", short: "ATH" }),
  Object.freeze({ id: "technique", label: "Technique", short: "TEC" }),
  Object.freeze({ id: "footballIq", label: "Football IQ", short: "IQ" }),
  Object.freeze({ id: "instincts", label: "Instincts", short: "INS" })
]);

// Reading the play and reacting to it, as opposed to trained technique.
const INSTINCT_KEYS = Object.freeze([
  "playRecognition",
  "throwOnRun",
  "elusiveness",
  "spectacularCatch",
  "pursuit",
  "zoneCoverage"
]);
const IQ_KEYS = Object.freeze(["awareness", "discipline"]);

const ABILITY_LABELS = Object.freeze({
  speed: "Speed",
  strength: "Strength",
  agility: "Agility",
  acceleration: "Burst",
  jumping: "Leaping",
  throwPower: "Arm Strength",
  throwAccuracy: "Accuracy",
  throwAccuracyShort: "Short Accuracy",
  throwAccuracyMedium: "Intermediate Accuracy",
  throwAccuracyDeep: "Deep Ball",
  throwOnRun: "Throw on the Run",
  catching: "Hands",
  carrying: "Ball Security",
  breakTackle: "Break Tackle",
  trucking: "Power Running",
  elusiveness: "Elusiveness",
  routeRunning: "Route Running",
  release: "Release",
  spectacularCatch: "Contested Catch",
  passBlocking: "Pass Protection",
  runBlocking: "Run Blocking",
  tackle: "Tackling",
  coverage: "Coverage",
  coverageShort: "Underneath Coverage",
  coverageMedium: "Intermediate Coverage",
  coverageDeep: "Deep Coverage",
  passRush: "Pass Rush",
  blockShedding: "Block Shedding",
  pursuit: "Pursuit",
  hitPower: "Hit Power",
  manCoverage: "Man Coverage",
  zoneCoverage: "Zone Coverage",
  awareness: "Awareness",
  playRecognition: "Play Recognition",
  discipline: "Discipline"
});

// Kickers and punters are graded on the same stored keys as everyone else;
// only the football name differs.
const SPECIALIST_LABELS = Object.freeze({
  throwPower: "Leg Strength",
  agility: "Footwork",
  awareness: "Composure",
  playRecognition: "Situational Kicking",
  discipline: "Consistency"
});

const DEPTH_BUCKETS = Object.freeze({
  throwAccuracyShort: ["qb", "short"],
  throwAccuracyMedium: ["qb", "medium"],
  throwAccuracyDeep: ["qb", "deep"],
  coverageShort: ["coverage", "short"],
  coverageMedium: ["coverage", "medium"],
  coverageDeep: ["coverage", "deep"]
});

export function attributeCategoryOf(key) {
  if (INSTINCT_KEYS.includes(key)) return "instincts";
  if (IQ_KEYS.includes(key)) return "footballIq";
  if (PLAYER_ATTRIBUTE_KEYS.physical.includes(key)) return "athleticism";
  return "technique";
}

export function abilityLabel(key, position = null) {
  if ((position === "K" || position === "P") && SPECIALIST_LABELS[key]) return SPECIALIST_LABELS[key];
  return ABILITY_LABELS[key] || key;
}

function readRating(ratings, key) {
  const stored = Number(ratings?.[key]);
  if (Number.isFinite(stored)) return stored;
  const bucket = DEPTH_BUCKETS[key];
  if (!bucket) return null;
  const derived = bucket[0] === "qb" ? quarterbackDepthAccuracy(ratings, bucket[1]) : coverageDepthRating(ratings, bucket[1]);
  return Number.isFinite(Number(derived)) ? Number(derived) : null;
}

function weightedScore(ratings, weightedKeys) {
  let total = 0;
  let weight = 0;
  for (const [key, keyWeight] of weightedKeys) {
    const value = readRating(ratings, key);
    if (value == null) continue;
    total += value * keyWeight;
    weight += keyWeight;
  }
  return weight > 0 ? Math.round(total / weight) : null;
}

// Keys a category falls back to when a position's overall formula uses none of
// that category's ratings (an offensive lineman has no instinct key beyond
// play recognition, a kicker no strength key).
const CATEGORY_FALLBACK_KEYS = Object.freeze({
  athleticism: PLAYER_ATTRIBUTE_KEYS.physical,
  technique: [],
  footballIq: IQ_KEYS,
  instincts: ["playRecognition"]
});

/**
 * Position-relative category scores, 0-99, or null when the player carries no
 * rating in that category. Each score weights the ratings the position's
 * overall formula actually uses, so "Technique 88" means the same thing as the
 * overall rating does: good at what this position asks for.
 */
export function playerCategoryScores(position, ratings) {
  const weights = Object.entries(positionRatingWeights(position) || {});
  const scores = {};
  for (const { id } of ATTRIBUTE_CATEGORIES) {
    const own = weights.filter(([key]) => attributeCategoryOf(key) === id);
    const keys = own.length ? own : CATEGORY_FALLBACK_KEYS[id].map((key) => [key, 1]);
    scores[id] = weightedScore(ratings, keys);
  }
  return scores;
}

/**
 * The abilities this player is best at among those his position uses, highest
 * first. Ties break on the position's own weighting, then on key name, so the
 * list is stable for a given player.
 */
export function playerTopAbilities(position, ratings, limit = 3) {
  const weights = positionRatingWeights(position) || {};
  return Object.entries(weights)
    .map(([key, weight]) => ({ key, weight, value: readRating(ratings, key) }))
    .filter((row) => row.value != null)
    .sort((a, b) => b.value - a.value || b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, limit))
    .map((row) => ({ key: row.key, label: abilityLabel(row.key, position), value: row.value, category: attributeCategoryOf(row.key) }));
}

/** Ratings grouped by category for display, position-relevant keys first. */
export function groupRatingsByCategory(position, ratings) {
  const weights = positionRatingWeights(position) || {};
  const keys = new Set([...Object.keys(weights), ...Object.keys(ratings || {})]);
  const groups = Object.fromEntries(ATTRIBUTE_CATEGORIES.map(({ id }) => [id, []]));
  for (const key of keys) {
    const value = readRating(ratings, key);
    if (value == null || !ABILITY_LABELS[key]) continue;
    groups[attributeCategoryOf(key)].push({ key, label: abilityLabel(key, position), value, weight: weights[key] || 0 });
  }
  for (const rows of Object.values(groups)) {
    rows.sort((a, b) => b.weight - a.weight || b.value - a.value || a.key.localeCompare(b.key));
  }
  return groups;
}

/** One compact summary object, the shape every player list attaches. */
export function playerAttributeSummary(position, ratings) {
  return {
    categories: playerCategoryScores(position, ratings),
    topAbilities: playerTopAbilities(position, ratings)
  };
}
