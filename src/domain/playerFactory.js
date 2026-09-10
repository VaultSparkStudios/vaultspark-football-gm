import {
  CONTRACT_RULES,
  DEVELOPMENT_TRAITS,
  FIELDABLE_DEPTH,
  PLAYER_ATTRIBUTE_KEYS,
  PRACTICE_SQUAD_TEMPLATE,
  ROSTER_TEMPLATE
} from "../config.js";
import { calculatePositionOverall, ensureCoverageDepthRatings, ensureQuarterbackDepthRatings } from "./ratings.js";
import { buildContract } from "./contracts.js";
import { clamp } from "../utils/rng.js";

const FIRST_NAMES = [
  "James",
  "Michael",
  "William",
  "David",
  "John",
  "Chris",
  "Aiden",
  "Malik",
  "Devin",
  "Tyler",
  "Jordan",
  "Noah",
  "Liam",
  "Jaxon",
  "Caleb",
  "Ethan"
];
const LAST_NAMES = [
  "Johnson",
  "Smith",
  "Brown",
  "Williams",
  "Jones",
  "Davis",
  "Taylor",
  "Wilson",
  "Moore",
  "Anderson",
  "Clark",
  "Thomas",
  "White",
  "Harris",
  "Walker",
  "Young"
];

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

export function createZeroedSeasonStats() {
  return {
    games: 0,
    gamesStarted: 0,
    snaps: {
      offense: 0,
      defense: 0,
      special: 0,
      passBlock: 0,
      runBlock: 0
    },
    passing: {
      cmp: 0,
      att: 0,
      yards: 0,
      td: 0,
      int: 0,
      sacks: 0,
      sackYards: 0,
      firstDowns: 0,
      long: 0
    },
    rushing: { att: 0, yards: 0, td: 0, long: 0, fumbles: 0, firstDowns: 0, brokenTackles: 0 },
    receiving: { targets: 0, rec: 0, yards: 0, td: 0, long: 0, drops: 0, firstDowns: 0, yac: 0 },
    defense: {
      tackles: 0,
      solo: 0,
      ast: 0,
      sacks: 0,
      qbHits: 0,
      tfl: 0,
      int: 0,
      passDefended: 0,
      ff: 0,
      fr: 0
    },
    blocking: {
      sacksAllowed: 0,
      pressuresAllowed: 0,
      penalties: 0
    },
    kicking: {
      fgm: 0,
      fga: 0,
      xpm: 0,
      xpa: 0,
      long: 0,
      fgM40: 0,
      fgA40: 0,
      fgM50: 0,
      fgA50: 0
    },
    punting: { punts: 0, yards: 0, in20: 0, long: 0, touchbacks: 0, blocks: 0 }
  };
}

export function createZeroedCareerStats() {
  return createZeroedSeasonStats();
}

function randomName(rng) {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
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

function randomPotential(trait, rng) {
  if (trait === "SUPERSTAR") return rng.int(84, 98);
  if (trait === "HIDDEN") return rng.int(76, 94);
  if (trait === "BUST") return rng.int(58, 76);
  return rng.int(68, 90);
}

function randomAttributeBase(position, rng) {
  const attrs = {};
  const allKeys = [
    ...PLAYER_ATTRIBUTE_KEYS.physical,
    ...PLAYER_ATTRIBUTE_KEYS.skill,
    ...PLAYER_ATTRIBUTE_KEYS.mental
  ];
  const bias = POSITION_ATTRIBUTE_BIASES[position] || {};
  for (const key of allKeys) {
    attrs[key] = clamp(rng.int(50, 86) + (bias[key] || 0), 40, 99);
  }
  return attrs;
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
  const hash = hashString(seed);
  return {
    heightInches: deriveRangeValue(hash, profile.height[0], profile.height[1]),
    weightLbs: deriveRangeValue(hash, profile.weight[0], profile.weight[1], 17)
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

export function createSyntheticPlayer({ teamId, position, year, rng, draft = false }) {
  const devTrait = randomTrait(rng);
  const potential = randomPotential(devTrait, rng);
  const ratings = randomAttributeBase(position, rng);
  if (position === "QB") ensureQuarterbackDepthRatings(ratings);
  if (position === "LB" || position === "DB") ensureCoverageDepthRatings(ratings);
  const overall = calculatePositionOverall(position, ratings);
  const age = draft ? rng.int(21, 23) : rng.int(22, 33);
  const id = `P${year}-${teamId}-${position}-${Math.floor(rng.next() * 1e8)}`;
  const frame = physicalFrameFromSeed(position, id);

  return {
    id,
    name: randomName(rng),
    position,
    teamId,
    age,
    heightInches: frame.heightInches,
    weightLbs: frame.weightLbs,
    jerseyNumber: jerseyNumberForPlayer(position, id),
    experience: draft ? 0 : Math.max(0, age - 21),
    developmentTrait: DEVELOPMENT_TRAITS[devTrait].label,
    developmentKey: devTrait,
    archetype: randomArchetype(position, rng),
    potential,
    ratings,
    overall,
    contract: buildContract({
      overall,
      years: rng.int(CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears),
      minSalary: CONTRACT_RULES.minSalary,
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
      faceSeed: `face-${hashString(id)}`
    },
    seasonStats: {},
    careerStats: createZeroedCareerStats()
  };
}

/** A one-year deal at the league minimum - what the back of a roster is paid. */
function minimumDeal(player, rng) {
  return buildContract({
    overall: player.overall,
    years: 1,
    salary: CONTRACT_RULES.minSalary,
    minSalary: CONTRACT_RULES.minSalary,
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
 * Practice players are created from the same factory and then marked, rather
 * than drawn from a separate quality curve: the slot is decided by
 * `assignFieldableActiveRoster` at the first normalize, exactly as it is for
 * every subsequent season, so generation cannot install a roster shape the
 * running engine would not have produced.
 */
export function buildSyntheticTeamRoster(teamId, year, rng) {
  const roster = [];
  for (const [position, count] of Object.entries(ROSTER_TEMPLATE)) {
    for (let i = 0; i < count; i += 1) {
      roster.push(createSyntheticPlayer({ teamId, position, year, rng }));
    }
  }

  // Price the roster by role, not by rating alone.
  //
  // S104 - every generated player was paid `marketSalaryForOverall`, which was
  // survivable while a club held 49 of them and is not at 53. Measured on the
  // canonical seed: the declared 53-man roster left the median club 10.2M under
  // a 255M cap and put **six clubs over it before a snap was played**, against
  // a baseline of zero over-cap clubs and 43.4M median headroom. A generated
  // league that is illegal at kickoff is fiction, and it is the fiction S89
  // built the compliance authority to remove.
  //
  // The answer is not to shave the salary curve until the number fits - that
  // would be moving a threshold until it passed, and the curve is bound to
  // `CONTRACT_RULES.maxSalary` by test. It is that a real roster does not pay
  // 53 market salaries. It pays its starters and key backups, and fills the
  // rest of the roster at the minimum. `FIELDABLE_DEPTH[pos].min` is already
  // this project's declaration of who those players are, so the depth beyond it
  // signs the deal the depth beyond it actually signs.
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    const room = roster
      .filter((player) => player.position === position)
      .sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0));
    for (const player of room.slice(band.min)) {
      player.contract = minimumDeal(player, rng);
    }
  }
  for (const [position, count] of Object.entries(PRACTICE_SQUAD_TEMPLATE)) {
    for (let i = 0; i < count; i += 1) {
      const player = createSyntheticPlayer({ teamId, position, year, rng });
      player.rosterSlot = "practice";
      // Practice-squad money, not veteran money. The first draft of this gave
      // the sixteen new players ordinary market contracts and put **every one
      // of the 32 clubs $50M over a $255M cap before a snap was played** -
      // median space -50.1M, worst -84.7M. A generated league that is illegal
      // at kickoff is the exact fiction S89 built this module to remove, and it
      // would have been laundered by the compliance pass cutting twenty players
      // per club in the first offseason. A practice-squad deal is one year at
      // the minimum, which is both what the sport pays and what keeps the
      // declared cap a real constraint.
      player.contract = minimumDeal(player, rng);
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

export function createDraftClass({ size = 256, year, rng }) {
  const classPlayers = [];
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
    classPlayers.push(prospect);
  }
  return classPlayers.sort((a, b) => b.potential - a.potential);
}

export function ensureSeasonStatBucket(player, year) {
  if (!player.seasonStats[year]) player.seasonStats[year] = createZeroedSeasonStats();
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

