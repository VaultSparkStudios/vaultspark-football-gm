import { derivedRng, clamp } from "../utils/rng.js";
import { PLAYER_DEMOGRAPHIC_BASELINE } from "../data/playerDemographicBaseline.js";
import { birthplaceWeightsForCategory, COUNTRY_IDENTITY_MODEL_VERSION } from "./playerDemographicModel.js";
import { estimatePlayerSkeleton, resolvePlayerMeasurements, resolveBodyVolume, resolveIndividualAnatomy, resolveRegionalBodyShape, resolveRecordedAnatomy } from "./playerMeasurements.js";
import { FAMILY_HERITAGE, COUNTRY_FAMILY_HERITAGE, FAMILY_HISTORY_MODEL_VERSION, familyHeritageOptions } from "../data/playerFamilyHeritage.js";
import { resolveAppearanceRecipe, resolvePlayerGrooming, resolveAppearanceDetailRecipe, resolveFacialPigmentRecipe, resolveHairArrangementRecipe, resolveFineFaceRecipe, resolveHairTextureRecipe } from "./playerVisualIdentity.js";
import { blendAppearanceColor } from "../../public/lib/appearancePalette.js";
import { HAIR_STYLE_RULES, resolveStyledTexture } from "../../public/lib/portraitAppearanceContract.js";
import { EXTENDED_BODY_MEASUREMENT_VERSION, bodyMeasurementBounds } from "../../public/lib/physiqueGeometryContract.js";
import { resolveRegionalBodyShapeRecipe } from "./playerVisualIdentity.js";

const FIRST_NAMES = [
  "James", "Michael", "William", "David", "Christopher", "Daniel", "Matthew", "Joshua",
  "Andrew", "Anthony", "Joseph", "Nicholas", "Alexander", "Ryan", "Nathan", "Benjamin",
  "Samuel", "Jonathan", "Zachary", "Noah", "Caleb", "Ethan", "Elijah", "Isaiah", "Gabriel",
  "Malik", "Devin", "Jordan", "Marcus", "Andre", "Darius", "Jalen", "Jaylen", "Jamal",
  "Tariq", "Dante", "Tyrese", "Desmond", "Xavier", "Donovan", "Miles", "Cameron", "Austin",
  "Tyler", "Brandon", "Cole", "Owen", "Grant", "Luke", "Connor", "Blake", "Trevor",
  "Luis", "Diego", "Mateo", "Adrian", "Rafael", "Carlos", "Miguel", "Antonio",
  "Kai", "Kenji", "Minho", "Arjun", "Aamir", "Kofi", "Emeka", "Chidi", "Tane", "Sione",
  "Luca", "Nico", "Henrik", "Declan", "Sean", "Dylan", "Jesse", "Julian", "Roman", "Theo"
];
const LAST_NAMES = [
  "Johnson", "Smith", "Brown", "Williams", "Jones", "Davis", "Taylor", "Wilson", "Moore",
  "Anderson", "Clark", "Thomas", "White", "Harris", "Walker", "Young", "Robinson", "Lewis",
  "Green", "Jackson", "Scott", "Hall", "Allen", "Adams", "Wright", "Hill", "Campbell",
  "Mitchell", "Carter", "Roberts", "Turner", "Phillips", "Parker", "Evans", "Edwards",
  "Collins", "Stewart", "Morris", "Reed", "Cook", "Morgan", "Bell", "Bailey", "Cooper",
  "Richardson", "Cox", "Howard", "Ward", "Torres", "García", "Martínez", "Hernández",
  "Rivera", "Santos", "Cruz", "Reyes", "Bennett", "Murphy", "O’Connor", "O’Brien",
  "Sullivan", "McKenzie", "Müller", "Andersen", "Romano", "Dubois", "Okafor", "Mensah",
  "Adeyemi", "Okoye", "Diallo", "Kim", "Lee", "Nguyen", "Chen", "Tanaka", "Patel",
  "Singh", "Khan", "Tuivasa", "Faletau", "Tupou", "Nakamura", "Fischer", "MacLeod"
];

// Curated top-ten vocabulary from SSA birth-period tables, checked 2026-10-06.
// The blend with the broader pool is an art choice, not a frequency estimate.
const US_NAME_COHORTS = Object.freeze({
  "1990s": ["Michael", "Christopher", "Matthew", "Joshua", "Jacob", "Nicholas", "Andrew", "Daniel", "Tyler", "Joseph"],
  "2000s": ["Jacob", "Michael", "Joshua", "Matthew", "Daniel", "Christopher", "Andrew", "Ethan", "Joseph", "William"],
  "2010s": ["Noah", "Liam", "Jacob", "William", "Mason", "Ethan", "Michael", "Alexander", "James", "Elijah"],
  "2020s": ["Liam", "Noah", "Oliver", "James", "Elijah", "William", "Henry", "Lucas", "Theodore", "Benjamin"]
});
function namingCohortFor(birthYear) {
  if (!Number.isInteger(birthYear) || birthYear < 1990) return { key: "broad-fictional", source: null, extrapolated: true };
  const decade = Math.min(2020, Math.floor(birthYear / 10) * 10);
  return { key: `${decade}s`, source: `https://www.ssa.gov/oact/babynames/decades/names${decade}s.html`, sourcePeriod: decade === 2020 ? "2020–2025" : `${decade}–${decade + 9}`, extrapolated: birthYear > 2025 };
}

// Naming pools are creative vocabulary, not surname-to-race inference. A
// player's name and birth country are never used to classify an imported person.
const LOCAL_NAMES = Object.freeze({
  Nigeria: { first: ["Emeka", "Chidi", "David", "Samuel", "Tunde", "Chuka", "Daniel", "Ayo"], last: ["Okafor", "Adeyemi", "Okoye", "Obi", "Adebayo", "Eze"] },
  Canada: { first: ["Jordan", "Noah", "Nathan", "Étienne", "Malik", "Lucas"], last: ["Brown", "Tremblay", "Singh", "Campbell", "Roy", "Thompson"] },
  Australia: { first: ["Jack", "Lachlan", "Noah", "Tane", "William", "Sione"], last: ["Wilson", "Tupou", "Williams", "Nguyen", "Faletau", "Smith"] },
  "American Samoa": { first: ["Sione", "Noah", "Tavita", "Daniel", "Malaki", "Isaiah"], last: ["Tupou", "Faumuina", "Tuilagi", "Faletau", "Brown", "Williams"] },
  Tonga: { first: ["Sione", "Tavita", "Daniel", "Noah"], last: ["Tupou", "Faletau", "Latu", "Williams"] },
  "New Zealand": { first: ["Tane", "Liam", "Sione", "Jordan", "Noah"], last: ["Williams", "Tuivasa", "Brown", "Tupou", "Wilson"] },
  Mexico: { first: ["Luis", "Diego", "Rafael", "Daniel", "Carlos", "Mateo"], last: ["García", "Hernández", "Martínez", "Torres", "Reyes", "Cruz"] },
  Brazil: { first: ["Rafael", "Lucas", "Gabriel", "Daniel", "Mateus"], last: ["Santos", "Silva", "Costa", "Oliveira", "Cruz"] },
  Germany: { first: ["Lukas", "David", "Jonas", "Malik", "Daniel", "Leon"], last: ["Müller", "Fischer", "Wagner", "Weber", "Brown", "Khan"] },
  "South Korea": { first: ["Minho", "Joon", "Daniel", "Jiho", "David"], last: ["Kim", "Lee", "Park", "Choi", "Han"] },
  Japan: { first: ["Kenji", "Kai", "Daniel", "Ren", "Noah"], last: ["Tanaka", "Nakamura", "Sato", "Brown", "Suzuki"] },
  "United Kingdom": { first: ["James", "Declan", "Dylan", "Aamir", "Jordan", "Noah"], last: ["MacLeod", "Smith", "Jones", "Khan", "Campbell", "Williams"] },
  Ireland: { first: ["Declan", "Sean", "James", "Dylan", "Daniel"], last: ["O’Connor", "O’Brien", "Murphy", "Kelly", "Sullivan"] }
});

export const NAMING_MODEL_VERSION = "fictional-family-community-names-v1";
// Curated creative vocabulary, not measured ethnic/name frequencies. Country
// pools describe naming communities rather than classifying anyone's ancestry.
const FAMILY_NAMING_COMMUNITIES = Object.freeze({
  Nigerian: "Nigeria", Irish: "Ireland", British: "United Kingdom", "Black British": "United Kingdom",
  German: "Germany", Samoan: "American Samoa", Tongan: "Tonga", Korean: "South Korea", Japanese: "Japan",
  Mexican: "Mexico", "Afro-Mexican": "Mexico", Brazilian: "Brazil", "Afro-Brazilian": "Brazil",
  "French Canadian": "Canada", "New Zealand European": "New Zealand"
});
const FAMILY_NAME_VOCABULARY = Object.freeze({
  Iranian: { first: ["Arman", "Reza", "Amir", "Navid", "Darius", "Daniel"], last: ["Rahimi", "Karimi", "Hosseini", "Nouri", "Shirazi", "Mohammadi"] },
  Lebanese: { first: ["Karim", "Rami", "Elias", "Jad", "Daniel", "Joseph"], last: ["Haddad", "Khoury", "Nassar", "Saliba", "Mansour", "Saad"] },
  Egyptian: { first: ["Omar", "Ahmed", "Youssef", "Karim", "Mina", "Daniel"], last: ["Hassan", "Ibrahim", "Mahmoud", "Mansour", "Naguib", "Youssef"] },
  Ghanaian: { first: ["Kofi", "Kwame", "Kojo", "Yaw", "Daniel", "Samuel"], last: ["Mensah", "Owusu", "Boateng", "Osei", "Asante", "Bediako"] },
  Jamaican: { first: ["Andre", "Daniel", "Michael", "Dwayne", "Jordan", "Marcus"], last: ["Brown", "Campbell", "Reid", "Grant", "Williams", "Morgan", "Thompson", "Stewart"] },
  Haitian: { first: ["Jean", "David", "Samuel", "Daniel", "Étienne", "Joseph"], last: ["Jean-Baptiste", "Pierre", "Joseph", "Louis", "Baptiste", "Charles", "Augustin"] },
  Chinese: { first: ["Wei", "Jun", "Ming", "Hao", "Daniel", "David"], last: ["Chen", "Wang", "Li", "Zhang", "Liu", "Huang", "Wu", "Lin"] },
  Vietnamese: { first: ["Minh", "Anh", "Duc", "Huy", "Daniel", "David"], last: ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu", "Dang"] },
  Filipino: { first: ["Jose", "Miguel", "Rafael", "Gabriel", "Daniel", "Marco"], last: ["Santos", "Reyes", "Cruz", "Garcia", "Mendoza", "Ramos", "Bautista"] },
  Italian: { first: ["Luca", "Marco", "Matteo", "Nico", "Antonio", "Daniel"], last: ["Rossi", "Romano", "Ricci", "Conti", "Marino", "Ferrari"] },
  French: { first: ["Lucas", "Gabriel", "Étienne", "Louis", "Hugo", "Daniel"], last: ["Dubois", "Martin", "Bernard", "Moreau", "Laurent", "Petit"] },
  Scandinavian: { first: ["Henrik", "Lars", "Erik", "Nils", "Lucas", "Daniel"], last: ["Andersen", "Larsen", "Johansson", "Nielsen", "Lindberg", "Berg"] }
});

/** New fictional identities only; never applied to a saved/imported name. */
export function generateContextualPlayerName(seed, { heritage = [], footballUpbringing = "United States", birthYear = null } = {}) {
  const contextRng = derivedRng(`identity-naming-context:${seed}`);
  const nameRng = derivedRng(`identity-name:${seed}`);
  const histories = Array.isArray(heritage) ? heritage.filter(value => typeof value === "string") : [];
  const selectedFamily = histories.length ? contextRng.pick(histories) : null;
  const familyCommunity = Object.hasOwn(FAMILY_NAMING_COMMUNITIES, selectedFamily) ? FAMILY_NAMING_COMMUNITIES[selectedFamily] : null;
  const familyPool = Object.hasOwn(FAMILY_NAME_VOCABULARY, selectedFamily) ? FAMILY_NAME_VOCABULARY[selectedFamily]
    : Object.hasOwn(LOCAL_NAMES, familyCommunity) ? LOCAL_NAMES[familyCommunity] : null;
  // These blend probabilities are artistic choices, not Census/SSA rates.
  const useFamily = Boolean(familyPool) && contextRng.chance(.65);
  const communityPool = Object.hasOwn(LOCAL_NAMES, footballUpbringing) ? LOCAL_NAMES[footballUpbringing] : null;
  const pool = useFamily ? familyPool : communityPool;
  const cohort = namingCohortFor(birthYear);
  const useCohort = footballUpbringing === "United States" && US_NAME_COHORTS[cohort.key] && nameRng.chance(.35);
  const first = nameRng.pick(useCohort ? US_NAME_COHORTS[cohort.key] : pool?.first || FIRST_NAMES);
  const last = nameRng.pick(pool?.last || LAST_NAMES);
  return {
    name: `${first} ${last}`,
    namingContext: {
      version: NAMING_MODEL_VERSION,
      kind: useFamily ? "family" : "community",
      community: useFamily ? familyCommunity || selectedFamily : footballUpbringing,
      ...(useFamily ? { familyHistory: selectedFamily } : {}),
      vocabulary: pool ? "curated-fictional" : "broad-fictional",
      givenNameSource: useCohort ? "us-birth-cohort-vocabulary" : "curated-fictional",
      assumptions: "creative-vocabulary-and-blend",
      fallbackReason: useFamily || !selectedFamily || familyPool ? null : "family-vocabulary-unreviewed"
    }
  };
}

function weightedIdentityChoice(rng, weights) {
  const entries = Object.entries(weights);
  let roll = rng.next() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries.at(-1)[0];
}

export function fictionalFamilyHeritage(category, seed, country = "United States") {
  if (category === "Undisclosed") return [];
  const rng = derivedRng(`identity-family:${seed}`);
  const choose = group => {
    const { local, diaspora, localPreference } = familyHeritageOptions(country, group);
    return rng.pick(local.length && rng.chance(localPreference) ? local : diaspora);
  };
  if (category !== "Multiracial") {
    if (!FAMILY_HERITAGE[category]) throw new Error(`Unknown fictional family category: ${category}`);
    return [choose(category)];
  }
  const families = Object.keys(FAMILY_HERITAGE);
  // Local family pools receive a modest creative preference, not a census rate.
  // Distinct reporting pools describe mixed histories; no biological fractions
  // or parents' actual self-identifications are asserted by these strings.
  const preferences = Object.fromEntries(families.map(group => [group, COUNTRY_FAMILY_HERITAGE[country]?.[group]?.length ? 3 : 1]));
  const first = weightedIdentityChoice(rng, preferences);
  const second = weightedIdentityChoice(rng, Object.fromEntries(Object.entries(preferences).filter(([group]) => group !== first)));
  const left = choose(first);
  const right = choose(second);
  // Some heritage vocabulary overlaps survey pools (e.g. Afro-Latino). Keep
  // multiple distinct histories without rerolling or consuming simulation RNG.
  if (right !== left) return [left, right];
  const options = familyHeritageOptions(country, second);
  const alternatives = [...options.local, ...options.diaspora].filter(value => value !== left);
  return [left, rng.pick(alternatives)];
}

export function generateFictionalName(rng) {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function createPlayerIdentity(seed, { birthYear = null } = {}) {
  const baseline = PLAYER_DEMOGRAPHIC_BASELINE;
  const demographicRng = derivedRng(`identity-demographic:${seed}`);
  const surveyCategory = weightedIdentityChoice(demographicRng, baseline.surveyWeights);
  const birthRng = derivedRng(`identity-birth:${seed}`);
  const birthCountry = weightedIdentityChoice(birthRng, birthplaceWeightsForCategory(surveyCategory));
  const namingCohort = namingCohortFor(birthYear);
  const footballUpbringing = birthCountry === "United States" || birthRng.chance(0.8) ? "United States" : birthCountry;
  const heritage = fictionalFamilyHeritage(surveyCategory, seed, birthCountry);
  const { name, namingContext } = generateContextualPlayerName(seed, { heritage, footballUpbringing, birthYear });
  return {
    version: baseline.version,
    countryModelVersion: COUNTRY_IDENTITY_MODEL_VERSION,
    familyHistoryModelVersion: FAMILY_HISTORY_MODEL_VERSION,
    birthYear: Number.isInteger(birthYear) ? birthYear : null,
    namingCohort,
    namingContext,
    source: "fictional-generated",
    surveyCategory,
    birthCountry,
    // Upbringing and heritage are separate; never assert a sampled birthplace
    // is also citizenship, ancestry or international-pathway eligibility.
    footballUpbringing,
    heritage,
    name
  };
}

export const HAIRSTYLES = Object.freeze([
  "buzz", "fade", "crew", "short-curls", "coils", "locs", "braids",
  "waves", "side-part", "swept", "long", "shaved", "receding", "afro"
]);
export const HAIR_COLORS = Object.freeze(["#151210", "#29201b", "#473126", "#66472e", "#8b623f", "#b58c58", "#d2b984", "#713629"]);
export const EYE_COLORS = Object.freeze(["#34251d", "#57412c", "#746047", "#67784f", "#59818b", "#587496", "#777c83"]);
// Configurable art priors, not observed NFL phenotype frequencies. Brown eyes
// and dark hair are common, while every palette entry retains positive support.
export const PIGMENTATION_ART_PRIORS = Object.freeze({
  hair: Object.freeze([.23, .21, .19, .12, .10, .07, .04, .04]),
  eyes: Object.freeze([.42, .20, .12, .08, .05, .09, .04])
});
function weightedPalette(rng, palette, weights, complexion, lightFrom) {
  const mapped = Object.fromEntries(palette.map((color, index) => [color, weights[index] * (index >= lightFrom ? 1 - .55 * complexion : 1)]));
  return weightedIdentityChoice(rng, mapped);
}

// Art direction with overlapping support, not measured phenotype probabilities.
export function playerAppearance(player) {
  // Frozen v2 decoder: don't change its channel names, ranges or palette
  // weights when adding another version. Stored recipes preserve old faces.
  const { seed, version, complexionBand: band } = resolveAppearanceRecipe(player);
  const channel = key => derivedRng(`appearance:${seed}:${key}`);
  const complexion = channel("complexion").float(...band);
  const hairColor = weightedPalette(channel("hair-color"), HAIR_COLORS, PIGMENTATION_ART_PRIORS.hair, complexion, 4);
  const appearance = {
    version: "portrait-identity-v2",
    complexion,
    hairstyle: channel("style").pick(HAIRSTYLES),
    hairColor,
    naturalHairColor: hairColor,
    dyedHairColor: channel("hair-dye").chance(.05) ? channel("dye-color").pick(HAIR_COLORS) : null,
    hairTexture: channel("texture").pick(["straight", "wavy", "curly", "coily"]),
    eyeColor: weightedPalette(channel("eye-color"), EYE_COLORS, PIGMENTATION_ART_PRIORS.eyes, complexion, 3),
    hairLength: channel("hair-length").float(.8, 1.2),
    hairDensity: channel("hair-density").float(.65, 1),
    hairline: channel("hairline").float(0, 1),
    grayOnsetAge: channel("gray-onset").int(32, 48),
    freckles: channel("freckles").chance(.17),
    mole: channel("mole").chance(.12) ? { x: channel("mole-x").float(122, 198), y: channel("mole-y").float(155, 195) } : null,
    facialHair: channel("facial-hair").pick(["clean", "stubble", "mustache", "goatee", "short-beard", "full-beard"]),
    faceWidth: channel("face-width").float(0.88, 1.10),
    jawWidth: channel("jaw").float(0.80, 1.16),
    faceLength: channel("face-length").float(0.92, 1.09),
    eyeSpacing: channel("eye-spacing").float(0.88, 1.10),
    noseWidth: channel("nose-width").float(0.80, 1.20),
    lipFullness: channel("lips").float(0.75, 1.25),
    browWeight: channel("brows").float(0.75, 1.35),
    earSize: channel("ears").float(0.85, 1.15),
    expression: channel("expression").pick(["focused", "calm", "confident", "warm"]),
    blinkDelay: channel("blink").float(0, 7),
    buildVariation: channel("build").float(-0.12, 0.12)
  };
  if (version === "portrait-identity-v3") {
    // Artistic bounded variation, not race-specific facial templates. New
    // features use separate channels; the retained v2 decoder stays unchanged.
    Object.assign(appearance, {
      version,
      naturalHairTexture: appearance.hairTexture,
      hairstyle: channel("style-v3").pick(HAIRSTYLES.filter(style => HAIR_STYLE_RULES[style].textures.includes(appearance.hairTexture))),
      skinUndertone: channel("undertone-v3").float(-1, 1),
      eyeAperture: channel("eye-aperture-v3").float(.7, 1.2),
      eyeTilt: channel("eye-tilt-v3").float(-2, 2),
      eyelidCrease: channel("eye-crease-v3").float(.2, 1),
      browArch: channel("brow-arch-v3").float(.7, 1.35),
      browAngle: channel("brow-angle-v3").float(-2, 2),
      noseBridge: channel("nose-bridge-v3").float(.7, 1.3),
      noseTip: channel("nose-tip-v3").float(.75, 1.25),
      noseLength: channel("nose-length-v3").float(.90, 1.12),
      cheekbone: channel("cheekbone-v3").float(.75, 1.25),
      cheekFullness: channel("cheek-fullness-v3").float(.75, 1.25),
      chinWidth: channel("chin-width-v3").float(.8, 1.2),
      chinLength: channel("chin-length-v3").float(.85, 1.12),
      lipWidth: channel("lip-width-v3").float(.85, 1.15),
      lipCurve: channel("lip-curve-v3").float(-1, 1),
      earShape: channel("ear-shape-v3").float(.8, 1.2),
      facialAsymmetry: channel("asymmetry-v3").float(-1, 1)
    });
  }
  const detail = resolveAppearanceDetailRecipe(player);
  if (detail) {
    // Independent artistic channels, never simulation RNG or inferred genes.
    const draw = key => derivedRng(`appearance-detail:${detail.seed}:${key}`);
    Object.assign(appearance, {
      detailVersion: detail.version,
      hairCurvature: draw("curvature").float(.65, 1.45),
      hairWaveScale: draw("wave-scale").float(.65, 1.5),
      hairStrandWidth: draw("strand-width").float(.65, 1.5),
      irisShade: draw("iris-shade").float(-.25, .25),
      irisInnerMix: draw("iris-inner").float(0, .65),
      irisPattern: draw("iris-pattern").float(.1, 1)
    });
  }
  const arrangement = resolveHairArrangementRecipe(player);
  if (arrangement) {
    const draw = key => derivedRng(`hair-arrangement:${arrangement.seed}:${key}`);
    Object.assign(appearance, { hairArrangementVersion: arrangement.version,
      hairPart: draw("part").float(.2, .8), hairStrandVariation: draw("strand-variation").float(.15, .5) });
  }
  const fineFace = resolveFineFaceRecipe(player);
  if (fineFace) {
    const draw = key => derivedRng(`fine-face:${fineFace.seed}:${key}`);
    Object.assign(appearance, { fineFaceVersion: fineFace.version,
      nasalRootWidth: draw("nasal-root").float(.75, 1.25),
      nasalWingWidth: draw("nasal-wing").float(.75, 1.25),
      upperLipScale: draw("upper-lip").float(.65, 1.4),
      lowerLipScale: draw("lower-lip").float(.65, 1.4),
      chinProjection: draw("chin-projection").float(-.7, .7),
      foreheadSlope: draw("forehead-slope").float(-.7, .7),
      browRidge: draw("brow-ridge").float(0, 1) });
  }
  const facialPigment = resolveFacialPigmentRecipe(player);
  if (facialPigment) {
    // Correlated artistic pigments with independent residuals, not measured
    // athlete frequencies or genetic inference. Never read gameplay RNG.
    const draw = key => derivedRng(`facial-pigment:${facialPigment.seed}:${key}`);
    Object.assign(appearance, { facialPigmentVersion: facialPigment.version,
      naturalFacialHairColor: blendAppearanceColor(hairColor, draw("beard-warm").chance(.15) ? "#713629" : "#151210", draw("beard-mix").float(0, .4)),
      naturalBrowColor: blendAppearanceColor(hairColor, "#151210", draw("brow-mix").float(0, .45)) });
  }
  const styled = { ...appearance, ...resolvePlayerGrooming(player) };
  if (version === "portrait-identity-v3") {
    const texture = resolveStyledTexture(styled.hairstyle, styled.hairTexture);
    styled.textureTreatment = texture !== styled.naturalHairTexture;
    styled.hairTexture = texture;
  }
  const hairTexture = resolveHairTextureRecipe(player);
  if (hairTexture) {
    // A bounded artistic coordinate, not measured national texture frequency.
    // Its private channel cannot perturb football or other appearance draws.
    const labels = ["straight", "wavy", "curly", "coily"];
    const natural = labels.indexOf(styled.naturalHairTexture || appearance.hairTexture);
    const position = clamp(natural + derivedRng(`hair-texture:${hairTexture.seed}`).float(-.5, .5), 0, 3);
    Object.assign(styled, { hairTextureVersion: hairTexture.version, naturalHairTexturePosition: position,
      hairTexturePosition: styled.hairTexture === (styled.naturalHairTexture || appearance.hairTexture)
        ? position : Math.max(0, labels.indexOf(styled.hairTexture)) });
  }
  return styled;
}

// Physique visualization, not an ability modifier. Mass and height anchor the
// silhouette; strength/athleticism only add bounded muscular-definition cues.
export function playerFrame(player) {
  const safe = (value, fallback, min, max) => value != null && value !== "" && Number.isFinite(Number(value))
    ? clamp(Number(value), min, max) : fallback;
  const extended = ['regional-body-shape-v3','regional-body-shape-v4'].includes(resolveRegionalBodyShapeRecipe(player)?.version);
  const marker = extended ? {bodyMeasurementVersion:EXTENDED_BODY_MEASUREMENT_VERSION} : {};
  const bounds = bodyMeasurementBounds(marker);
  const measurements = resolvePlayerMeasurements(player).values;
  const unsupported = extended ? [['heightInches','height'],['weightLbs','weight']]
    .filter(([key,bound]) => measurements[key] != null && (measurements[key] < bounds[bound][0] || measurements[key] > bounds[bound][1]))
    .map(([measurement,bound]) => ({measurement,observed:measurements[measurement],rendered:null,supportBounds:bounds[bound]})) : [];
  // Unsupported observations stay canonical. Estimates keep head-only
  // portraits usable; full bodies refuse the fit instead of drawing a clamp.
  const height = unsupported.some(row=>row.measurement==='heightInches') ? 74 : safe(extended?measurements.heightInches:player?.heightInches, 74, ...bounds.height);
  const weight = unsupported.some(row=>row.measurement==='weightLbs') ? 225 : safe(extended?measurements.weightLbs:player?.weightLbs, 225, ...bounds.weight);
  const strength = safe(player?.ratings?.strength, 70, 40, 99);
  const individuality = playerAppearance(player).buildVariation;
  const skeleton = estimatePlayerSkeleton(player);
  const reach = safe(measurements.wingspanInches, skeleton.wingspanInches, ...bounds.reach);
  const arm = safe(measurements.armLengthInches,
    measurements.wingspanInches != null ? (reach - skeleton.shoulderSpanInches) / 2 : skeleton.armLengthInches, ...bounds.arm);
  const recordedShoulders = reach - arm * 2;
  const shoulderSpanInches = measurements.wingspanInches != null && measurements.armLengthInches != null
    && recordedShoulders >= 12 && recordedShoulders <= 24 ? recordedShoulders : skeleton.shoulderSpanInches;
  const recordedHandLength = measurements.handLengthInches;
  // Retain unusual observations in the canonical record; only anatomically
  // usable lengths displace the stable legacy visual estimate.
  const handLength = recordedHandLength >= 4 && recordedHandLength <= 12 && recordedHandLength < arm
    ? recordedHandLength : undefined;
  const { anatomy, reconciliation } = resolveRecordedAnatomy(player, resolveIndividualAnatomy(player, height));
  const bodyShape = resolveRegionalBodyShape(player);
  const volume = resolveBodyVolume({ height, weight, shoulderSpan: shoulderSpanInches,
    torsoShare: skeleton.torsoShare, armLength: arm, handLength, individuality, anatomy, bodyShape });
  return {
    ...marker,
    ...(extended ? {measurementFit:{scope:'stature-and-mass',status:unsupported.length?'unsupported':'supported',unsupported,
      authority:'artistic-rendering-support-not-population',estimated:['heightInches','weightLbs'].filter(key=>measurements[key]==null)}} : {}),
    heightInches: height, weightLbs: weight,
    ...volume,
    ...(anatomy || {}),
    ...(reconciliation.length ? { measurementReconciliation: reconciliation } : {}),
    shoulderWidth: volume.chestWidthInches * 4,
    neckWidth: volume.neckDiameterInches * 5,
    torsoLength: clamp(65 + (height - 74) * 1.8, 48, 85),
    // Modern static shading is a saved-seed artistic appearance estimate,
    // never measured composition or a strength-rating proxy. Retain the
    // historical decoder for profiles without the regional recipe.
    muscleDefinition: bodyShape?.surfaceDefinition ?? clamp((strength - 40) / 59 * .8 + individuality, 0, 1),
    shoulderSpanInches,
    torsoShare: skeleton.torsoShare,
    armLengthInches: arm,
    wingspanInches: measurements.wingspanInches != null ? reach : skeleton.shoulderSpanInches + arm * 2,
    handSizeInches: safe(measurements.handSizeInches, skeleton.handSizeInches, ...bounds.handSpan),
    ...(handLength === undefined ? {} : { handLengthInches: handLength })
  };
}
