import { TEAM_RATING_WEIGHTS } from "../config.js";
import { clamp, mean } from "../utils/rng.js";

const POSITION_FORMULAS = {
  QB: {
    throwPower: 0.24,
    throwAccuracy: 0.24,
    throwOnRun: 0.1,
    awareness: 0.13,
    playRecognition: 0.11,
    discipline: 0.06,
    speed: 0.06,
    agility: 0.06
  },
  RB: {
    speed: 0.16,
    acceleration: 0.13,
    agility: 0.12,
    elusiveness: 0.14,
    breakTackle: 0.12,
    carrying: 0.08,
    strength: 0.07,
    awareness: 0.1,
    catching: 0.12,
    discipline: 0.06,
    trucking: 0.1
  },
  WR: {
    speed: 0.16,
    acceleration: 0.14,
    agility: 0.11,
    catching: 0.19,
    routeRunning: 0.16,
    release: 0.1,
    spectacularCatch: 0.08,
    awareness: 0.09,
    playRecognition: 0.08,
    discipline: 0.06
  },
  TE: {
    speed: 0.1,
    strength: 0.14,
    agility: 0.1,
    catching: 0.17,
    routeRunning: 0.08,
    release: 0.05,
    spectacularCatch: 0.05,
    runBlocking: 0.14,
    passBlocking: 0.08,
    awareness: 0.1,
    discipline: 0.1
  },
  OL: {
    strength: 0.2,
    passBlocking: 0.28,
    runBlocking: 0.25,
    awareness: 0.11,
    playRecognition: 0.08,
    discipline: 0.08
  },
  DL: {
    strength: 0.2,
    speed: 0.08,
    acceleration: 0.11,
    tackle: 0.18,
    passRush: 0.16,
    blockShedding: 0.12,
    playRecognition: 0.15,
    discipline: 0.08,
    awareness: 0.1,
    pursuit: 0.08
  },
  LB: {
    speed: 0.12,
    strength: 0.12,
    acceleration: 0.1,
    tackle: 0.2,
    coverage: 0.1,
    pursuit: 0.12,
    hitPower: 0.1,
    blockShedding: 0.08,
    awareness: 0.12,
    playRecognition: 0.13
  },
  DB: {
    speed: 0.16,
    acceleration: 0.14,
    agility: 0.1,
    coverage: 0.14,
    manCoverage: 0.13,
    zoneCoverage: 0.13,
    tackle: 0.08,
    awareness: 0.1,
    playRecognition: 0.1
  },
  K: {
    awareness: 0.2,
    discipline: 0.15,
    throwPower: 0.3,
    playRecognition: 0.15,
    agility: 0.2
  },
  P: {
    awareness: 0.2,
    discipline: 0.15,
    throwPower: 0.28,
    playRecognition: 0.15,
    agility: 0.22
  }
};

export function calculatePositionOverall(position, ratings) {
  const formula = POSITION_FORMULAS[position];
  if (!formula) return 60;
  const score = Object.entries(formula).reduce((total, [key, weight]) => {
    return total + (ratings[key] ?? 60) * weight;
  }, 0);
  return Math.round(clamp(score, 40, 99));
}

export function calcTeamOffenseDefense(teamPlayers) {
  const byPosition = (position) =>
    teamPlayers
      .filter((p) => p.position === position && p.status === "active")
      .sort((a, b) => b.overall - a.overall);

  const qb = byPosition("QB")[0]?.overall ?? 60;
  const rb = byPosition("RB")[0]?.overall ?? 60;
  const ol = mean(byPosition("OL").slice(0, 5).map((p) => p.overall)) || 60;
  const wr = byPosition("WR").slice(0, 3).map((p) => p.overall);
  const te = byPosition("TE").slice(0, 1).map((p) => p.overall);
  const passCatchers = mean([...wr, ...te]) || 60;

  const dl = mean(byPosition("DL").slice(0, 4).map((p) => p.overall)) || 60;
  const lb = mean(byPosition("LB").slice(0, 3).map((p) => p.overall)) || 60;
  const db = mean(byPosition("DB").slice(0, 4).map((p) => p.overall)) || 60;

  const offenseRating = Math.round(
    qb * TEAM_RATING_WEIGHTS.offense.QB +
      ol * TEAM_RATING_WEIGHTS.offense.OL +
      passCatchers * TEAM_RATING_WEIGHTS.offense.PASS_CATCHERS +
      rb * TEAM_RATING_WEIGHTS.offense.RB
  );
  const defenseRating = Math.round(
    dl * TEAM_RATING_WEIGHTS.defense.DL +
      lb * TEAM_RATING_WEIGHTS.defense.LB +
      db * TEAM_RATING_WEIGHTS.defense.DB
  );

  return {
    offenseRating: clamp(offenseRating, 40, 99),
    defenseRating: clamp(defenseRating, 40, 99),
    overallRating: clamp(Math.round((offenseRating + defenseRating) / 2), 40, 99)
  };
}

export function developmentDelta(player, rng) {
  let ageFactor;
  if (player.age <= 25) ageFactor = 1.5;
  else if (player.age <= 29) ageFactor = 0.4;
  else ageFactor = -1.3;

  const traitFactor = (player.potential - 70) / 20;
  const variance = rng.int(-2, 3);
  return Math.round(ageFactor + traitFactor + variance);
}
