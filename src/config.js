export const GAME_NAME = "VaultSpark Football GM";

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

export const ROSTER_TEMPLATE = {
  QB: 2,
  RB: 4,
  WR: 6,
  TE: 3,
  OL: 9,
  DL: 8,
  LB: 7,
  DB: 8,
  K: 1,
  P: 1
};

export const PLAYER_ATTRIBUTE_KEYS = {
  physical: ["speed", "strength", "agility", "acceleration"],
  skill: [
    "throwPower",
    "throwAccuracy",
    "catching",
    "passBlocking",
    "runBlocking",
    "tackle",
    "coverage"
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
  maxSalary: 45_000_000
};

// Hard upper bounds for active player age by position.
// Players can play through their max-age season and are forced out once they exceed it.
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
