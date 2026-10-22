import { clamp } from "../utils/rng.js";
import { calculatePositionOverall } from "./ratings.js";

// Talent is shared across attributes; skill-specific noise preserves individual
// strengths. Independent full-range ratings otherwise average every player
// toward the same overall, however wide each attribute's range appears.
const reserveIntake = Object.freeze([48, 77]);
export const TALENT_DISTRIBUTION = Object.freeze({
  version: "2026-player-identity-v3-common-reserve-intake",
  starter: Object.freeze([75, 88]),
  rotation: Object.freeze([64, 80]),
  reserve: reserveIntake,
  // Both are candidate roles. Final fieldability/eligibility selection decides
  // active vs practice membership, just as it does after subsequent intake.
  // A weaker boot-only pool creates replacement drift without player growth.
  practice: reserveIntake,
  attributeNoise: 12,
  // Fictional upper bounds on the population mean, not observed NFL shares or
  // deterministic per-seed guarantees. Creation diagnostics use a fixed
  // sample-size allowance and a pooled ensemble; career gates are separate.
  elite90MeanUpperBound: .025,
  elite95MeanUpperBound: .01,
  creationDiagnosticSigma: 5
});

export const STARTER_COUNTS = Object.freeze({ QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, K: 1, P: 1 });

export function drawPlayerTalent(rng, { draft = false, band = null } = {}) {
  if (band) return rng.int(band[0], band[1]);
  const roll = rng.next();
  // Draft classes contain raw projects, useful depth and rare immediate stars.
  if (roll < 0.15) return rng.int(45, 59);
  if (roll < 0.60) return rng.int(60, 74);
  if (roll < 0.94) return rng.int(75, 85);
  return rng.int(86, draft ? 94 : 98);
}

const ARCHETYPE_STRENGTHS = Object.freeze({
  Pocket: ["throwAccuracyShort", "throwAccuracyMedium", "awareness"],
  FieldGeneral: ["awareness", "playRecognition", "throwAccuracyMedium"],
  Scrambler: ["speed", "agility", "throwOnRun"],
  Power: ["strength", "trucking", "breakTackle", "throwPower"],
  Elusive: ["agility", "acceleration", "elusiveness"],
  Receiving: ["catching", "routeRunning", "speed"],
  DeepThreat: ["speed", "acceleration", "release"],
  RouteRunner: ["routeRunning", "agility", "catching"],
  Possession: ["catching", "spectacularCatch", "strength"],
  Blocking: ["runBlocking", "passBlocking", "strength"],
  Vertical: ["speed", "catching", "routeRunning"],
  PassProtect: ["passBlocking", "awareness"],
  PowerRun: ["runBlocking", "strength"],
  PassRush: ["passRush", "acceleration", "blockShedding"],
  RunStop: ["tackle", "strength", "blockShedding"],
  Coverage: ["coverage", "coverageShort", "coverageMedium", "speed"],
  Mike: ["tackle", "playRecognition", "awareness"],
  Edge: ["passRush", "acceleration", "pursuit"],
  Man: ["manCoverage", "speed", "agility"],
  Zone: ["zoneCoverage", "playRecognition", "awareness"],
  BallHawk: ["catching", "jumping", "playRecognition"],
  PowerLeg: ["throwPower"],
  Accurate: ["discipline", "awareness"],
  Directional: ["discipline", "awareness"]
});

export function generateTalentAttributes({ position, keys, bias, archetype, talent, rng }) {
  const strengths = new Set(ARCHETYPE_STRENGTHS[archetype] || []);
  // Position biases describe skill shape, not a free overall subsidy. Calibrate
  // against the exact grading formula so every position can contain stars.
  const neutral = Object.fromEntries(keys.map(key => [key, 60 + (bias[key] || 0) + (strengths.has(key) ? 7 : 0)]));
  const positionOffset = calculatePositionOverall(position, neutral) - 60;
  return Object.fromEntries(keys.map(key => [key, clamp(Math.round(
    talent - positionOffset + (bias[key] || 0)
    + (strengths.has(key) ? 7 : 0)
    + rng.int(-TALENT_DISTRIBUTION.attributeNoise, TALENT_DISTRIBUTION.attributeNoise)
  ), 40, 99)]));
}
