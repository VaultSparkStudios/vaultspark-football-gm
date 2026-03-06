import {
  CONTRACT_RULES,
  DEVELOPMENT_TRAITS,
  PLAYER_ATTRIBUTE_KEYS,
  ROSTER_TEMPLATE
} from "../config.js";
import { calculatePositionOverall } from "./ratings.js";
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
  QB: { throwPower: 18, throwAccuracy: 18, awareness: 10, playRecognition: 8 },
  RB: { speed: 12, acceleration: 12, agility: 12, runBlocking: 6, catching: 6 },
  WR: { speed: 14, acceleration: 14, agility: 10, catching: 12 },
  TE: { catching: 10, strength: 8, runBlocking: 10, passBlocking: 6 },
  OL: { passBlocking: 18, runBlocking: 18, strength: 12, awareness: 8 },
  DL: { tackle: 16, strength: 14, playRecognition: 8 },
  LB: { tackle: 14, coverage: 12, playRecognition: 10, speed: 8 },
  DB: { coverage: 18, speed: 12, acceleration: 10, playRecognition: 8 },
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

export function createSyntheticPlayer({ teamId, position, year, rng, draft = false }) {
  const devTrait = randomTrait(rng);
  const potential = randomPotential(devTrait, rng);
  const ratings = randomAttributeBase(position, rng);
  const overall = calculatePositionOverall(position, ratings);
  const age = draft ? rng.int(21, 23) : rng.int(22, 33);

  return {
    id: `P${year}-${teamId}-${position}-${Math.floor(rng.next() * 1e8)}`,
    name: randomName(rng),
    position,
    teamId,
    age,
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
      maxSalary: 19_500_000,
      rng
    }),
    status: "active",
    rosterSlot: "active",
    depthChartOrder: 99,
    morale: rng.int(55, 86),
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
      college: null
    },
    seasonStats: {},
    careerStats: createZeroedCareerStats()
  };
}

export function buildSyntheticTeamRoster(teamId, year, rng) {
  const roster = [];
  for (const [position, count] of Object.entries(ROSTER_TEMPLATE)) {
    for (let i = 0; i < count; i += 1) {
      roster.push(createSyntheticPlayer({ teamId, position, year, rng }));
    }
  }
  return roster;
}

export function createDraftClass({ size = 256, year, rng }) {
  const positions = Object.keys(ROSTER_TEMPLATE).filter((p) => p !== "P");
  const classPlayers = [];
  for (let i = 0; i < size; i += 1) {
    const position = rng.pick(positions);
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
