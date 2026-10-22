import {
  CONTRACT_RULES,
  DEVELOPMENT_TRAITS,
  FIELDABLE_DEPTH,
  PLAYER_ATTRIBUTE_KEYS,
  PRACTICE_SQUAD_TEMPLATE,
  ROSTER_TEMPLATE
} from "../config.js";
import { calculatePositionOverall, ensureCoverageDepthRatings, ensureQuarterbackDepthRatings, positionRatingWeights } from "./ratings.js";
import { buildContract } from "./contracts.js";
import { minimumSalaryForSeason } from "../data/nflSalaryMinimum.js";
import { clamp, derivedRng } from "../utils/rng.js";
import { FOOTBALL_STAT_SCHEMA } from "../sport/football/statSchema.js";
import { TALENT_DISTRIBUTION, STARTER_COUNTS, drawPlayerTalent, generateTalentAttributes } from "./talentDistribution.js";
import { createPlayerIdentity, generateFictionalName, assignPlayerFamily } from "./playerIdentity.js";
import { generatePlayerMeasurements } from "./playerMeasurements.js";
import { ensurePlayerVisualIdentity } from "./playerVisualIdentity.js";
import { generatedPlayerService } from './playerService.js';
import { buildPracticeContract } from './practiceContracts.js';

const POSITION_ATTRIBUTE_BIASES = {
  QB: { throwPower: 18, throwAccuracy: 16, throwAccuracyShort: 18, throwAccuracyMedium: 16, throwAccuracyDeep: 12, throwOnRun: 10, awareness: 10, playRecognition: 8 },
  RB: { speed: 12, acceleration: 12, agility: 12, carrying: 12, breakTackle: 10, trucking: 8, elusiveness: 10, catching: 6 },
  WR: { speed: 14, acceleration: 14, agility: 10, catching: 12, routeRunning: 12, release: 10, spectacularCatch: 8, jumping: 8 },
  TE: { catching: 10, strength: 8, routeRunning: 8, release: 6, spectacularCatch: 6, runBlocking: 10, passBlocking: 6 },
  OL: { passBlocking: 18, runBlocking: 18, strength: 12, awareness: 8 },
  DL: { tackle: 12, strength: 14, passRush: 14, blockShedding: 12, pursuit: 8, playRecognition: 8 },
  LB: { tackle: 12, coverage: 10, pursuit: 12, hitPower: 10, blockShedding: 8, playRecognition: 10, speed: 8 },
  DB: { coverage: 10, manCoverage: 14, zoneCoverage: 14, speed: 12, acceleration: 10, playRecognition: 8, jumping: 8 },
  K: { throwPower: 18, discipline: 10, awareness: 8 },
  P: { throwPower: 16, discipline: 10, awareness: 8 }
};

const DEV_TRAIT_WEIGHTS = {
  SUPERSTAR: 0.11,
  HIDDEN: 0.18,
  NORMAL: 0.58,
  BUST: 0.13
};

const POSITION_ARCHETYPES = {
  QB: ["Pocket", "FieldGeneral", "Scrambler"],
  RB: ["Power", "Elusive", "Receiving"],
  WR: ["DeepThreat", "RouteRunner", "Possession"],
  TE: ["Blocking", "Vertical", "Balanced"],
  OL: ["PassProtect", "PowerRun", "Balanced"],
  DL: ["PassRush", "RunStop", "Hybrid"],
  LB: ["Coverage", "Mike", "Edge"],
  DB: ["Man", "Zone", "BallHawk"],
  K: ["PowerLeg", "Accurate"],
  P: ["Directional", "Power"]
};

const POSITION_BODY_PROFILES = {
  QB: { height: [72, 79], weight: [205, 245] },
  RB: { height: [68, 74], weight: [195, 235] },
  WR: { height: [69, 78], weight: [180, 230] },
  TE: { height: [75, 81], weight: [235, 275] },
  OL: { height: [75, 81], weight: [295, 365] },
  DL: { height: [74, 80], weight: [255, 330] },
  LB: { height: [72, 78], weight: [220, 270] },
  DB: { height: [69, 76], weight: [180, 220] },
  K: { height: [69, 76], weight: [170, 220] },
  P: { height: [71, 78], weight: [185, 235] }
};

// The stat shape is the sport's, declared in its stat schema. playerFactory is
// still football's player factory, so it reads the football schema directly;
// it moves behind getSportRules(sportId).stats when player creation does.
export function createZeroedSeasonStats() {
  return FOOTBALL_STAT_SCHEMA.zeroedSeasonStats();
}

export function createZeroedCareerStats() {
  return FOOTBALL_STAT_SCHEMA.zeroedCareerStats();
}

function randomName(rng) {
  return generateFictionalName(rng);
}

/**
 * The league's one name source.
 *
 * Exported so coaching staff draw from the same pool as players instead of
 * carrying their role label as a name — see `buildStaffProfile`. Any RNG-shaped
 * source works, including `derivedRng`, so a caller that must not touch the
 * session stream can still get a stable, distinct name.
 */
export function generatePersonName(rng) {
  return randomName(rng);
}

function randomTrait(rng) {
  return rng.weightedPick(DEV_TRAIT_WEIGHTS);
}

/** Age- and trait-shaped growth room on the attribute-derived overall scale.
 * Raw prospects retain large upside; proximity to 99 tapers only elite players.
 * Generation version intentionally changes seeded content for the overhaul. */
export const POTENTIAL_HEADROOM_PROFILE = Object.freeze({
  version: "attribute-readiness-headroom-v2",
  /** Rating points of growth a 23-year-old far from the ceiling may be drawn, by trait. */
  headroomByTrait: Object.freeze({
    SUPERSTAR: Object.freeze([14, 35]),
    HIDDEN: Object.freeze([8, 30]),
    BUST: Object.freeze([0, 6]),
    NORMAL: Object.freeze([2, 22])
  }),
  /** Headroom is whole at or below this age... */
  fullHeadroomAge: 23,
  /** ...and gone by this one: a veteran's ceiling is the player he already is. */
  closedHeadroomAge: 35,
  /** Full headroom below 79; progressively less as overall approaches 99. */
  ceilingTaperSpan: 20,
  // Fictional design coefficients, not an empirical prediction of careers.
  readinessSpan: 120,
  readinessMin: .8,
  readinessMax: 1.2
});

const POTENTIAL_CAPACITY_KEYS = new Set([...PLAYER_ATTRIBUTE_KEYS.physical, "throwPower"]);

/** A raw athlete with physical capacity ahead of position-relevant execution
 * retains modestly more growth room than an equally rated polished player.
 * Only actual grading keys participate, using the same grading weights. No
 * country, appearance, size, name or cosmetic RNG enters this calculation.
 * Missing/corrupt observations withhold the modifier instead of inventing skill. */
export function resolvePotentialReadiness(position, ratings = {}) {
  if (!ratings || typeof ratings !== "object" || Array.isArray(ratings)) return 1;
  const weights = positionRatingWeights(position);
  const groups = { physical: { score: 0, weight: 0 }, execution: { score: 0, weight: 0 } };
  for (const [key, weight] of Object.entries(weights)) {
    const value = ratings[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 40 || value > 99) return 1;
    const group = groups[POTENTIAL_CAPACITY_KEYS.has(key) ? "physical" : "execution"];
    group.score += value * weight;
    group.weight += weight;
  }
  if (!groups.physical.weight || !groups.execution.weight) return 1;
  const capacity = groups.physical.score / groups.physical.weight;
  const execution = groups.execution.score / groups.execution.weight;
  const profile = POTENTIAL_HEADROOM_PROFILE;
  return clamp(1 + (capacity - execution) / profile.readinessSpan, profile.readinessMin, profile.readinessMax);
}

/** Individualized trait draw; creation content follows this model version. */
function drawPotentialHeadroom(trait, rng) {
  const [min, max] = POTENTIAL_HEADROOM_PROFILE.headroomByTrait[trait] || POTENTIAL_HEADROOM_PROFILE.headroomByTrait.NORMAL;
  return rng.int(min, max);
}

/**
 * A player's potential on the scale his overall is measured on: his own
 * overall plus the drawn headroom, closed by age and by proximity to 99.
 * Never below his overall, so no player is generated past his own ceiling.
 */
export function resolvePotential({ overall, age, headroom, readiness = 1 }) {
  const profile = POTENTIAL_HEADROOM_PROFILE;
  // Validated here, where the value is written: a NaN potential would sail
  // through every downstream `|| overall` and silently stop development applying.
  const values = { overall: Number(overall), age: Number(age), headroom: Number(headroom), readiness: Number(readiness) };
  for (const [label, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) throw new TypeError(`resolvePotential: ${label} must be finite, received ${value}`);
  }
  const ageRoom = clamp(
    (profile.closedHeadroomAge - values.age) / (profile.closedHeadroomAge - profile.fullHeadroomAge),
    0,
    1
  );
  const ceilingRoom = clamp((99 - values.overall) / profile.ceilingTaperSpan, 0, 1);
  const individualizedRoom = Math.max(0, values.headroom)
    * clamp(values.readiness, profile.readinessMin, profile.readinessMax);
  return clamp(values.overall + Math.round(individualizedRoom * ageRoom * ceilingRoom), values.overall, 99);
}

function randomAttributeBase(position, rng, talent, archetype) {
  const allKeys = [
    ...PLAYER_ATTRIBUTE_KEYS.physical,
    ...PLAYER_ATTRIBUTE_KEYS.skill,
    ...PLAYER_ATTRIBUTE_KEYS.mental
  ];
  const bias = POSITION_ATTRIBUTE_BIASES[position] || {};
  return generateTalentAttributes({ position, keys: allKeys, bias, archetype, talent, rng });
}

function randomArchetype(position, rng) {
  const list = POSITION_ARCHETYPES[position] || ["Balanced"];
  return rng.pick(list);
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function deriveRangeValue(hash, min, max, offset = 0) {
  const span = Math.max(1, max - min + 1);
  return min + ((hash + offset) % span);
}

function physicalFrameFromSeed(position, seed) {
  const profile = POSITION_BODY_PROFILES[position] || POSITION_BODY_PROFILES.QB;
  const heightRng = derivedRng(`player-height:${seed}`);
  const massRng = derivedRng(`player-mass:${seed}`);
  // Triangular draws put most bodies near the position's centre rather than
  // distributing every extreme uniformly. Height and mass are related but
  // independently varied; they no longer share a modulo hash residue.
  const heightUnit = (heightRng.next() + heightRng.next()) / 2;
  const massUnit = clamp((massRng.next() + massRng.next()) / 2 + (heightUnit - 0.5) * 0.3, 0, 1);
  return {
    heightInches: Math.round(profile.height[0] + heightUnit * (profile.height[1] - profile.height[0])),
    weightLbs: Math.round(profile.weight[0] + massUnit * (profile.weight[1] - profile.weight[0]))
  };
}

export function jerseyNumberForPlayer(position, seed) {
  const hash = hashString(seed);
  const pickFromRange = (min, max, offset = 0) => deriveRangeValue(hash, min, max, offset);
  const pickFromRanges = (ranges) => {
    const range = ranges[(hash >>> 3) % ranges.length];
    return pickFromRange(range[0], range[1], 11);
  };
  if (position === "QB") return pickFromRange(1, 19);
  if (position === "RB") return pickFromRanges([[0, 19], [20, 49]]);
  if (position === "WR") return pickFromRanges([[0, 19], [80, 89]]);
  if (position === "TE") return pickFromRanges([[40, 49], [80, 89]]);
  if (position === "OL") return pickFromRange(50, 79);
  if (position === "DL") return pickFromRanges([[50, 79], [90, 99]]);
  if (position === "LB") return pickFromRanges([[0, 59], [90, 99]]);
  if (position === "DB") return pickFromRange(0, 49);
  if (position === "K" || position === "P") return pickFromRange(1, 19);
  return pickFromRange(0, 99);
}

export function createSyntheticPlayer({ teamId, position, year, rng, draft = false, initialPractice = false, talentBand = null, familyAnchor = null }) {
  const devTrait = randomTrait(rng);
  const headroom = drawPotentialHeadroom(devTrait, rng);
  const archetype = randomArchetype(position, rng);
  const talent = drawPlayerTalent(rng, { draft, band: talentBand });
  const ratings = randomAttributeBase(position, rng, talent, archetype);
  if (position === "QB") ensureQuarterbackDepthRatings(ratings);
  if (position === "LB" || position === "DB") ensureCoverageDepthRatings(ratings);
  const overall = calculatePositionOverall(position, ratings);
  const age = draft ? rng.int(21, 23) : initialPractice ? rng.int(21, 25) : rng.int(22, 33);
  // A fictional entering practice cohort, not an observed NFL age/service fit.
  // Choose before identity/headroom so age, birth year and development agree.
  const experience = draft || initialPractice ? 0 : Math.max(0, age - 21);
  const readiness = resolvePotentialReadiness(position, ratings);
  const adjustedHeadroom = Math.min(POTENTIAL_HEADROOM_PROFILE.headroomByTrait[devTrait][1], headroom * readiness);
  const potential = resolvePotential({ overall, age, headroom: adjustedHeadroom });
  const id = `P${year}-${teamId}-${position}-${Math.floor(rng.next() * 1e8)}`;
  const frame = physicalFrameFromSeed(position, id);
  const identity = createPlayerIdentity(id, { birthYear: year - age });

  const player = ensurePlayerVisualIdentity({
    id,
    name: identity.name,
    position,
    teamId,
    age,
    heightInches: frame.heightInches,
    weightLbs: frame.weightLbs,
    measurements: generatePlayerMeasurements({ id, ...frame, profile: { faceSeed: `face-${hashString(id)}` } }),
    measurementProvenance: {
      heightInches: { kind: "fictional-generated", model: "position-frame-v1" },
      weightLbs: { kind: "fictional-generated", model: "position-frame-v1" }
    },
    jerseyNumber: jerseyNumberForPlayer(position, id),
    experience,
    ...generatedPlayerService(experience),
    developmentTrait: DEVELOPMENT_TRAITS[devTrait].label,
    developmentKey: devTrait,
    archetype,
    potential,
    developmentOrigin: { model: POTENTIAL_HEADROOM_PROFILE.version, headroomDraw: headroom, readiness, adjustedHeadroom },
    ratings,
    overall,
    contract: buildContract({
      overall,
      years: rng.int(CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears),
      year, position, creditedSeasons: experience,
      rng
    }),
    status: "active",
    rosterSlot: "active",
    depthChartOrder: 99,
    morale: rng.int(55, 86),
    motivation: rng.int(54, 88),
    schemeFit: rng.int(58, 86),
    chemistryImpact: rng.int(-6, 8),
    reinjuryRisk: 0,
    injury: null,
    suspensionWeeks: 0,
    retirementOverride: null,
    retiredYear: null,
    seasonsPlayed: 0,
    profile: {
      source: draft ? "generated-draft" : "generated-roster",
      pfrId: null,
      college: null,
      identity,
      faceSeed: `face-${hashString(id)}`
    },
    seasonStats: {},
    careerStats: createZeroedCareerStats()
  }, { newPlayer: true });
  return familyAnchor ? assignPlayerFamily(player, familyAnchor) : player;
}

/** A one-year deal at the league minimum - what the back of a roster is paid. */
function minimumDeal(player, rng, year) {
  return buildContract({
    overall: player.overall,
    years: 1,
    salary: minimumSalaryForSeason(year, player.experience).salary,
    year, position: player.position, creditedSeasons: player.experience,
    rng
  });
}

/**
 * A club's whole roster at generation: the declared active 53 **and** the
 * declared 16-man practice squad.
 *
 * S104 — this built only `ROSTER_TEMPLATE`, and before S104 that template
 * summed to 49. Every generated league therefore began 20 players per club
 * short of the roster the rules require it to carry, and closed the gap over
 * the following decade. See the note on `ROSTER_TEMPLATE` for why that made
 * both of this project's candidate gated populations invalid drift statistics.
 *
 * Reserve and provisional practice candidates share a talent intake prior.
 * Practice candidates retain their entering age/service and weekly terms; the
 * final slot is decided by
 * `assignFieldableActiveRoster` at the first normalize, exactly as it is for
 * every subsequent season, so generation cannot install a roster shape the
 * running engine would not have produced.
 */
export function buildSyntheticTeamRoster(teamId, year, rng) {
  const roster = [];
  for (const [position, count] of Object.entries(ROSTER_TEMPLATE)) {
    for (let i = 0; i < count; i += 1) {
      const talentBand = i < STARTER_COUNTS[position]
        ? (rng.chance(0.04) ? [91, 97] : TALENT_DISTRIBUTION.starter)
        : i < (FIELDABLE_DEPTH[position]?.min || 1)
          ? TALENT_DISTRIBUTION.rotation : TALENT_DISTRIBUTION.reserve;
      roster.push(createSyntheticPlayer({ teamId, position, year, rng, talentBand }));
    }
  }

  // Initial contracts reflect actual starting roles, not the minimum depth
  // required to field a roster. That minimum includes several backups per
  // position; pricing all of them as established starters makes broad-talent
  // leagues exceed the cap before kickoff. Reserve contracts represent recent
  // minimum signings. Key backups get bounded bridge deals. Existing saves and
  // the free-agent market curve remain authoritative and unchanged.
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    const room = roster
      .filter((player) => player.position === position)
      .sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0));
    for (const player of room.slice(0, STARTER_COUNTS[position])) {
      // Generation models an existing mix of rookie and veteran deals. Young
      // starters have not all signed their second contract, and specialists
      // do not receive the generic elite-field-player salary. These are game
      // initialization assumptions, not claimed observed NFL salary percentiles.
      const rookie = player.experience < 4;
      const salaryCeiling = position === "K" || position === "P" ? 5_000_000 : rookie ? 7_500_000 : Infinity;
      if (player.contract.salary > salaryCeiling) player.contract = buildContract({
        overall: player.overall,
        years: rookie ? Math.max(1, 4 - player.experience) : player.contract.yearsRemaining,
        salary: salaryCeiling,
        year, position, creditedSeasons: player.experience,
        rng
      });
    }
    for (let index = STARTER_COUNTS[position]; index < room.length; index += 1) {
      const player = room[index];
      player.contract = index >= band.min ? minimumDeal(player, rng, year) : buildContract({
        overall: player.overall,
        years: rng.int(1, 2),
        salary: Math.max(CONTRACT_RULES.minSalary, Math.min(4_000_000, Math.round(player.contract.salary * 0.4))),
        year, position, creditedSeasons: player.experience,
        rng
      });
    }
  }
  for (const [position, count] of Object.entries(PRACTICE_SQUAD_TEMPLATE)) {
    for (let i = 0; i < count; i += 1) {
      const player = createSyntheticPlayer({ teamId, position, year, rng, initialPractice: true, talentBand: TALENT_DISTRIBUTION.practice });
      player.rosterSlot = "practice";
      // Practice-squad money, not veteran money. The first draft of this gave
      // the sixteen new players ordinary market contracts and put **every one
      // of the 32 clubs $50M over a $255M cap before a snap was played** -
      // median space -50.1M, worst -84.7M. A generated league that is illegal
      // at kickoff is the exact fiction S89 built this module to remove, and it
      // would have been laundered by the compliance pass cutting twenty players
      // per club in the first offseason. Weekly terms reserve the remaining
      // regular-season compensation and carry no bonus or guarantees.
      player.contract = buildPracticeContract(player, {year});
      roster.push(player);
    }
  }
  return roster;
}

/**
 * The draft's position mix, weighted by what a roster actually needs.
 *
 * S104 — this is the engine that drove the league's position composition apart,
 * and it is worth stating plainly because every measured direction falls out of
 * one line. `createDraftClass` sampled `rng.pick(positions)` over the nine
 * drafted positions, so **every position received 11.1% of every draft class**
 * — 256 prospects a year, forever — while a club's demand for them is
 * `ROSTER_TEMPLATE`-shaped and ranges from 1.9% (kicker) to 18.9% (offensive
 * line). Intake that does not match demand does not equilibrate; it accumulates
 * on one side and starves the other, monotonically, for as long as the league
 * runs.
 *
 * Measured over ten seasons on the canonical seed 20260306, against the
 * uniform draw's predictions:
 *
 *   position   demand   uniform intake   rostered population, season 0 -> 10
 *   QB           5.7%       11.1%          64 -> 211   (+230%)
 *   K/P          3.8%       11.1%          64 -> 172   (+169%)
 *   OL          17.0%       11.1%         288 -> 314   (+9%)
 *   Front Seven 28.3%       22.2%         480 -> 559   (+16%)
 *
 * Over-supplied rooms grow fastest, under-supplied rooms slowest, and the
 * ordering is exact. It also explains why the surplus concentrates in the
 * *highest-rated* rooms: quarterbacks and specialists rate several points above
 * a league mean by construction, so an over-supplied quarterback room is also a
 * disproportionately elite one — 11.3% of quarterbacks at 90+ overall by season
 * ten, against 1.1% of the front seven.
 *
 * Weighting the draw by the declared template makes intake proportional to
 * demand. Punters are included: excluding them from the draft while every club
 * needs one is why the only route to a punter was the emergency-depth signing
 * path, which manufactures a player out of nothing.
 *
 * This is a weighted pick over a fixed table, not a new RNG stream — it draws
 * exactly one value from `rng` per prospect, as the uniform pick did, so a
 * seeded league's RNG position is unchanged in count. Seeded *content* does
 * change, necessarily: that is the defect being fixed.
 */
export const DRAFT_POSITION_WEIGHTS = Object.freeze(
  Object.fromEntries(Object.entries(ROSTER_TEMPLATE).map(([position, count]) => [position, count]))
);

export function pickDraftPosition(rng) {
  // `weightedPick` already exists on the RNG and already draws exactly one
  // `float`, as the uniform `pick` it replaces drew exactly one `int`. Writing
  // the loop again here would be the second declaration of one quantity, which
  // is the drift this project has paid for repeatedly.
  return rng.weightedPick(DRAFT_POSITION_WEIGHTS);
}

export function createDraftClass({ size = 256, year, rng, familyAnchors = [] }) {
  const classPlayers = [];
  const familyCandidates=new Map();
  const ageGap=(p,prospectAge)=>Number.isInteger(p.profile?.identity?.birthYear)
    ? year-prospectAge-p.profile.identity.birthYear
    : p.status==='retired'||p.retiredYear!=null ? NaN : p.age-prospectAge;
  for (let i = 0; i < size; i += 1) {
    const position = pickDraftPosition(rng);
    const prospect = createSyntheticPlayer({
      teamId: "FA",
      position,
      year,
      rng,
      draft: true
    });
    prospect.contract = { salary: 0, yearsRemaining: 0, capHit: 0 };
    prospect.profile.source = "draft-prospect";
    // A small fictional legacy cohort. This private channel never consumes
    // football RNG, selects talent or changes a prospect's measured body.
    const kinRng = derivedRng(`draft-family:${prospect.id}`);
    if(!familyCandidates.has(prospect.age))familyCandidates.set(prospect.age,familyAnchors.filter(p=>{
      if(!p?.profile?.identity)return false;const gap=ageGap(p,prospect.age);
      return(gap>=2&&gap<=12)||(gap>=18&&gap<=45);
    }));
    const anchors=familyCandidates.get(prospect.age);
    if (anchors.length && kinRng.chance(.035)) {
      const anchor = kinRng.pick(anchors);
      assignPlayerFamily(prospect, anchor);
      const relation = ageGap(anchor,prospect.age) >= 18 ? 'son' : 'brother';
      prospect.profile.familyRelationship = { anchorId:anchor.id, anchorName:anchor.name, relation };
      const surname = String(anchor.name || '').trim().split(/\s+/).slice(1).join(' ');
      if (surname) prospect.name = `${prospect.name.split(' ')[0]} ${surname}`;
      prospect.profile.identity.name = prospect.name;
    }
    classPlayers.push(prospect);
  }
  return classPlayers.sort((a, b) => b.potential - a.potential);
}

// createStats lets the StatBook build the bucket from its league's stat schema.
export function ensureSeasonStatBucket(player, year, createStats = createZeroedSeasonStats) {
  if (!player.seasonStats[year]) player.seasonStats[year] = createStats();
  return player.seasonStats[year];
}

export function mergeStats(into, add) {
  for (const [key, value] of Object.entries(add)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!into[key]) into[key] = {};
      mergeStats(into[key], value);
    } else if (typeof value === "number") {
      if (key === "long") {
        into[key] = Math.max(into[key] || 0, value);
      } else {
        into[key] = (into[key] || 0) + value;
      }
    }
  }
  return into;
}
