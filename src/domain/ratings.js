import { TEAM_RATING_WEIGHTS } from "../config.js";
import { clamp, mean } from "../utils/rng.js";

const POSITION_FORMULAS = {
  QB: {
    throwPower: 0.2,
    throwAccuracyShort: 0.18,
    throwAccuracyMedium: 0.16,
    throwAccuracyDeep: 0.12,
    throwOnRun: 0.09,
    awareness: 0.1,
    playRecognition: 0.09,
    discipline: 0.03,
    speed: 0.02,
    agility: 0.01
  },
  RB: {
    speed: 0.16,
    acceleration: 0.13,
    agility: 0.12,
    elusiveness: 0.14,
    breakTackle: 0.12,
    carrying: 0.08,
    strength: 0.07,
    awareness: 0.1,
    catching: 0.12,
    discipline: 0.06,
    trucking: 0.1
  },
  WR: {
    speed: 0.16,
    acceleration: 0.14,
    agility: 0.11,
    catching: 0.19,
    routeRunning: 0.16,
    release: 0.1,
    spectacularCatch: 0.08,
    awareness: 0.09,
    playRecognition: 0.08,
    discipline: 0.06
  },
  TE: {
    speed: 0.1,
    strength: 0.14,
    agility: 0.1,
    catching: 0.17,
    routeRunning: 0.08,
    release: 0.05,
    spectacularCatch: 0.05,
    runBlocking: 0.14,
    passBlocking: 0.08,
    awareness: 0.1,
    discipline: 0.1
  },
  OL: {
    strength: 0.2,
    passBlocking: 0.28,
    runBlocking: 0.25,
    awareness: 0.11,
    playRecognition: 0.08,
    discipline: 0.08
  },
  DL: {
    strength: 0.2,
    speed: 0.08,
    acceleration: 0.11,
    tackle: 0.18,
    passRush: 0.16,
    blockShedding: 0.12,
    playRecognition: 0.15,
    discipline: 0.08,
    awareness: 0.1,
    pursuit: 0.08
  },
  LB: {
    speed: 0.11,
    strength: 0.11,
    acceleration: 0.09,
    tackle: 0.19,
    coverageShort: 0.1,
    coverageMedium: 0.08,
    coverageDeep: 0.04,
    pursuit: 0.12,
    hitPower: 0.09,
    blockShedding: 0.07,
    awareness: 0.1,
    playRecognition: 0.1
  },
  DB: {
    speed: 0.14,
    acceleration: 0.12,
    agility: 0.08,
    coverageShort: 0.08,
    coverageMedium: 0.12,
    coverageDeep: 0.16,
    manCoverage: 0.1,
    zoneCoverage: 0.1,
    tackle: 0.06,
    awareness: 0.08,
    playRecognition: 0.1
  },
  K: {
    awareness: 0.2,
    discipline: 0.15,
    throwPower: 0.3,
    playRecognition: 0.15,
    agility: 0.2
  },
  P: {
    awareness: 0.2,
    discipline: 0.15,
    throwPower: 0.28,
    playRecognition: 0.15,
    agility: 0.22
  }
};

function derivedQuarterbackDepthRatings(ratings = {}) {
  const base = Number(ratings.throwAccuracy ?? 60);
  const power = Number(ratings.throwPower ?? base);
  const awareness = Number(ratings.awareness ?? base);
  const onRun = Number(ratings.throwOnRun ?? base);
  return {
    throwAccuracyShort: clamp(Math.round(base * 0.72 + awareness * 0.22 + 6), 40, 99),
    throwAccuracyMedium: clamp(Math.round(base * 0.76 + power * 0.08 + awareness * 0.12 + 2), 40, 99),
    throwAccuracyDeep: clamp(Math.round(base * 0.58 + power * 0.24 + onRun * 0.1 + awareness * 0.08 - 3), 40, 99)
  };
}

function derivedCoverageDepthRatings(ratings = {}) {
  const base = Number(ratings.coverage ?? 60);
  const man = Number(ratings.manCoverage ?? base);
  const zone = Number(ratings.zoneCoverage ?? base);
  const speed = Number(ratings.speed ?? base);
  const acceleration = Number(ratings.acceleration ?? speed);
  const awareness = Number(ratings.awareness ?? base);
  const playRecognition = Number(ratings.playRecognition ?? base);
  const tackle = Number(ratings.tackle ?? base);
  const pursuit = Number(ratings.pursuit ?? tackle);
  return {
    coverageShort: clamp(
      Math.round(
        base * 0.4 +
          zone * 0.12 +
          man * 0.08 +
          awareness * 0.1 +
          playRecognition * 0.12 +
          tackle * 0.08 +
          pursuit * 0.1
      ),
      40,
      99
    ),
    coverageMedium: clamp(
      Math.round(
        base * 0.38 +
          zone * 0.12 +
          man * 0.1 +
          awareness * 0.1 +
          playRecognition * 0.14 +
          speed * 0.08 +
          acceleration * 0.08
      ),
      40,
      99
    ),
    coverageDeep: clamp(
      Math.round(
        base * 0.24 +
          zone * 0.16 +
          man * 0.12 +
          awareness * 0.08 +
          playRecognition * 0.12 +
          speed * 0.16 +
          acceleration * 0.12
      ),
      40,
      99
    )
  };
}

export function ensureQuarterbackDepthRatings(ratings = {}) {
  const derived = derivedQuarterbackDepthRatings(ratings);
  if (!Number.isFinite(Number(ratings.throwAccuracyShort))) ratings.throwAccuracyShort = derived.throwAccuracyShort;
  if (!Number.isFinite(Number(ratings.throwAccuracyMedium))) ratings.throwAccuracyMedium = derived.throwAccuracyMedium;
  if (!Number.isFinite(Number(ratings.throwAccuracyDeep))) ratings.throwAccuracyDeep = derived.throwAccuracyDeep;
  return ratings;
}

export function ensureCoverageDepthRatings(ratings = {}) {
  const derived = derivedCoverageDepthRatings(ratings);
  if (!Number.isFinite(Number(ratings.coverageShort))) ratings.coverageShort = derived.coverageShort;
  if (!Number.isFinite(Number(ratings.coverageMedium))) ratings.coverageMedium = derived.coverageMedium;
  if (!Number.isFinite(Number(ratings.coverageDeep))) ratings.coverageDeep = derived.coverageDeep;
  return ratings;
}

export function quarterbackDepthAccuracy(ratings = {}, bucket = "medium") {
  const ensured = ensureQuarterbackDepthRatings({ ...ratings });
  if (bucket === "short") return ensured.throwAccuracyShort;
  if (bucket === "deep") return ensured.throwAccuracyDeep;
  return ensured.throwAccuracyMedium;
}

export function coverageDepthRating(ratings = {}, bucket = "medium") {
  const ensured = ensureCoverageDepthRatings({ ...ratings });
  if (bucket === "short") return ensured.coverageShort;
  if (bucket === "deep") return ensured.coverageDeep;
  return ensured.coverageMedium;
}

/**
 * The rating keys that actually contribute to a position's overall, weightiest
 * first.
 *
 * S86 [audit #3] — progression previously applied its age/development delta to
 * at most four rating keys chosen mostly at random out of roughly thirty-two,
 * then recomputed overall from the full weighted formula. Only the weighted
 * share of those four keys reached overall, so the declared aging curve arrived
 * about five times weaker than specified (measured -0.46 OVR/yr against a
 * declared -2.25 for age 30+), and an aging quarterback's decline could land
 * entirely on tackling and kick power and cost him nothing. Exposing the
 * weighted keys lets progression move the attributes the position is actually
 * graded on, so the declared curve is what the player experiences.
 */
export function positionRatingKeys(position) {
  const formula = POSITION_FORMULAS[position];
  if (!formula) return [];
  return Object.entries(formula)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([key]) => key);
}

export function calculatePositionOverall(position, ratings) {
  const formula = POSITION_FORMULAS[position];
  if (!formula) return 60;
  const resolvedRatings = { ...(ratings || {}) };
  if (position === "QB") ensureQuarterbackDepthRatings(resolvedRatings);
  if (position === "LB" || position === "DB") ensureCoverageDepthRatings(resolvedRatings);
  const weightTotal = Math.max(
    0.0001,
    Object.values(formula).reduce((sum, weight) => sum + Number(weight || 0), 0)
  );
  const score =
    Object.entries(formula).reduce((total, [key, weight]) => {
      return total + (resolvedRatings[key] ?? 60) * weight;
    }, 0) / weightTotal;
  return Math.round(clamp(score, 40, 99));
}

export function calcTeamOffenseDefense(teamPlayers) {
  const byPosition = (position) =>
    teamPlayers
      .filter((p) => p.position === position && p.status === "active")
      .sort((a, b) => b.overall - a.overall);

  const qb = byPosition("QB")[0]?.overall ?? 60;
  const rb = byPosition("RB")[0]?.overall ?? 60;
  const ol = mean(byPosition("OL").slice(0, 5).map((p) => p.overall)) || 60;
  const wr = byPosition("WR").slice(0, 3).map((p) => p.overall);
  const te = byPosition("TE").slice(0, 1).map((p) => p.overall);
  const passCatchers = mean([...wr, ...te]) || 60;

  const dl = mean(byPosition("DL").slice(0, 4).map((p) => p.overall)) || 60;
  const lb = mean(byPosition("LB").slice(0, 3).map((p) => p.overall)) || 60;
  const db = mean(byPosition("DB").slice(0, 4).map((p) => p.overall)) || 60;

  const offenseRating = Math.round(
    qb * TEAM_RATING_WEIGHTS.offense.QB +
      ol * TEAM_RATING_WEIGHTS.offense.OL +
      passCatchers * TEAM_RATING_WEIGHTS.offense.PASS_CATCHERS +
      rb * TEAM_RATING_WEIGHTS.offense.RB
  );
  const defenseRating = Math.round(
    dl * TEAM_RATING_WEIGHTS.defense.DL +
      lb * TEAM_RATING_WEIGHTS.defense.LB +
      db * TEAM_RATING_WEIGHTS.defense.DB
  );

  // S63: the aggregate defense rating hides *where* a defense is soft, which is
  // exactly what an offense gameplans against. These split the same source
  // players the aggregate already uses, so the pre-game tactical brief can show
  // the player the read the drive engine now acts on.
  const runDefenseRating = Math.round(dl * 0.58 + lb * 0.42);
  const passDefenseRating = Math.round(db * 0.68 + lb * 0.32);

  return {
    offenseRating: clamp(offenseRating, 40, 99),
    defenseRating: clamp(defenseRating, 40, 99),
    runDefenseRating: clamp(runDefenseRating, 40, 99),
    passDefenseRating: clamp(passDefenseRating, 40, 99),
    overallRating: clamp(Math.round((offenseRating + defenseRating) / 2), 40, 99)
  };
}

/**
 * The potential a league-average player carries.
 *
 * `developmentDelta` asks "is this player better than average?", so it needs the
 * league's actual centre. The measured mean potential of a generated league is
 * 79.9; the reference had been left at 70, which turned a *differentiator* into
 * a **+0.50 bonus every player collected every offseason** regardless of talent.
 * Held here as a named constant so a drift between the generator and the
 * development curve is visible rather than silent.
 */
export const LEAGUE_AVERAGE_POTENTIAL = 80;

export const PLAYER_DEVELOPMENT_PROFILE = Object.freeze({
  version: "2026-s91-reverting",
  potentialCenter: LEAGUE_AVERAGE_POTENTIAL,
  varianceMin: -2.5,
  varianceMax: 2.5,
  ageFactors: Object.freeze({
    developing25AndUnder: 0.2,
    prime26To29: -0.55,
    veteran30Plus: -2.25
  })
});

/**
 * How much a player's ratings move over one offseason.
 *
 * S71 removed two constants that were quietly inflating the whole league by
 * roughly a full rating point a year, which a hundred-year franchise cannot
 * absorb — over ten simulated seasons the league's mean overall climbed
 * 77.5 → 81.8 and the number of 90-plus players went from 13 to 117:
 *
 *  - `rng.int(-2, 3)` — `RNG.int` is inclusive at both ends, so this "variance"
 *    averaged +0.5 rather than 0.
 *  - `(potential - 70)` — measured against a centre the league left behind, so
 *    every player cleared it. Now measured against the real centre.
 *
 * The draw is also continuous rather than a whole number. With an integer
 * variance, `Math.round` of the sum discards every fractional term: a prime-age
 * player's +0.4 and any trait edge under half a point rounded away to exactly
 * nothing, so the curve's resolution was decorative. Across a window that spans
 * a whole number of rating points the rounding is unbiased, which makes the
 * expected move precisely `ageFactor + traitFactor` — what the curve says.
 *
 * What remains is deliberate: young players still develop, thirty-somethings
 * still decline, and high-potential players still separate from the field.
 *
 * S90 — `environmentTilt` (the club's zero-centred development environment, see
 * `src/domain/developmentEnvironment.js`) is summed in *before* the single
 * rounding rather than rounded separately and added afterwards. Rounding is only
 * unbiased when something continuous and random is inside it; the tilt is
 * deterministic per player, so rounding it alone biased it in whichever
 * direction it happened to sit. Folded in here it rides the same unbiased
 * rounding as the rest of the curve. The RNG stream is untouched — `rng.float`
 * is still drawn exactly once per player, in the same order.
 */
export function developmentDelta(player, rng, { environmentTilt = 0, potentialReversion = 0 } = {}) {
  let ageFactor;
  if (player.age <= 25) ageFactor = PLAYER_DEVELOPMENT_PROFILE.ageFactors.developing25AndUnder;
  else if (player.age <= 29) ageFactor = PLAYER_DEVELOPMENT_PROFILE.ageFactors.prime26To29;
  else ageFactor = PLAYER_DEVELOPMENT_PROFILE.ageFactors.veteran30Plus;

  const traitFactor = (player.potential - LEAGUE_AVERAGE_POTENTIAL) / 20;
  // Never `Number(x || 0)` here: NaN is falsy, so that idiom launders a NaN into
  // a silent zero and the curve quietly stops applying. Validate, then use.
  const tilt = environmentTilt === undefined || environmentTilt === null ? 0 : Number(environmentTilt);
  if (!Number.isFinite(tilt)) {
    throw new TypeError(`developmentDelta: environmentTilt must be finite, received ${environmentTilt}`);
  }
  // S91 — the reversion term. `traitFactor` above is a *constant* for the life
  // of the player, which is what made this curve a random walk with no mean
  // reversion and no ceiling: the distribution's variance grew linearly and
  // forever, and selection truncated only its bottom. `potentialReversion` is
  // the league-centred pull back toward the player's own potential (see
  // `src/domain/potentialReversion.js`). It is zero-sum across the league by
  // construction, so it damps the diffusion without moving the mean the S90
  // parity receipt polices.
  //
  // Same NaN discipline as `tilt`: never `|| 0`, because NaN is falsy and that
  // idiom would launder a corrupt centre into a silent zero — the reversion
  // would stop applying and nothing anywhere would fail.
  const reversion =
    potentialReversion === undefined || potentialReversion === null ? 0 : Number(potentialReversion);
  if (!Number.isFinite(reversion)) {
    throw new TypeError(`developmentDelta: potentialReversion must be finite, received ${potentialReversion}`);
  }
  // Folded in before the single rounding, for the same reason `tilt` is: it is
  // deterministic per player, and rounding it separately would bias it.
  // `rng.float` is still drawn exactly once per player, in the same order, so
  // the RNG stream position is unchanged.
  const variance = rng.float(PLAYER_DEVELOPMENT_PROFILE.varianceMin, PLAYER_DEVELOPMENT_PROFILE.varianceMax);
  return Math.round(ageFactor + traitFactor + tilt + reversion + variance);
}
