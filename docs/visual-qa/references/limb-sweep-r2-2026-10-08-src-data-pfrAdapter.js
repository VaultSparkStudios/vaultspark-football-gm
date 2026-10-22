import { DEVELOPMENT_TRAITS } from "../config.js";
import { buildContract } from "../domain/contracts.js";
import { calculatePositionOverall, ensureCoverageDepthRatings, ensureQuarterbackDepthRatings } from "../domain/ratings.js";
import { clamp } from "../utils/rng.js";

const POSITION_MAP = {
  FB: "RB",
  HB: "RB",
  LT: "OL",
  LG: "OL",
  C: "OL",
  RG: "OL",
  RT: "OL",
  DE: "DL",
  DT: "DL",
  NT: "DL",
  ILB: "LB",
  OLB: "LB",
  CB: "DB",
  S: "DB",
  SS: "DB",
  FS: "DB",
  PK: "K"
};

function toPosition(rawPos) {
  const pos = (rawPos || "").toUpperCase().trim();
  return POSITION_MAP[pos] || pos || "WR";
}

function deriveRatingsFromPfr(raw, rng) {
  const passYds = Number(raw.pass_yds || raw.passing_yards || 0);
  const passAtt = Number(raw.pass_att || raw.passing_att || raw.pass_attempts || 0);
  const passCmp = Number(raw.pass_cmp || raw.passing_cmp || raw.pass_completions || 0);
  const rushYds = Number(raw.rush_yds || raw.rushing_yards || 0);
  const recYds = Number(raw.rec_yds || raw.receiving_yards || 0);
  const tackles = Number(raw.tackles || 0);
  const sacks = Number(raw.sacks || 0);
  const ints = Number(raw.interceptions || raw.def_int || 0);
  const passesDefended = Number(raw.pass_defended || raw.passes_defended || raw.pd || 0);
  const completionPct = passAtt > 0 ? passCmp / passAtt : 0;
  const yardsPerAttempt = passAtt > 0 ? passYds / passAtt : 0;

  const ratings = {
    speed: clamp(58 + Math.floor(recYds / 220) + rng.int(-6, 6), 45, 98),
    strength: clamp(58 + Math.floor((tackles + sacks * 4) / 26) + rng.int(-6, 6), 45, 98),
    agility: clamp(58 + Math.floor((recYds + rushYds) / 280) + rng.int(-5, 6), 45, 98),
    acceleration: clamp(58 + Math.floor((recYds + rushYds) / 320) + rng.int(-5, 5), 45, 98),
    throwPower: clamp(
      54 + Math.floor(passYds / 230) + Math.round((yardsPerAttempt - 6.4) * 3.5) + rng.int(-5, 7),
      45,
      99
    ),
    throwAccuracy: clamp(
      55 + Math.floor(passYds / 310) + Math.round((completionPct - 0.58) * 95) + rng.int(-5, 6),
      45,
      99
    ),
    throwAccuracyShort: clamp(
      60 + Math.floor(passYds / 400) + Math.round((completionPct - 0.63) * 110) + rng.int(-4, 5),
      45,
      99
    ),
    throwAccuracyMedium: clamp(
      56 +
        Math.floor(passYds / 380) +
        Math.round((completionPct - 0.6) * 55) +
        Math.round((yardsPerAttempt - 6.8) * 7) +
        rng.int(-4, 5),
      42,
      99
    ),
    throwAccuracyDeep: clamp(
      53 + Math.floor(passYds / 560) + Math.round((yardsPerAttempt - 7.1) * 11) + rng.int(-5, 6),
      40,
      99
    ),
    catching: clamp(58 + Math.floor(recYds / 250) + rng.int(-7, 7), 45, 99),
    passBlocking: clamp(58 + rng.int(-8, 10), 40, 95),
    runBlocking: clamp(58 + rng.int(-8, 10), 40, 95),
    tackle: clamp(58 + Math.floor(tackles / 28) + rng.int(-6, 6), 45, 98),
    coverage: clamp(57 + Math.floor(ints * 3) + Math.floor(passesDefended * 0.8) + rng.int(-6, 7), 40, 98),
    manCoverage: clamp(56 + Math.floor(ints * 2) + Math.floor(passesDefended * 0.9) + rng.int(-6, 7), 40, 98),
    zoneCoverage: clamp(57 + Math.floor(ints * 2.5) + Math.floor(passesDefended) + Math.floor(tackles / 40) + rng.int(-6, 7), 40, 98),
    awareness: clamp(
      60 + Math.floor((passYds + recYds + tackles * 8) / 760) + Math.floor(passAtt / 210) + rng.int(-6, 7),
      45,
      98
    ),
    playRecognition: clamp(60 + Math.floor((ints * 10 + sacks * 8 + passCmp) / 55) + rng.int(-6, 6), 45, 98),
    discipline: clamp(60 + rng.int(-10, 12), 45, 98)
  };
  return ratings;
}

function inferTraitAndPotential(overall, rng) {
  if (overall >= 89) {
    return { key: "SUPERSTAR", potential: clamp(overall + rng.int(2, 6), 84, 99) };
  }
  if (overall >= 80) {
    return { key: "HIDDEN", potential: clamp(overall + rng.int(1, 6), 78, 97) };
  }
  if (overall <= 66) {
    return { key: "BUST", potential: clamp(overall + rng.int(-2, 5), 58, 80) };
  }
  return { key: "NORMAL", potential: clamp(overall + rng.int(-1, 5), 68, 93) };
}

function readString(raw, ...keys) {
  for (const key of keys) {
    if (raw[key] != null && raw[key] !== "") return String(raw[key]);
  }
  return null;
}

function readNumber(raw, fallback, ...keys) {
  for (const key of keys) {
    const value = Number(raw[key]);
    if (!Number.isNaN(value) && Number.isFinite(value) && raw[key] !== null && raw[key] !== "") {
      return value;
    }
  }
  return fallback;
}

function importedMeasurements(raw) {
  const height = readNumber(raw, null, "heightInches", "height_inches");
  const feetInches = String(raw.height || "").match(/^(\d)[-'′]\s*(\d+(?:\.\d+)?)\s*(?:["″])?$/);
  const values = {
    heightInches: height ?? (feetInches ? Number(feetInches[1]) * 12 + Number(feetInches[2]) : null),
    weightLbs: readNumber(raw, null, "weightLbs", "weight_lbs", "weight", "wt"),
    armLengthInches: readNumber(raw, null, "armLengthInches", "arm_length_inches"),
    wingspanInches: readNumber(raw, null, "wingspanInches", "wingspan_inches"),
    handSizeInches: readNumber(raw, null, "handSizeInches", "hand_size_inches"),
    handLengthInches: readNumber(raw, null, "handLengthInches", "hand_length_inches"),
    hipJointSpanInches: readNumber(raw, null, "hipJointSpanInches", "hip_joint_span_inches"),
    footLengthInches: readNumber(raw, null, "footLengthInches", "foot_length_inches"),
    footWidthInches: readNumber(raw, null, "footWidthInches", "foot_width_inches")
  };
  const present = Object.fromEntries(Object.entries(values).filter(([, value]) => Number.isFinite(value) && value > 0));
  return {
    ...present,
    measurementProvenance: Object.fromEntries(Object.keys(present).map(key => [key,
      raw.measurementProvenance?.[key] || { kind: "recorded", source: "imported-player-data" }]))
  };
}

export function normalizePfrPlayers(rawPlayers, rng, year) {
  if (!Array.isArray(rawPlayers)) return [];
  return rawPlayers
    .map((raw, index) => {
      const position = toPosition(readString(raw, "pos", "position"));
      const name = readString(raw, "name", "player", "player_name") || `Imported Player ${index + 1}`;
      const teamId = (readString(raw, "team", "tm", "team_id") || "FA").toUpperCase();
      const age = clamp(readNumber(raw, rng.int(22, 31), "age"), 21, 41);
      const experience = Math.max(0, age - 21);
      const ratings = deriveRatingsFromPfr(raw, rng);
      if (position === "QB") ensureQuarterbackDepthRatings(ratings);
      if (position === "LB" || position === "DB") ensureCoverageDepthRatings(ratings);
      const overall = calculatePositionOverall(position, ratings);
      const { key, potential } = inferTraitAndPotential(overall, rng);

      return {
        id: `PFR-${readString(raw, "player_id", "pfr_id") || `${year}-${index}`}`,
        name,
        position,
        teamId,
        age,
        ...importedMeasurements(raw),
        experience,
        developmentTrait: DEVELOPMENT_TRAITS[key].label,
        developmentKey: key,
        potential,
        ratings,
        overall,
        contract: buildContract({
          overall,
          years: clamp(readNumber(raw, rng.int(1, 4), "contract_years"), 1, 5),
          minSalary: 850_000,
          maxSalary: 20_000_000,
          rng
        }),
        status: "active",
        rosterSlot: "active",
        depthChartOrder: 99,
        morale: rng.int(58, 88),
        injury: null,
        suspensionWeeks: 0,
        retiredYear: null,
        seasonsPlayed: clamp(readNumber(raw, experience, "years", "experience"), 0, 25),
        profile: {
          source: "pro-football-reference",
          pfrId: readString(raw, "player_id", "pfr_id"),
          college: readString(raw, "college")
        },
        seasonStats: {},
        careerStats: {
          games: 0,
          gamesStarted: 0,
          passing: { cmp: 0, att: 0, yards: 0, td: 0, int: 0, sacks: 0, sackYards: 0 },
          rushing: { att: 0, yards: 0, td: 0, long: 0, fumbles: 0 },
          receiving: { targets: 0, rec: 0, yards: 0, td: 0, long: 0, drops: 0 },
          defense: { tackles: 0, sacks: 0, int: 0, passDefended: 0, ff: 0, fr: 0 },
          kicking: { fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0 },
          punting: { punts: 0, yards: 0, in20: 0, long: 0 }
        }
      };
    })
    .filter((p) => p.position);
}

