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

function createTeam(meta, year) {
  return {
    id: meta.id,
    name: meta.name,
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

export function createLeagueBase(year) {
  return {
    year,
    teams: TEAM_METADATA.map((meta) => createTeam(meta, year)),
    players: [],
    retiredPlayers: [],
    champions: [],
    history: [],
    weeklyHistory: [],
    awards: [],
    capLedger: {},
    teamCapOverride: {},
    depthCharts: {},
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
