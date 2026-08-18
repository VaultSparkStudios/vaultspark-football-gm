import { clamp } from "../utils/rng.js";

/**
 * Development-environment authority — the single place a club's environment is
 * allowed to move a player's offseason development.
 *
 * The development curve itself is declared in `PLAYER_DEVELOPMENT_PROFILE`:
 * players 25 and under rise, prime players hold roughly level, thirty-somethings
 * decline, and a player's own potential separates him from the field. A club's
 * environment — its training facility, its position coaching, how well the
 * player fits the scheme, and the culture the owner tolerates — is meant to
 * *tilt* that curve, so the same player develops differently in one building
 * than in another.
 *
 * A tilt has to be measured against the league's centre, or it stops being a
 * tilt and becomes a subsidy. That is what had happened, and it is the upstream
 * driver of the league-wide talent inflation S89 could only bound at the
 * symptom:
 *
 *  - The coaching term was measured against a literal 72 while a generated
 *    league's mean `coaching.development` is 78.2. The average club therefore
 *    cleared the bar by six points and every player on it collected roughly
 *    **+0.48 OVR for it, every offseason, forever**.
 *  - The scheme-fit term was measured against a literal 70, and scheme fit is
 *    *derived from the player's ratings*. So the richer the league got, the
 *    larger the bonus grew — and the bonus was what made the league richer. A
 *    closed positive-feedback loop, which is why the drift accelerated rather
 *    than settling.
 *  - The culture term paid +1 to every player on a "developmental" club but
 *    charged -1 only to players aged 29 and over on an "urgent" one, and the
 *    clamp allowed +4 of upside against -3 of downside. Both asymmetries point
 *    the same way.
 *
 * Measured on the live engine across four independent seeds: mean environment
 * bonus **+0.84 OVR per player per offseason**, with 62% of the league positive
 * and 3.8% negative. The declared curve it modifies has a cohort-weighted league
 * mean near zero — so the environment term was not tilting the curve, it *was*
 * the curve, and it pointed one way.
 *
 * This module fixes it at the source rather than by tuning a number down:
 *
 *  1. Every centre is **measured from the league actually being simulated**,
 *     not held as a literal that can drift away from the generator. This is the
 *     same failure `LEAGUE_AVERAGE_POTENTIAL` was rescued from in S71; holding
 *     the centre as a constant is precisely what let it rot the second time.
 *  2. The clamp is symmetric.
 *  3. The whole tilt is **zero-centred by construction** — the league's own mean
 *     raw tilt is subtracted from every player's. Narrative shapes (a
 *     developmental club really does favour its young; an urgent club really
 *     does burn its veterans) are preserved exactly, but they now redistribute
 *     development between clubs instead of minting it. What a club's environment
 *     is worth is what it is worth *relative to its peers*.
 *
 * Because the league-wide tilt now sums to zero, the progression-parity model in
 * `src/stats/progressionParity.js` — which models `ageFactor + traitFactor` and
 * has never known this term existed — becomes correct on average rather than
 * systematically blind. That is the point: the receipt and the engine are now
 * the same function, so the receipt can police the drift it is there to police.
 */
export const DEVELOPMENT_ENVIRONMENT_PROFILE = Object.freeze({
  version: "2026-s90-centred",
  trainingDivisor: 10,
  coachingDivisor: 13,
  schemeFitDivisor: 18,
  cultureTilt: 1,
  developmentalCultureMaxAge: 25,
  urgentCultureMinAge: 29,
  minTilt: -3,
  maxTilt: 3,
  /**
   * The minimum rostered sample that may define a centre. Below it the league is
   * a fixture, not a league, and a three-player sample would make itself the
   * average by definition — so the declared fallbacks are used and the source is
   * reported as "declared" rather than silently passed off as measured.
   */
  minimumCentreSample: 200,
  fallbackCentres: Object.freeze({
    training: 72,
    coachingDevelopment: 72,
    schemeFit: 70
  })
});

/**
 * The league-wide mean tilt this authority guarantees. Asserted directly by
 * `test/session90-development-environment.test.js`; the gate ships with a
 * negative control that reconstructs the pre-fix formula and proves this
 * tolerance rejects it.
 */
export const ZERO_CENTRED_TILT_TOLERANCE = 0.05;

const trainingOf = (team) => Number(team?.owner?.facilities?.training ?? DEVELOPMENT_ENVIRONMENT_PROFILE.fallbackCentres.training);
const coachingDevelopmentOf = (team) =>
  Number(team?.coaching?.development ?? DEVELOPMENT_ENVIRONMENT_PROFILE.fallbackCentres.coachingDevelopment);

function assertFinite(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`developmentEnvironment: ${label} must be finite, received ${value}`);
  }
  return numeric;
}

function cultureTiltFor(cultureIdentity, playerAge) {
  const profile = DEVELOPMENT_ENVIRONMENT_PROFILE;
  const age = Number(playerAge);
  if (cultureIdentity === "developmental" && Number.isFinite(age) && age <= profile.developmentalCultureMaxAge) {
    return profile.cultureTilt;
  }
  if (cultureIdentity === "urgent" && Number.isFinite(age) && age >= profile.urgentCultureMinAge) {
    return -profile.cultureTilt;
  }
  return 0;
}

/**
 * The uncentred tilt for one player. Exported so the negative control can drive
 * it directly, and so the centring pass and the per-player path provably share
 * one formula rather than two copies that will drift.
 */
export function rawDevelopmentTilt({ training, coachingDevelopment, schemeFit, cultureIdentity, playerAge }, centres) {
  const profile = DEVELOPMENT_ENVIRONMENT_PROFILE;
  return (
    (assertFinite(training, "training") - assertFinite(centres.training, "centres.training")) / profile.trainingDivisor +
    (assertFinite(coachingDevelopment, "coachingDevelopment") - assertFinite(centres.coachingDevelopment, "centres.coachingDevelopment")) /
      profile.coachingDivisor +
    (assertFinite(schemeFit, "schemeFit") - assertFinite(centres.schemeFit, "centres.schemeFit")) / profile.schemeFitDivisor +
    cultureTiltFor(cultureIdentity, playerAge)
  );
}

/**
 * Measure the league's own centres, including the mean raw tilt that makes the
 * result zero-sum.
 *
 * `schemeFitOf(player, team)` is injected rather than imported so this module
 * stays free of the runtime, and so a test can drive it with a known fit.
 */
export function measureDevelopmentCentres(league, schemeFitOf) {
  if (typeof schemeFitOf !== "function") {
    throw new TypeError("measureDevelopmentCentres requires a schemeFitOf(player, team) function.");
  }
  const profile = DEVELOPMENT_ENVIRONMENT_PROFILE;
  const teamsById = new Map((league?.teams || []).map((team) => [team.id, team]));
  const rostered = (league?.players || []).filter(
    (player) => player?.status !== "retired" && teamsById.has(player?.teamId)
  );

  if (rostered.length < profile.minimumCentreSample) {
    return Object.freeze({
      ...profile.fallbackCentres,
      tiltOffset: 0,
      sampleSize: rostered.length,
      source: "declared",
      profileVersion: profile.version
    });
  }

  let trainingSum = 0;
  let coachingSum = 0;
  let fitSum = 0;
  const measured = [];
  for (const player of rostered) {
    const team = teamsById.get(player.teamId);
    const training = assertFinite(trainingOf(team), "team training");
    const coachingDevelopment = assertFinite(coachingDevelopmentOf(team), "team coaching development");
    const schemeFit = assertFinite(schemeFitOf(player, team), "schemeFit");
    trainingSum += training;
    coachingSum += coachingDevelopment;
    fitSum += schemeFit;
    measured.push({
      training,
      coachingDevelopment,
      schemeFit,
      cultureIdentity: team?.cultureProfile?.identity || null,
      playerAge: Number(player.age)
    });
  }

  const termCentres = {
    training: trainingSum / measured.length,
    coachingDevelopment: coachingSum / measured.length,
    schemeFit: fitSum / measured.length
  };

  // Second pass: the league's own mean raw tilt. Subtracting it is what makes
  // the term a redistribution rather than a subsidy — including the deliberately
  // asymmetric culture shapes, which stay intact and simply stop being free.
  let tiltSum = 0;
  for (const row of measured) tiltSum += rawDevelopmentTilt(row, termCentres);

  return Object.freeze({
    ...termCentres,
    tiltOffset: tiltSum / measured.length,
    sampleSize: measured.length,
    source: "measured",
    profileVersion: profile.version
  });
}

/**
 * The centred, clamped tilt applied to one player's offseason development.
 *
 * Continuous on purpose. `progressPlayer` folds it into the single rounding that
 * already carries the development curve's random variance, so the rounding stays
 * unbiased. Rounding this value on its own — as the old code did — biased a
 * *deterministic* per-player quantity in whichever direction it happened to sit,
 * which is a second, quieter inflation source on top of the miscentred one.
 */
export function developmentEnvironmentTilt(inputs, centres) {
  const profile = DEVELOPMENT_ENVIRONMENT_PROFILE;
  const raw = rawDevelopmentTilt(inputs, centres);
  const centred = raw - assertFinite(centres.tiltOffset ?? 0, "centres.tiltOffset");
  return clamp(centred, profile.minTilt, profile.maxTilt);
}
