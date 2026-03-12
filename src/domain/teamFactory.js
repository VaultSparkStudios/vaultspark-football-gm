import { NFL_STRUCTURE, ROSTER_TEMPLATE, TEAM_METADATA } from "../config.js";
import { buildSyntheticTeamRoster, createSyntheticPlayer } from "./playerFactory.js";
import { calcTeamOffenseDefense } from "./ratings.js";

const TEAM_ID_ALIASES = {
  JAC: "JAX",
  LA: "LAR",
  STL: "LAR",
  SD: "LAC",
  OAK: "LV",
  LVR: "LV",
  GNB: "GB",
  KAN: "KC",
  NWE: "NE",
  TAM: "TB",
  NOR: "NO",
  SFO: "SF",
  ARZ: "ARI",
  WAS: "WAS",
  WSH: "WAS"
};

function normalizeTeamId(teamId) {
  const value = (teamId || "FA").toUpperCase();
  return TEAM_ID_ALIASES[value] || value;
}

const TEAM_NAME_PARTS = {
  city: [
    "Austin",
    "Boise",
    "Boulder",
    "Buffalo",
    "Charleston",
    "Cincinnati",
    "Cleveland",
    "Columbus",
    "Dayton",
    "Denver",
    "Des Moines",
    "Detroit",
    "El Paso",
    "Fresno",
    "Grand Rapids",
    "Honolulu",
    "Indianapolis",
    "Jackson",
    "Knoxville",
    "Louisville",
    "Madison",
    "Milwaukee",
    "Nashville",
    "Norfolk",
    "Oklahoma City",
    "Omaha",
    "Orlando",
    "Portland",
    "Raleigh",
    "Salt Lake City",
    "San Antonio",
    "Tucson"
  ],
  mascot: [
    "Guardians",
    "Outlaws",
    "Sentinels",
    "Phantoms",
    "Comets",
    "Marauders",
    "Titans",
    "Voyagers",
    "Stallions",
    "Vipers",
    "Dragons",
    "Cyclones",
    "Wolves",
    "Knights",
    "Raiders",
    "Thunder",
    "Reapers",
    "Warhawks",
    "Bandits",
    "Bulls",
    "Ravens",
    "Sharks",
    "Mustangs",
    "Pioneers",
    "Sabers",
    "Storm",
    "Blaze",
    "Giants",
    "Coyotes",
    "Aces",
    "Kings",
    "Pilots"
  ]
};

function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function splitIdentityWords(value) {
  return String(value || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function sanitizeAbbreviation(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function buildAbbreviationCandidates(city, mascot) {
  const cityWords = splitIdentityWords(city);
  const mascotWords = splitIdentityWords(mascot);
  const cityInitials = cityWords.map((word) => word[0]).join("");
  const mascotInitials = mascotWords.map((word) => word[0]).join("");
  const cityCompact = cityWords.join("");
  const mascotCompact = mascotWords.join("");
  const candidates = [
    `${cityInitials.slice(0, 2)}${mascotInitials.slice(0, 1)}`,
    `${cityCompact.slice(0, 2)}${mascotInitials.slice(0, 1)}`,
    `${cityInitials.slice(0, 1)}${mascotCompact.slice(0, 2)}`,
    `${cityCompact.slice(0, 1)}${mascotCompact.slice(0, 2)}`,
    `${cityCompact.slice(0, 2)}${mascotCompact.slice(0, 1)}`,
    `${cityInitials.slice(0, 1)}${mascotCompact.slice(0, 3)}`,
    `${cityInitials}${mascotInitials}`,
    cityCompact.slice(0, 3),
    mascotCompact.slice(0, 3)
  ];
  return [...new Set(candidates.map(sanitizeAbbreviation).filter((candidate) => candidate.length >= 2))];
}

function resolveTeamAbbreviation(city, mascot, used, seedKey) {
  for (const candidate of buildAbbreviationCandidates(city, mascot)) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  const base = sanitizeAbbreviation(`${city[0] || "T"}${mascot.slice(0, 2) || "M"}`).slice(0, 3) || "TM";
  const hash = hashString(seedKey).toString(36).toUpperCase();
  for (let index = 0; index < hash.length; index += 1) {
    const fallback = sanitizeAbbreviation(`${base.slice(0, 2)}${hash[index]}`);
    if (fallback.length >= 3 && !used.has(fallback)) {
      used.add(fallback);
      return fallback;
    }
  }

  let serial = 0;
  while (serial < 100) {
    const fallback = sanitizeAbbreviation(`${base.slice(0, 2)}${serial}`);
    if (fallback.length >= 3 && !used.has(fallback)) {
      used.add(fallback);
      return fallback;
    }
    serial += 1;
  }

  used.add(base);
  return base;
}

function buildRandomizedTeamIdentities(year) {
  const cities = [...TEAM_NAME_PARTS.city];
  const mascots = [...TEAM_NAME_PARTS.mascot];
  const usedAbbreviations = new Set();
  const identities = new Map();
  for (const meta of TEAM_METADATA) {
    const cityIndex = hashString(`${year}-${meta.id}-city`) % cities.length;
    const mascotIndex = hashString(`${year}-${meta.id}-mascot`) % mascots.length;
    const city = cities.splice(cityIndex, 1)[0];
    const mascot = mascots.splice(mascotIndex, 1)[0];
    identities.set(meta.id, {
      city,
      nickname: mascot,
      name: `${city} ${mascot}`,
      abbrev: resolveTeamAbbreviation(city, mascot, usedAbbreviations, `${year}-${meta.id}-${city}-${mascot}`)
    });
  }
  return identities;
}

export function ensureTeamIdentity(team) {
  if (!team || typeof team !== "object") return team;
  const name = String(team.name || "").trim();
  const words = name.split(/\s+/).filter(Boolean);
  const city = team.city || (words.length > 1 ? words.slice(0, -1).join(" ") : name || team.id);
  const nickname = team.nickname || words.at(-1) || name || team.id;
  return {
    ...team,
    city,
    nickname,
    abbrev: sanitizeAbbreviation(team.abbrev) || sanitizeAbbreviation(team.id) || sanitizeAbbreviation(`${city[0]}${nickname[0]}`)
  };
}

function createTeam(meta, year, randomizedIdentities = null) {
  const identity = randomizedIdentities?.get(meta.id) || {
    city: meta.name.split(" ").slice(0, -1).join(" "),
    nickname: meta.name.split(" ").at(-1),
    name: meta.name,
    abbrev: meta.id
  };
  return {
    id: meta.id,
    name: identity.name,
    city: identity.city,
    nickname: identity.nickname,
    abbrev: identity.abbrev,
    conference: meta.conference,
    division: meta.division,
    salaryCap: NFL_STRUCTURE.salaryCap,
    season: {
      year,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      yardsFor: 0,
      yardsAgainst: 0,
      turnovers: 0,
      weekResults: []
    },
    offenseRating: 60,
    defenseRating: 60,
    overallRating: 60,
    playoffSeed: null,
    coaching: {
      offense: 72,
      defense: 72,
      discipline: 72
    },
    scheme: {
      passRate: 0.54,
      aggression: 0.5
    },
    chemistry: 70,
    owner: {
      marketSize: 1,
      ticketPrice: 120,
      fanInterest: 70,
      cash: 150_000_000,
      staffBudget: 28_000_000,
      facilities: {
        training: 72,
        rehab: 72,
        analytics: 72
      },
      finances: {
        revenueYtd: 0,
        expensesYtd: 0
      }
    }
  };
}

export function createLeagueBase(year, rng = null) {
  const randomizedIdentities = buildRandomizedTeamIdentities(year);
  return {
    year,
    teams: TEAM_METADATA.map((meta) => createTeam(meta, year, randomizedIdentities)),
    players: [],
    retiredPlayers: [],
    champions: [],
    history: [],
    weeklyHistory: [],
    gameArchive: [],
    awards: [],
    capLedger: {},
    teamCapOverride: {},
    depthCharts: {},
    depthChartSnapShares: {},
    waiverWire: [],
    pendingWaiverClaims: [],
    pendingDraft: null
  };
}

function allocateImportedPlayers(teams, importedPlayers, year, rng) {
  if (!importedPlayers.length) {
    const generated = [];
    for (const team of teams) generated.push(...buildSyntheticTeamRoster(team.id, year, rng));
    return generated;
  }

  const playersByTeam = new Map();
  for (const p of importedPlayers) {
    const teamId = normalizeTeamId(p.teamId);
    if (!playersByTeam.has(teamId)) playersByTeam.set(teamId, []);
    playersByTeam.get(teamId).push({ ...p, teamId });
  }

  const assigned = [];
  for (const team of teams) {
    const incoming = playersByTeam.get(team.id) || [];
    const byPosition = {};
    for (const p of incoming) {
      if (!byPosition[p.position]) byPosition[p.position] = [];
      byPosition[p.position].push(p);
    }
    for (const [position, count] of Object.entries(ROSTER_TEMPLATE)) {
      const existing = (byPosition[position] || []).sort((a, b) => b.overall - a.overall);
      for (let i = 0; i < count; i += 1) {
        const player = existing[i] || createSyntheticPlayer({ teamId: team.id, position, year, rng });
        player.teamId = team.id;
        assigned.push(player);
      }
    }
  }

  return assigned;
}

export function initializeLeagueRoster({ league, importedPlayers, rng }) {
  const players = allocateImportedPlayers(league.teams, importedPlayers || [], league.year, rng);
  league.players = players;
  for (const team of league.teams) {
    const teamPlayers = players
      .filter((player) => player.teamId === team.id && player.status === "active")
      .sort((a, b) => b.overall - a.overall);
    teamPlayers.forEach((player, index) => {
      player.rosterSlot = index < 53 ? "active" : "practice";
      player.depthChartOrder = index + 1;
    });
    league.depthCharts[team.id] = buildDefaultDepthChart(teamPlayers);
    league.capLedger[team.id] = {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    team.coaching = {
      offense: rng.int(64, 92),
      defense: rng.int(64, 92),
      discipline: rng.int(64, 92)
    };
    team.scheme = {
      passRate: Number((rng.float(0.42, 0.64)).toFixed(2)),
      aggression: Number((rng.float(0.35, 0.75)).toFixed(2))
    };
  }
  recalculateAllTeamRatings(league);
  return league;
}

function buildDefaultDepthChart(teamPlayers) {
  const chart = {};
  const positions = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"];
  for (const position of positions) {
    chart[position] = teamPlayers
      .filter((player) => player.position === position)
      .sort((a, b) => b.overall - a.overall)
      .map((player) => player.id);
  }
  return chart;
}

export function getTeamPlayers(league, teamId) {
  return league.players.filter(
    (p) =>
      p.teamId === teamId &&
      p.status === "active" &&
      (p.rosterSlot || "active") === "active" &&
      p.designations?.ir !== true &&
      p.designations?.pup !== true &&
      p.designations?.nfi !== true &&
      p.designations?.gameDayInactive !== true &&
      (!p.injury || p.injury.weeksRemaining <= 0) &&
      (p.suspensionWeeks || 0) <= 0
  );
}

export function getAllTeamPlayers(league, teamId) {
  return league.players.filter((p) => p.teamId === teamId && p.status === "active");
}

export function recalculateAllTeamRatings(league) {
  for (const team of league.teams) {
    const roster = getTeamPlayers(league, team.id);
    const ratings = calcTeamOffenseDefense(roster);
    team.offenseRating = ratings.offenseRating;
    team.defenseRating = ratings.defenseRating;
    team.overallRating = ratings.overallRating;
  }
}

export function resetTeamSeasonState(league, year) {
  league.year = year;
  for (const team of league.teams) {
    team.season = {
      year,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      yardsFor: 0,
      yardsAgainst: 0,
      turnovers: 0,
      weekResults: []
    };
    team.playoffSeed = null;
  }
}
