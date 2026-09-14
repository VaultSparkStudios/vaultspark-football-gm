import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { GameSession, computeSchemeFit } from "../src/runtime/GameSession.js";
import {
  DEVELOPMENT_ENVIRONMENT_PROFILE,
  ZERO_CENTRED_TILT_TOLERANCE,
  developmentEnvironmentTilt,
  measureDevelopmentCentres,
  rawDevelopmentTilt
} from "../src/domain/developmentEnvironment.js";
import { developmentDelta, PLAYER_DEVELOPMENT_PROFILE } from "../src/domain/ratings.js";
import { measurePotentialCentre } from "../src/domain/potentialReversion.js";
import { applyAgingProgressionAndRetirements, progressPlayer } from "../src/engine/offseasonSimulator.js";
import { clamp } from "../src/utils/rng.js";

const SEEDS = [20260306, 4040, 777, 90210];

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

function leagueOf(seed) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
  const teamsById = new Map(session.league.teams.map((team) => [team.id, team]));
  const roster = session.league.players.filter(
    (player) => player.status !== "retired" && teamsById.has(player.teamId)
  );
  return { session, teamsById, roster };
}

/** Every rostered player's tilt, as the engine itself computes it. */
function leagueTilts(session, roster) {
  return roster.map((player) => Number(session.buildPlayerDevelopmentContext(player.teamId, player).developmentEnvironmentTilt));
}

test("development centres are measured from the league, not from literals it left behind", () => {
  const { session, roster } = leagueOf(20260306);
  const centres = measureDevelopmentCentres(session.league, computeSchemeFit);

  assert.equal(centres.source, "measured");
  assert.equal(centres.sampleSize, roster.length);

  // The specific literals that rotted. Each is asserted to be genuinely wrong so
  // that re-hardcoding one cannot pass this test quietly.
  const fallbacks = DEVELOPMENT_ENVIRONMENT_PROFILE.fallbackCentres;
  assert.ok(
    Math.abs(centres.coachingDevelopment - fallbacks.coachingDevelopment) > 5,
    `coaching centre should be measured (~78), not the stale ${fallbacks.coachingDevelopment}; got ${centres.coachingDevelopment}`
  );
  assert.ok(
    Math.abs(centres.schemeFit - fallbacks.schemeFit) > 5,
    `scheme-fit centre should be measured (~78), not the stale ${fallbacks.schemeFit}; got ${centres.schemeFit}`
  );

  // And each centre must actually be its own league mean.
  const teamsById = new Map(session.league.teams.map((team) => [team.id, team]));
  assert.ok(
    Math.abs(centres.coachingDevelopment - mean(roster.map((p) => Number(teamsById.get(p.teamId).coaching.development)))) < 1e-9
  );
  assert.ok(
    Math.abs(centres.schemeFit - mean(roster.map((p) => Number(computeSchemeFit(p, teamsById.get(p.teamId)))))) < 1e-9
  );
});

test("the club development environment is a differentiator, not a league-wide subsidy", () => {
  for (const seed of SEEDS) {
    const { session, roster } = leagueOf(seed);
    const tilts = leagueTilts(session, roster);
    assert.ok(
      Math.abs(mean(tilts)) <= ZERO_CENTRED_TILT_TOLERANCE,
      `seed ${seed}: league-wide mean environment tilt ${mean(tilts).toFixed(4)} exceeds ${ZERO_CENTRED_TILT_TOLERANCE}. ` +
        "A non-zero mean is talent minted from nothing every offseason."
    );
  }
});

test("NEGATIVE CONTROL — the same assertion rejects the pre-S90 formula it was written to catch", () => {
  // The defect exactly as it shipped (`priorTilt`, below). If the tolerance above
  // cannot fail it, it is not a gate — it is decoration.
  const { session, teamsById, roster } = leagueOf(20260306);
  const priorMean = mean(
    roster.map((player) => {
      const team = teamsById.get(player.teamId);
      return priorTilt(player, team, team?.cultureProfile?.identity || null);
    })
  );

  assert.ok(
    priorMean > 0.5,
    `the reconstructed pre-S90 formula should reproduce the measured inflation; got ${priorMean.toFixed(3)}`
  );
  assert.ok(
    Math.abs(priorMean) > ZERO_CENTRED_TILT_TOLERANCE,
    "the zero-centring tolerance must reject the defect it was written for"
  );

  // And the current authority, on the same league, must pass where that fails.
  assert.ok(Math.abs(mean(leagueTilts(session, roster))) <= ZERO_CENTRED_TILT_TOLERANCE);
});

test("zero-centring redistributes development between clubs instead of flattening it", () => {
  const { session, roster } = leagueOf(20260306);
  const byTeam = new Map();
  for (const player of roster) {
    const tilt = Number(session.buildPlayerDevelopmentContext(player.teamId, player).developmentEnvironmentTilt);
    if (!byTeam.has(player.teamId)) byTeam.set(player.teamId, []);
    byTeam.get(player.teamId).push(tilt);
  }
  const teamMeans = [...byTeam.values()].map(mean).sort((a, b) => b - a);

  // A constant stub would satisfy "mean is zero" perfectly while silently
  // deleting the entire system. The spread is what proves the environment still
  // means something.
  assert.ok(teamMeans[0] > 0.5, `best club should still be a real advantage; got ${teamMeans[0].toFixed(2)}`);
  assert.ok(teamMeans.at(-1) < -0.5, `worst club should still be a real penalty; got ${teamMeans.at(-1).toFixed(2)}`);
  assert.ok(teamMeans[0] - teamMeans.at(-1) > 1.5, "club-to-club spread collapsed");
});

test("a better environment develops the same player harder than a worse one", () => {
  const { session, teamsById, roster } = leagueOf(20260306);
  const centres = measureDevelopmentCentres(session.league, computeSchemeFit);
  const player = roster.find((candidate) => candidate.age === 24) || roster[0];
  const team = teamsById.get(player.teamId);

  const inputs = (coachingDevelopment, training) => ({
    training,
    coachingDevelopment,
    schemeFit: computeSchemeFit(player, team),
    cultureIdentity: null,
    playerAge: Number(player.age)
  });

  const rich = developmentEnvironmentTilt(inputs(centres.coachingDevelopment + 12, centres.training + 12), centres);
  const poor = developmentEnvironmentTilt(inputs(centres.coachingDevelopment - 12, centres.training - 12), centres);
  assert.ok(rich > poor + 1.5, `environment quality must still separate clubs; rich ${rich} vs poor ${poor}`);
  assert.ok(rich > 0 && poor < 0, "the centre must sit between a good and a bad building");
});

test("the environment tilt never consumes the RNG stream", () => {
  let floats = 0;
  const rng = {
    float: (min, max) => {
      floats += 1;
      return (min + max) / 2;
    }
  };
  const player = { age: 24, potential: 82 };

  floats = 0;
  developmentDelta(player, rng);
  assert.equal(floats, 1);

  floats = 0;
  developmentDelta(player, rng, { environmentTilt: 2.4 });
  assert.equal(floats, 1, "a tilted progression must draw the same randomness as an untilted one");

  floats = 0;
  developmentDelta(player, rng, { environmentTilt: -2.4 });
  assert.equal(floats, 1);
});

test("the tilt rides the curve's single unbiased rounding rather than being rounded alone", () => {
  // A tilt of +0.5 rounds to +1 on its own — a whole rating point per player per
  // year, conjured by Math.round. Folded into the curve it is worth exactly what
  // it says: half a point, resolved by the variance draw.
  const rng = { float: () => 0 };
  const player = { age: 27, potential: 80 }; // ageFactor -0.55, traitFactor 0

  assert.ok(developmentDelta(player, rng, { environmentTilt: 0.5 }) === 0, "-0.55 + 0.50 must round to 0, not +1");
  assert.equal(developmentDelta(player, rng, { environmentTilt: 0 }), -1);

  // The separate-rounding path the engine used to take would have produced
  // Math.round(-0.55) + Math.round(0.5) = -1 + 1 = 0 for the same inputs while
  // claiming the curve was unchanged; the difference compounds every offseason.
  assert.notEqual(Math.round(-0.55) + Math.round(0.5), Math.round(-0.55 + 0.5) + 1);
});

test("a rejected environment value fails loudly instead of laundering into zero", () => {
  const centres = { training: 72, coachingDevelopment: 78, schemeFit: 78, tiltOffset: 0 };
  assert.throws(
    () => rawDevelopmentTilt({ training: NaN, coachingDevelopment: 78, schemeFit: 78, cultureIdentity: null, playerAge: 25 }, centres),
    /must be finite/
  );
  assert.throws(() => developmentDelta({ age: 25, potential: 80 }, { float: () => 0 }, { environmentTilt: NaN }), /must be finite/);

  // Absent is legitimate — the headless runOffseason façade passes no development
  // context at all — and must mean zero, not throw.
  const player = () => ({ age: 25, potential: 80, ratings: { speed: 70, awareness: 70 }, position: "WR", morale: 72 });
  const rng = { float: () => 0, shuffle: (keys) => keys };
  assert.doesNotThrow(() => progressPlayer(player(), rng));
  assert.doesNotThrow(() => progressPlayer(player(), rng, { developmentEnvironmentTilt: 0 }));
  // Present but corrupt is not legitimate and must not launder into zero.
  assert.throws(() => progressPlayer(player(), rng, { developmentEnvironmentTilt: NaN }), /must be finite/);
  assert.throws(() => progressPlayer(player(), rng, { developmentBonus: NaN }), /must be finite/);
});

test("a sample too small to define a centre reports declared, never a fabricated measurement", () => {
  const tiny = {
    teams: [{ id: "BUF", owner: { facilities: { training: 90 } }, coaching: { development: 90 } }],
    players: [{ id: "p1", teamId: "BUF", status: "active", age: 24 }]
  };
  const centres = measureDevelopmentCentres(tiny, () => 80);
  assert.equal(centres.source, "declared");
  assert.equal(centres.tiltOffset, 0);
  assert.equal(centres.coachingDevelopment, DEVELOPMENT_ENVIRONMENT_PROFILE.fallbackCentres.coachingDevelopment);
  assert.ok(centres.sampleSize < DEVELOPMENT_ENVIRONMENT_PROFILE.minimumCentreSample);
});

test("a restored snapshot measures the same centres as the live session", () => {
  const { session } = leagueOf(4040);
  const live = session.developmentEnvironmentCentres();

  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  const clone = GameSession.fromSnapshot(snapshot, (seed) => new session.rng.constructor(seed));
  const restored = clone.developmentEnvironmentCentres();

  for (const key of ["training", "coachingDevelopment", "schemeFit", "tiltOffset", "sampleSize", "source"]) {
    assert.equal(restored[key], live[key], `${key} drifted across fromSnapshot`);
  }
});

test("the player-facing development outlook reports the tilt the engine will actually apply", () => {
  // A surface built on the declared fallbacks while the engine progresses on the
  // measured centres would show the player a number the simulation never uses.
  // That is the defect class this project keeps finding: the report and the
  // mechanism drifting apart while both look reasonable on their own.
  const { session, roster } = leagueOf(20260306);
  const sampled = roster.filter((_, index) => index % 137 === 0).slice(0, 8);
  assert.ok(sampled.length >= 5, "expected a real sample");

  for (const player of sampled) {
    const surfaced = session.getPlayerProfile(player.id)?.developmentOutlook;
    assert.ok(surfaced, `no development outlook surfaced for ${player.id}`);
    const engine = session.buildPlayerDevelopmentContext(player.teamId, player);
    assert.equal(
      surfaced.developmentBonus,
      engine.developmentBonus,
      `surfaced development bonus disagrees with the engine for ${player.id}`
    );
  }
});

/*
 * S107 — the offseason gates below measure every player the offseason
 * PROGRESSED, captured before the call, retirees included.
 *
 * Until S107 this gate read the players who survived the offseason, "so that
 * retirement cannot mask the result". It did the opposite. The offseason
 * progresses a player and only then rolls his retirement, on the overall it
 * has just produced (`retirementChance` rewards 84+ and punishes 74-and-below),
 * so keeping only survivors selects on the very outcome being measured. On the
 * unchanged S106 tree that selection alone read +0.149 to +0.238 across four
 * seeds — 94 per cent of the 0.25 tolerance on the canonical seed — while the
 * full progressed population matched the declared curve to within 0.035 and
 * the environment itself contributed -0.035 to -0.005. S106 read that residual
 * as rating-level redistribution and refused a generator change for it; the
 * change had only altered who retires.
 *
 * League-level multi-season drift is still deliberately NOT asserted here: it
 * is the emergent product of this curve plus retirement plus intake, and
 * `test/realism-career-regression.test.js` owns it.
 */
const OFFSEASON_GATE_SEED = 20260306;

/**
 * Largest mean OVR move, in either direction, an offseason may make beyond what
 * the declared curve (or, for the environment arm, a zeroed environment) says.
 * Tightened from 0.25 in S107: with the population defect removed, the largest
 * reading across four seeds on both the old potential draw and the shipped
 * generator was 0.056 against the declared curve and 0.035 for the environment
 * arm, while the defect this guards against read +0.82 to +0.90 through the
 * same measurement.
 */
const OFFSEASON_MOVEMENT_TOLERANCE = 0.1;

// The environment exactly as it shipped before S90: centres hardcoded at
// 72/72/70, the culture credit unconditional while its debit applied only to
// players 29 and over, and a clamp with more headroom up than down.
function priorTilt(player, team, modifierIdentity) {
  return clamp(
    Math.round(
      (Number(team?.owner?.facilities?.training || 72) - 72) / 10 +
        (Number(team?.coaching?.development || 72) - 72) / 13 +
        (computeSchemeFit(player, team) - 70) / 18 +
        (modifierIdentity === "developmental" ? 1 : 0) -
        (modifierIdentity === "urgent" && player.age >= 29 ? 1 : 0)
    ),
    -3,
    4
  );
}

const offseasonRuns = new Map();

/**
 * One real offseason on a fresh league. `environment` selects the club
 * development environment the engine is handed: `wired` (the live authority),
 * `zeroed` (the same context with the tilt removed) or `prior` (the pre-S90
 * formula). Everything else — the RNG stream, reversion, centres, retirement —
 * is the engine's own, so arms on the same seed differ only in the environment.
 */
function offseasonMovement(environment) {
  if (offseasonRuns.has(environment)) return offseasonRuns.get(environment);
  const session = createSession({ seed: OFFSEASON_GATE_SEED, startYear: 2026, controlledTeamId: "BUF" });
  const progressed = session.league.players.filter((player) => player.status !== "retired");
  const before = new Map(
    progressed.map((player) => [
      player.id,
      { overall: Number(player.overall), age: Number(player.age), potential: Number(player.potential) }
    ])
  );
  // The centre the engine differentiates the trait term against, measured the
  // way the engine measures it, from the league before anyone is progressed.
  const { potentialCentre } = measurePotentialCentre(session.league);
  const factors = PLAYER_DEVELOPMENT_PROFILE.ageFactors;
  const declared = mean(
    [...before.values()].map((player) => {
      // The player is a year older when the curve is applied to him.
      const age = player.age + 1;
      const ageFactor =
        age <= 25 ? factors.developing25AndUnder : age <= 29 ? factors.prime26To29 : factors.veteran30Plus;
      return ageFactor + (player.potential - potentialCentre) / 20;
    })
  );

  session.developmentEnvironmentCentres();
  applyAgingProgressionAndRetirements(session.league, session.currentYear, session.rng, {
    developmentContext: (player, team) => {
      const context = session.buildPlayerDevelopmentContext(team?.id || player.teamId, player);
      if (environment === "zeroed") return { ...context, developmentEnvironmentTilt: 0, developmentBonus: 0 };
      if (environment === "prior") {
        const tilt = priorTilt(player, team, team?.cultureProfile?.identity || null);
        return { ...context, developmentEnvironmentTilt: tilt, developmentBonus: 0 };
      }
      return context;
    }
  });

  const moved = (players) => mean(players.map((player) => Number(player.overall) - before.get(player.id).overall));
  const survivors = session.league.players.filter((player) => before.has(player.id));
  const run = {
    declared,
    progressedCount: progressed.length,
    survivorCount: survivors.length,
    progressed: moved(progressed),
    survivors: moved(survivors)
  };
  offseasonRuns.set(environment, run);
  return run;
}

test("one wired offseason moves every player it progressed by the declared curve and nothing else", () => {
  const wired = offseasonMovement("wired");
  assert.ok(wired.progressedCount > 2000, `expected a full league, got ${wired.progressedCount}`);
  assert.ok(
    Math.abs(wired.progressed - wired.declared) <= OFFSEASON_MOVEMENT_TOLERANCE,
    `the engine moved the league ${wired.progressed.toFixed(3)} OVR while the declared curve says ` +
      `${wired.declared.toFixed(3)} (gap ${(wired.progressed - wired.declared).toFixed(3)}). ` +
      "The pre-S90 environment subsidy was worth +0.84 here."
  );
});

test("the club environment, isolated by a matched offseason with the tilt zeroed, mints no development", () => {
  const wired = offseasonMovement("wired");
  const zeroed = offseasonMovement("zeroed");
  const contribution = wired.progressed - zeroed.progressed;
  assert.ok(
    Math.abs(contribution) <= OFFSEASON_MOVEMENT_TOLERANCE,
    `the wired environment moved the league ${contribution.toFixed(3)} OVR beyond an identical offseason without it`
  );
});

test("NEGATIVE CONTROL — the matched offseason rejects the pre-S90 environment it was written to catch", () => {
  const prior = offseasonMovement("prior");
  const zeroed = offseasonMovement("zeroed");
  const contribution = prior.progressed - zeroed.progressed;
  assert.ok(contribution > 0.5, `the pre-S90 environment should reproduce the measured subsidy; got ${contribution.toFixed(3)}`);
  assert.ok(contribution > OFFSEASON_MOVEMENT_TOLERANCE, "the offseason tolerance must reject the defect it was written for");
});

test("NEGATIVE CONTROL — reading only the survivors is selection on the outcome, and visibly so", () => {
  // Retirement is rolled on the overall the offseason just produced, so the
  // survivor population is biased toward players whose ratings rose. If a
  // refactor ever "simplifies" the gates above back to survivors, this is the
  // size of the error it reintroduces.
  const wired = offseasonMovement("wired");
  assert.ok(wired.survivorCount < wired.progressedCount, "retirement should have removed someone");
  assert.ok(
    wired.survivors - wired.progressed > OFFSEASON_MOVEMENT_TOLERANCE,
    `survivors ${wired.survivors.toFixed(3)} vs progressed ${wired.progressed.toFixed(3)}: the survivor bias the ` +
      "pre-S107 gate carried should be larger than the tolerance it consumed"
  );
});
