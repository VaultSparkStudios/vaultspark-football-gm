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
import { developmentDelta, LEAGUE_AVERAGE_POTENTIAL, PLAYER_DEVELOPMENT_PROFILE } from "../src/domain/ratings.js";
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
  // The defect exactly as it shipped: centres hardcoded at 72/72/70, the culture
  // credit unconditional while its debit applied only to players 29 and over,
  // and a clamp with more headroom up than down. If the tolerance above cannot
  // fail this, it is not a gate — it is decoration.
  const priorTilt = (player, team, modifierIdentity) =>
    clamp(
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

test("one wired offseason moves the league by the declared curve and nothing else", () => {
  // The sharpest available statement of the defect. The declared curve says what
  // the league's mean development should be for this exact roster; the engine
  // must deliver that and not that-plus-a-subsidy. Measured on the players who
  // survive the offseason, so retirement and intake composition — separate
  // mechanisms with their own owners — cannot mask or be blamed for the result.
  //
  // League-level multi-season drift is deliberately NOT asserted here: it is the
  // emergent product of this curve plus retirement plus intake, and
  // `test/realism-career-regression.test.js` is the authority that owns it.
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const year = session.currentYear;

  const before = new Map(
    session.league.players
      .filter((player) => player.status !== "retired")
      .map((player) => [player.id, { overall: Number(player.overall), age: Number(player.age), potential: Number(player.potential) }])
  );

  const declared = mean(
    [...before.values()].map((player) => {
      // The player is a year older when the curve is applied to him.
      const age = player.age + 1;
      const factors = PLAYER_DEVELOPMENT_PROFILE.ageFactors;
      const ageFactor =
        age <= 25 ? factors.developing25AndUnder : age <= 29 ? factors.prime26To29 : factors.veteran30Plus;
      return ageFactor + (player.potential - LEAGUE_AVERAGE_POTENTIAL) / 20;
    })
  );

  session.developmentEnvironmentCentres();
  applyAgingProgressionAndRetirements(session.league, year, session.rng, {
    developmentContext: (player, team) => session.buildPlayerDevelopmentContext(team?.id || player.teamId, player)
  });

  const survivors = session.league.players.filter((player) => before.has(player.id));
  const observed = mean(survivors.map((player) => Number(player.overall) - before.get(player.id).overall));

  assert.ok(survivors.length > 1000, `expected a full league of survivors, got ${survivors.length}`);
  assert.ok(
    Math.abs(observed - declared) <= 0.25,
    `the engine moved the league ${observed.toFixed(3)} OVR while the declared curve says ${declared.toFixed(3)} ` +
      `(gap ${(observed - declared).toFixed(3)}). The pre-S90 environment subsidy was worth +0.84 here.`
  );
});
