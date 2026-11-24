// Frame Matters (S133). A player's body (height, weight, wingspan, arm length,
// hand size) changes what happens on the field.
//
// Every effect is relative to the player's position, measured against the
// league as it is *now*: the centres are recomputed from the active players
// each time they are asked for, never stored and never a constant. A league
// whose bodies drift (body programmes, imported rosters) moves its own
// centres with it, so no frame can become a subsidy by standing still while
// the league moves (see the project's "stale centre" lessons).
//
// Effects are small and bounded. A frame edge is worth at most a few rating
// points on one matchup, so ratings still decide most plays and the frame
// decides some of the close ones. All functions are pure; none draws a random
// number, so adding them changes outcomes but never the length of a game's
// random stream.

const SIZE_POSITIONS = Object.freeze(["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"]);
const Z_LIMIT = 2.5;

function finite(value, fallback = null) {
  // null and "" are missing measurements, not zero (Number(null) === 0).
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }

/** The measurements a frame reads, with honest fallbacks for older saves. */
export function frameMeasures(player = {}) {
  const height = finite(player.heightInches);
  const weight = finite(player.weightLbs);
  const m = player.measurements || {};
  const wingspan = finite(m.wingspanInches, height == null ? null : height + 2.5);
  const arm = finite(m.armLengthInches, wingspan == null || height == null ? null : (wingspan - height * 0.218) / 2);
  const hand = finite(m.handSizeInches, height == null ? null : height * 0.127);
  return { height, weight, wingspan, arm, hand };
}

function stats(values) {
  const list = values.filter((v) => Number.isFinite(v));
  if (list.length < 3) return null;
  const mean = list.reduce((sum, v) => sum + v, 0) / list.length;
  const variance = list.reduce((sum, v) => sum + (v - mean) ** 2, 0) / list.length;
  return { mean, sd: Math.max(Math.sqrt(variance), 0.5), n: list.length };
}

/**
 * Position centres and spreads for every measure, from the players given
 * (normally `league.players`, active only). Cheap: one pass per position.
 */
export function buildFrameNorms(players = []) {
  const byPosition = new Map(SIZE_POSITIONS.map((position) => [position, []]));
  for (const player of players) {
    if (!player || player.status === "retired") continue;
    byPosition.get(player.position)?.push(frameMeasures(player));
  }
  const norms = {};
  for (const [position, rows] of byPosition) {
    norms[position] = {
      height: stats(rows.map((r) => r.height)),
      weight: stats(rows.map((r) => r.weight)),
      wingspan: stats(rows.map((r) => r.wingspan)),
      arm: stats(rows.map((r) => r.arm)),
      hand: stats(rows.map((r) => r.hand))
    };
  }
  return norms;
}

function z(value, stat) {
  if (value == null || !stat) return 0;
  return clamp((value - stat.mean) / stat.sd, -Z_LIMIT, Z_LIMIT);
}

/** Where this body sits against its position: z-scores, 0 = league centre. */
export function frameScores(player, norms) {
  const n = norms?.[player?.position];
  if (!n) return { height: 0, weight: 0, reach: 0, hand: 0 };
  const m = frameMeasures(player);
  const reach = (z(m.wingspan, n.wingspan) + z(m.arm, n.arm)) / 2;
  return { height: z(m.height, n.height), weight: z(m.weight, n.weight), reach, hand: z(m.hand, n.hand) };
}

// Rating-point edges, per role. Each is a weighted sum of z-scores, then
// capped, so a two-standard-deviation body is worth roughly 2-4 points.
const EDGE_CAP = 4;
const ROLE_WEIGHTS = Object.freeze({
  // Long arms keep a rusher off the body; mass anchors.
  passBlock: { reach: 1.4, weight: 0.9 },
  // Mass moves people; very tall linemen lose leverage on the ground.
  runBlock: { weight: 1.5, height: -0.4, reach: 0.4 },
  // Long arms win the first contact; bend favours a lower frame.
  passRush: { reach: 1.5, weight: 0.5, height: 0.2 },
  // Holding the point of attack is mass.
  runDefense: { weight: 1.3, reach: 0.5 },
  // Length closes windows and contests at the catch point.
  coverage: { height: 0.8, reach: 1.2 },
  // A big catch radius wins the contested ball.
  catchRadius: { height: 1.1, reach: 1.1, hand: 0.4 },
  // Mass behind the pads breaks arm tackles.
  breakTackle: { weight: 1.4, height: -0.2 },
  // Wrap-up range and the weight to finish.
  tackling: { reach: 0.8, weight: 0.8 },
  // A taller passer sees and throws over the line.
  passerSight: { height: 1.2 }
});

/** Rating points this body adds (or costs) in one role. Pure and bounded. */
export function frameEdge(player, role, norms) {
  const weights = ROLE_WEIGHTS[role];
  if (!weights || !player) return 0;
  const s = frameScores(player, norms);
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) total += (s[key] || 0) * weight;
  return clamp(total, -EDGE_CAP, EDGE_CAP);
}

/** Usage-weighted frame edge across a rotation ({ player, usageWeight }). */
export function rotationFrameEdge(rotation = [], role, norms) {
  let weighted = 0, weight = 0;
  for (const row of rotation) {
    const w = Number(row?.usageWeight ?? row?.snapShare ?? 1) || 0;
    if (!row?.player || w <= 0) continue;
    weighted += frameEdge(row.player, role, norms) * w;
    weight += w;
  }
  return weight > 0 ? weighted / weight : 0;
}

/**
 * How much a ball carrier's hands change his fumble chance: a multiplier,
 * bigger hands below 1. Bounded to +/-15%.
 */
export function ballSecurityFactor(player, norms) {
  const { hand } = frameScores(player, norms);
  return clamp(1 - hand * 0.07, 0.85, 1.15);
}

/**
 * Injury risk from the body. Two documented football patterns:
 * - soft tissue: a heavy player for his position who also runs fast carries
 *   more force through his hamstrings and knees;
 * - contact: a light player for his position absorbs more on every collision.
 * A multiplier in 0.9-1.2; an average body is exactly 1.
 */
export function frameInjuryFactor(player, norms) {
  const s = frameScores(player, norms);
  const speed = finite(player?.ratings?.speed, 70);
  const heavyAndFast = Math.max(0, s.weight) * Math.max(0, (speed - 75) / 15);
  const light = Math.max(0, -s.weight - 0.5);
  return clamp(1 + heavyAndFast * 0.06 + light * 0.07 - Math.max(0, s.weight - 0.5) * Math.max(0, (70 - speed) / 20) * 0.02, 0.9, 1.2);
}

/**
 * Aging by frame: a heavy body loses a step before it loses strength. For a
 * player 28 or older who is heavy for his position (z >= 1) and whose ratings
 * fell this offseason (delta < 0), one point of the fall moves from strength
 * to speed. Zero-sum per player, no random number. Returns whether it applied.
 */
export function applyFrameAging(player, norms, delta) {
  if (!(Number(delta) < 0) || !(Number(player?.age) >= 28) || !player?.ratings) return false;
  const speed = Number(player.ratings.speed), strength = Number(player.ratings.strength);
  if (!Number.isFinite(speed) || !Number.isFinite(strength) || speed <= 40 || strength >= 99) return false;
  if (frameScores(player, norms).weight < 1) return false;
  player.ratings.speed = speed - 1;
  player.ratings.strength = strength + 1;
  return true;
}

// ── Scouting measurables a fan knows ────────────────────────────────────────

/** Speed Score (Bill Barnwell's): weight * 200 / forty^4. ~100 is average for a back. */
export function speedScore(player) {
  const weight = finite(player?.weightLbs);
  const forty = finite(player?.workout?.forty ?? player?.combine?.forty ?? player?.measurables?.forty);
  if (weight == null || forty == null || forty <= 0) return null;
  return Math.round((weight * 200) / forty ** 4);
}

/** Catch radius in inches: standing reach plus a jump, the ball a receiver can get to. */
export function catchRadiusInches(player) {
  const m = frameMeasures(player);
  if (m.height == null) return null;
  const vertical = finite(player?.workout?.vertical, 32);
  const standingReach = m.height * 0.665 + (m.wingspan ?? m.height + 2.5) * 0.66;
  return Math.round(standingReach + vertical);
}

const ARCHETYPES = Object.freeze([
  { key: "long", label: "Long", test: (s) => s.reach >= 1 && s.reach - s.weight >= 0.5 },
  { key: "power", label: "Power", test: (s) => s.weight >= 1 && s.height <= 0.5 },
  { key: "tower", label: "Tower", test: (s) => s.height >= 1.2 },
  { key: "compact", label: "Compact", test: (s) => s.height <= -1 && s.weight >= -0.5 },
  { key: "lean", label: "Lean", test: (s) => s.weight <= -1 },
  { key: "thick", label: "Thick", test: (s) => s.weight >= 1 }
]);

/** A one-word body type a scout would use, relative to the position. */
export function frameArchetype(player, norms) {
  const s = frameScores(player, norms);
  return ARCHETYPES.find((a) => a.test(s)) || { key: "prototype", label: "Prototype" };
}

/**
 * Relative Athletic Score, 0-10 (Kent Lee Platte's idea): each measurable as a
 * percentile against the position, averaged. Uses size from the frame norms
 * and workouts against the workout spread of the same position.
 */
export function relativeAthleticScore(player, norms, workoutNorms = null) {
  const s = frameScores(player, norms);
  const pct = (zScore) => 0.5 * (1 + erf(zScore / Math.SQRT2));
  const parts = [pct(s.height), pct(s.weight), pct(s.reach)];
  const w = player?.workout;
  const wn = workoutNorms?.[player?.position];
  if (w && wn) {
    // Lower is better for timed drills.
    for (const [key, lowerBetter] of [["forty", true], ["vertical", false], ["broad", false], ["shuttle", true], ["cone", true], ["bench", false]]) {
      const value = finite(w[key]);
      const stat = wn[key];
      if (value == null || !stat) continue;
      const zs = clamp((value - stat.mean) / stat.sd, -Z_LIMIT, Z_LIMIT);
      parts.push(pct(lowerBetter ? -zs : zs));
    }
  }
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) / 10;
}

/** Workout centres per position, from the players given. */
export function buildWorkoutNorms(players = []) {
  const keys = ["forty", "vertical", "broad", "shuttle", "cone", "bench"];
  const byPosition = new Map();
  for (const player of players) {
    if (!player?.workout || !SIZE_POSITIONS.includes(player.position)) continue;
    if (!byPosition.has(player.position)) byPosition.set(player.position, []);
    byPosition.get(player.position).push(player.workout);
  }
  const norms = {};
  for (const [position, rows] of byPosition) {
    norms[position] = Object.fromEntries(keys.map((key) => [key, stats(rows.map((r) => finite(r[key])))]));
  }
  return norms;
}

// Abramowitz-Stegun 7.1.26, plenty for a percentile.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

/** Everything a player card shows about the body, in one call. */
export function physicalCard(player, norms, workoutNorms = null) {
  const archetype = frameArchetype(player, norms);
  return {
    archetype: archetype.label,
    archetypeKey: archetype.key,
    ras: relativeAthleticScore(player, norms, workoutNorms),
    speedScore: speedScore(player),
    catchRadiusInches: catchRadiusInches(player),
    scores: frameScores(player, norms)
  };
}
