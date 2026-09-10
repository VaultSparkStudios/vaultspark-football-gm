export const GAME_NAME = "Franchise Architect: Football";

export const NFL_STRUCTURE = {
  conferences: ["AFC", "NFC"],
  divisions: ["East", "North", "South", "West"],
  teamsPerDivision: 4,
  regularSeasonWeeks: 18,
  gamesPerTeam: 17,
  playoffTeamsPerConference: 7,
  possessionsPerTeamRange: [10, 12],
  salaryCap: 255_000_000
};

export const TEAM_METADATA = [
  { id: "BUF", name: "Buffalo Bills", conference: "AFC", division: "East" },
  { id: "MIA", name: "Miami Dolphins", conference: "AFC", division: "East" },
  { id: "NE", name: "New England Patriots", conference: "AFC", division: "East" },
  { id: "NYJ", name: "New York Jets", conference: "AFC", division: "East" },
  { id: "BAL", name: "Baltimore Ravens", conference: "AFC", division: "North" },
  { id: "CIN", name: "Cincinnati Bengals", conference: "AFC", division: "North" },
  { id: "CLE", name: "Cleveland Browns", conference: "AFC", division: "North" },
  { id: "PIT", name: "Pittsburgh Steelers", conference: "AFC", division: "North" },
  { id: "HOU", name: "Houston Texans", conference: "AFC", division: "South" },
  { id: "IND", name: "Indianapolis Colts", conference: "AFC", division: "South" },
  { id: "JAX", name: "Jacksonville Jaguars", conference: "AFC", division: "South" },
  { id: "TEN", name: "Tennessee Titans", conference: "AFC", division: "South" },
  { id: "DEN", name: "Denver Broncos", conference: "AFC", division: "West" },
  { id: "KC", name: "Kansas City Chiefs", conference: "AFC", division: "West" },
  { id: "LV", name: "Las Vegas Raiders", conference: "AFC", division: "West" },
  { id: "LAC", name: "Los Angeles Chargers", conference: "AFC", division: "West" },
  { id: "DAL", name: "Dallas Cowboys", conference: "NFC", division: "East" },
  { id: "NYG", name: "New York Giants", conference: "NFC", division: "East" },
  { id: "PHI", name: "Philadelphia Eagles", conference: "NFC", division: "East" },
  { id: "WAS", name: "Washington Commanders", conference: "NFC", division: "East" },
  { id: "CHI", name: "Chicago Bears", conference: "NFC", division: "North" },
  { id: "DET", name: "Detroit Lions", conference: "NFC", division: "North" },
  { id: "GB", name: "Green Bay Packers", conference: "NFC", division: "North" },
  { id: "MIN", name: "Minnesota Vikings", conference: "NFC", division: "North" },
  { id: "ATL", name: "Atlanta Falcons", conference: "NFC", division: "South" },
  { id: "CAR", name: "Carolina Panthers", conference: "NFC", division: "South" },
  { id: "NO", name: "New Orleans Saints", conference: "NFC", division: "South" },
  { id: "TB", name: "Tampa Bay Buccaneers", conference: "NFC", division: "South" },
  { id: "ARI", name: "Arizona Cardinals", conference: "NFC", division: "West" },
  { id: "LAR", name: "Los Angeles Rams", conference: "NFC", division: "West" },
  { id: "SF", name: "San Francisco 49ers", conference: "NFC", division: "West" },
  { id: "SEA", name: "Seattle Seahawks", conference: "NFC", division: "West" }
];

export const POSITION_BUCKETS = {
  offense: ["QB", "RB", "WR", "TE", "OL"],
  defense: ["DL", "LB", "DB"],
  special: ["K", "P"]
};

/**
 * The active roster a club is generated with, position by position.
 *
 * S104 — this summed to **49**, four short of `ROSTER_STRUCTURE.activeLimit`
 * and twenty short of the 69 a club actually carries. A generated league
 * therefore started 20 players per club below its own steady state and spent
 * the next decade filling the gap: rostered population 1,568 -> 2,178 on the
 * canonical seed, with the practice squad going 0 -> 495.
 *
 * That is not a cosmetic starting condition. It is the reason **neither** of
 * this project's two candidate gated populations was a valid drift statistic:
 *
 *   - `rostered` gains ~39% of itself over the window, all of it ~10 points
 *     below the roster it is averaged into (the S103 finding);
 *   - `activeRosterOnly` is an *unfiltered* 49 at the start of the window and
 *     the **top 53 of 68** at the end, so it silently acquires a selection
 *     filter it did not have — the same defect mirrored, and the reason the
 *     re-point read +0.303/season and was correctly refused in S103.
 *
 * A drift statistic requires a population that exists at both ends of its
 * window. Generating the league at 53 active plus a full 16-man practice squad
 * makes both populations exist at both ends, which is what lets the parity
 * target be re-pointed on measurement rather than paid for with a threshold.
 *
 * The counts sum to exactly `ROSTER_STRUCTURE.activeLimit` and every one of
 * them lies inside its `FIELDABLE_DEPTH` band; `test/session104-fieldable-depth.test.js`
 * binds both facts so this table cannot drift out of the structure it fills.
 */
export const ROSTER_TEMPLATE = {
  QB: 3,
  RB: 4,
  WR: 6,
  TE: 3,
  OL: 9,
  DL: 8,
  LB: 7,
  DB: 11,
  K: 1,
  P: 1
};

/**
 * The 16-man practice squad a club is generated with.
 *
 * Sums to `ROSTER_STRUCTURE.practiceLimit`. No kicker and no punter: a club
 * carries one of each and does not develop a second, which is also why those
 * two rooms are pinned at `{ min: 1, max: 1 }` in `FIELDABLE_DEPTH`.
 */
export const PRACTICE_SQUAD_TEMPLATE = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 1,
  OL: 3,
  DL: 3,
  LB: 2,
  DB: 1
};

/**
 * The full roster a club is expected to carry, position by position.
 *
 * S104 - `ROSTER_STRUCTURE` was enforced only as a **ceiling**. Nothing was a
 * floor, so a club that lost players to retirement and cap cuts simply carried
 * fewer, and the league drained: measured 2,208 -> 1,905 rostered players over
 * ten seasons on the canonical seed with the practice squad falling from 16 per
 * club to 6.5. A one-sided limit is not a roster rule, and a draining practice
 * squad reintroduces exactly the moving denominator this session exists to
 * remove - it is the S103 defect with its sign flipped.
 *
 * So the same declared structure is now read from both sides: the compliance
 * pass will not let a club exceed it, and `teamNeeds` will not let a club sit
 * below it. It sums to `activeLimit + practiceLimit`, which is what "a club
 * carries a full roster" means.
 */
export const FULL_ROSTER_TEMPLATE = Object.freeze(
  Object.fromEntries(
    Object.keys(ROSTER_TEMPLATE).map((position) => [
      position,
      ROSTER_TEMPLATE[position] + (PRACTICE_SQUAD_TEMPLATE[position] || 0)
    ])
  )
);

export const PLAYER_ATTRIBUTE_KEYS = {
  physical: ["speed", "strength", "agility", "acceleration", "jumping"],
  skill: [
    "throwPower",
    "throwAccuracy",
    "throwAccuracyShort",
    "throwAccuracyMedium",
    "throwAccuracyDeep",
    "throwOnRun",
    "catching",
    "carrying",
    "breakTackle",
    "trucking",
    "elusiveness",
    "routeRunning",
    "release",
    "spectacularCatch",
    "passBlocking",
    "runBlocking",
    "tackle",
    "coverage",
    "passRush",
    "blockShedding",
    "pursuit",
    "hitPower",
    "manCoverage",
    "zoneCoverage"
  ],
  mental: ["awareness", "playRecognition", "discipline"]
};

export const DEVELOPMENT_TRAITS = {
  SUPERSTAR: { label: "Superstar", maxGrowth: 4, minGrowth: -1 },
  NORMAL: { label: "Normal", maxGrowth: 3, minGrowth: -2 },
  HIDDEN: { label: "Hidden Development", maxGrowth: 4, minGrowth: -2 },
  BUST: { label: "Bust", maxGrowth: 2, minGrowth: -3 }
};

export const TEAM_RATING_WEIGHTS = {
  offense: { QB: 0.35, OL: 0.3, PASS_CATCHERS: 0.2, RB: 0.15 },
  defense: { DL: 0.3, LB: 0.3, DB: 0.4 }
};

export const DRIVE_OUTCOMES = {
  TOUCHDOWN: "TD",
  FIELD_GOAL: "FG",
  PUNT: "PUNT",
  TURNOVER: "TURNOVER"
};

export const CONTRACT_RULES = {
  minYears: 1,
  maxYears: 5,
  minSalary: 850_000,
  // The top of market is whatever the versioned scarcity curve in
  // src/domain/contracts.js actually pays a perfect 100-overall player. Until
  // S89 this read 45_000_000, which the curve could not reach at any rating —
  // it maxes out at 43_320_000 — so the clamp was dead code and the declared
  // ceiling was fiction. `test/session89-franchise-economy-truth.test.js` binds
  // this constant to the curve so it can never drift back out of reach.
  maxSalary: 43_320_000
};

// Declared roster structure. Before S89 the only roster number in the engine was
// a bare `53` inside normalizeRosterSlots, and there was no upper bound at all —
// every player beyond the top 53 was labelled "practice" forever, so clubs
// accumulated players until retirement and the league grew 1,568 -> 2,919 across
// 20 simulated seasons. Both limits are enforced by src/engine/capCompliance.js.
export const ROSTER_STRUCTURE = {
  activeLimit: 53,
  practiceLimit: 16
};

/**
 * The fieldable depth chart — what the active 53 has to *look* like.
 *
 * S104. `ROSTER_STRUCTURE` bounds how many players a club may carry; nothing
 * bounded *which* players. Every seam that decides membership of the active
 * roster ranked by a position-blind scalar: `normalizeRosterSlots` labelled the
 * top 53 by overall, the roster-limit cut released the tail by overall, and the
 * cap cut released by value density (overall per dollar of cap hit). None of
 * them knew what a football team has to put on the field.
 *
 * Those scalars are not neutral with respect to position. A quarterback or a
 * kicker on a rookie deal has enormous overall-per-dollar; a starting left
 * tackle has very little. So the cap cut strips linemen first and keeps
 * specialists, and the overall ranking then promotes the survivors. Measured
 * over ten seasons on the canonical seed, the league's quarterback rooms went
 * 64 -> 195 players and its specialists 64 -> 155, while the offensive line
 * fell 288 -> 258 and the front seven 480 -> 407 — and 11.3% of the quarterback
 * population sat at 90+ overall. That is a roster no club could field, and it
 * inflates every mean measured on the active roster for a reason that has
 * nothing to do with players developing: the denominator is quietly refilling
 * itself with the highest-rated, cheapest rooms in the sport.
 *
 * Both bounds are load-bearing and they are declared together on purpose:
 *
 *   - **`min`** is what the club must dress. It is protected in the release
 *     paths too, so trimming to legality can never leave a club unable to field
 *     an offensive line.
 *   - **`max`** is what stops the drift. A minimum alone does not: nothing in a
 *     minimum prevents a sixth quarterback from out-rating a fourth cornerback
 *     and taking the slot, which is exactly how the room grew.
 *
 * The minimums sum to 41 and the maximums to 59, so the declared 53 sits
 * strictly inside the feasible band with 12 slots left for a club to allocate
 * on merit. `test/session104-fieldable-depth.test.js` binds that arithmetic to
 * `ROSTER_STRUCTURE.activeLimit` so neither constant can drift out of the
 * other's reach — the failure mode `CONTRACT_RULES.maxSalary` shipped for years.
 */
export const FIELDABLE_DEPTH = Object.freeze({
  QB: Object.freeze({ min: 2, max: 3 }),
  RB: Object.freeze({ min: 3, max: 5 }),
  WR: Object.freeze({ min: 5, max: 7 }),
  TE: Object.freeze({ min: 2, max: 4 }),
  OL: Object.freeze({ min: 8, max: 10 }),
  DL: Object.freeze({ min: 6, max: 9 }),
  LB: Object.freeze({ min: 5, max: 8 }),
  DB: Object.freeze({ min: 8, max: 11 }),
  K: Object.freeze({ min: 1, max: 1 }),
  P: Object.freeze({ min: 1, max: 1 })
});

// Hard upper bounds for active player age by position.
// Players can play through their max-age season and are forced out once they exceed it.
/**
 * The free-agent pool's exit rule.
 *
 * S102 — the pool had no exit. Intake ran every offseason (draft class plus
 * emergency depth) and the only way out was a retirement roll that is ~0.03%
 * for an unsigned 24-year-old, so the pool grew monotonically: measured 0 at
 * season 0 to 311 by simulated season 10 (mean age 28.9, mean overall 66.4) on
 * seed 2026. That is not a market, it is an accumulator — and `progressionParity`
 * had already been forced to fence the pool out of its gated population in S91
 * precisely because its unbounded size could cancel any amount of rostered
 * inflation in a blended mean.
 *
 * A player nobody signs for this many consecutive offseasons is out of the
 * league. Three is the shortest window that still lets a real market miss on a
 * player twice — once for a down year, once for a crowded position — before
 * calling it a career, and it is applied as a deterministic rule so it does not
 * consume the RNG stream and re-calibrate every league in the process.
 */
export const FREE_AGENCY_RULES = {
  maxConsecutiveUnsignedOffseasons: 3
};

export const POSITION_MAX_AGE_LIMITS = {
  QB: 45,
  RB: 40,
  WR: 38,
  TE: 39,
  OL: 40,
  DL: 38,
  LB: 37,
  DB: 37,
  K: 45,
  P: 45
};

// League baseline usage by depth chart slot.
// These are percentages of unit snaps (offense/defense/special teams) per position room.
// Calibrated from public NFL snap-count distributions and personnel usage trends.
export const DEPTH_CHART_SNAP_SHARE = {
  QB: [0.97, 0.03],
  RB: [0.57, 0.27, 0.11, 0.05],
  WR: [0.83, 0.78, 0.62, 0.24, 0.11, 0.05],
  TE: [0.72, 0.38, 0.13],
  OL: [0.97, 0.97, 0.97, 0.97, 0.97, 0.2, 0.1, 0.05, 0.02],
  DL: [0.73, 0.71, 0.67, 0.63, 0.46, 0.41, 0.36, 0.29],
  LB: [0.86, 0.82, 0.69, 0.47, 0.31, 0.2, 0.13],
  DB: [0.98, 0.96, 0.95, 0.92, 0.71, 0.44, 0.29, 0.16],
  K: [0.98],
  P: [0.98]
};

export const DEPTH_CHART_ROLE_NAMES = {
  QB: ["QB1", "QB2"],
  RB: ["RB1", "RB2", "RB3", "RB4"],
  WR: ["WR1", "WR2", "WR3", "WR4", "WR5", "WR6"],
  TE: ["TE1", "TE2", "TE3"],
  OL: ["LT1", "LG1", "C1", "RG1", "RT1", "OL6", "OL7", "OL8", "OL9"],
  DL: ["DE1", "DE2", "DT1", "DT2", "DE3", "DT3", "DE4", "DT4"],
  LB: ["LB1", "LB2", "LB3", "LB4", "LB5", "LB6", "LB7"],
  DB: ["CB1", "CB2", "FS1", "SS1", "NB1", "CB3", "DB7", "DB8"],
  K: ["K1"],
  P: ["P1"]
};

export const TEAM_STRATEGY_PRESETS = {
  contender: {
    label: "Contender",
    veteranBias: 1.14,
    youthBias: 0.94,
    capDiscipline: 0.92,
    depthUrgency: 1.18
  },
  "win-now": {
    label: "Win Now",
    veteranBias: 1.2,
    youthBias: 0.9,
    capDiscipline: 0.88,
    depthUrgency: 1.22
  },
  balanced: {
    label: "Balanced",
    veteranBias: 1,
    youthBias: 1,
    capDiscipline: 1,
    depthUrgency: 1
  },
  retool: {
    label: "Retool",
    veteranBias: 0.96,
    youthBias: 1.05,
    capDiscipline: 1.05,
    depthUrgency: 0.97
  },
  rebuild: {
    label: "Rebuild",
    veteranBias: 0.88,
    youthBias: 1.16,
    capDiscipline: 1.12,
    depthUrgency: 0.9
  }
};

export const POSITION_ROLE_RETENTION = {
  QB: { coreStarts: 12, replaceAge: 35, replaceOverall: 74 },
  RB: { coreStarts: 8, replaceAge: 28, replaceOverall: 76 },
  WR: { coreStarts: 10, replaceAge: 30, replaceOverall: 74 },
  TE: { coreStarts: 8, replaceAge: 31, replaceOverall: 73 },
  OL: { coreStarts: 12, replaceAge: 32, replaceOverall: 73 },
  DL: { coreStarts: 9, replaceAge: 30, replaceOverall: 72 },
  LB: { coreStarts: 9, replaceAge: 29, replaceOverall: 72 },
  DB: { coreStarts: 10, replaceAge: 29, replaceOverall: 72 },
  K: { coreStarts: 14, replaceAge: 36, replaceOverall: 71 },
  P: { coreStarts: 14, replaceAge: 36, replaceOverall: 70 }
};

export const COACHING_TENDENCY_ARCHETYPES = {
  "modern-pass": {
    offenseTempo: 1.05,
    deepShotRate: 1.12,
    redZonePassRate: 1.08,
    rbCommitteeRate: 0.92,
    targetTeRate: 1.04,
    targetRbRate: 0.94,
    blitzRate: 1.08,
    rotationDiscipline: 0.98
  },
  balanced: {
    offenseTempo: 1,
    deepShotRate: 1,
    redZonePassRate: 1,
    rbCommitteeRate: 1,
    targetTeRate: 1,
    targetRbRate: 1,
    blitzRate: 1,
    rotationDiscipline: 1
  },
  "ball-control": {
    offenseTempo: 0.95,
    deepShotRate: 0.9,
    redZonePassRate: 0.92,
    rbCommitteeRate: 1.08,
    targetTeRate: 1.06,
    targetRbRate: 1.05,
    blitzRate: 0.96,
    rotationDiscipline: 1.04
  },
  "pressure-defense": {
    offenseTempo: 1,
    deepShotRate: 0.98,
    redZonePassRate: 0.98,
    rbCommitteeRate: 1,
    targetTeRate: 0.98,
    targetRbRate: 1,
    blitzRate: 1.16,
    rotationDiscipline: 1.08
  }
};

export const OFFENSIVE_PERSONNEL_PACKAGES = {
  "11": { label: "11 Personnel", rb: 1, te: 1, wr: 3, rate: 0.49 },
  "12": { label: "12 Personnel", rb: 1, te: 2, wr: 2, rate: 0.2 },
  "21": { label: "21 Personnel", rb: 2, te: 1, wr: 2, rate: 0.08 },
  "10": { label: "10 Personnel", rb: 1, te: 0, wr: 4, rate: 0.1 },
  "22": { label: "22 Personnel", rb: 2, te: 2, wr: 1, rate: 0.05 },
  "13": { label: "13 Personnel", rb: 1, te: 3, wr: 1, rate: 0.05 },
  "20": { label: "20 Personnel", rb: 2, te: 0, wr: 3, rate: 0.03 }
};

