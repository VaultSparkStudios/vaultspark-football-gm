import test from "node:test";
import assert from "node:assert/strict";
import { createPlayerIdentity, generateContextualPlayerName, NAMING_MODEL_VERSION, fictionalFamilyHeritage, playerAppearance, playerFrame, HAIRSTYLES, HAIR_COLORS, EYE_COLORS } from "../src/domain/playerIdentity.js";
import { PLAYER_DEMOGRAPHIC_BASELINE } from "../src/data/playerDemographicBaseline.js";
import { buildCountryIdentityDistribution } from "../src/domain/playerDemographicModel.js";
import { createSyntheticPlayer } from "../src/domain/playerFactory.js";
import { calculatePositionOverall } from "../src/domain/ratings.js";
import { RNG } from "../src/utils/rng.js";
import { buildPlayerPortraitSvg } from "../public/lib/playerPortrait.js";
import { injuryProbability, rollInjuryCheck } from "../src/engine/injurySystem.js";
import { progressPlayer } from "../src/engine/offseasonSimulator.js";
import { revisePlayerPotential, recordDevelopmentInjury } from "../src/domain/livingPotential.js";
import { playerStrategyValue } from "../src/engine/aiTeamStrategy.js";
import { ensureContractAgent, evaluateCanonicalAgentOffer } from "../src/engine/playerAgentAI.js";
import { COUNTRY_FAMILY_HERITAGE, FAMILY_HERITAGE, FAMILY_HISTORY_MODEL_VERSION, familyHeritageOptions } from "../src/data/playerFamilyHeritage.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";

test("large fictional sample follows dated league demographics with country-aware birthplace coverage", () => {
  const count = 20000;
  const rows = Array.from({ length: count }, (_, i) => createPlayerIdentity(`identity-test-${i}`));
  const weights = PLAYER_DEMOGRAPHIC_BASELINE.surveyWeights;
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  for (const [category, weight] of Object.entries(weights)) {
    const observed = rows.filter(row => row.surveyCategory === category).length;
    const expected = count * weight / total;
    assert.ok(Math.abs(observed - expected) < 5 * Math.sqrt(expected) + 3, `${category}: ${observed} vs ${expected}`);
  }
  const international = rows.filter(row => row.birthCountry !== "United States");
  assert.ok(international.length > 600 && international.length < 1000);
  assert.ok(new Set(international.map(row => row.birthCountry)).size >= 38);
  assert.ok(new Set(rows.map(row => row.name)).size > 4500, "names must expand beyond 256 combinations");
  assert.ok(rows.filter(row => row.surveyCategory === "Undisclosed").every(row => row.heritage.length === 0));
  assert.ok(rows.filter(row => row.surveyCategory === "Multiracial").every(row => row.heritage.length >= 2 && row.heritage[0] !== row.heritage[1]));
  assert.ok(new Set(rows.filter(row => row.surveyCategory === "Black").flatMap(row => row.heritage)).size >= 5);
  assert.ok(rows.some(row => row.birthCountry === "United States" && row.surveyCategory === "Asian"));
  assert.ok(rows.some(row => row.birthCountry === "Canada" && row.surveyCategory === "Black"));
});

test("joint country model preserves both declared margins and overlapping family support", () => {
  const model = buildCountryIdentityDistribution();
  for (let row = 0; row < model.countries.length; row++) {
    assert.ok(Math.abs(model.joint[row].reduce((sum, n) => sum + n, 0) - model.countryMarginals[row]) < 1e-10);
    assert.ok(model.joint[row].every(value => value > 0 && Number.isFinite(value)));
  }
  for (let column = 0; column < model.categories.length; column++) {
    assert.ok(Math.abs(model.joint.reduce((sum, row) => sum + row[column], 0) - model.categoryMarginals[column]) < 1e-10);
  }
  const share = (country, category) => model.joint[model.countries.indexOf(country)][model.categories.indexOf(category)] / model.countryMarginals[model.countries.indexOf(country)];
  assert.ok(share("Nigeria", "Black") > share("United States", "Black"));
  assert.ok(share("American Samoa", "PacificIslander") > .5);
  assert.ok(share("Japan", "Asian") > share("United States", "Asian"));
  assert.ok(share("Brazil", "HispanicLatino") < share("Mexico", "HispanicLatino") / 10, "Brazilian birth must not inherit the Hispanic preference");
  assert.throws(() => buildCountryIdentityDistribution({ ...PLAYER_DEMOGRAPHIC_BASELINE, internationalBirthShare: 0 }), /positive/);
});

test("country-aware histories retain local, diaspora and mixed families across every supported country", () => {
  for (const country of ["United States", ...Object.keys(PLAYER_DEMOGRAPHIC_BASELINE.internationalCountries)]) {
    assert.ok(COUNTRY_FAMILY_HERITAGE[country], `missing country vocabulary: ${country}`);
    for (const category of [...Object.keys(FAMILY_HERITAGE), "Multiracial", "Undisclosed"]) {
      const histories = Array.from({ length: 160 }, (_, i) => fictionalFamilyHeritage(category, `${country}-${category}-${i}`, country));
      assert.ok(histories.every(row => row.every(value => typeof value === "string" && value.length > 0)));
      if (category === "Undisclosed") assert.ok(histories.every(row => row.length === 0));
      else if (category === "Multiracial") assert.ok(histories.every(row => row.length === 2 && row[0] !== row[1]));
      else {
        const { local, diaspora } = familyHeritageOptions(country, category);
        const values = histories.flat();
        assert.ok(values.every(value => [...local, ...diaspora].includes(value)));
        if (local.length) {
          assert.ok(values.filter(value => local.includes(value)).length > histories.length * .6, `${country}/${category}: local histories lost`);
          if (diaspora.some(value => !local.includes(value))) assert.ok(values.some(value => !local.includes(value)), `${country}/${category}: diaspora erased`);
        }
      }
    }
  }
  const maori = Array.from({ length: 300 }, (_, i) => fictionalFamilyHeritage("Indigenous", `maori-${i}`, "New Zealand")).flat();
  assert.ok(maori.filter(value => value === "Māori").length > 200);
  assert.ok(!COUNTRY_FAMILY_HERITAGE["New Zealand"].PacificIslander.includes("Māori"));
  assert.ok(FAMILY_HERITAGE.White.includes("Egyptian") && FAMILY_HERITAGE.White.includes("Lebanese"));
  assert.throws(() => fictionalFamilyHeritage("invented-category", "seed", "Canada"), /Unknown/);
});

test("new and previously stored family identities survive actual session restore without rerolling", () => {
  const session = createSession({ seed: 734, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.league.players.find(row => row.teamId === "BUF");
  assert.equal(player.profile.identity.familyHistoryModelVersion, FAMILY_HISTORY_MODEL_VERSION);
  const identity = structuredClone(player.profile.identity);
  const restored = createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  const restoredPlayer = restored.league.players.find(row => row.id === player.id);
  assert.deepEqual(restoredPlayer.profile.identity, identity);
  // Older fictional save contents are authority even if the new model would
  // choose a different family or country. No migration asserts new facts.
  delete player.profile.identity.familyHistoryModelVersion;
  delete player.profile.identity.namingContext;
  player.name = player.profile.identity.name = "Stored Jean-Baptiste O’Brien";
  player.profile.identity.countryModelVersion = "fictional-joint-country-v2";
  player.profile.identity.heritage = ["Stored family history"];
  const legacyIdentity = structuredClone(player.profile.identity);
  const legacy = createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  assert.deepEqual(legacy.league.players.find(row => row.id === player.id).profile.identity, legacyIdentity);
  assert.equal(legacy.league.players.find(row => row.id === player.id).name, player.name);
});

test("fictional naming contexts retain family, diaspora, mixed and community choices", () => {
  const samples = heritage => Array.from({ length: 500 }, (_, i) => generateContextualPlayerName(`context-${i}`, {
    heritage, footballUpbringing: "United States", birthYear: 2004
  }));
  const iranian = samples(["Iranian"]);
  const family = iranian.filter(row => row.namingContext.kind === "family");
  assert.ok(family.length > 200 && family.length < 400);
  assert.ok(iranian.some(row => row.namingContext.kind === "community"));
  for (const row of family) {
    assert.equal(row.namingContext.familyHistory, "Iranian");
    assert.match(row.name, / (Rahimi|Karimi|Hosseini|Nouri|Shirazi|Mohammadi)$/);
  }
  const mixed = samples(["Iranian", "Nigerian"]);
  assert.deepEqual(new Set(mixed.filter(row => row.namingContext.kind === "family").map(row => row.namingContext.familyHistory)), new Set(["Iranian", "Nigerian"]));
  for (const row of [...iranian, ...mixed]) {
    assert.equal(row.namingContext.version, NAMING_MODEL_VERSION);
    assert.equal(row.namingContext.assumptions, "creative-vocabulary-and-blend");
    assert.doesNotMatch(row.name, /undefined|\[object/);
  }
  const local = generateContextualPlayerName("community-only", { heritage: [], footballUpbringing: "Japan" });
  assert.equal(local.namingContext.kind, "community");
  assert.equal(local.namingContext.community, "Japan");
  assert.equal(local.namingContext.vocabulary, "curated-fictional");
});

test("unknown and undisclosed naming histories cannot invent or leak family context", () => {
  for (const heritage of [[], ["Unreviewed family"], ["__proto__"], ["constructor"]]) {
    const input = { heritage, footballUpbringing: "Unreviewed community", birthYear: 2004 };
    const result = generateContextualPlayerName("fallback-person", input);
    assert.deepEqual(generateContextualPlayerName("fallback-person", input), result);
    assert.equal(result.namingContext.kind, "community");
    assert.equal(result.namingContext.vocabulary, "broad-fictional");
    assert.equal(Object.hasOwn(result.namingContext, "familyHistory"), false);
    assert.equal(result.namingContext.fallbackReason, heritage.length ? "family-vocabulary-unreviewed" : null);
    assert.equal(result.namingContext.givenNameSource, "curated-fictional");
  }
  const rows = Array.from({ length: 3000 }, (_, i) => createPlayerIdentity(`private-${i}`));
  const undisclosed = rows.filter(row => row.surveyCategory === "Undisclosed");
  assert.ok(undisclosed.length > 10);
  assert.ok(undisclosed.every(row => row.namingContext.kind === "community" && !Object.hasOwn(row.namingContext, "familyHistory")));
});

test("name cohorts follow birth year and future extrapolation is explicitly identified", () => {
  for (const [birthYear, key, extrapolated] of [[1994, "1990s", false], [2004, "2000s", false], [2014, "2010s", false], [2024, "2020s", false], [2084, "2020s", true]]) {
    const identity = createPlayerIdentity("cohort-person", { birthYear });
    assert.equal(identity.birthYear, birthYear);
    assert.equal(identity.namingCohort.key, key);
    assert.equal(identity.namingCohort.extrapolated, extrapolated);
    assert.deepEqual(createPlayerIdentity("cohort-person", { birthYear }), identity);
  }
  assert.equal(createPlayerIdentity("unknown-birth").birthYear, null);
  const player = createSyntheticPlayer({ teamId: "BUF", position: "QB", year: 2026, rng: new RNG(52) });
  assert.equal(player.profile.identity.birthYear, 2026 - player.age);
});

test("appearance channels vary independently and persist through saves, aging and trades", () => {
  const players = Array.from({ length: 3000 }, (_, i) => ({ id: `portrait-${i}`, profile: { faceSeed: `face-${i}` } }));
  const appearances = players.map(playerAppearance);
  assert.equal(new Set(appearances.map(a => a.hairstyle)).size, HAIRSTYLES.length);
  assert.equal(new Set(appearances.map(a => a.hairColor)).size, HAIR_COLORS.length);
  assert.equal(new Set(appearances.map(a => a.eyeColor)).size, EYE_COLORS.length);
  assert.ok(new Set(appearances.map(a => `${a.hairstyle}/${a.hairColor}/${a.eyeColor}`)).size > 400);
  assert.ok(appearances.filter(a => HAIR_COLORS.slice(0, 4).includes(a.hairColor)).length / players.length > .7);
  assert.ok(appearances.filter(a => EYE_COLORS.slice(0, 3).includes(a.eyeColor)).length / players.length > .7);
  assert.ok(appearances.some(a => a.dyedHairColor));
  assert.ok(appearances.some(a => a.freckles) && appearances.some(a => a.mole));
  assert.equal(new Set(appearances.map(a => JSON.stringify(a))).size, players.length);
  const player = { ...players[0], teamId: "BUF", age: 23 };
  const before = playerAppearance(player);
  const restored = JSON.parse(JSON.stringify(player));
  restored.teamId = "MIA";
  restored.age = 33;
  assert.deepEqual(playerAppearance(restored), before);
});

test("frame tracks height and mass with bounded geometry and limited athleticism cues", () => {
  const base = { id: "same-face", heightInches: 74, weightLbs: 205, ratings: { speed: 80, strength: 70 } };
  const light = playerFrame(base);
  const heavy = playerFrame({ ...base, weightLbs: 330 });
  const tall = playerFrame({ ...base, heightInches: 80 });
  assert.ok(heavy.shoulderWidth > light.shoulderWidth);
  assert.ok(heavy.neckWidth > light.neckWidth);
  assert.ok(heavy.waistRatio > light.waistRatio);
  assert.ok(tall.torsoLength > light.torsoLength);
  const athletic = playerFrame({ ...base, ratings: { strength: 95, speed: 95 } });
  assert.ok(athletic.muscleDefinition > light.muscleDefinition);
  for (const value of Object.values(playerFrame({ ...base, heightInches: NaN, weightLbs: Infinity }))) assert.ok(Number.isFinite(value));
});

test("rendered portraits retain valid colors and a shaved scalp has no hair geometry", () => {
  for (const hairstyle of HAIRSTYLES) {
    const player = { id: `render-${hairstyle}`, age: 35, heightInches: 78, weightLbs: 310, ratings: { strength: 92, speed: 60 }, name: "Test <Athlete>" };
    player.appearance = { ...playerAppearance(player), hairstyle };
    player.visualFrame = playerFrame(player);
    const svg = buildPlayerPortraitSvg(player);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    const colors = [...svg.matchAll(/(?:fill|stroke|stop-color)="(#[^"]+)"/g)].map(match => match[1]);
    assert.ok(colors.length > 15);
    assert.ok(colors.every(color => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)), colors.join(","));
    assert.match(svg, /Test &lt;Athlete&gt;/);
    if (hairstyle === "shaved") assert.doesNotMatch(svg.split('class="portrait-scalp-hair"')[1], /<path/);
  }
});

test("identity generation and rendering leave simulation randomness and football ability alone", () => {
  const rng = new RNG(524);
  const player = createSyntheticPlayer({ teamId: "BUF", position: "WR", year: 2026, rng });
  const seed = rng.seed;
  const ratings = structuredClone(player.ratings);
  const potential = player.potential;
  for (const category of Object.keys(PLAYER_DEMOGRAPHIC_BASELINE.surveyWeights)) {
    player.profile.identity.surveyCategory = category;
    createPlayerIdentity(player.id);
    playerAppearance(player);
    playerFrame(player);
    assert.deepEqual(player.ratings, ratings);
    assert.equal(player.potential, potential);
    assert.equal(calculatePositionOverall(player.position, player.ratings), player.overall);
    assert.equal(rng.seed, seed);
  }
});

test("paired demographic-only changes preserve injury, progression, potential and GM negotiation outcomes across positions", () => {
  const team = { id: "BUF", strategyProfile: "balanced", scheme: { passRate: .55, aggression: .5 } };
  for (const position of ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"]) {
    const original = createSyntheticPlayer({ teamId: "BUF", position, year: 2026, rng: new RNG(515) });
    for (const surveyCategory of Object.keys(PLAYER_DEMOGRAPHIC_BASELINE.surveyWeights)) {
      const left = structuredClone(original), right = structuredClone(original);
      right.profile.identity = { ...right.profile.identity, surveyCategory, birthCountry: "Canada", footballUpbringing: "Nigeria", heritage: ["Japanese", "Caribbean"] };
      assert.equal(injuryProbability(left), injuryProbability(right));
      const leftRng = new RNG(829), rightRng = new RNG(829);
      for (let week = 0; week < 30; week++) assert.equal(rollInjuryCheck(left, leftRng), rollInjuryCheck(right, rightRng));
      assert.deepEqual(progressPlayer(left, leftRng), progressPlayer(right, rightRng));
      assert.deepEqual(left.ratings, right.ratings);
      assert.equal(left.overall, right.overall);
      recordDevelopmentInjury(left, { severity: "major", weeksRemaining: 8 });
      recordDevelopmentInjury(right, { severity: "major", weeksRemaining: 8 });
      assert.deepEqual(revisePlayerPotential(left, { year: 2026, performance: "poor" }), revisePlayerPotential(right, { year: 2026, performance: "poor" }));
      assert.equal(playerStrategyValue(left, team), playerStrategyValue(right, team));
      const offer = { currentYear: 2026, baseSalary: 8_000_000, baseYears: 3, guaranteed: 10_000_000 };
      assert.deepEqual(ensureContractAgent(left, offer), ensureContractAgent(right, offer));
      assert.deepEqual(evaluateCanonicalAgentOffer(left, 7_000_000, 3), evaluateCanonicalAgentOffer(right, 7_000_000, 3));
      assert.equal(leftRng.seed, rightRng.seed);
    }
  }
});
