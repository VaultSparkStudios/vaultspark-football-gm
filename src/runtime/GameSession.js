
import {
  COACHING_TENDENCY_ARCHETYPES,
  DEPTH_CHART_ROLE_NAMES,
  GAME_NAME,
  NFL_STRUCTURE,
  POSITION_MAX_AGE_LIMITS,
  TEAM_STRATEGY_PRESETS,
  ROSTER_TEMPLATE
} from "../config.js";
import {
  applyFifthYearOption,
  applyFranchiseTag,
  buildContract,
  computeReleaseDeadCap,
  normalizeContract,
  restructureContract
} from "../domain/contracts.js";
import { createDraftClass, createZeroedSeasonStats } from "../domain/playerFactory.js";
import {
  createLeagueBase,
  ensureTeamIdentity,
  getAllTeamPlayers,
  initializeLeagueRoster,
  recalculateAllTeamRatings,
  resetTeamSeasonState
} from "../domain/teamFactory.js";
import { runOffseason } from "../engine/offseasonSimulator.js";
import { buildTeamUsageProfile, resolveDepthChartRoomShares } from "../engine/depthChartUsage.js";
import {
  defaultDepthChartForTeam,
  isTradeValueAcceptable,
  roleRetentionProfile,
  sortPlayersForDepth,
  strategyPresetForTeam
} from "../engine/aiTeamStrategy.js";
import { buildSeasonSchedule } from "../engine/schedule.js";
import { runPlayoffsAndSuperBowl, sortStandings } from "../engine/seasonSimulator.js";
import { simulateRegularSeasonWeek } from "../engine/weeklySimulator.js";
import { StatBook } from "../stats/statBook.js";
import {
  applySeasonRealismCalibration,
  buildCareerCalibrationSnapshot,
  buildPositionCalibrationSnapshot
} from "../stats/realismCalibrator.js";
import { PFR_RECENT_WEIGHTED_PROFILE } from "../stats/profiles/pfrRecentWeightedProfile.js";
import { PFR_CAREER_WEIGHTED_PROFILE } from "../stats/profiles/pfrCareerWeightedProfile.js";
import { clamp } from "../utils/rng.js";
import { RNGStreams } from "../utils/rngStreams.js";
import { createSessionModules } from "./modules/sessionModules.js";
import { LATEST_SNAPSHOT_SCHEMA_VERSION } from "./snapshotMigration.js";

const TABLE_CATEGORIES = ["passing", "rushing", "receiving", "defense", "blocking", "kicking", "punting", "snaps"];
const MAX_ACTIVE_ROSTER = 53;
const MAX_PRACTICE_SQUAD = 16;
const MAX_GAME_DAY_INACTIVES = 7;
const DRAFT_ROUNDS = 7;
const PICK_ASSET_HORIZON_YEARS = 3;

const DEFAULT_LEAGUE_SETTINGS = {
  allowInjuries: true,
  injuryRateMultiplier: 1,
  capGrowthRate: 0.045,
  cpuTradeAggression: 0.5,
  autoProgressOffseason: false,
  eraProfile: "modern",
  enableOwnerMode: true,
  enableNarratives: true,
  enableCompPicks: true,
  enableChemistry: true,
  retirementWinningRetention: true,
  retirementOverrideMinWinningPct: 0.55,
  waiverClaimWindowWeeks: 1,
  practiceSquadExperienceLimit: 2,
  onboardingCompleted: false
};

const ERA_PROFILES = {
  modern: { passRateDelta: 0.02, offenseBoost: 1.5, injuryDelta: 0.04 },
  balanced: { passRateDelta: 0, offenseBoost: 0, injuryDelta: 0 },
  legacy: { passRateDelta: -0.05, offenseBoost: -1, injuryDelta: -0.02 }
};

function normalizeCount(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeSeasonType(value, fallback = "regular") {
  if (value === "regular" || value === "playoffs" || value === "all") return value;
  return fallback;
}

function teamById(league, teamId) {
  return league.teams.find((team) => team.id === teamId) || null;
}

function teamPlayersAll(league, teamId) {
  return getAllTeamPlayers(league, teamId).sort((a, b) => b.overall - a.overall);
}

function activeRosterPlayers(league, teamId) {
  return teamPlayersAll(league, teamId).filter((player) => (player.rosterSlot || "active") === "active");
}

function practicePlayers(league, teamId) {
  return teamPlayersAll(league, teamId).filter((player) => (player.rosterSlot || "active") === "practice");
}

function topRows(rows, limit = 10) {
  return rows.slice(0, limit);
}

function weekGameKey(homeTeamId, awayTeamId) {
  return `${homeTeamId}-${awayTeamId}`;
}

function pickDefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value != null));
}

function percentDrift(actual, target) {
  if (!Number.isFinite(target) || target === 0) {
    return Number.isFinite(actual) && actual === 0 ? 0 : 1;
  }
  return (actual - target) / target;
}

function driftStatus(absDrift, { warn = 0.12, fail = 0.25 } = {}) {
  if (absDrift >= fail) return "out-of-range";
  if (absDrift >= warn) return "watch";
  return "on-target";
}

function scoutingConfidence(pointsSpent, hasReveal) {
  const base = hasReveal ? 58 : 32;
  return clamp(Math.round(base + pointsSpent * 1.9), hasReveal ? 55 : 20, 99);
}

function rookieContract(round, overall, rng) {
  const base = 4_900_000 - (round - 1) * 480_000;
  const salary = clamp(Math.round(base + overall * 11_000 + rng.int(-220_000, 220_000)), 850_000, 7_500_000);
  return buildContract({ overall, years: 4, salary, minSalary: 850_000, maxSalary: 7_500_000, rng });
}

function veteranContract(overall, rng) {
  return buildContract({
    overall,
    years: rng.int(1, 4),
    minSalary: 850_000,
    maxSalary: 20_000_000,
    rng
  });
}

function randomInjuryType(rng) {
  return rng.pick(["ankle", "hamstring", "shoulder", "knee", "concussion", "wrist", "quad"]);
}

function randomSuspensionReason(rng) {
  return rng.pick(["conduct", "substance policy", "team discipline"]);
}

function buildStaffProfile(rng, existing = null) {
  const archetypes = Object.keys(COACHING_TENDENCY_ARCHETYPES);
  const pickArchetype = () => {
    if (typeof rng?.pick === "function") return rng.pick(archetypes);
    return archetypes[0] || "balanced";
  };
  const tendencyKey =
    existing?.tendencyKey && COACHING_TENDENCY_ARCHETYPES[existing.tendencyKey]
      ? existing.tendencyKey
      : pickArchetype();
  const make = (role, fallback) => ({
    name: existing?.[role]?.name || fallback,
    playcalling: Number.isFinite(existing?.[role]?.playcalling) ? existing[role].playcalling : rng.int(62, 93),
    development: Number.isFinite(existing?.[role]?.development) ? existing[role].development : rng.int(62, 93),
    discipline: Number.isFinite(existing?.[role]?.discipline) ? existing[role].discipline : rng.int(62, 93),
    yearsRemaining: Number.isFinite(existing?.[role]?.yearsRemaining) ? existing[role].yearsRemaining : rng.int(2, 5)
  });
  return {
    tendencyKey,
    headCoach: make("headCoach", "Head Coach"),
    offensiveCoordinator: make("offensiveCoordinator", "Offensive Coordinator"),
    defensiveCoordinator: make("defensiveCoordinator", "Defensive Coordinator")
  };
}

function applyStaffToCoaching(team) {
  if (!team?.staff) return;
  const hc = team.staff.headCoach;
  const oc = team.staff.offensiveCoordinator;
  const dc = team.staff.defensiveCoordinator;
  const tendencies =
    COACHING_TENDENCY_ARCHETYPES[team.staff.tendencyKey] || COACHING_TENDENCY_ARCHETYPES.balanced;
  team.coaching = {
    offense: clamp(Math.round((oc.playcalling * 0.58 + hc.playcalling * 0.42)), 40, 99),
    defense: clamp(Math.round((dc.playcalling * 0.58 + hc.playcalling * 0.42)), 40, 99),
    discipline: clamp(Math.round((hc.discipline * 0.68 + (oc.discipline + dc.discipline) * 0.16)), 40, 99),
    tendencies
  };
}

function computeTeamStrategyProfile(team, roster = []) {
  const avgAge = roster.length ? roster.reduce((sum, player) => sum + (player.age || 26), 0) / roster.length : 26;
  if ((team.overallRating || 70) >= 87 && avgAge >= 27.2) return "win-now";
  if ((team.overallRating || 70) >= 84 && avgAge >= 26.5) return "contender";
  if ((team.overallRating || 70) <= 72 || avgAge <= 24.5) return "rebuild";
  if ((team.overallRating || 70) <= 77 && avgAge <= 25.5) return "retool";
  return "balanced";
}

function buildOwnerProfile(rng, existing = null) {
  const market = Number(existing?.marketSize ?? rng.float(0.85, 1.2));
  return {
    marketSize: Number(market.toFixed(2)),
    ticketPrice: Math.round(Number(existing?.ticketPrice ?? rng.int(75, 210))),
    fanInterest: clamp(Math.round(Number(existing?.fanInterest ?? rng.int(58, 84))), 20, 100),
    cash: Math.round(Number(existing?.cash ?? rng.int(70_000_000, 260_000_000))),
    staffBudget: Math.round(Number(existing?.staffBudget ?? rng.int(18_000_000, 42_000_000))),
    facilities: {
      training: clamp(Math.round(Number(existing?.facilities?.training ?? rng.int(60, 85))), 40, 99),
      rehab: clamp(Math.round(Number(existing?.facilities?.rehab ?? rng.int(60, 85))), 40, 99),
      analytics: clamp(Math.round(Number(existing?.facilities?.analytics ?? rng.int(55, 86))), 40, 99)
    },
    finances: {
      revenueYtd: Math.round(Number(existing?.finances?.revenueYtd ?? 0)),
      expensesYtd: Math.round(Number(existing?.finances?.expensesYtd ?? 0))
    }
  };
}

function computeSchemeFit(player, team) {
  const passRate = team?.scheme?.passRate ?? 0.54;
  const aggression = team?.scheme?.aggression ?? 0.5;
  const ratings = player?.ratings || {};
  if (player.position === "QB") {
    return clamp(
      Math.round((ratings.throwAccuracy || 65) * 0.6 + (ratings.awareness || 65) * 0.3 + passRate * 30),
      45,
      99
    );
  }
  if (player.position === "RB") {
    return clamp(
      Math.round((ratings.acceleration || 65) * 0.34 + (ratings.agility || 65) * 0.33 + (1 - passRate) * 38),
      45,
      99
    );
  }
  if (["WR", "TE"].includes(player.position)) {
    return clamp(
      Math.round((ratings.catching || 65) * 0.55 + (ratings.speed || 65) * 0.25 + passRate * 28),
      45,
      99
    );
  }
  if (player.position === "OL") {
    return clamp(
      Math.round((ratings.passBlocking || 65) * (0.42 + passRate * 0.22) + (ratings.runBlocking || 65) * (0.42 + (1 - passRate) * 0.22)),
      45,
      99
    );
  }
  if (["DL", "LB", "DB"].includes(player.position)) {
    return clamp(
      Math.round((ratings.playRecognition || 65) * 0.36 + (ratings.awareness || 65) * 0.24 + (ratings.coverage || 65) * (0.2 + aggression * 0.18)),
      45,
      99
    );
  }
  return clamp(Math.round((ratings.awareness || 65) * 0.45 + (ratings.discipline || 65) * 0.35 + 20), 45, 99);
}

function computeTeamChemistry(roster = [], team = null) {
  if (!roster.length) return 68;
  const avgMorale = roster.reduce((sum, p) => sum + (p.morale || 70), 0) / roster.length;
  const avgFit = roster.reduce((sum, p) => sum + (p.schemeFit || computeSchemeFit(p, team)), 0) / roster.length;
  const ageVariance = roster.reduce((sum, p) => sum + Math.abs((p.age || 26) - 26), 0) / roster.length;
  return clamp(Math.round(avgMorale * 0.45 + avgFit * 0.45 - ageVariance * 0.7 + 8), 35, 99);
}

function primaryCategoryForPosition(position) {
  if (position === "QB") return "passing";
  if (position === "RB") return "rushing";
  if (position === "WR" || position === "TE") return "receiving";
  if (position === "OL") return "blocking";
  if (position === "K") return "kicking";
  if (position === "P") return "punting";
  return "defense";
}

function hallOfFameLegacyScore(player) {
  const stats = player.careerStats || {};
  const pass = stats.passing || {};
  const rush = stats.rushing || {};
  const rec = stats.receiving || {};
  const def = stats.defense || {};
  const kick = stats.kicking || {};
  const punt = stats.punting || {};
  let score = 0;
  score += (player.overall || 70) * 1.6;
  score += (player.seasonsPlayed || 0) * 6;
  score += (stats.gamesStarted || 0) * 0.32;
  score += (pass.yards || 0) / 220;
  score += (pass.td || 0) * 1.8;
  score -= (pass.int || 0) * 0.45;
  score += (rush.yards || 0) / 90;
  score += (rush.td || 0) * 1.8;
  score += (rec.yards || 0) / 95;
  score += (rec.td || 0) * 1.9;
  score += (def.tackles || 0) * 0.08;
  score += (def.sacks || 0) * 2.6;
  score += (def.int || 0) * 2.4;
  score += (def.passDefended || 0) * 0.35;
  score += (kick.fgm || 0) * 0.7;
  score += (punt.in20 || 0) * 0.3;
  return Number(score.toFixed(2));
}

function defaultRulebookRows() {
  return [
    { section: "League Setup", topic: "Season Setup", summary: "Create or resume a league, pick a team, and load realism profiles if available." },
    { section: "Simulation", topic: "Weekly Advance", summary: "Advancing the calendar simulates games, injuries, news, standings, and stat progression." },
    { section: "Roster", topic: "Depth Charts", summary: "Depth order drives role share, snap counts, touches, and long-run stat accumulation." },
    { section: "Contracts", topic: "Cap Management", summary: "Extensions, restructures, tags, options, waivers, and dead cap all feed the cap ledger." },
    { section: "Scouting", topic: "Draft Cycle", summary: "Allocate scouting points, lock your board, and manage user or CPU draft picks." },
    { section: "Realism", topic: "Verification", summary: "Run 10-20 year checks to compare season and career output against PFR-based target profiles." },
    { section: "Commissioner", topic: "Admin Tools", summary: "Override retirements, force player edits, export or import snapshots, and inspect diagnostics." }
  ];
}

function defaultOffseasonPipeline(year) {
  return {
    year,
    stage: "retirements",
    completed: false,
    history: []
  };
}

function pickAssetValue(pick) {
  const yearPenalty = Math.max(0, Number(pick.year || 0) - Number(pick.baseYear || pick.year || 0));
  return Math.max(20, Math.round(420 - pick.round * 48 - (pick.originalPickIndex || 16) * 2 - yearPenalty * 44));
}

function ensurePlayerRuntime(player, rng = null) {
  if (!player.rosterSlot) player.rosterSlot = "active";
  if (!Number.isFinite(player.depthChartOrder)) player.depthChartOrder = 99;
  if (!Number.isFinite(player.morale)) player.morale = rng ? rng.int(58, 86) : 72;
  if (!Number.isFinite(player.motivation)) player.motivation = rng ? rng.int(56, 88) : 72;
  if (!player.injury) player.injury = null;
  if (!Number.isFinite(player.reinjuryRisk)) player.reinjuryRisk = 0;
  if (!Number.isFinite(player.suspensionWeeks)) player.suspensionWeeks = 0;
  if (!Number.isFinite(player.schemeFit)) player.schemeFit = rng ? rng.int(58, 86) : 72;
  if (!Number.isFinite(player.chemistryImpact)) player.chemistryImpact = rng ? rng.int(-6, 8) : 1;
  if (!player.designations || typeof player.designations !== "object") {
    player.designations = {
      ir: false,
      pup: false,
      nfi: false,
      gameDayInactive: false
    };
  }
  player.designations.ir = player.designations.ir === true;
  player.designations.pup = player.designations.pup === true;
  player.designations.nfi = player.designations.nfi === true;
  player.designations.gameDayInactive = player.designations.gameDayInactive === true;
  if (player.injury && typeof player.injury === "object") {
    if (!player.injury.bodyPart) player.injury.bodyPart = player.injury.type || "unknown";
    if (!Number.isFinite(player.injury.reinjuryRisk)) player.injury.reinjuryRisk = 0;
  }
  if (!player.retirementOverride || typeof player.retirementOverride !== "object") {
    player.retirementOverride = null;
  } else {
    player.retirementOverride.active = player.retirementOverride.active === true;
    player.retirementOverride.minWinningPct = clamp(
      Number(player.retirementOverride.minWinningPct ?? 0.55),
      0.3,
      0.9
    );
    player.retirementOverride.teamId = player.retirementOverride.teamId || player.teamId;
  }
  player.contract = normalizeContract(player.contract);
}

function ensureLeagueRuntime(league) {
  if (!league.weeklyHistory) league.weeklyHistory = [];
  if (!Array.isArray(league.gameArchive)) league.gameArchive = [];
  if (!league.awards) league.awards = [];
  if (!league.capLedger) league.capLedger = {};
  if (!league.teamCapOverride) league.teamCapOverride = {};
  if (!league.depthCharts) league.depthCharts = {};
  if (!league.depthChartSnapShares) league.depthChartSnapShares = {};
  if (!league.waiverWire) league.waiverWire = [];
  if (!league.pendingWaiverClaims) league.pendingWaiverClaims = [];
  if (!league.pendingDraft) league.pendingDraft = null;
  if (!league.transactionLog) league.transactionLog = [];
  if (!Number.isFinite(league.transactionSeq)) league.transactionSeq = league.transactionLog.length;
  if (!league.scouting) league.scouting = { teams: {}, weeklyPoints: 12 };
  if (!Number.isFinite(league.scouting.weeklyPoints)) league.scouting.weeklyPoints = 12;
  if (!league.scouting.teams) league.scouting.teams = {};
  if (!Array.isArray(league.newsFeed)) league.newsFeed = [];
  if (!Array.isArray(league.eventLog)) league.eventLog = [];
  if (!Array.isArray(league.calibrationJobs)) league.calibrationJobs = [];
  if (!Array.isArray(league.draftPicks)) league.draftPicks = [];
  if (!Array.isArray(league.compensatoryPicks)) league.compensatoryPicks = [];
  if (!Array.isArray(league.freeAgencyMoves)) league.freeAgencyMoves = [];
  if (!Array.isArray(league.hallOfFame)) league.hallOfFame = [];
  if (!Array.isArray(league.rulebookNotes)) league.rulebookNotes = [];
  if (!league.compFormulaLedger || typeof league.compFormulaLedger !== "object") {
    league.compFormulaLedger = { losses: {}, gains: {} };
  }
  if (!league.offseasonPipeline || typeof league.offseasonPipeline !== "object") {
    league.offseasonPipeline = defaultOffseasonPipeline(league.year || new Date().getFullYear());
  }
  if (!league.observability || typeof league.observability !== "object") {
    league.observability = { counters: {}, timings: {}, lastUpdated: Date.now() };
  }
  if (!league.freeAgencyMarket || typeof league.freeAgencyMarket !== "object") {
    league.freeAgencyMarket = { stage: "open-market", offers: [] };
  }
  if (!league.negotiations || typeof league.negotiations !== "object") league.negotiations = {};
  if (!league.settings || typeof league.settings !== "object") league.settings = { ...DEFAULT_LEAGUE_SETTINGS };
  league.settings = {
    ...DEFAULT_LEAGUE_SETTINGS,
    ...league.settings
  };
  for (const team of league.teams) {
    Object.assign(team, ensureTeamIdentity(team));
    if (!team.staff) team.staff = buildStaffProfile({ int: () => 76 }, team.staff);
    if (!team.strategyProfile) team.strategyProfile = "balanced";
    if (!team.owner) team.owner = buildOwnerProfile({ int: () => 76, float: () => 1, chance: () => false }, team.owner);
    if (!Number.isFinite(team.chemistry)) team.chemistry = 70;
    applyStaffToCoaching(team);
  }
}

function toTeamIdentity(team) {
  return {
    id: team.id,
    abbrev: team.abbrev || team.id,
    name: team.name,
    city: team.city || null,
    nickname: team.nickname || null,
    conference: team.conference,
    division: team.division
  };
}

function toDashboardTeam(team) {
  return {
    ...toTeamIdentity(team),
    overallRating: team.overallRating,
    coaching: team.coaching,
    scheme: team.scheme,
    strategyProfile: team.strategyProfile || "balanced",
    staff: team.staff || null,
    chemistry: team.chemistry || 70,
    owner: team.owner || null
  };
}

function ensureDepthCharts(league) {
  const positions = Object.keys(ROSTER_TEMPLATE);
  for (const team of league.teams) {
    const roster = teamPlayersAll(league, team.id);
    if (!league.depthCharts[team.id]) league.depthCharts[team.id] = {};
    for (const position of positions) {
      if (!Array.isArray(league.depthCharts[team.id][position])) {
        league.depthCharts[team.id][position] = [];
      }
      const chart = league.depthCharts[team.id][position]
        .filter((id) => roster.some((player) => player.id === id && player.position === position));
      const missing = roster
        .filter((player) => player.position === position)
        .map((player) => player.id)
        .filter((id) => !chart.includes(id));
      league.depthCharts[team.id][position] = [...chart, ...missing];
    }
  }
}

function ensureDepthChartSnapShares(league) {
  const positions = Object.keys(ROSTER_TEMPLATE);
  if (!league.depthChartSnapShares || typeof league.depthChartSnapShares !== "object") {
    league.depthChartSnapShares = {};
  }
  for (const team of league.teams) {
    const roster = teamPlayersAll(league, team.id);
    if (!league.depthChartSnapShares[team.id] || typeof league.depthChartSnapShares[team.id] !== "object") {
      league.depthChartSnapShares[team.id] = {};
    }
    for (const position of positions) {
      const existing = league.depthChartSnapShares[team.id][position];
      const next = {};
      if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        for (const [playerId, rawShare] of Object.entries(existing)) {
          const player = roster.find((entry) => entry.id === playerId);
          const share = Number(rawShare);
          if (!player || player.position !== position || !Number.isFinite(share)) continue;
          next[playerId] = Number(clamp(share, 0, 1).toFixed(3));
        }
      }
      league.depthChartSnapShares[team.id][position] = next;
    }
  }
}

function applyWeekMorale(league, weekResult) {
  const deltaByTeam = new Map();
  for (const game of weekResult.games) {
    if (!deltaByTeam.has(game.homeTeamId)) deltaByTeam.set(game.homeTeamId, 0);
    if (!deltaByTeam.has(game.awayTeamId)) deltaByTeam.set(game.awayTeamId, 0);
    if (game.isTie) continue;
    if (game.winnerId === game.homeTeamId) {
      deltaByTeam.set(game.homeTeamId, deltaByTeam.get(game.homeTeamId) + 2);
      deltaByTeam.set(game.awayTeamId, deltaByTeam.get(game.awayTeamId) - 2);
    } else {
      deltaByTeam.set(game.awayTeamId, deltaByTeam.get(game.awayTeamId) + 2);
      deltaByTeam.set(game.homeTeamId, deltaByTeam.get(game.homeTeamId) - 2);
    }
  }
  for (const [teamId, delta] of deltaByTeam.entries()) {
    for (const player of activeRosterPlayers(league, teamId)) {
      player.morale = clamp((player.morale || 72) + delta, 35, 99);
    }
  }
}

function waiverPriority(league) {
  return league.teams
    .slice()
    .sort(
      (a, b) =>
        a.season.wins - b.season.wins ||
        b.season.losses - a.season.losses ||
        a.season.pointsFor - b.season.pointsFor
    )
    .map((team) => team.id);
}

function estimateAwards(session, year) {
  const passing = session.statBook.getPlayerSeasonTable("passing", { year }).slice(0, 30);
  const rushing = session.statBook.getPlayerSeasonTable("rushing", { year }).slice(0, 30);
  const receiving = session.statBook.getPlayerSeasonTable("receiving", { year }).slice(0, 30);
  const defense = session.statBook.getPlayerSeasonTable("defense", { year }).slice(0, 30);
  const rookies = new Set(
    session.league.players.filter((player) => player.seasonsPlayed <= 1 && player.status === "active").map((p) => p.id)
  );

  const mvp = passing[0] || rushing[0] || receiving[0] || null;
  const opoy = (rushing[0]?.yds || 0) > (receiving[0]?.yds || 0) ? rushing[0] : receiving[0] || passing[0] || null;
  const dpoy =
    defense
      .slice()
      .sort(
        (a, b) =>
          (b.sacks || 0) * 2 + (b.int || 0) * 2.5 + (b.tkl || 0) * 0.04 -
          ((a.sacks || 0) * 2 + (a.int || 0) * 2.5 + (a.tkl || 0) * 0.04)
      )[0] || null;

  const oroy = [...passing, ...rushing, ...receiving].find((row) => rookies.has(row.playerId)) || null;
  const droy = defense.find((row) => rookies.has(row.playerId)) || null;

  const award = {
    year,
    MVP: mvp ? { playerId: mvp.playerId, player: mvp.player, team: mvp.tm } : null,
    OPOY: opoy ? { playerId: opoy.playerId, player: opoy.player, team: opoy.tm } : null,
    DPOY: dpoy ? { playerId: dpoy.playerId, player: dpoy.player, team: dpoy.tm } : null,
    OROY: oroy ? { playerId: oroy.playerId, player: oroy.player, team: oroy.tm } : null,
    DROY: droy ? { playerId: droy.playerId, player: droy.player, team: droy.tm } : null,
    BestQB: passing[0] ? { playerId: passing[0].playerId, player: passing[0].player, team: passing[0].tm } : null
  };
  session.league.awards.push(award);
  return award;
}

export class GameSession {
  constructor({
    rng,
    rngStreams = null,
    startYear = 2026,
    mode = "drive",
    importedPlayers = [],
    controlledTeamId = "BUF",
    realismProfile = null,
    careerRealismProfile = null
  }) {
    this.rng = rng;
    this.rngStreams = rngStreams || new RNGStreams(this.rng.seed, this.rng.constructor);
    this.modules = createSessionModules(this);
    this.mode = mode;
    this.startYear = startYear;
    this.currentYear = startYear;
    this.seasonsSimulated = 0;
    this.previousDivisionRanks = null;
    this.lastCalibrationReport = null;
    this.lastRealismVerificationReport = null;
    this.realismProfile = realismProfile || PFR_RECENT_WEIGHTED_PROFILE;
    this.careerRealismProfile = careerRealismProfile || PFR_CAREER_WEIGHTED_PROFILE;

    this.league = createLeagueBase(startYear, this.rng);
    initializeLeagueRoster({ league: this.league, importedPlayers, rng: this.rng });
    ensureLeagueRuntime(this.league);
    this.initializeLeagueSystems();
    for (const player of this.league.players) ensurePlayerRuntime(player, this.rng);
    ensureDepthCharts(this.league);
    ensureDepthChartSnapShares(this.league);

    recalculateAllTeamRatings(this.league);
    this.statBook = new StatBook(this.league);
    this.controlledTeamId = teamById(this.league, controlledTeamId)?.id || this.league.teams[0].id;

    this.phase = "regular-season";
    this.currentWeek = 1;
    this.seasonSchedule = [];
    this.weekResultsCurrentSeason = [];
    this.latestPostseason = null;
    this.lastAwardSummary = null;

    this.startSeason(this.currentYear);
  }

  static fromSnapshot(snapshot, rngFactory) {
    const session = Object.create(GameSession.prototype);
    Object.assign(session, snapshot);
    session.schemaVersion = Number(snapshot.schemaVersion || LATEST_SNAPSHOT_SCHEMA_VERSION);
    session.rng = rngFactory(snapshot.rngSeed);
    session.rngStreams = RNGStreams.fromSnapshot(
      snapshot.rngStreams || { baseSeed: snapshot.rngSeed, streamSeeds: {} },
      session.rng.constructor
    );
    session.modules = createSessionModules(session);
    session.statBook = new StatBook(session.league);
    session.statBook.teamSeasonArchive = snapshot.teamSeasonArchive || [];
    session.realismProfile = snapshot.realismProfile || PFR_RECENT_WEIGHTED_PROFILE;
    session.careerRealismProfile = snapshot.careerRealismProfile || PFR_CAREER_WEIGHTED_PROFILE;
    session.lastRealismVerificationReport = snapshot.lastRealismVerificationReport || null;
    session.statBook.reindexPlayers();
    ensureLeagueRuntime(session.league);
    session.initializeLeagueSystems();
    for (const player of [...session.league.players, ...session.league.retiredPlayers]) ensurePlayerRuntime(player);
    ensureDepthCharts(session.league);
    ensureDepthChartSnapShares(session.league);
    return session;
  }

  toSnapshot() {
    const controlledTeam = this.getControlledTeam();
    return {
      schemaVersion: LATEST_SNAPSHOT_SCHEMA_VERSION,
      rngSeed: this.rng.seed,
      rngStreams: this.rngStreams?.toSnapshot?.() || { baseSeed: this.rng.seed, streamSeeds: {} },
      mode: this.mode,
      startYear: this.startYear,
      currentYear: this.currentYear,
      seasonsSimulated: this.seasonsSimulated,
      previousDivisionRanks: this.previousDivisionRanks,
      lastCalibrationReport: this.lastCalibrationReport,
      lastRealismVerificationReport: this.lastRealismVerificationReport,
      realismProfile: this.realismProfile,
      careerRealismProfile: this.careerRealismProfile,
      league: this.league,
      controlledTeamId: this.controlledTeamId,
      controlledTeamName: controlledTeam?.name || null,
      controlledTeamAbbrev: controlledTeam?.abbrev || controlledTeam?.id || null,
      phase: this.phase,
      currentWeek: this.currentWeek,
      seasonSchedule: this.seasonSchedule,
      weekResultsCurrentSeason: this.weekResultsCurrentSeason,
      latestPostseason: this.latestPostseason,
      lastAwardSummary: this.lastAwardSummary,
      teamSeasonArchive: this.statBook.teamSeasonArchive
    };
  }

  initializeLeagueSystems() {
    ensureLeagueRuntime(this.league);
    for (const team of this.league.teams) {
      if (!team.staff || !team.staff.headCoach) {
        team.staff = buildStaffProfile(this.rng, team.staff);
      }
      if (!team.owner) team.owner = buildOwnerProfile(this.rng, team.owner);
      applyStaffToCoaching(team);
      if (!team.strategyProfile) {
        const roster = teamPlayersAll(this.league, team.id);
        team.strategyProfile = computeTeamStrategyProfile(team, roster);
      }
      const roster = teamPlayersAll(this.league, team.id);
      for (const player of roster) {
        player.schemeFit = computeSchemeFit(player, team);
      }
      team.chemistry = computeTeamChemistry(roster, team);
    }
    this.ensureDraftPickAssets();
    if (!this.league.offseasonPipeline || this.league.offseasonPipeline.year !== this.currentYear) {
      this.league.offseasonPipeline = defaultOffseasonPipeline(this.currentYear);
    }
  }

  logNews(headline, details = {}) {
    const entry = {
      id: `NEWS-${this.currentYear}-${this.currentWeek}-${this.league.newsFeed.length + 1}`,
      year: this.currentYear,
      week: this.currentWeek,
      phase: this.phase,
      headline,
      details
    };
    this.league.newsFeed.push(entry);
    if (this.league.newsFeed.length > 2000) this.league.newsFeed = this.league.newsFeed.slice(-2000);
    this.appendEvent("news", entry);
    return entry;
  }

  appendEvent(type, payload = {}) {
    if (!Array.isArray(this.league.eventLog)) this.league.eventLog = [];
    const entry = {
      id: `EV-${this.currentYear}-${this.currentWeek}-${this.league.eventLog.length + 1}`,
      ts: Date.now(),
      year: this.currentYear,
      week: this.currentWeek,
      phase: this.phase,
      type,
      payload
    };
    this.league.eventLog.push(entry);
    if (this.league.eventLog.length > 10_000) this.league.eventLog = this.league.eventLog.slice(-10_000);
    return entry;
  }

  getEventLog({ limit = 250, type = null, year = null } = {}) {
    const safeLimit = normalizeCount(limit, 1, 3000, 250);
    return (this.league.eventLog || [])
      .slice()
      .reverse()
      .filter((entry) => (!type ? true : entry.type === type))
      .filter((entry) => (year == null ? true : entry.year === year))
      .slice(0, safeLimit);
  }

  trackCounter(name, delta = 1) {
    if (!this.league.observability) this.league.observability = { counters: {}, timings: {}, lastUpdated: Date.now() };
    this.league.observability.counters[name] = (this.league.observability.counters[name] || 0) + delta;
    this.league.observability.lastUpdated = Date.now();
  }

  trackTiming(name, ms) {
    if (!this.league.observability) this.league.observability = { counters: {}, timings: {}, lastUpdated: Date.now() };
    const t = this.league.observability.timings[name] || { count: 0, totalMs: 0, avgMs: 0 };
    t.count += 1;
    t.totalMs += Math.max(0, Number(ms || 0));
    t.avgMs = Number((t.totalMs / t.count).toFixed(2));
    this.league.observability.timings[name] = t;
    this.league.observability.lastUpdated = Date.now();
  }

  getObservability() {
    return this.league.observability || { counters: {}, timings: {}, lastUpdated: Date.now() };
  }

  getNewsFeed({ limit = 80, year = null, teamId = null } = {}) {
    const safeLimit = normalizeCount(limit, 1, 500, 80);
    return this.league.newsFeed
      .slice()
      .reverse()
      .filter((entry) => (year == null ? true : entry.year === year))
      .filter((entry) => (!teamId ? true : entry.details?.teamId === teamId || entry.details?.teamA === teamId || entry.details?.teamB === teamId))
      .slice(0, safeLimit);
  }

  ensureDraftPickAssets() {
    if (!Array.isArray(this.league.draftPicks)) this.league.draftPicks = [];
    const existing = new Set(this.league.draftPicks.map((pick) => `${pick.year}-${pick.originalTeamId}-${pick.round}`));
    for (let year = this.currentYear + 1; year <= this.currentYear + PICK_ASSET_HORIZON_YEARS; year += 1) {
      for (const team of this.league.teams) {
        for (let round = 1; round <= DRAFT_ROUNDS; round += 1) {
          const key = `${year}-${team.id}-${round}`;
          if (existing.has(key)) continue;
          this.league.draftPicks.push({
            id: `PICK-${year}-${team.id}-R${round}`,
            year,
            round,
            originalTeamId: team.id,
            ownerTeamId: team.id,
            originalPickIndex: this.rng.int(1, 32),
            baseYear: this.currentYear,
            conditions: null
          });
        }
      }
    }
  }

  getDraftPickAssets(teamId = null, { year = null } = {}) {
    this.ensureDraftPickAssets();
    return this.league.draftPicks
      .filter((pick) => (teamId ? pick.ownerTeamId === teamId : true))
      .filter((pick) => (year == null ? true : pick.year === year))
      .sort((a, b) => a.year - b.year || a.round - b.round || a.originalPickIndex - b.originalPickIndex)
      .map((pick) => ({
        ...pick,
        value: pickAssetValue(pick)
      }));
  }

  getLeagueSettings() {
    return {
      ...DEFAULT_LEAGUE_SETTINGS,
      ...(this.league.settings || {})
    };
  }

  updateLeagueSettings(patch = {}) {
    const next = {
      ...this.getLeagueSettings()
    };
    if (patch.allowInjuries != null) next.allowInjuries = patch.allowInjuries === true;
    if (patch.autoProgressOffseason != null) next.autoProgressOffseason = patch.autoProgressOffseason === true;
    if (patch.injuryRateMultiplier != null) next.injuryRateMultiplier = clamp(Number(patch.injuryRateMultiplier) || 1, 0.1, 3);
    if (patch.capGrowthRate != null) next.capGrowthRate = clamp(Number(patch.capGrowthRate) || 0.045, 0, 0.2);
    if (patch.cpuTradeAggression != null) next.cpuTradeAggression = clamp(Number(patch.cpuTradeAggression) || 0.5, 0, 1);
    if (patch.eraProfile != null && ERA_PROFILES[patch.eraProfile]) next.eraProfile = patch.eraProfile;
    if (patch.enableOwnerMode != null) next.enableOwnerMode = patch.enableOwnerMode === true;
    if (patch.enableNarratives != null) next.enableNarratives = patch.enableNarratives === true;
    if (patch.enableCompPicks != null) next.enableCompPicks = patch.enableCompPicks === true;
    if (patch.enableChemistry != null) next.enableChemistry = patch.enableChemistry === true;
    if (patch.retirementWinningRetention != null) next.retirementWinningRetention = patch.retirementWinningRetention === true;
    if (patch.retirementOverrideMinWinningPct != null) {
      next.retirementOverrideMinWinningPct = clamp(Number(patch.retirementOverrideMinWinningPct) || 0.55, 0.3, 0.9);
    }
    if (patch.waiverClaimWindowWeeks != null) {
      next.waiverClaimWindowWeeks = clamp(Math.round(Number(patch.waiverClaimWindowWeeks) || 1), 1, 4);
    }
    if (patch.practiceSquadExperienceLimit != null) {
      next.practiceSquadExperienceLimit = clamp(Math.round(Number(patch.practiceSquadExperienceLimit) || 2), 0, 5);
    }
    this.league.settings = next;
    return next;
  }

  getEraProfile() {
    const key = this.league.settings?.eraProfile || "modern";
    return { key, ...(ERA_PROFILES[key] || ERA_PROFILES.modern) };
  }

  getOffseasonPipeline() {
    if (!this.league.offseasonPipeline || typeof this.league.offseasonPipeline !== "object") {
      this.league.offseasonPipeline = defaultOffseasonPipeline(this.currentYear);
    }
    return this.league.offseasonPipeline;
  }

  resetOffseasonPipeline(year = this.currentYear) {
    this.league.offseasonPipeline = defaultOffseasonPipeline(year);
    return this.league.offseasonPipeline;
  }

  registerFreeAgencyMove({ teamId, direction, playerId, value = 0 }) {
    if (!teamId || !direction) return;
    const move = {
      id: `FAM-${this.currentYear}-${this.currentWeek}-${this.league.freeAgencyMoves.length + 1}`,
      year: this.currentYear,
      week: this.currentWeek,
      teamId,
      direction,
      playerId,
      value: Math.max(0, Math.round(Number(value || 0)))
    };
    this.league.freeAgencyMoves.push(move);
    if (this.league.freeAgencyMoves.length > 4000) {
      this.league.freeAgencyMoves = this.league.freeAgencyMoves.slice(-4000);
    }
    if (!this.league.compFormulaLedger) this.league.compFormulaLedger = { losses: {}, gains: {} };
    if (!this.league.compFormulaLedger[direction]) this.league.compFormulaLedger[direction] = {};
    if (!Array.isArray(this.league.compFormulaLedger[direction][teamId])) {
      this.league.compFormulaLedger[direction][teamId] = [];
    }
    this.league.compFormulaLedger[direction][teamId].push(move);
  }

  seedCompLedgerForUpcomingOffseason() {
    if (!this.league.compFormulaLedger) this.league.compFormulaLedger = { losses: {}, gains: {} };
    this.league.compFormulaLedger.losses = {};
    this.league.compFormulaLedger.gains = {};
    for (const team of this.league.teams) {
      const potentialLosses = this.listExpiringContracts(team.id)
        .slice(0, 8)
        .map((player) => ({
          id: `LOSS-${team.id}-${player.id}`,
          year: this.currentYear,
          week: this.currentWeek,
          teamId: team.id,
          direction: "losses",
          playerId: player.id,
          value: Math.round(Math.max(50, player.value || player.capHit / 120_000))
        }));
      this.league.compFormulaLedger.losses[team.id] = potentialLosses;
      this.league.compFormulaLedger.gains[team.id] = [];
    }
  }

  generateCompensatoryPicks() {
    const settings = this.getLeagueSettings();
    if (!settings.enableCompPicks) return [];
    const draftYear = this.currentYear + 1;
    const existing = (this.league.compensatoryPicks || []).filter((pick) => pick.year === draftYear);
    if (existing.length) return existing;

    const picks = [];
    for (const team of this.league.teams) {
      const losses = this.league.compFormulaLedger?.losses?.[team.id] || [];
      const gains = this.league.compFormulaLedger?.gains?.[team.id] || [];
      const lossValue = losses.reduce((sum, row) => sum + (row.value || 0), 0);
      const gainValue = gains.reduce((sum, row) => sum + (row.value || 0), 0);
      const net = lossValue - gainValue;
      if (net <= 0) continue;
      const rounds = net >= 280 ? [3, 5] : net >= 170 ? [4] : net >= 90 ? [5] : [6];
      for (const round of rounds) {
        picks.push({
          id: `COMP-${draftYear}-${team.id}-${round}-${picks.length + 1}`,
          year: draftYear,
          teamId: team.id,
          round,
          reason: `Net FA loss ${net}`
        });
      }
    }
    this.league.compensatoryPicks = [...(this.league.compensatoryPicks || []), ...picks].slice(-600);
    if (picks.length) {
      this.logNews(`Compensatory picks awarded for ${draftYear}`, { year: draftYear, count: picks.length });
      this.appendEvent("comp-picks", { year: draftYear, picks });
    }
    return picks;
  }

  getCompensatoryPicks({ year = null, teamId = null } = {}) {
    return (this.league.compensatoryPicks || [])
      .filter((pick) => (year == null ? true : pick.year === year))
      .filter((pick) => (!teamId ? true : pick.teamId === teamId))
      .sort((a, b) => a.year - b.year || a.round - b.round || a.teamId.localeCompare(b.teamId));
  }

  advanceOffseasonPipeline() {
    const pipeline = this.getOffseasonPipeline();
    if (pipeline.completed) return { ...pipeline, message: "Offseason pipeline complete." };
    const stage = pipeline.stage;
    const next = (value) => {
      pipeline.history.push({ stage, week: this.currentWeek, year: this.currentYear, result: value });
      pipeline.stage = value.nextStage;
      if (pipeline.stage === "complete") pipeline.completed = true;
      return { ...pipeline, message: value.message };
    };

    if (stage === "retirements") {
      this.processStaffLifecycle();
      this.logNews(`Retirement processing complete for ${this.currentYear}`, { year: this.currentYear });
      return next({ nextStage: "coaching-carousel", message: "Retirements and contract aging processed." });
    }
    if (stage === "coaching-carousel") {
      this.processStaffLifecycle();
      return next({ nextStage: "combine", message: "Coaching carousel resolved." });
    }
    if (stage === "combine") {
      if (!this.league.pendingDraft) this.prepareDraft();
      for (const prospect of this.league.pendingDraft.available) {
        prospect.scouting.combineGrade = clamp(
          Math.round(
            50 +
              (5.2 - prospect.scouting.combine.forty) * 12 +
              prospect.scouting.combine.bench * 0.65 +
              prospect.scouting.combine.vertical * 0.6
          ),
          45,
          99
        );
      }
      this.logNews(`NFL Combine wrapped for class ${this.league.pendingDraft.year}`, { year: this.league.pendingDraft.year });
      return next({ nextStage: "pro-days", message: "Combine metrics applied to draft class." });
    }
    if (stage === "pro-days") {
      for (const prospect of this.league.pendingDraft?.available || []) {
        const bump = this.rng.int(-1, 3);
        prospect.scouting.proDayBoost = (prospect.scouting.proDayBoost || 0) + bump;
        prospect.scouting.scoutedOverall = clamp((prospect.scouting.scoutedOverall || prospect.overall) + bump, 45, 99);
      }
      return next({ nextStage: "draft", message: "Pro day updates merged." });
    }
    if (stage === "draft") {
      if (this.league.pendingDraft && !this.league.pendingDraft.completed) {
        this.runCpuDraft({ untilUserPick: false });
      }
      this.generateCompensatoryPicks();
      return next({ nextStage: "udfa", message: "Draft finished and compensatory picks generated." });
    }
    if (stage === "udfa") {
      this.processFreeAgencyMarket();
      const settings = this.getLeagueSettings();
      runOffseason({
        league: this.league,
        year: this.currentYear,
        rng: this.rng,
        skipDraft: true,
        retirementSettings: {
          winningRetention: settings.retirementWinningRetention !== false
        }
      });
      return next({ nextStage: "camp-cuts", message: "UDFA and free agency pass completed." });
    }
    if (stage === "camp-cuts") {
      this.runAiTeamMaintenance();
      this.refreshChemistryAndSchemeFit();
      return next({ nextStage: "complete", message: "Training camp cuts and roster normalization complete." });
    }
    pipeline.completed = true;
    pipeline.stage = "complete";
    return { ...pipeline, message: "Offseason pipeline complete." };
  }

  getLeagueAnalytics({ year = this.currentYear, teamId = null } = {}) {
    const teams = this.statBook.getTeamSeasonTable({ year }).filter((row) => (teamId ? row.team === teamId : true));
    const passingRows = this.statBook.getPlayerSeasonTable("passing", { year });
    const rushingRows = this.statBook.getPlayerSeasonTable("rushing", { year });
    const defenseRows = this.statBook.getPlayerSeasonTable("defense", { year });
    const totalPassAttempts = passingRows.reduce((sum, row) => sum + (row.att || 0), 0);
    const totalSacks = passingRows.reduce((sum, row) => sum + (row.sacks || 0), 0);
    const totalInts = passingRows.reduce((sum, row) => sum + (row.int || 0), 0);
    const totalRushAttempts = rushingRows.reduce((sum, row) => sum + (row.att || 0), 0);
    const totalRushYards = rushingRows.reduce((sum, row) => sum + (row.yds || 0), 0);
    const ownerSlice = this.league.teams
      .filter((team) => (teamId ? team.id === teamId : true))
      .map((team) => team.owner)
      .filter(Boolean);

    return {
      year,
      teamId: teamId || null,
      teamAverages: {
        pointsPerGame: teams.length ? Number((teams.reduce((sum, row) => sum + row.pf / 17, 0) / teams.length).toFixed(2)) : 0,
        pointsAllowedPerGame: teams.length ? Number((teams.reduce((sum, row) => sum + row.pa / 17, 0) / teams.length).toFixed(2)) : 0,
        yardsPerGame: teams.length
          ? Number(
              (
                teams.reduce((sum, row) => sum + ((row.yardsFor || row.yards || row.yds || 0) / 17 || 0), 0) /
                teams.length
              ).toFixed(2)
            )
          : 0
      },
      efficiency: {
        sackRate: Number((totalPassAttempts ? totalSacks / (totalPassAttempts + totalSacks) : 0).toFixed(4)),
        interceptionRate: Number((totalPassAttempts ? totalInts / totalPassAttempts : 0).toFixed(4)),
        rushYardsPerAttempt: Number((totalRushAttempts ? totalRushYards / totalRushAttempts : 0).toFixed(3))
      },
      ownerEconomy: {
        avgTicketPrice: ownerSlice.length
          ? Number((ownerSlice.reduce((sum, owner) => sum + (owner.ticketPrice || 0), 0) / ownerSlice.length).toFixed(2))
          : 0,
        avgFanInterest: ownerSlice.length
          ? Number((ownerSlice.reduce((sum, owner) => sum + (owner.fanInterest || 0), 0) / ownerSlice.length).toFixed(2))
          : 0
      },
      defensivePlaymakers: defenseRows
        .slice()
        .sort((a, b) => (b.sacks || 0) + (b.int || 0) * 1.4 - ((a.sacks || 0) + (a.int || 0) * 1.4))
        .slice(0, 10)
    };
  }

  getWarehouseSnapshot({ year = this.currentYear, teamId = null } = {}) {
    return this.statBook.getWarehouseSnapshot({ year, teamId });
  }

  runAutoCalibrationJob({ year = this.currentYear, samples = 20, label = "auto" } = {}) {
    const report = this.getQaReport(year);
    const drift = report
      ? Object.fromEntries(
          Object.entries(report.comparisons || {}).map(([metric, row]) => [metric, row.drift])
        )
      : {};
    const recommendation = {
      passing: drift.passingYardsPerAttempt > 0 ? -0.04 : 0.04,
      rushing: drift.rushYardsPerAttempt > 0 ? -0.03 : 0.03,
      pressure: drift.sackRate > 0 ? 0.02 : -0.02,
      turnover: drift.interceptionRate > 0 ? -0.01 : 0.01
    };
    const job = {
      id: `CAL-${this.currentYear}-${this.currentWeek}-${this.league.calibrationJobs.length + 1}`,
      year,
      samples: normalizeCount(samples, 1, 500, 20),
      label,
      eraProfile: this.getEraProfile().key,
      report,
      recommendation,
      createdAt: Date.now()
    };
    this.league.calibrationJobs.push(job);
    if (this.league.calibrationJobs.length > 200) this.league.calibrationJobs = this.league.calibrationJobs.slice(-200);
    this.appendEvent("calibration-job", job);
    return job;
  }

  listCalibrationJobs(limit = 40) {
    return (this.league.calibrationJobs || []).slice().reverse().slice(0, normalizeCount(limit, 1, 200, 40));
  }

  getStaff(teamId = this.controlledTeamId) {
    const team = teamById(this.league, teamId);
    if (!team) return null;
    return {
      teamId,
      teamName: team.name,
      strategyProfile: team.strategyProfile || "balanced",
      staff: team.staff || null,
      coaching: team.coaching || null
    };
  }

  updateStaff({ teamId, role, name, playcalling, development, discipline, yearsRemaining }) {
    const team = teamById(this.league, teamId);
    if (!team) return { ok: false, error: "Invalid team." };
    if (!team.staff) team.staff = buildStaffProfile(this.rng, team.staff);
    if (!["headCoach", "offensiveCoordinator", "defensiveCoordinator"].includes(role)) {
      return { ok: false, error: "Invalid staff role." };
    }
    const current = team.staff[role];
    team.staff[role] = {
      name: name || current.name,
      playcalling: clamp(Math.round(Number(playcalling ?? current.playcalling)), 40, 99),
      development: clamp(Math.round(Number(development ?? current.development)), 40, 99),
      discipline: clamp(Math.round(Number(discipline ?? current.discipline)), 40, 99),
      yearsRemaining: clamp(Math.round(Number(yearsRemaining ?? current.yearsRemaining)), 1, 7)
    };
    applyStaffToCoaching(team);
    this.logTransaction({
      type: "staff-update",
      teamId,
      details: { role, name: team.staff[role].name }
    });
    this.logNews(`${team.id} updated ${role}`, { teamId, role, name: team.staff[role].name });
    return { ok: true, team: this.getStaff(teamId) };
  }

  getOwnerState(teamId = this.controlledTeamId) {
    const team = teamById(this.league, teamId);
    if (!team) return null;
    if (!team.owner) team.owner = buildOwnerProfile(this.rng);
    return {
      teamId,
      owner: team.owner,
      chemistry: team.chemistry || 70
    };
  }

  updateOwnerState({ teamId, ticketPrice = null, staffBudget = null, training = null, rehab = null, analytics = null }) {
    const team = teamById(this.league, teamId);
    if (!team) return { ok: false, error: "Team not found." };
    if (!team.owner) team.owner = buildOwnerProfile(this.rng);
    if (ticketPrice != null) team.owner.ticketPrice = clamp(Math.round(Number(ticketPrice)), 35, 450);
    if (staffBudget != null) team.owner.staffBudget = clamp(Math.round(Number(staffBudget)), 10_000_000, 70_000_000);
    if (training != null) team.owner.facilities.training = clamp(Math.round(Number(training)), 40, 99);
    if (rehab != null) team.owner.facilities.rehab = clamp(Math.round(Number(rehab)), 40, 99);
    if (analytics != null) team.owner.facilities.analytics = clamp(Math.round(Number(analytics)), 40, 99);
    this.logTransaction({
      type: "owner-update",
      teamId,
      details: {
        ticketPrice: team.owner.ticketPrice,
        staffBudget: team.owner.staffBudget
      }
    });
    return { ok: true, owner: team.owner };
  }

  refreshChemistryAndSchemeFit() {
    for (const team of this.league.teams) {
      const roster = teamPlayersAll(this.league, team.id);
      for (const player of roster) {
        player.schemeFit = computeSchemeFit(player, team);
      }
      team.chemistry = computeTeamChemistry(roster, team);
    }
  }

  processOwnerFinances(weekResult) {
    const settings = this.getLeagueSettings();
    if (!settings.enableOwnerMode) return;
    for (const game of weekResult.games || []) {
      const home = teamById(this.league, game.homeTeamId);
      const away = teamById(this.league, game.awayTeamId);
      if (!home?.owner || !away?.owner) continue;
      const attendanceFactorHome = clamp((home.owner.fanInterest || 70) / 100 + this.rng.float(-0.08, 0.08), 0.52, 1.08);
      const attendanceFactorAway = clamp((away.owner.fanInterest || 70) / 100 + this.rng.float(-0.08, 0.08), 0.52, 1.08);
      const homeRevenue = Math.round(home.owner.marketSize * (home.owner.ticketPrice || 120) * 66_500 * attendanceFactorHome);
      const awayRevenue = Math.round(away.owner.marketSize * (away.owner.ticketPrice || 120) * 24_000 * attendanceFactorAway);
      home.owner.finances.revenueYtd += homeRevenue;
      away.owner.finances.revenueYtd += awayRevenue;
      home.owner.finances.expensesYtd += Math.round((home.owner.staffBudget || 25_000_000) / NFL_STRUCTURE.regularSeasonWeeks);
      away.owner.finances.expensesYtd += Math.round((away.owner.staffBudget || 25_000_000) / NFL_STRUCTURE.regularSeasonWeeks);
      home.owner.cash += homeRevenue - Math.round((home.owner.staffBudget || 25_000_000) / NFL_STRUCTURE.regularSeasonWeeks);
      away.owner.cash += awayRevenue - Math.round((away.owner.staffBudget || 25_000_000) / NFL_STRUCTURE.regularSeasonWeeks);
    }
  }

  startSeason(year) {
    this.currentYear = year;
    resetTeamSeasonState(this.league, year);
    const settings = this.getLeagueSettings();
    const era = this.getEraProfile();
    const growthYears = Math.max(0, year - this.startYear);
    const scaledCap = Math.round(NFL_STRUCTURE.salaryCap * Math.pow(1 + settings.capGrowthRate, growthYears));
    for (const team of this.league.teams) {
      this.league.teamCapOverride[team.id] = scaledCap;
      if (!team.scheme) team.scheme = { passRate: 0.54, aggression: 0.5 };
      team.scheme.passRate = Number(clamp((team.scheme.passRate || 0.54) + era.passRateDelta * 0.35, 0.34, 0.72).toFixed(2));
      if (!team.owner) team.owner = buildOwnerProfile(this.rng, team.owner);
      team.owner.finances = { revenueYtd: 0, expensesYtd: 0 };
    }
    this.refreshChemistryAndSchemeFit();
    this.ensureDraftPickAssets();
    recalculateAllTeamRatings(this.league);
    this.statBook.reindexPlayers();
    this.phase = "regular-season";
    this.currentWeek = 1;
    this.weekResultsCurrentSeason = [];
    this.latestPostseason = null;
    this.lastAwardSummary = null;
    this.seasonSchedule = buildSeasonSchedule({
      league: this.league,
      year,
      previousDivisionRanks: this.previousDivisionRanks,
      rng: this.rng
    });
    this.league.pendingWaiverClaims = [];
  }
  setControlledTeam(teamId) {
    if (teamById(this.league, teamId)) this.controlledTeamId = teamId;
    return this.controlledTeamId;
  }

  getControlledTeam() {
    return teamById(this.league, this.controlledTeamId);
  }

  getSetupState() {
    const controlledTeam = this.getControlledTeam();
    return {
      phase: this.phase,
      currentYear: this.currentYear,
      currentWeek: this.currentWeek,
      seasonsSimulated: this.seasonsSimulated,
      mode: this.mode,
      controlledTeamId: this.controlledTeamId,
      controlledTeamName: controlledTeam?.name || null,
      controlledTeamAbbrev: controlledTeam?.abbrev || controlledTeam?.id || null,
      teams: this.league.teams.map(toTeamIdentity)
    };
  }

  getTeamCapSummary(teamId) {
    const capLedger = this.league.capLedger[teamId] || {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    const usedCap = teamPlayersAll(this.league, teamId).reduce(
      (sum, player) => sum + normalizeContract(player.contract).capHit,
      0
    );
    const salaryCapBase = this.league.teamCapOverride?.[teamId] || NFL_STRUCTURE.salaryCap;
    const salaryCap = salaryCapBase + (capLedger.rollover || 0);
    const deadCap = capLedger.deadCapCurrentYear || 0;
    return {
      salaryCap,
      usedCap,
      deadCap,
      capSpace: salaryCap - usedCap - deadCap,
      deadCapNextYear: capLedger.deadCapNextYear || 0,
      rolloverNextYearEstimate: capLedger.rollover || 0
    };
  }

  getRosterNeedSummary(teamId) {
    const roster = activeRosterPlayers(this.league, teamId);
    const counts = {};
    for (const player of roster) counts[player.position] = (counts[player.position] || 0) + 1;
    return Object.entries(ROSTER_TEMPLATE).map(([position, target]) => ({
      position,
      target,
      current: counts[position] || 0,
      delta: (counts[position] || 0) - target
    }));
  }

  refreshTeamDepthChart(teamId) {
    const team = teamById(this.league, teamId);
    if (!team) return;
    const roster = teamPlayersAll(this.league, teamId).filter((player) => player.status === "active");
    const chart = defaultDepthChartForTeam(roster, team);
    if (!this.league.depthCharts[teamId]) this.league.depthCharts[teamId] = {};
    for (const [position, ids] of Object.entries(chart)) {
      this.league.depthCharts[teamId][position] = ids;
    }
  }

  runAiTeamMaintenance() {
    const freeAgentPool = () =>
      this.league.players.filter((player) => player.status === "active" && player.teamId === "FA");

    const findBestPracticePlayer = (teamId, position = null) =>
      sortPlayersForDepth(
        practicePlayers(this.league, teamId).filter((player) => (position ? player.position === position : true)),
        teamById(this.league, teamId)
      )[0] || null;

    const findWorstActivePlayer = (teamId) =>
      activeRosterPlayers(this.league, teamId)
        .slice()
        .sort((a, b) => a.overall - b.overall || b.age - a.age)
        .find((player) => player.position !== "QB" || activePositionCount(teamId, "QB") > 2) || null;

    const activePositionCount = (teamId, position) =>
      activeRosterPlayers(this.league, teamId).filter((player) => player.position === position).length;

    for (const team of this.league.teams) {
      if (team.id === this.controlledTeamId) {
        this.refreshTeamDepthChart(team.id);
        continue;
      }

      while (activeRosterPlayers(this.league, team.id).length > MAX_ACTIVE_ROSTER) {
        const movable = practicePlayers(this.league, team.id).length < MAX_PRACTICE_SQUAD
          ? activeRosterPlayers(this.league, team.id)
              .slice()
              .filter((player) => player.experience <= 3)
              .sort((a, b) => a.overall - b.overall || b.age - a.age)[0]
          : null;

        if (movable) {
          movable.rosterSlot = "practice";
          continue;
        }

        const cutCandidate = findWorstActivePlayer(team.id);
        if (!cutCandidate) break;
        this.releasePlayer({ teamId: team.id, playerId: cutCandidate.id, toWaivers: false });
      }

      const needs = this.getRosterNeedSummary(team.id)
        .filter((entry) => entry.delta < 0)
        .sort((a, b) => a.delta - b.delta);
      const strategy = team.strategyProfile || "balanced";
      const depthUsage = this.getDepthChartSnapShare(team.id, { includePlayers: true });
      const coreThreshold = strategy === "contender" ? 0.65 : strategy === "rebuild" ? 0.58 : 0.62;

      for (const [position, rows] of Object.entries(depthUsage)) {
        const coreRows = rows
          .filter((row) => row.snapShare >= coreThreshold)
          .slice(0, 3);
        for (const row of coreRows) {
          const current = this.league.players.find(
            (player) => player.id === row.playerId && player.teamId === team.id && player.status === "active"
          );
          if (!current) continue;
          const floor =
            strategy === "contender" ? 74 : strategy === "rebuild" ? 68 : 71;
          if ((current.overall || 60) >= floor) continue;
          const candidate = sortPlayersForDepth(
            freeAgentPool().filter((player) => player.position === position && player.overall >= current.overall + 3),
            team
          )[0];
          if (!candidate) continue;
          const sign = this.signFreeAgent({ teamId: team.id, playerId: candidate.id });
          if (!sign.ok) continue;
          this.releasePlayer({ teamId: team.id, playerId: current.id, toWaivers: false });
        }
      }

      for (const need of needs) {
        const missing = Math.abs(need.delta);
        for (let i = 0; i < missing; i += 1) {
          const promote = findBestPracticePlayer(team.id, need.position);
          if (promote && activeRosterPlayers(this.league, team.id).length < MAX_ACTIVE_ROSTER) {
            promote.rosterSlot = "active";
            continue;
          }
          if (activeRosterPlayers(this.league, team.id).length >= MAX_ACTIVE_ROSTER) break;
          const candidates = sortPlayersForDepth(
            freeAgentPool().filter((player) => player.position === need.position),
            team
          );
          const best =
            strategy === "rebuild"
              ? candidates.find((player) => player.age <= 25) || candidates[0]
              : strategy === "contender"
                ? candidates[0]
                : candidates.find((player) => player.contract?.capHit <= 8_000_000) || candidates[0];
          if (!best) break;
          const signed = this.signFreeAgent({ teamId: team.id, playerId: best.id });
          if (!signed.ok) break;
        }
      }

      while (activeRosterPlayers(this.league, team.id).length < MAX_ACTIVE_ROSTER) {
        const promote = findBestPracticePlayer(team.id);
        if (promote) {
          promote.rosterSlot = "active";
          continue;
        }
        const bestOverallFa = sortPlayersForDepth(freeAgentPool(), team)[0];
        if (!bestOverallFa) break;
        const signed = this.signFreeAgent({ teamId: team.id, playerId: bestOverallFa.id });
        if (!signed.ok) break;
      }

      while (practicePlayers(this.league, team.id).length > MAX_PRACTICE_SQUAD) {
        const practiceCut = practicePlayers(this.league, team.id)
          .slice()
          .sort((a, b) => a.overall - b.overall || b.age - a.age)[0];
        if (!practiceCut) break;
        this.releasePlayer({ teamId: team.id, playerId: practiceCut.id, toWaivers: false });
      }

      this.refreshTeamDepthChart(team.id);
    }

    recalculateAllTeamRatings(this.league);
    this.statBook.reindexPlayers();
  }

  ensureScoutingTeamState(teamId) {
    if (!this.league.scouting) this.league.scouting = { teams: {}, weeklyPoints: 12 };
    if (!this.league.scouting.teams[teamId]) {
      this.league.scouting.teams[teamId] = {
        points: 0,
        board: [],
        locked: false,
        evaluations: {},
        effort: {},
        weeklyReports: []
      };
    }
    const state = this.league.scouting.teams[teamId];
    if (!state.evaluations) state.evaluations = {};
    if (!state.effort) state.effort = {};
    if (!Array.isArray(state.weeklyReports)) state.weeklyReports = [];
    if (!Array.isArray(state.board)) state.board = [];
    if (!Number.isFinite(state.points)) state.points = 0;
    if (state.locked !== true) state.locked = false;
    return state;
  }

  grantWeeklyScoutingPoints() {
    const weeklyPoints = Number(this.league.scouting?.weeklyPoints || 12);
    for (const team of this.league.teams) {
      const state = this.ensureScoutingTeamState(team.id);
      state.points = Math.min(240, (state.points || 0) + weeklyPoints);
    }
  }

  initializeDraftScouting() {
    if (!this.league.pendingDraft) return;
    const availableSet = new Set(this.league.pendingDraft.available.map((prospect) => prospect.id));
    for (const team of this.league.teams) {
      const state = this.ensureScoutingTeamState(team.id);
      state.points = Math.max(state.points || 0, 40);
      state.locked = false;
      state.evaluations = Object.fromEntries(
        Object.entries(state.evaluations || {}).filter(([playerId]) => availableSet.has(playerId))
      );
      state.effort = Object.fromEntries(
        Object.entries(state.effort || {}).filter(([playerId]) => availableSet.has(playerId))
      );
      state.board = (state.board || []).filter((playerId) => availableSet.has(playerId));
    }
  }

  getScoutingBoard({ teamId = this.controlledTeamId, limit = 120 } = {}) {
    const draft = this.league.pendingDraft;
    if (!draft) return { active: false, teamId, points: 0, locked: false, weeklyReports: [], prospects: [] };
    const state = this.ensureScoutingTeamState(teamId);
    const safeLimit = normalizeCount(limit, 10, 300, 120);
    const prospects = draft.available.slice(0, safeLimit).map((prospect) => {
      const revealed = state.evaluations[prospect.id];
      const spent = Number(state.effort[prospect.id] || 0);
      return {
        playerId: prospect.id,
        player: prospect.name,
        pos: prospect.position,
        age: prospect.age,
        projectedRound: prospect.scouting?.projectedRound || null,
        rank: prospect.scouting?.rank || null,
        combine40: prospect.scouting?.combine?.forty || null,
        scoutedOverall: revealed ?? null,
        baselineScout: prospect.scouting?.scoutedOverall ?? null,
        pointsSpent: spent,
        confidence: scoutingConfidence(spent, revealed != null)
      };
    });

    if (state.locked && state.board.length) {
      prospects.sort((a, b) => {
        const ia = state.board.indexOf(a.playerId);
        const ib = state.board.indexOf(b.playerId);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return (a.rank || 999) - (b.rank || 999);
      });
    }

    return {
      active: true,
      teamId,
      points: state.points || 0,
      locked: state.locked === true,
      board: state.board || [],
      weeklyReports: state.weeklyReports.slice(-120).reverse(),
      prospects
    };
  }

  allocateScoutingPoints({ teamId = this.controlledTeamId, playerId, points = 10 }) {
    const draft = this.league.pendingDraft;
    if (!draft) return { ok: false, error: "No active draft scouting cycle." };
    const teamState = this.ensureScoutingTeamState(teamId);
    const spend = normalizeCount(points, 1, 60, 10);
    if ((teamState.points || 0) < spend) return { ok: false, error: "Not enough scouting points." };
    const prospect = draft.available.find((entry) => entry.id === playerId);
    if (!prospect) return { ok: false, error: "Prospect not found." };

    const hadReveal = teamState.evaluations[playerId] != null;
    const baseline = teamState.evaluations[playerId] ?? prospect.scouting?.scoutedOverall ?? prospect.overall;
    const revealFactor = clamp(spend / 32, 0.08, 0.72);
    const revealed = clamp(
      Math.round(baseline + (prospect.overall - baseline) * revealFactor + this.rng.int(-2, 2)),
      45,
      99
    );

    teamState.evaluations[playerId] = revealed;
    teamState.effort[playerId] = Number(teamState.effort[playerId] || 0) + spend;
    teamState.points -= spend;

    const reportKey = `${this.currentYear}-${this.currentWeek}`;
    let report = teamState.weeklyReports.find((entry) => entry.key === reportKey);
    if (!report) {
      report = {
        key: reportKey,
        year: this.currentYear,
        week: this.currentWeek,
        pointsSpent: 0,
        evaluations: []
      };
      teamState.weeklyReports.push(report);
      if (teamState.weeklyReports.length > 180) teamState.weeklyReports = teamState.weeklyReports.slice(-180);
    }
    report.pointsSpent += spend;
    const confidence = scoutingConfidence(teamState.effort[playerId], true);
    const existingEvalIndex = report.evaluations.findIndex((entry) => entry.playerId === playerId);
    const evalRow = {
      playerId,
      player: prospect.name,
      pos: prospect.position,
      previous: hadReveal ? baseline : null,
      revealed,
      delta: hadReveal ? revealed - baseline : revealed - (prospect.scouting?.scoutedOverall ?? revealed),
      confidence,
      pointsSpent: teamState.effort[playerId]
    };
    if (existingEvalIndex >= 0) report.evaluations[existingEvalIndex] = evalRow;
    else report.evaluations.push(evalRow);

    return {
      ok: true,
      teamId,
      playerId,
      pointsSpent: spend,
      scoutedOverall: revealed,
      confidence,
      pointsRemaining: teamState.points
    };
  }

  lockDraftBoard({ teamId = this.controlledTeamId, playerIds = [] }) {
    const draft = this.league.pendingDraft;
    if (!draft) return { ok: false, error: "No active draft scouting cycle." };
    const state = this.ensureScoutingTeamState(teamId);
    const availableSet = new Set(draft.available.map((prospect) => prospect.id));
    const board = [...new Set(playerIds.filter((id) => availableSet.has(id)))].slice(0, 20);
    if (!board.length) return { ok: false, error: "No valid prospects in board submission." };
    state.board = board;
    state.locked = true;
    return { ok: true, teamId, locked: true, board };
  }

  setPracticeSquad({ teamId, playerId, moveToPractice = true }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };

    const previousSlot = player.rosterSlot || "active";
    if (moveToPractice) {
      const expLimit = Number(this.getLeagueSettings().practiceSquadExperienceLimit || 2);
      if (player.experience > expLimit) {
        return { ok: false, error: `Player not practice-squad eligible (>${expLimit} years experience).` };
      }
      if (normalizeContract(player.contract).salary > 4_500_000) {
        return { ok: false, error: "Veteran salary too high for practice squad designation." };
      }
      if (practicePlayers(this.league, teamId).length >= MAX_PRACTICE_SQUAD) {
        return { ok: false, error: "Practice squad full." };
      }
      player.rosterSlot = "practice";
    } else {
      if (activeRosterPlayers(this.league, teamId).length >= MAX_ACTIVE_ROSTER) {
        return { ok: false, error: "Active roster full (53)." };
      }
      player.rosterSlot = "active";
    }

    this.statBook.reindexPlayers();
    recalculateAllTeamRatings(this.league);
    this.logTransaction({
      type: "practice-squad-move",
      teamId,
      playerId,
      playerName: player.name,
      details: {
        from: previousSlot,
        to: player.rosterSlot
      }
    });
    return { ok: true, teamId, playerId, rosterSlot: player.rosterSlot };
  }

  setPlayerDesignation({ teamId, playerId, designation, active = true }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };
    if (!["ir", "pup", "nfi", "gameDayInactive"].includes(designation)) {
      return { ok: false, error: "Invalid designation." };
    }

    const isActive = active === true;
    if (designation === "gameDayInactive" && isActive) {
      const current = activeRosterPlayers(this.league, teamId).filter((entry) => entry.designations?.gameDayInactive).length;
      if (current >= MAX_GAME_DAY_INACTIVES && !player.designations?.gameDayInactive) {
        return { ok: false, error: `Maximum ${MAX_GAME_DAY_INACTIVES} game-day inactives reached.` };
      }
    }

    if (!player.designations || typeof player.designations !== "object") {
      player.designations = { ir: false, pup: false, nfi: false, gameDayInactive: false };
    }
    player.designations[designation] = isActive;

    if (designation === "ir" && isActive) {
      player.injury = player.injury || {
        type: "reserve/injured",
        severity: "moderate",
        weeksRemaining: this.rng.int(3, 8),
        startedWeek: this.currentWeek,
        year: this.currentYear
      };
    }

    this.logTransaction({
      type: "designation",
      teamId,
      playerId,
      playerName: player.name,
      details: { designation, active: isActive }
    });
    return { ok: true, teamId, playerId, designations: player.designations };
  }

  getDepthChart(teamId = this.controlledTeamId) {
    ensureDepthCharts(this.league);
    return this.league.depthCharts[teamId] || {};
  }

  getDepthChartSnapShare(teamId = this.controlledTeamId, { includePlayers = true } = {}) {
    ensureDepthCharts(this.league);
    ensureDepthChartSnapShares(this.league);
    const chart = this.league.depthCharts[teamId] || {};
    const manualShares = this.league.depthChartSnapShares?.[teamId] || {};
    const playersById = new Map(
      teamPlayersAll(this.league, teamId).map((player) => [player.id, player])
    );
    const output = {};
    const usageProfile = buildTeamUsageProfile(teamById(this.league, teamId));
    for (const [position, ids] of Object.entries(chart)) {
      const shares = usageProfile.sharesByPosition[position] || [];
      const roles = DEPTH_CHART_ROLE_NAMES[position] || [];
      const resolvedShares = resolveDepthChartRoomShares({
        position,
        playerIds: ids,
        baseShares: shares,
        manualSharesByPlayer: manualShares[position] || {}
      });
      output[position] = resolvedShares.map((row, index) => {
        const playerId = row.playerId;
        const player = playersById.get(playerId) || null;
        return {
          rank: index + 1,
          role: roles[index] || `${position}${index + 1}`,
          playerId,
          player: includePlayers ? player?.name || null : null,
          overall: includePlayers ? player?.overall || null : null,
          snapShare: row.snapShare,
          defaultSnapShare: row.defaultSnapShare,
          manual: row.manual
        };
      });
    }
    return output;
  }

  setDepthChart({ teamId, position, playerIds, snapShares = null }) {
    if (!teamById(this.league, teamId)) return { ok: false, error: "Invalid team." };
    const team = teamById(this.league, teamId);
    const allowed = new Set(
      teamPlayersAll(this.league, teamId)
        .filter((player) => player.position === position)
        .map((player) => player.id)
    );
    const sanitized = (playerIds || []).filter((id) => allowed.has(id));
    if (!sanitized.length) return { ok: false, error: "No valid players for depth chart." };
    ensureDepthCharts(this.league);
    ensureDepthChartSnapShares(this.league);
    this.league.depthCharts[teamId][position] = sanitized;
    const defaultShares = buildTeamUsageProfile(team).sharesByPosition[position] || [];
    const existingShares = this.league.depthChartSnapShares[teamId][position] || {};
    const sourceShares =
      snapShares && typeof snapShares === "object" && !Array.isArray(snapShares)
        ? snapShares
        : existingShares;
    const nextShares = {};
    for (const [index, playerId] of sanitized.entries()) {
      const rawShare = Number(sourceShares?.[playerId]);
      if (!Number.isFinite(rawShare)) continue;
      const share = Number(clamp(rawShare, 0, 1).toFixed(3));
      const defaultShare = Number((defaultShares[index] ?? 0.02).toFixed(3));
      if (Math.abs(share - defaultShare) < 0.001) continue;
      nextShares[playerId] = share;
    }
    const hasPositiveManual = Object.values(nextShares).some((share) => share > 0);
    if (Object.keys(nextShares).length && !hasPositiveManual) {
      nextShares[sanitized[0]] = Number(clamp(defaultShares[0] ?? 0.5, 0.01, 1).toFixed(3));
    }
    this.league.depthChartSnapShares[teamId][position] = nextShares;
    return {
      ok: true,
      teamId,
      position,
      depthChart: sanitized,
      snapShare: this.getDepthChartSnapShare(teamId, { includePlayers: false })[position] || []
    };
  }

  signFreeAgent({ teamId, playerId }) {
    if (!teamById(this.league, teamId)) return { ok: false, error: "Invalid team." };
    const player = this.league.players.find(
      (entry) =>
        entry.id === playerId &&
        entry.status === "active" &&
        (entry.teamId === "FA" || entry.teamId === "WAIVER")
    );
    if (!player) return { ok: false, error: "Free agent not found." };
    if (activeRosterPlayers(this.league, teamId).length >= MAX_ACTIVE_ROSTER) {
      return { ok: false, error: "Active roster full (53)." };
    }
    const contract = veteranContract(player.overall, this.rng);
    if (this.getTeamCapSummary(teamId).capSpace < contract.capHit) {
      return { ok: false, error: "Insufficient cap space." };
    }
    const previousTeam = player.teamId;
    player.teamId = teamId;
    player.contract = contract;
    player.rosterSlot = "active";
    this.league.waiverWire = this.league.waiverWire.filter((entry) => entry.playerId !== playerId);
    recalculateAllTeamRatings(this.league);
    this.statBook.reindexPlayers();
    this.logTransaction({
      type: "signing",
      teamId,
      playerId,
      playerName: player.name,
      details: {
        from: previousTeam,
        capHit: contract.capHit,
        yearsRemaining: contract.yearsRemaining
      }
    });
    this.registerFreeAgencyMove({
      teamId,
      direction: "gains",
      playerId,
      value: Math.round(contract.salary / 220_000)
    });
    return { ok: true, teamId, playerId };
  }

  releasePlayer({ teamId, playerId, june1 = false, toWaivers = this.phase === "regular-season" }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };
    const capLedger = this.league.capLedger[teamId] || {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    const deadCap = computeReleaseDeadCap(player.contract, { june1 });
    capLedger.deadCapCurrentYear += deadCap.currentYearDeadCap;
    capLedger.deadCapNextYear += deadCap.nextYearDeadCap;
    this.league.capLedger[teamId] = capLedger;

    player.contract = normalizeContract({
      salary: 0,
      yearsRemaining: 0,
      capHit: 0,
      baseSalary: 0,
      signingBonus: 0,
      guaranteed: 0,
      deadCapRemaining: 0
    });

    if (toWaivers) {
      const claimWindow = Number(this.getLeagueSettings().waiverClaimWindowWeeks || 1);
      player.teamId = "WAIVER";
      this.league.waiverWire.push({
        playerId: player.id,
        releasedBy: teamId,
        year: this.currentYear,
        week: this.currentWeek,
        expiresWeek: this.currentWeek + claimWindow
      });
    } else {
      player.teamId = "FA";
    }
    player.rosterSlot = "active";

    recalculateAllTeamRatings(this.league);
    this.statBook.reindexPlayers();
    this.logTransaction({
      type: "release",
      teamId,
      playerId,
      playerName: player.name,
      details: {
        june1,
        toWaivers,
        destination: player.teamId,
        deadCapCurrentYear: deadCap.currentYearDeadCap,
        deadCapNextYear: deadCap.nextYearDeadCap
      }
    });
    if (!toWaivers) {
      this.registerFreeAgencyMove({
        teamId,
        direction: "losses",
        playerId,
        value: Math.round((deadCap.currentYearDeadCap + deadCap.nextYearDeadCap) / 220_000)
      });
    }
    return { ok: true, teamId, playerId, deadCap };
  }

  claimWaiver({ teamId, playerId }) {
    if (!teamById(this.league, teamId)) return { ok: false, error: "Invalid team." };
    if (!this.league.waiverWire.some((entry) => entry.playerId === playerId)) {
      return { ok: false, error: "Player is not on waiver wire." };
    }
    if (activeRosterPlayers(this.league, teamId).length >= MAX_ACTIVE_ROSTER) {
      return { ok: false, error: "Active roster full (53)." };
    }
    this.league.pendingWaiverClaims.push({
      playerId,
      teamId,
      year: this.currentYear,
      week: this.currentWeek
    });
    const player = this.league.players.find((entry) => entry.id === playerId);
    this.logTransaction({
      type: "waiver-claim",
      teamId,
      playerId,
      playerName: player?.name || null,
      details: { status: "submitted" }
    });
    return { ok: true, teamId, playerId };
  }

  processWaivers() {
    const priority = waiverPriority(this.league);
    const priorityIndex = Object.fromEntries(priority.map((teamId, idx) => [teamId, idx]));
    const resolved = new Set();
    const claims = this.league.pendingWaiverClaims
      .slice()
      .sort((a, b) => (priorityIndex[a.teamId] || 99) - (priorityIndex[b.teamId] || 99));

    for (const claim of claims) {
      if (resolved.has(claim.playerId)) continue;
      const player = this.league.players.find((entry) => entry.id === claim.playerId && entry.teamId === "WAIVER");
      if (!player) continue;
      if (activeRosterPlayers(this.league, claim.teamId).length >= MAX_ACTIVE_ROSTER) continue;
      const offerContract = veteranContract(player.overall, this.rng);
      if (this.getTeamCapSummary(claim.teamId).capSpace < offerContract.capHit) continue;
      player.teamId = claim.teamId;
      player.contract = offerContract;
      player.rosterSlot = "active";
      this.logTransaction({
        type: "waiver-award",
        teamId: claim.teamId,
        playerId: player.id,
        playerName: player.name,
        details: {
          capHit: offerContract.capHit,
          yearsRemaining: offerContract.yearsRemaining
        }
      });
      this.registerFreeAgencyMove({
        teamId: claim.teamId,
        direction: "gains",
        playerId: player.id,
        value: Math.round(offerContract.salary / 300_000)
      });
      resolved.add(claim.playerId);
    }

    this.league.waiverWire = this.league.waiverWire.filter((entry) => {
      const player = this.league.players.find((row) => row.id === entry.playerId);
      if (!player) return false;
      if (player.teamId !== "WAIVER") return false;
      if (entry.expiresWeek < this.currentWeek) {
        player.teamId = "FA";
        return false;
      }
      return true;
    });
    this.league.pendingWaiverClaims = [];
  }

  evaluateTradePackage({ teamA, teamB, teamAPlayerIds = [], teamBPlayerIds = [], teamAPickIds = [], teamBPickIds = [] }) {
    if (!teamById(this.league, teamA) || !teamById(this.league, teamB)) {
      return { ok: false, error: "Invalid team IDs.", reasonCode: "invalid-team" };
    }
    if (teamA === teamB) return { ok: false, error: "Teams must be different.", reasonCode: "same-team" };

    const fromA = teamAPlayerIds
      .map((id) => this.league.players.find((player) => player.id === id && player.teamId === teamA))
      .filter(Boolean);
    const fromB = teamBPlayerIds
      .map((id) => this.league.players.find((player) => player.id === id && player.teamId === teamB))
      .filter(Boolean);
    const picksA = teamAPickIds
      .map((id) => this.league.draftPicks.find((pick) => pick.id === id && pick.ownerTeamId === teamA))
      .filter(Boolean);
    const picksB = teamBPickIds
      .map((id) => this.league.draftPicks.find((pick) => pick.id === id && pick.ownerTeamId === teamB))
      .filter(Boolean);

    if (
      fromA.length !== teamAPlayerIds.length ||
      fromB.length !== teamBPlayerIds.length ||
      picksA.length !== teamAPickIds.length ||
      picksB.length !== teamBPickIds.length
    ) {
      return { ok: false, error: "Invalid asset in trade package.", reasonCode: "invalid-asset" };
    }

    const capA = this.getTeamCapSummary(teamA).capSpace;
    const capB = this.getTeamCapSummary(teamB).capSpace;
    const outgoingA = fromA.reduce((sum, player) => sum + player.contract.capHit, 0);
    const incomingA = fromB.reduce((sum, player) => sum + player.contract.capHit, 0);
    const outgoingB = fromB.reduce((sum, player) => sum + player.contract.capHit, 0);
    const incomingB = fromA.reduce((sum, player) => sum + player.contract.capHit, 0);

    if (capA + outgoingA - incomingA < 0 || capB + outgoingB - incomingB < 0) {
      return {
        ok: false,
        error: "Trade failed cap check.",
        reasonCode: "cap-failed",
        capAfter: {
          [teamA]: capA + outgoingA - incomingA,
          [teamB]: capB + outgoingB - incomingB
        }
      };
    }

    const teamAObj = teamById(this.league, teamA);
    const teamBObj = teamById(this.league, teamB);
    const pickValueA = picksA.reduce((sum, pick) => sum + pickAssetValue(pick), 0);
    const pickValueB = picksB.reduce((sum, pick) => sum + pickAssetValue(pick), 0);
    const playerValueOutA = fromA.reduce((sum, player) => sum + player.overall * 3, 0);
    const playerValueInA = fromB.reduce((sum, player) => sum + player.overall * 3, 0);
    const playerValueOutB = fromB.reduce((sum, player) => sum + player.overall * 3, 0);
    const playerValueInB = fromA.reduce((sum, player) => sum + player.overall * 3, 0);

    const outgoingValueA = playerValueOutA + pickValueA;
    const incomingValueA = playerValueInA + pickValueB;
    const outgoingValueB = playerValueOutB + pickValueB;
    const incomingValueB = playerValueInB + pickValueA;

    const strategyTolerance = (team) => {
      const aggression = this.getLeagueSettings().cpuTradeAggression;
      const aggressionAdj = clamp((aggression - 0.5) * 0.24, -0.12, 0.12);
      if (team.strategyProfile === "rebuild") return clamp(0.4 + aggressionAdj, 0.2, 0.55);
      if (team.strategyProfile === "contender") return clamp(0.25 + aggressionAdj, 0.12, 0.4);
      return clamp(0.32 + aggressionAdj, 0.15, 0.5);
    };

    const aiAcceptableA =
      isTradeValueAcceptable({ outgoing: fromA, incoming: fromB, team: teamAObj, tolerance: strategyTolerance(teamAObj) }) ||
      incomingValueA >= outgoingValueA * (1 - strategyTolerance(teamAObj));
    const aiAcceptableB =
      isTradeValueAcceptable({ outgoing: fromB, incoming: fromA, team: teamBObj, tolerance: strategyTolerance(teamBObj) }) ||
      incomingValueB >= outgoingValueB * (1 - strategyTolerance(teamBObj));

    if (!aiAcceptableA || !aiAcceptableB) {
      return {
        ok: false,
        error: "Trade rejected by AI valuation.",
        reasonCode: "valuation-failed",
        valuation: {
          [teamA]: { outgoingValue: outgoingValueA, incomingValue: incomingValueA, delta: incomingValueA - outgoingValueA },
          [teamB]: { outgoingValue: outgoingValueB, incomingValue: incomingValueB, delta: incomingValueB - outgoingValueB }
        }
      };
    }

    return {
      ok: true,
      teamA,
      teamB,
      players: { fromA, fromB },
      picks: { fromA: picksA, fromB: picksB },
      capAfter: {
        [teamA]: capA + outgoingA - incomingA,
        [teamB]: capB + outgoingB - incomingB
      },
      valuation: {
        [teamA]: { outgoingValue: outgoingValueA, incomingValue: incomingValueA, delta: incomingValueA - outgoingValueA },
        [teamB]: { outgoingValue: outgoingValueB, incomingValue: incomingValueB, delta: incomingValueB - outgoingValueB }
      }
    };
  }

  tradePlayers({ teamA, teamB, teamAPlayerIds = [], teamBPlayerIds = [], teamAPickIds = [], teamBPickIds = [] }) {
    const evalResult = this.evaluateTradePackage({
      teamA,
      teamB,
      teamAPlayerIds,
      teamBPlayerIds,
      teamAPickIds,
      teamBPickIds
    });
    if (!evalResult.ok) return evalResult;

    const fromA = evalResult.players.fromA;
    const fromB = evalResult.players.fromB;
    const picksA = evalResult.picks.fromA;
    const picksB = evalResult.picks.fromB;

    for (const player of fromA) player.teamId = teamB;
    for (const player of fromB) player.teamId = teamA;
    for (const pick of picksA) pick.ownerTeamId = teamB;
    for (const pick of picksB) pick.ownerTeamId = teamA;

    this.logTransaction({
      type: "trade",
      teamA,
      teamB,
      details: {
        fromA: fromA.map((player) => ({ playerId: player.id, player: player.name, capHit: player.contract.capHit })),
        fromB: fromB.map((player) => ({ playerId: player.id, player: player.name, capHit: player.contract.capHit })),
        picksFromA: picksA.map((pick) => ({ id: pick.id, year: pick.year, round: pick.round, originalTeamId: pick.originalTeamId })),
        picksFromB: picksB.map((pick) => ({ id: pick.id, year: pick.year, round: pick.round, originalTeamId: pick.originalTeamId }))
      }
    });
    this.logNews(`${teamA} and ${teamB} completed a trade`, { teamA, teamB, playersMoved: fromA.length + fromB.length });

    ensureDepthCharts(this.league);
    recalculateAllTeamRatings(this.league);
    this.statBook.reindexPlayers();
    return {
      ok: true,
      teamA,
      teamB,
      movedA: fromA.map((player) => player.id),
      movedB: fromB.map((player) => player.id),
      movedPicksA: picksA.map((pick) => pick.id),
      movedPicksB: picksB.map((pick) => pick.id),
      valuation: evalResult.valuation
    };
  }

  listExpiringContracts(teamId = this.controlledTeamId) {
    return teamPlayersAll(this.league, teamId)
      .filter((player) => normalizeContract(player.contract).yearsRemaining <= 1)
      .map((player) => ({
        id: player.id,
        name: player.name,
        pos: player.position,
        overall: player.overall,
        contract: normalizeContract(player.contract)
      }));
  }

  listFranchiseTagCandidates(teamId = this.controlledTeamId) {
    return teamPlayersAll(this.league, teamId)
      .filter((player) => {
        const contract = normalizeContract(player.contract);
        return contract.yearsRemaining <= 1 && contract.franchiseTagYear !== this.currentYear;
      })
      .map((player) => {
        const contract = normalizeContract(player.contract);
        const projectedCapHit = Math.max(contract.salary * 1.2, contract.capHit * 1.35, 18_000_000);
        return {
          id: player.id,
          name: player.name,
          pos: player.position,
          overall: player.overall,
          contract,
          projectedCapHit: Math.round(projectedCapHit),
          capDelta: Math.round(projectedCapHit - contract.capHit)
        };
      })
      .sort((a, b) => b.overall - a.overall || a.capDelta - b.capDelta);
  }

  listFifthYearOptionCandidates(teamId = this.controlledTeamId) {
    return teamPlayersAll(this.league, teamId)
      .filter((player) => {
        const contract = normalizeContract(player.contract);
        return player.experience >= 3 && player.experience <= 5 && contract.yearsRemaining <= 2 && !contract.optionYear;
      })
      .map((player) => {
        const contract = normalizeContract(player.contract);
        const projectedCapHit = Math.max(contract.salary * 1.15, contract.capHit * 1.2, 7_500_000);
        return {
          id: player.id,
          name: player.name,
          pos: player.position,
          overall: player.overall,
          experience: player.experience,
          contract,
          projectedCapHit: Math.round(projectedCapHit),
          capDelta: Math.round(projectedCapHit - contract.capHit)
        };
      })
      .sort((a, b) => b.overall - a.overall || a.capDelta - b.capDelta);
  }

  getNegotiationDemand({ teamId, playerId }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };
    const contract = normalizeContract(player.contract);
    const baseSalary = Math.max(850_000, Math.round(player.overall * player.overall * 510));
    const leverage =
      player.developmentTrait === "Superstar" ? 1.28 : player.developmentTrait === "Hidden Development" ? 1.14 : 1;
    const ageCurve = player.age <= 27 ? 1.08 : player.age <= 31 ? 1 : 0.92;
    const years = clamp(
      contract.yearsRemaining <= 1
        ? player.age <= 25
          ? 5
          : player.age <= 29
            ? 4
            : 3
        : Math.max(1, Math.min(4, contract.yearsRemaining + (player.age <= 27 ? 1 : 0))),
      1,
      5
    );
    const salary = Math.round(Math.max(baseSalary, contract.salary * 1.04) * leverage * ageCurve);
    const guaranteedPct = clamp(0.36 + (player.overall - 70) / 160 + (leverage - 1) * 0.4, 0.32, 0.82);
    const guaranteed = Math.round(salary * guaranteedPct);
    return {
      ok: true,
      demand: {
        years,
        salary,
        guaranteed,
        guaranteedPct: Number(guaranteedPct.toFixed(3)),
        askCapHit: Math.round(salary * (0.85 + (1 - guaranteedPct) * 0.2))
      }
    };
  }

  listNegotiationTargets(teamId = this.controlledTeamId) {
    return this.listExpiringContracts(teamId)
      .map((player) => {
        const demand = this.getNegotiationDemand({ teamId, playerId: player.id });
        return {
          ...player,
          demand: demand.ok ? demand.demand : null
        };
      })
      .sort((a, b) => b.overall - a.overall);
  }

  adjustNegotiationSentiment(player, { morale = 0, motivation = 0 }) {
    if (!player) return;
    player.morale = clamp((player.morale || 72) + morale, 35, 99);
    player.motivation = clamp((player.motivation || 72) + motivation, 35, 99);
  }

  negotiateAndSign({ teamId, playerId, years = null, salary = null }) {
    const demandPayload = this.getNegotiationDemand({ teamId, playerId });
    if (!demandPayload.ok) return demandPayload;
    const demand = demandPayload.demand;
    const offerYears = clamp(Number(years ?? demand.years), 1, 5);
    const offerSalary = Math.max(850_000, Math.round(Number(salary ?? demand.salary)));
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };

    const yearsGap = Math.abs(offerYears - demand.years);
    const salaryGap = (offerSalary - demand.salary) / Math.max(1, demand.salary);
    const acceptanceScore = salaryGap * 1.25 - yearsGap * 0.08 + this.rng.float(-0.08, 0.08);
    if (acceptanceScore < -0.18) {
      this.adjustNegotiationSentiment(player, { morale: -4, motivation: -3 });
      this.logTransaction({
        type: "negotiation",
        teamId,
        playerId,
        playerName: player.name,
        details: {
          outcome: "rejected",
          offerYears,
          offerSalary,
          askYears: demand.years,
          askSalary: demand.salary,
          morale: player.morale,
          motivation: player.motivation
        }
      });
      return { ok: false, error: "Player rejected the offer based on term/value." };
    }

    if (acceptanceScore < 0.04) {
      const counterYears = clamp(Math.max(offerYears, demand.years), 1, 5);
      const counterSalary = Math.max(
        850_000,
        Math.round(Math.max(demand.salary, offerSalary * 1.04, demand.salary * 0.985))
      );
      this.adjustNegotiationSentiment(player, { morale: -1, motivation: 1 });
      this.logTransaction({
        type: "negotiation",
        teamId,
        playerId,
        playerName: player.name,
        details: {
          outcome: "countered",
          offerYears,
          offerSalary,
          counterYears,
          counterSalary,
          morale: player.morale,
          motivation: player.motivation
        }
      });
      return {
        ok: true,
        countered: true,
        teamId,
        playerId,
        demand,
        counterOffer: {
          years: counterYears,
          salary: counterSalary,
          askCapHit: Math.round(counterSalary * 0.9)
        },
        morale: player.morale,
        motivation: player.motivation
      };
    }

    let result = this.resignPlayer({ teamId, playerId, years: offerYears, salary: offerSalary });
    if (!result.ok && String(result.error || "").toLowerCase().includes("cap")) {
      const currentCapHit = normalizeContract(player.contract).capHit;
      const capRoom = this.getTeamCapSummary(teamId).capSpace + currentCapHit;
      const fallbackSalary = Math.max(850_000, Math.min(offerSalary, Math.round(capRoom * 0.92)));
      const fallbackYears = clamp(Math.max(offerYears, 2), 1, 5);
      result = this.resignPlayer({ teamId, playerId, years: fallbackYears, salary: fallbackSalary });
      if (!result.ok && String(result.error || "").toLowerCase().includes("cap")) {
        const current = normalizeContract(player.contract);
        player.contract = normalizeContract({
          ...current,
          yearsRemaining: clamp(current.yearsRemaining + 1, 1, 5),
          salary: Math.max(850_000, Math.min(current.salary, 12_000_000)),
          capHit: current.capHit
        });
        result = { ok: true, contract: player.contract };
      }
    }
    if (!result.ok) return result;
    this.adjustNegotiationSentiment(player, { morale: 3, motivation: 2 });
    this.logTransaction({
      type: "negotiation",
      teamId,
      playerId,
      playerName: player.name,
      details: { outcome: "accepted", offerYears, offerSalary, morale: player.morale, motivation: player.motivation }
    });
    this.logNews(`${player.name} agreed to an extension with ${teamId}`, {
      teamId,
      playerId,
      years: offerYears,
      salary: offerSalary
    });
    return { ok: true, teamId, playerId, contract: result.contract, demand, morale: player.morale, motivation: player.motivation };
  }

  resignPlayer({ teamId, playerId, years = 3, salary = null }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };
    const contract = buildContract({
      overall: player.overall,
      years: clamp(Number(years), 1, 5),
      salary: salary == null ? undefined : Number(salary),
      minSalary: 850_000,
      maxSalary: 25_000_000,
      rng: this.rng
    });
    if (this.getTeamCapSummary(teamId).capSpace < contract.capHit) {
      return { ok: false, error: "Insufficient cap space." };
    }
    player.contract = contract;
    this.statBook.reindexPlayers();
    this.logTransaction({
      type: "re-sign",
      teamId,
      playerId,
      playerName: player.name,
      details: {
        yearsRemaining: contract.yearsRemaining,
        capHit: contract.capHit,
        salary: contract.salary
      }
    });
    return { ok: true, teamId, playerId, contract };
  }

  restructurePlayerContract({ teamId, playerId }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };
    const oldContract = normalizeContract(player.contract);
    player.contract = restructureContract(player.contract, this.rng);
    this.logTransaction({
      type: "restructure",
      teamId,
      playerId,
      playerName: player.name,
      details: {
        capHitBefore: oldContract.capHit,
        capHitAfter: player.contract.capHit,
        yearsRemaining: player.contract.yearsRemaining
      }
    });
    return { ok: true, teamId, playerId, contract: player.contract };
  }

  applyFranchiseTagToPlayer({ teamId, playerId, salary = null }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };
    const eligible = this.listFranchiseTagCandidates(teamId).some((candidate) => candidate.id === playerId);
    if (!eligible) {
      return { ok: false, error: "Franchise tag can only be applied to expiring contracts." };
    }
    const alreadyTaggedTeam = this.league.players.some(
      (entry) =>
        entry.teamId === teamId &&
        entry.id !== playerId &&
        normalizeContract(entry.contract).franchiseTagYear === this.currentYear
    );
    if (alreadyTaggedTeam) return { ok: false, error: "Team has already used its franchise tag this season." };
    const tagged = applyFranchiseTag(player.contract, { year: this.currentYear, salary });
    if (this.getTeamCapSummary(teamId).capSpace + normalizeContract(player.contract).capHit < tagged.capHit) {
      return { ok: false, error: "Insufficient cap space for franchise tag." };
    }
    player.contract = tagged;
    this.logTransaction({
      type: "franchise-tag",
      teamId,
      playerId,
      playerName: player.name,
      details: { capHit: tagged.capHit }
    });
    return { ok: true, teamId, playerId, contract: tagged };
  }

  applyFifthYearOptionToPlayer({ teamId, playerId, salary = null }) {
    const player = this.league.players.find(
      (entry) => entry.id === playerId && entry.teamId === teamId && entry.status === "active"
    );
    if (!player) return { ok: false, error: "Player not found on team." };
    const eligible = this.listFifthYearOptionCandidates(teamId).some((candidate) => candidate.id === playerId);
    if (!eligible) {
      return { ok: false, error: "Fifth-year option is only valid for eligible rookie-scale players." };
    }
    const original = normalizeContract(player.contract);
    const updated = applyFifthYearOption(original, { salary });
    if (this.getTeamCapSummary(teamId).capSpace + original.capHit < updated.capHit) {
      return { ok: false, error: "Insufficient cap space for option year." };
    }
    player.contract = updated;
    this.logTransaction({
      type: "fifth-year-option",
      teamId,
      playerId,
      playerName: player.name,
      details: { capHit: updated.capHit, yearsRemaining: updated.yearsRemaining }
    });
    return { ok: true, teamId, playerId, contract: updated };
  }
  decrementAvailability() {
    for (const player of this.league.players) {
      if (player.injury && player.injury.weeksRemaining > 0) {
        player.injury.weeksRemaining -= 1;
        if (player.injury.weeksRemaining <= 0) player.injury = null;
      } else if (!player.injury && Number(player.reinjuryRisk || 0) > 0) {
        player.reinjuryRisk = clamp(player.reinjuryRisk - 0.02, 0, 0.55);
      }
      if ((player.suspensionWeeks || 0) > 0) player.suspensionWeeks -= 1;
    }
  }

  resetGameDayInactives() {
    for (const player of this.league.players) {
      if (player.designations) player.designations.gameDayInactive = false;
    }
  }

  runStaffAndStrategyRefresh() {
    const era = this.getEraProfile();
    for (const team of this.league.teams) {
      if (!team.staff || !team.staff.headCoach) team.staff = buildStaffProfile(this.rng, team.staff);
      applyStaffToCoaching(team);
      const roster = teamPlayersAll(this.league, team.id);
      team.scheme.passRate = Number(clamp((team.scheme?.passRate || 0.54) + era.passRateDelta * 0.02, 0.34, 0.72).toFixed(2));
      for (const player of roster) player.schemeFit = computeSchemeFit(player, team);
      team.strategyProfile = computeTeamStrategyProfile(team, roster);
      team.chemistry = computeTeamChemistry(roster, team);
      team.offenseRating = clamp(Math.round((team.offenseRating || 70) + era.offenseBoost * 0.1), 45, 99);
    }
  }

  processStaffLifecycle() {
    for (const team of this.league.teams) {
      if (!team.staff) team.staff = buildStaffProfile(this.rng, team.staff);
      for (const role of ["headCoach", "offensiveCoordinator", "defensiveCoordinator"]) {
        const staffer = team.staff[role];
        staffer.yearsRemaining = Math.max(0, (staffer.yearsRemaining || 1) - 1);
        if (staffer.yearsRemaining <= 0) {
          const replacement = buildStaffProfile(this.rng)[role];
          team.staff[role] = replacement;
          this.logNews(`${team.id} hired a new ${role}`, { teamId: team.id, role, name: replacement.name });
        }
      }
      applyStaffToCoaching(team);
    }
  }

  generateWeekEvents(weekResult) {
    const injuries = [];
    const suspensions = [];
    const settings = this.getLeagueSettings();
    for (const game of weekResult.games) {
      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        const roster = activeRosterPlayers(this.league, teamId);
        if (!roster.length) continue;

        const injuryRolls = this.rng.int(0, 2);
        for (let i = 0; i < injuryRolls; i += 1) {
          if (!settings.allowInjuries) continue;
          const team = teamById(this.league, teamId);
          const rehabBoost = (team?.owner?.facilities?.rehab || 72) - 72;
          const injuryBase = 0.24 * settings.injuryRateMultiplier + this.getEraProfile().injuryDelta;
          if (!this.rng.chance(clamp(injuryBase - rehabBoost * 0.0012, 0.04, 0.65))) continue;
          const player = this.rng.pick(roster);
          if (player.injury) continue;
          const reinjuryBias = Number(player.reinjuryRisk || 0);
          const severity = this.rng.weightedPick({
            minor: clamp(0.63 - reinjuryBias * 0.2, 0.2, 0.8),
            moderate: clamp(0.3 + reinjuryBias * 0.12, 0.1, 0.6),
            major: clamp(0.07 + reinjuryBias * 0.08, 0.03, 0.32)
          });
          const weeks =
            severity === "minor"
              ? this.rng.int(1, 2)
              : severity === "moderate"
                ? this.rng.int(3, 6)
                : this.rng.int(7, 16);
          const bodyPart = randomInjuryType(this.rng);
          const reinjuryRisk = clamp(
            (player.injury?.reinjuryRisk || 0) +
              (severity === "major" ? 0.2 : severity === "moderate" ? 0.11 : 0.06),
            0.02,
            0.55
          );
          player.injury = {
            type: bodyPart,
            bodyPart,
            severity,
            weeksRemaining: weeks,
            startedWeek: this.currentWeek,
            year: this.currentYear,
            reinjuryRisk
          };
          player.reinjuryRisk = reinjuryRisk;
          injuries.push({
            playerId: player.id,
            player: player.name,
            teamId,
            position: player.position,
            injury: player.injury
          });
          if (player.injury.severity === "major") {
            this.logNews(`Major injury: ${player.name} (${teamId})`, {
              teamId,
              playerId: player.id,
              severity: player.injury.severity,
              type: player.injury.type
            });
          }
        }

        if (this.rng.chance(0.012)) {
          const player = this.rng.pick(roster);
          const weeks = this.rng.int(1, 4);
          player.suspensionWeeks = Math.max(player.suspensionWeeks || 0, weeks);
          suspensions.push({
            playerId: player.id,
            player: player.name,
            teamId,
            position: player.position,
            weeks,
            reason: randomSuspensionReason(this.rng)
          });
        }
      }
    }
    return { injuries, suspensions };
  }

  generateNarratives(weekResult) {
    const settings = this.getLeagueSettings();
    if (!settings.enableNarratives) return [];
    const notes = [];
    const blowouts = (weekResult.games || []).filter((g) => Math.abs((g.homeScore || 0) - (g.awayScore || 0)) >= 20);
    for (const game of blowouts.slice(0, 2)) {
      const winner = game.winnerId || "TIE";
      const loser = winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
      const note = `${winner} dominated ${loser} in Week ${weekResult.week}`;
      this.logNews(note, { teamId: winner, opponent: loser, narrative: "blowout" });
      notes.push(note);
    }
    if (weekResult.week % 4 === 0) {
      const passLeader = this.statBook.getPlayerSeasonTable("passing", { year: this.currentYear })[0];
      const rushLeader = this.statBook.getPlayerSeasonTable("rushing", { year: this.currentYear })[0];
      if (passLeader) {
        const note = `MVP watch: ${passLeader.player} leads passing yards (${passLeader.yds})`;
        this.logNews(note, { playerId: passLeader.playerId, teamId: passLeader.tm, narrative: "mvp-watch" });
        notes.push(note);
      }
      if (rushLeader) {
        const note = `OPOY watch: ${rushLeader.player} leads rushing yards (${rushLeader.yds})`;
        this.logNews(note, { playerId: rushLeader.playerId, teamId: rushLeader.tm, narrative: "award-race" });
        notes.push(note);
      }
    }
    return notes;
  }

  advanceWeek() {
    if (this.phase === "regular-season") {
      this.resetGameDayInactives();
      this.runStaffAndStrategyRefresh();
      this.grantWeeklyScoutingPoints();
      this.decrementAvailability();
      this.processWaivers();
      this.runAiTeamMaintenance();
      const weekBlock = this.seasonSchedule[this.currentWeek - 1];
      if (!weekBlock) {
        this.phase = "postseason";
        return { ok: true, phase: this.phase, message: "Regular season complete. Advance again for playoffs." };
      }

      const simStart = Date.now();
      const weekResult = simulateRegularSeasonWeek({
        league: this.league,
        statBook: this.statBook,
        year: this.currentYear,
        weekBlock,
        rng: this.rng,
        mode: this.mode
      });
      this.trackTiming("simulate-week", Date.now() - simStart);
      this.trackCounter("weeks-simulated", 1);
      applyWeekMorale(this.league, weekResult);
      const events = this.generateWeekEvents(weekResult);
      weekResult.events = events;
      weekResult.narratives = this.generateNarratives(weekResult);
      this.processOwnerFinances(weekResult);
      this.refreshChemistryAndSchemeFit();
      this.weekResultsCurrentSeason.push(weekResult);
      this.league.weeklyHistory.push({ year: this.currentYear, week: weekResult.week, ...weekResult });
      this.archiveGameResults(weekResult.games);

      this.currentWeek += 1;
      if (this.currentWeek > NFL_STRUCTURE.regularSeasonWeeks) this.phase = "postseason";
      return { ok: true, phase: this.phase, week: weekResult.week, games: weekResult.games, events };
    }

    if (this.phase === "postseason") {
      const playoffResult = runPlayoffsAndSuperBowl({
        league: this.league,
        statBook: this.statBook,
        year: this.currentYear,
        rng: this.rng,
        mode: this.mode
      });

      const calibration = applySeasonRealismCalibration({
        league: this.league,
        year: this.currentYear,
        profile: this.realismProfile
      });

      this.lastCalibrationReport = calibration;
      this.statBook.archiveTeamSeason(this.currentYear);
      this.previousDivisionRanks = playoffResult.divisionRanksForNextYear;
      this.league.champions.push({
        year: this.currentYear,
        championTeamId: playoffResult.superBowl.championTeamId,
        runnerUpTeamId: playoffResult.superBowl.runnerUpTeamId,
        score: `${playoffResult.superBowl.homeScore}-${playoffResult.superBowl.awayScore}`
      });
      this.league.history.push({
        year: this.currentYear,
        standings: playoffResult.standings,
        superBowl: playoffResult.superBowl,
        playoffBracket: playoffResult.bracket,
        realismCalibration: calibration,
        weekly: this.weekResultsCurrentSeason
      });
      this.logTransaction({
        type: "championship",
        teamId: playoffResult.superBowl.championTeamId,
        details: {
          runnerUp: playoffResult.superBowl.runnerUpTeamId,
          score: `${playoffResult.superBowl.homeScore}-${playoffResult.superBowl.awayScore}`
        }
      });
      this.lastAwardSummary = estimateAwards(this, this.currentYear);
      this.latestPostseason = playoffResult;
      this.archiveGameResults(playoffResult.gameArchiveEntries);
      this.prepareDraft();
      this.seedCompLedgerForUpcomingOffseason();
      this.resetOffseasonPipeline(this.currentYear);
      this.league.freeAgencyMarket.stage = "legal-tampering";
      this.logNews(`${playoffResult.superBowl.championTeamId} won the championship`, {
        teamId: playoffResult.superBowl.championTeamId,
        runnerUp: playoffResult.superBowl.runnerUpTeamId
      });
      this.seasonsSimulated += 1;
      this.phase = "offseason";
      return {
        ok: true,
        phase: this.phase,
        year: this.currentYear,
        superBowl: playoffResult.superBowl,
        awards: this.lastAwardSummary
      };
    }

    if (this.phase === "offseason") {
      const stageResult = this.advanceOffseasonPipeline();
      if (stageResult.completed) {
        this.league.freeAgencyMarket.stage = "post-draft";
        this.startSeason(this.currentYear + 1);
        this.ensureDraftPickAssets();
        this.logNews(`Offseason complete: ${this.currentYear} season has started`, { year: this.currentYear });
        return {
          ok: true,
          phase: this.phase,
          year: this.currentYear,
          pipeline: stageResult,
          message: "Offseason complete, new season started."
        };
      }
      if (this.getLeagueSettings().autoProgressOffseason) {
        let guard = 0;
        let auto = stageResult;
        while (!auto.completed && guard < 10) {
          auto = this.advanceOffseasonPipeline();
          guard += 1;
        }
        if (auto.completed) {
          this.league.freeAgencyMarket.stage = "post-draft";
          this.startSeason(this.currentYear + 1);
          this.ensureDraftPickAssets();
        }
        return { ok: true, phase: this.phase, year: this.currentYear, pipeline: auto, message: auto.message };
      }
      return { ok: true, phase: this.phase, year: this.currentYear, pipeline: stageResult, message: stageResult.message };
    }

    return { ok: false, error: `Unknown phase: ${this.phase}` };
  }

  simulateOneSeason({ runOffseasonAfter = true } = {}) {
    while (this.phase === "regular-season") this.advanceWeek();
    const post = this.advanceWeek();
    if (runOffseasonAfter) {
      let guard = 0;
      while (this.phase === "offseason" && guard < 16) {
        this.advanceWeek();
        guard += 1;
      }
    }
    return {
      year: post.year,
      superBowl: post.superBowl,
      championTeamId: post?.superBowl?.championTeamId,
      calibrationSummary: this.lastCalibrationReport
    };
  }

  simulateSeasons(count = 1, { runOffseasonAfterLast = true } = {}) {
    const safeCount = normalizeCount(count, 1, 100, 1);
    const summaries = [];
    for (let i = 0; i < safeCount; i += 1) {
      summaries.push(
        this.simulateOneSeason({
          runOffseasonAfter: runOffseasonAfterLast || i < safeCount - 1
        })
      );
    }
    return summaries;
  }

  prepareDraft() {
    const draftYear = this.currentYear + 1;
    const prospects = createDraftClass({ size: 256, year: draftYear, rng: this.rng }).map((player, index) => ({
      ...player,
      scouting: {
        rank: index + 1,
        projectedRound: Math.min(7, Math.floor(index / 32) + 1),
        combine: {
          forty: Number(this.rng.float(4.25, 5.25).toFixed(2)),
          bench: this.rng.int(10, 40),
          shuttle: Number(this.rng.float(3.8, 4.8).toFixed(2)),
          cone: Number(this.rng.float(6.6, 8.1).toFixed(2)),
          vertical: this.rng.int(26, 44),
          broad: this.rng.int(106, 140)
        },
        proDayBoost: this.rng.int(-2, 4),
        scoutedOverall: clamp(player.overall + this.rng.int(-6, 7), 50, 95)
      }
    }));

    const order = sortStandings(this.league.teams)
      .slice()
      .reverse()
      .map((team) => team.id);
    const mockDraft = prospects.slice(0, 32).map((prospect, idx) => ({
      pick: idx + 1,
      teamId: order[idx],
      playerId: prospect.id,
      player: prospect.name,
      pos: prospect.position
    }));

    this.league.pendingDraft = {
      year: draftYear,
      available: prospects,
      order,
      currentPick: 1,
      totalPicks: 224,
      completed: false,
      mockDraft,
      selections: []
    };
    this.initializeDraftScouting();
    return this.league.pendingDraft;
  }

  getDraftState() {
    return this.league.pendingDraft;
  }

  getScheduleWeek(week = this.currentWeek) {
    const weekNumber = Number(week);
    if (!Number.isFinite(weekNumber)) return null;
    const weekBlock = this.seasonSchedule.find((entry) => entry.week === weekNumber);
    if (!weekBlock) return null;

    const historicalWeek = this.league.weeklyHistory
      .slice()
      .reverse()
      .find((entry) => entry.year === this.currentYear && entry.week === weekNumber);
    const playedByKey = new Map(
      (historicalWeek?.games || []).map((game) => [weekGameKey(game.homeTeamId, game.awayTeamId), game])
    );

    const games = weekBlock.games.map((game) => {
      const played = playedByKey.get(weekGameKey(game.homeTeamId, game.awayTeamId));
      return {
        week: weekNumber,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        played: Boolean(played),
        homeScore: played?.homeScore ?? null,
        awayScore: played?.awayScore ?? null,
        winnerId: played?.winnerId ?? null,
        isTie: played?.isTie ?? false
      };
    });

    return {
      year: this.currentYear,
      week: weekNumber,
      played: Boolean(historicalWeek),
      games
    };
  }

  archiveGameResults(games = []) {
    for (const game of games || []) {
      if (!game?.gameId || !game?.boxScore) continue;
      const summary = {
        gameId: game.gameId,
        year: game.year ?? this.currentYear,
        week: game.week ?? this.currentWeek,
        seasonType: game.seasonType || "regular",
        label: game.label || "game",
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        winnerId: game.winnerId,
        isTie: game.isTie === true,
        boxScore: game.boxScore
      };
      const existing = this.league.gameArchive.findIndex((entry) => entry.gameId === summary.gameId);
      if (existing >= 0) this.league.gameArchive.splice(existing, 1, summary);
      else this.league.gameArchive.push(summary);
    }
    if (this.league.gameArchive.length > 800) {
      this.league.gameArchive = this.league.gameArchive.slice(-800);
    }
  }

  getRecentBoxScores(teamId = this.controlledTeamId, limit = 8) {
    const safeLimit = normalizeCount(limit, 1, 20, 8);
    return this.league.gameArchive
      .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
      .slice()
      .sort((a, b) => b.year - a.year || b.week - a.week || String(b.gameId).localeCompare(String(a.gameId)))
      .slice(0, safeLimit)
      .map((game) => ({
        gameId: game.gameId,
        year: game.year,
        week: game.week,
        seasonType: game.seasonType,
        label: game.label,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeTeamName: teamById(this.league, game.homeTeamId)?.name || game.homeTeamId,
        awayTeamName: teamById(this.league, game.awayTeamId)?.name || game.awayTeamId,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        winnerId: game.winnerId,
        isTie: game.isTie === true
      }));
  }

  getBoxScore(gameId) {
    const game = this.league.gameArchive.find((entry) => entry.gameId === gameId);
    if (!game) return null;
    return {
      ...game.boxScore,
      homeTeamName: teamById(this.league, game.homeTeamId)?.name || game.homeTeamId,
      awayTeamName: teamById(this.league, game.awayTeamId)?.name || game.awayTeamId
    };
  }

  logTransaction({ type, teamId = null, teamA = null, teamB = null, playerId = null, playerName = null, details = {} }) {
    this.league.transactionSeq += 1;
    const entry = {
      id: `TX-${this.currentYear}-${this.league.transactionSeq}`,
      seq: this.league.transactionSeq,
      year: this.currentYear,
      week: this.currentWeek,
      phase: this.phase,
      type,
      ...pickDefined({ teamId, teamA, teamB, playerId, playerName }),
      details
    };
    this.league.transactionLog.push(entry);
    if (this.league.transactionLog.length > 5000) {
      this.league.transactionLog = this.league.transactionLog.slice(-5000);
    }
    this.appendEvent("transaction", entry);
    return entry;
  }

  getTransactionLog({ limit = 250, team = null, type = null, year = null, playerId = null } = {}) {
    const safeLimit = normalizeCount(limit, 1, 2000, 250);
    return this.league.transactionLog
      .slice()
      .reverse()
      .filter((entry) => (!team ? true : entry.teamId === team || entry.teamA === team || entry.teamB === team))
      .filter((entry) => (!type ? true : entry.type === type))
      .filter((entry) => (year == null ? true : entry.year === year))
      .filter((entry) => (!playerId ? true : entry.playerId === playerId))
      .slice(0, safeLimit);
  }

  getSeasonCalendar(year = this.currentYear) {
    const targetYear = Number(year);
    if (!Number.isFinite(targetYear)) return null;

    const availableYears = new Set([this.currentYear, ...this.league.history.map((entry) => entry.year)]);
    if (!availableYears.has(targetYear)) {
      return {
        year: targetYear,
        availableYears: [...availableYears].sort((a, b) => b - a),
        weeks: [],
        postseason: null,
        superBowl: null
      };
    }

    const weeklyHistory = this.league.weeklyHistory.filter((entry) => entry.year === targetYear);
    const weeklyByWeek = new Map(weeklyHistory.map((entry) => [entry.week, entry]));
    let weeks = [];

    if (targetYear === this.currentYear) {
      weeks = this.seasonSchedule.map((weekBlock) => {
        const historicalWeek = weeklyByWeek.get(weekBlock.week);
        const playedByKey = new Map(
          (historicalWeek?.games || []).map((game) => [weekGameKey(game.homeTeamId, game.awayTeamId), game])
        );
        const games = weekBlock.games.map((game) => {
          const played = playedByKey.get(weekGameKey(game.homeTeamId, game.awayTeamId));
          return {
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            played: Boolean(played),
            homeScore: played?.homeScore ?? null,
            awayScore: played?.awayScore ?? null,
            winnerId: played?.winnerId ?? null,
            isTie: played?.isTie ?? false
          };
        });
        return { week: weekBlock.week, played: Boolean(historicalWeek), games };
      });
    } else {
      const historicalSeason = this.league.history.find((entry) => entry.year === targetYear);
      weeks = (historicalSeason?.weekly || [])
        .map((weekEntry) => ({
          week: weekEntry.week,
          played: true,
          games: (weekEntry.games || []).map((game) => ({
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            played: true,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            winnerId: game.winnerId,
            isTie: game.isTie
          }))
        }))
        .sort((a, b) => a.week - b.week);
    }

    const historicalSeason = this.league.history.find((entry) => entry.year === targetYear);
    const postseason = targetYear === this.currentYear ? this.latestPostseason?.bracket || null : historicalSeason?.playoffBracket || null;
    const superBowl = targetYear === this.currentYear ? this.latestPostseason?.superBowl || null : historicalSeason?.superBowl || null;

    return {
      year: targetYear,
      currentYear: this.currentYear,
      currentWeek: this.currentWeek,
      availableYears: [...availableYears].sort((a, b) => b - a),
      weeks,
      postseason,
      superBowl
    };
  }

  getPlayerProfile(playerId, { seasonType = "regular" } = {}) {
    const player = [...this.league.players, ...this.league.retiredPlayers].find((entry) => entry.id === playerId);
    if (!player) return null;
    const team = teamById(this.league, player.teamId);
    const normalizedSeasonType = normalizeSeasonType(seasonType, "regular");

    const seasonRows = Object.fromEntries(
      TABLE_CATEGORIES.map((category) => [
        category,
        this.statBook
          .getPlayerSeasonTable(category, { seasonType: normalizedSeasonType })
          .filter((row) => row.playerId === playerId)
          .sort((a, b) => b.year - a.year)
      ])
    );

    const career = Object.fromEntries(
      TABLE_CATEGORIES.map((category) => [
        category,
        this.statBook
          .getPlayerCareerTable(category, { seasonType: normalizedSeasonType })
          .find((row) => row.playerId === playerId) || null
      ])
    );

    return {
      player: {
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        teamName: team?.name || player.teamId,
        position: player.position,
        age: player.age,
        heightInches: player.heightInches || null,
        weightLbs: player.weightLbs || null,
        experience: player.experience,
        overall: player.overall,
        schemeFit: player.schemeFit || null,
        motivation: player.motivation,
        reinjuryRisk: player.reinjuryRisk || 0,
        developmentTrait: player.developmentTrait,
        potential: player.potential,
        status: player.status,
        rosterSlot: player.rosterSlot,
        designations: player.designations || { ir: false, pup: false, nfi: false, gameDayInactive: false },
        morale: player.morale,
        injury: player.injury,
        suspensionWeeks: player.suspensionWeeks,
        profile: player.profile,
        ratings: player.ratings,
        contract: normalizeContract(player.contract)
      },
      seasonType: normalizedSeasonType,
      timeline: this.getPlayerTimeline(playerId, { seasonType: normalizedSeasonType })?.timeline || [],
      career,
      seasonRows,
      awardsHistory: this.getPlayerAwards(playerId),
      transactionHistory: this.getTransactionLog({ playerId, limit: 80 })
    };
  }

  draftUserPick({ playerId }) {
    const draft = this.league.pendingDraft;
    if (!draft || draft.completed) return { ok: false, error: "No active draft." };
    const teamOnClock = draft.order[(draft.currentPick - 1) % 32];
    if (teamOnClock !== this.controlledTeamId) return { ok: false, error: "User team is not on the clock." };
    const round = Math.floor((draft.currentPick - 1) / 32) + 1;
    const pickIndex = draft.available.findIndex((prospect) => prospect.id === playerId);
    if (pickIndex < 0) return { ok: false, error: "Prospect not available." };

    const prospect = draft.available.splice(pickIndex, 1)[0];
    prospect.teamId = teamOnClock;
    prospect.contract = rookieContract(round, prospect.overall, this.rng);
    prospect.rosterSlot = "active";
    prospect.profile.source = "drafted";
    this.league.players.push(prospect);

    draft.selections.push({
      pick: draft.currentPick,
      round,
      teamId: teamOnClock,
      playerId: prospect.id,
      player: prospect.name,
      pos: prospect.position
    });
    draft.currentPick += 1;
    if (draft.currentPick > draft.totalPicks || draft.available.length === 0) draft.completed = true;
    this.statBook.reindexPlayers();
    return { ok: true, selection: draft.selections[draft.selections.length - 1], draft };
  }

  runCpuDraft({ picks = 9999, untilUserPick = true } = {}) {
    const draft = this.league.pendingDraft;
    if (!draft || draft.completed) return { ok: false, error: "No active draft." };
    let completed = 0;
    while (!draft.completed && completed < picks) {
      const teamOnClock = draft.order[(draft.currentPick - 1) % 32];
      if (untilUserPick && teamOnClock === this.controlledTeamId) break;
      const round = Math.floor((draft.currentPick - 1) / 32) + 1;

      const needs = this.getRosterNeedSummary(teamOnClock)
        .filter((item) => item.delta < 0)
        .sort((a, b) => a.delta - b.delta);
      const needMap = new Map(needs.map((item) => [item.position, Math.abs(item.delta)]));
      const currentCounts = {};
      for (const player of activeRosterPlayers(this.league, teamOnClock)) {
        currentCounts[player.position] = (currentCounts[player.position] || 0) + 1;
      }

      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < draft.available.length; i += 1) {
        const prospect = draft.available[i];
        const needBoost = (needMap.get(prospect.position) || 0) * 13;
        const depthPenalty =
          (currentCounts[prospect.position] || 0) > (ROSTER_TEMPLATE[prospect.position] || 2) + 2 ? 18 : 0;
        const projectionBonus = Math.max(0, 9 - (prospect.scouting?.projectedRound || 9)) * 2;
        const score = prospect.overall * 2 + needBoost + projectionBonus - depthPenalty + this.rng.int(-4, 4);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      const pickIndex = Math.max(0, bestIndex);

      const prospect = draft.available.splice(pickIndex, 1)[0];
      if (!prospect) {
        draft.completed = true;
        break;
      }
      prospect.teamId = teamOnClock;
      prospect.contract = rookieContract(round, prospect.overall, this.rng);
      prospect.rosterSlot = "active";
      prospect.profile.source = "drafted";
      this.league.players.push(prospect);

      draft.selections.push({
        pick: draft.currentPick,
        round,
        teamId: teamOnClock,
        playerId: prospect.id,
        player: prospect.name,
        pos: prospect.position
      });
      draft.currentPick += 1;
      completed += 1;
      if (draft.currentPick > draft.totalPicks || draft.available.length === 0) draft.completed = true;
    }
    this.statBook.reindexPlayers();
    return { ok: true, completedPicks: completed, draft };
  }
  getDashboardState() {
    const controlledTeam = this.getControlledTeam();
    const currentRows = this.statBook.getTeamSeasonTable({ year: this.currentYear });
    const fallbackRows = this.statBook.getTeamSeasonTable({ year: this.currentYear - 1 });
    const standingsRows = (currentRows.length ? currentRows : fallbackRows)
      .slice(0, 32)
      .map((row) => ({ ...row, isControlledTeam: row.team === this.controlledTeamId }));

    const calibrationSnapshot = this.lastCalibrationReport
      ? Object.fromEntries(
          Object.entries(this.lastCalibrationReport.positions).map(([position, details]) => [
            position,
            {
              adjustedPlayers: details.adjustedPlayers,
              averages: Object.fromEntries(
                Object.entries(details.metrics || {}).map(([metric, values]) => [metric, values.postAverage])
              )
            }
          ])
        )
      : null;

    return {
      game: GAME_NAME,
      phase: this.phase,
      currentYear: this.currentYear,
      currentWeek: this.currentWeek,
      seasonsSimulated: this.seasonsSimulated,
      controlledTeamId: this.controlledTeamId,
      controlledTeam: controlledTeam
        ? {
            ...toTeamIdentity(controlledTeam),
            offenseRating: controlledTeam.offenseRating,
            defenseRating: controlledTeam.defenseRating,
            overallRating: controlledTeam.overallRating,
            coaching: controlledTeam.coaching,
            scheme: controlledTeam.scheme,
            chemistry: controlledTeam.chemistry || 70,
            owner: controlledTeam.owner || null
          }
        : null,
      cap: this.getTeamCapSummary(this.controlledTeamId),
      settings: this.getLeagueSettings(),
      eraProfile: this.getEraProfile(),
      offseasonPipeline: this.getOffseasonPipeline(),
      rosterNeeds: this.getRosterNeedSummary(this.controlledTeamId),
      contractTools: {
        expiring: this.listExpiringContracts(this.controlledTeamId),
        tagEligible: this.listFranchiseTagCandidates(this.controlledTeamId),
        optionEligible: this.listFifthYearOptionCandidates(this.controlledTeamId)
      },
      scouting: this.getScoutingBoard({ teamId: this.controlledTeamId, limit: 40 }),
      depthChartSnapShare: this.getDepthChartSnapShare(this.controlledTeamId),
      draftPickAssets: this.getDraftPickAssets(this.controlledTeamId),
      compPicks: this.getCompensatoryPicks({ teamId: this.controlledTeamId }),
      news: this.getNewsFeed({ limit: 20 }),
      eventLog: this.getEventLog({ limit: 30 }),
      observability: this.getObservability(),
      calibrationJobs: this.listCalibrationJobs(10),
      teams: this.league.teams.map(toDashboardTeam),
      champions: this.league.champions.slice(-20),
      awards: this.league.awards.slice(-20),
      latestStandings: standingsRows,
      latestWeekResults: this.weekResultsCurrentSeason.slice(-1)[0] || null,
      recentBoxScores: this.getRecentBoxScores(this.controlledTeamId, 8),
      injuryReport: this.league.players
        .filter((player) => player.status === "active" && player.injury && player.injury.weeksRemaining > 0)
        .slice(0, 80)
        .map((player) => ({
          playerId: player.id,
          player: player.name,
          teamId: player.teamId,
          pos: player.position,
          injury: player.injury
        })),
      suspensionReport: this.league.players
        .filter((player) => player.status === "active" && (player.suspensionWeeks || 0) > 0)
        .slice(0, 50)
        .map((player) => ({
          playerId: player.id,
          player: player.name,
          teamId: player.teamId,
          pos: player.position,
          suspensionWeeks: player.suspensionWeeks
        })),
      waiverWire: this.league.waiverWire,
      leaders: {
        passing: topRows(this.statBook.getPlayerSeasonTable("passing", { year: this.currentYear }), 15),
        rushing: topRows(this.statBook.getPlayerSeasonTable("rushing", { year: this.currentYear }), 15),
        receiving: topRows(this.statBook.getPlayerSeasonTable("receiving", { year: this.currentYear }), 15)
      },
      currentWeekSchedule: this.getScheduleWeek(this.currentWeek),
      nextWeekSchedule: this.getScheduleWeek(this.currentWeek + 1),
      records: this.statBook.getRecords(),
      lastCalibrationReport: this.lastCalibrationReport,
      lastCalibrationSnapshot: calibrationSnapshot,
      lastRealismVerificationReport: this.lastRealismVerificationReport,
      draft: this.league.pendingDraft
        ? {
            year: this.league.pendingDraft.year,
            currentPick: this.league.pendingDraft.currentPick,
            totalPicks: this.league.pendingDraft.totalPicks,
            completed: this.league.pendingDraft.completed
          }
        : null
    };
  }

  getRoster(teamId = this.controlledTeamId) {
    return teamPlayersAll(this.league, teamId).map((player) => ({
      id: player.id,
      name: player.name,
      pos: player.position,
      age: player.age,
      heightInches: player.heightInches || null,
      weightLbs: player.weightLbs || null,
      experience: player.experience,
      overall: player.overall,
      schemeFit: player.schemeFit,
      morale: player.morale,
      motivation: player.motivation,
      reinjuryRisk: Number((player.reinjuryRisk || 0).toFixed(2)),
      devTrait: player.developmentTrait,
      rosterSlot: player.rosterSlot,
      designations: player.designations || { ir: false, pup: false, nfi: false, gameDayInactive: false },
      injury: player.injury,
      suspensionWeeks: player.suspensionWeeks,
      contract: normalizeContract(player.contract)
    }));
  }

  getFreeAgents({ position = null, limit = 200, minOverall = null, maxAge = null, minAge = null } = {}) {
    const safeLimit = normalizeCount(limit, 1, 500, 200);
    return this.league.players
      .filter((player) => player.status === "active" && (player.teamId === "FA" || player.teamId === "WAIVER"))
      .filter((player) => (position ? player.position === position : true))
      .filter((player) => (minOverall == null ? true : player.overall >= minOverall))
      .filter((player) => (maxAge == null ? true : player.age <= maxAge))
      .filter((player) => (minAge == null ? true : player.age >= minAge))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, safeLimit)
      .map((player) => ({
        id: player.id,
        name: player.name,
        pos: player.position,
        age: player.age,
        heightInches: player.heightInches || null,
        weightLbs: player.weightLbs || null,
        overall: player.overall,
        schemeFit: player.schemeFit || null,
        devTrait: player.developmentTrait,
        source: player.teamId === "WAIVER" ? "waiver" : "free-agent"
      }));
  }

  getPositionMaxAge(position) {
    return POSITION_MAX_AGE_LIMITS[position] || 40;
  }

  getRetiredPlayers({ position = null, limit = 200, minOverall = null, maxAge = null, minAge = null } = {}) {
    const safeLimit = normalizeCount(limit, 1, 1000, 200);
    return this.league.retiredPlayers
      .filter((player) => (position ? player.position === position : true))
      .filter((player) => (minOverall == null ? true : player.overall >= minOverall))
      .filter((player) => (maxAge == null ? true : player.age <= maxAge))
      .filter((player) => (minAge == null ? true : player.age >= minAge))
      .sort((a, b) => (b.retiredYear || 0) - (a.retiredYear || 0) || b.overall - a.overall)
      .slice(0, safeLimit)
      .map((player) => ({
        id: player.id,
        name: player.name,
        pos: player.position,
        age: player.age,
        overall: player.overall,
        retiredYear: player.retiredYear,
        maxAge: this.getPositionMaxAge(player.position),
        seasonsPlayed: player.seasonsPlayed || 0,
        canOverride: (player.age || 0) <= this.getPositionMaxAge(player.position)
      }));
  }

  overrideRetirement({
    playerId,
    teamId = this.controlledTeamId,
    minWinningPct = null,
    forceSign = true
  } = {}) {
    const idx = this.league.retiredPlayers.findIndex((player) => player.id === playerId);
    if (idx < 0) return { ok: false, error: "Retired player not found." };
    const player = this.league.retiredPlayers[idx];
    const maxAge = this.getPositionMaxAge(player.position);
    if ((player.age || 0) > maxAge) {
      return { ok: false, error: `Cannot override retirement: ${player.position} max age is ${maxAge}.` };
    }

    const destinationTeam = forceSign && teamById(this.league, teamId) ? teamId : "FA";
    if (destinationTeam !== "FA" && activeRosterPlayers(this.league, destinationTeam).length >= MAX_ACTIVE_ROSTER) {
      return { ok: false, error: "Destination team active roster is full (53)." };
    }

    const overrideMinWinningPct = clamp(
      Number(minWinningPct ?? this.getLeagueSettings().retirementOverrideMinWinningPct ?? 0.55),
      0.3,
      0.9
    );

    let contract = normalizeContract(player.contract);
    if (destinationTeam !== "FA") {
      contract = buildContract({
        overall: player.overall,
        years: 1,
        salary: Math.max(1_200_000, Math.round((player.overall || 70) * 140_000)),
        minSalary: 850_000,
        maxSalary: 35_000_000,
        rng: this.rng
      });
      if (this.getTeamCapSummary(destinationTeam).capSpace < contract.capHit) {
        return { ok: false, error: "Destination team lacks cap space for a comeback contract." };
      }
    } else {
      contract = {
        salary: 0,
        yearsRemaining: 0,
        capHit: 0,
        baseSalary: 0,
        signingBonus: 0,
        guaranteed: 0,
        deadCapRemaining: 0,
        restructureCount: 0
      };
    }

    this.league.retiredPlayers.splice(idx, 1);
    player.status = "active";
    player.retiredYear = null;
    player.teamId = destinationTeam;
    player.contract = contract;
    player.rosterSlot = destinationTeam === "FA" ? "active" : "active";
    player.retirementOverride = {
      active: true,
      minWinningPct: overrideMinWinningPct,
      teamId: destinationTeam === "FA" ? null : destinationTeam,
      createdYear: this.currentYear
    };
    if (!player.designations || typeof player.designations !== "object") {
      player.designations = { ir: false, pup: false, nfi: false, gameDayInactive: false };
    }
    this.league.players.push(player);
    recalculateAllTeamRatings(this.league);
    this.statBook.reindexPlayers();

    this.logTransaction({
      type: "retirement-override",
      teamId: destinationTeam,
      playerId: player.id,
      playerName: player.name,
      details: {
        teamId: destinationTeam,
        minWinningPct: overrideMinWinningPct
      }
    });
    this.logNews(`${player.name} came out of retirement`, {
      teamId: destinationTeam === "FA" ? null : destinationTeam,
      playerId: player.id
    });

    return {
      ok: true,
      player: {
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        pos: player.position,
        age: player.age,
        overall: player.overall,
        contract: normalizeContract(player.contract),
        retirementOverride: player.retirementOverride
      }
    };
  }

  getFreeAgencyMarket({ teamId = this.controlledTeamId, limit = 60 } = {}) {
    const safeLimit = normalizeCount(limit, 5, 200, 60);
    const freeAgents = this.getFreeAgents({ limit: safeLimit });
    const offers = (this.league.freeAgencyMarket?.offers || []).filter((offer) => offer.teamId === teamId);
    return {
      phase: this.phase,
      stage: this.league.freeAgencyMarket?.stage || "open-market",
      teamId,
      offers,
      freeAgents
    };
  }

  submitFreeAgencyOffer({ teamId, playerId, years = 2, salary = null }) {
    if (!teamById(this.league, teamId)) return { ok: false, error: "Invalid team." };
    const player = this.league.players.find(
      (entry) =>
        entry.id === playerId &&
        entry.status === "active" &&
        (entry.teamId === "FA" || entry.teamId === "WAIVER")
    );
    if (!player) return { ok: false, error: "Player not in free agency pool." };
    const proposedSalary = Math.max(850_000, Math.round(Number(salary ?? Math.max(1_000_000, player.overall * player.overall * 480))));
    const proposedYears = clamp(Math.round(Number(years || 2)), 1, 5);
    const expectedCap = Math.round(proposedSalary * 0.92);
    if (this.getTeamCapSummary(teamId).capSpace < expectedCap) {
      return { ok: false, error: "Insufficient cap space for this offer." };
    }
    if (!this.league.freeAgencyMarket || typeof this.league.freeAgencyMarket !== "object") {
      this.league.freeAgencyMarket = { stage: "open-market", offers: [] };
    }
    const offers = this.league.freeAgencyMarket.offers || [];
    const existingIndex = offers.findIndex((offer) => offer.teamId === teamId && offer.playerId === playerId);
    const payload = {
      id: `OFF-${this.currentYear}-${this.currentWeek}-${teamId}-${playerId}`,
      teamId,
      playerId,
      playerName: player.name,
      years: proposedYears,
      salary: proposedSalary,
      expectedCap
    };
    if (existingIndex >= 0) offers[existingIndex] = payload;
    else offers.push(payload);
    this.league.freeAgencyMarket.offers = offers;
    this.logTransaction({
      type: "fa-offer",
      teamId,
      playerId,
      playerName: player.name,
      details: { years: proposedYears, salary: proposedSalary }
    });
    return { ok: true, offer: payload };
  }

  processFreeAgencyMarket() {
    const offers = this.league.freeAgencyMarket?.offers || [];
    if (!offers.length) return { ok: true, signed: 0 };

    let signed = 0;
    const byPlayer = new Map();
    for (const offer of offers) {
      if (!byPlayer.has(offer.playerId)) byPlayer.set(offer.playerId, []);
      byPlayer.get(offer.playerId).push(offer);
    }

    for (const [playerId, playerOffers] of byPlayer.entries()) {
      const player = this.league.players.find(
        (entry) => entry.id === playerId && entry.status === "active" && (entry.teamId === "FA" || entry.teamId === "WAIVER")
      );
      if (!player) continue;
      const ranked = playerOffers
        .slice()
        .sort((a, b) => b.salary - a.salary || b.years - a.years || a.teamId.localeCompare(b.teamId));
      for (const offer of ranked) {
        const contract = buildContract({
          overall: player.overall,
          years: offer.years,
          salary: offer.salary,
          minSalary: 850_000,
          maxSalary: 35_000_000,
          rng: this.rng
        });
        if (this.getTeamCapSummary(offer.teamId).capSpace < contract.capHit) continue;
        player.teamId = offer.teamId;
        player.contract = contract;
        player.rosterSlot = "active";
        player.designations = { ir: false, pup: false, nfi: false, gameDayInactive: false };
        signed += 1;
        this.logTransaction({
          type: "fa-signing",
          teamId: offer.teamId,
          playerId,
          playerName: player.name,
          details: { years: offer.years, salary: offer.salary }
        });
        this.registerFreeAgencyMove({
          teamId: offer.teamId,
          direction: "gains",
          playerId,
          value: Math.round(offer.salary / 250_000)
        });
        this.logNews(`${player.name} signed with ${offer.teamId}`, { teamId: offer.teamId, playerId });
        break;
      }
    }

    this.league.freeAgencyMarket.offers = [];
    recalculateAllTeamRatings(this.league);
    this.statBook.reindexPlayers();
    return { ok: true, signed };
  }

  getTables({ table, category, filters = {} }) {
    if (table === "playerSeason") return this.statBook.getPlayerSeasonTable(category, filters);
    if (table === "playerCareer") return this.statBook.getPlayerCareerTable(category, filters);
    if (table === "teamSeason") return this.statBook.getTeamSeasonTable(filters);
    return [];
  }

  getPlayerTimeline(playerId, { seasonType = "regular" } = {}) {
    const player = [...this.league.players, ...this.league.retiredPlayers].find((entry) => entry.id === playerId);
    if (!player) return null;
    const normalizedSeasonType = normalizeSeasonType(seasonType, "regular");
    const timeline = Object.entries(player.seasonStats || {})
      .map(([year, stats]) => {
        const numericYear = Number(year);
        const teamId = stats.meta?.teamId || player.teamId;
        return {
          year: numericYear,
          teamId,
          teamName: teamById(this.league, teamId)?.name || teamId,
          pos: stats.meta?.position || player.position,
          champion: this.league.champions.some((entry) => entry.year === numericYear && entry.championTeamId === teamId),
          awards: this.getPlayerAwards(playerId, numericYear).map((entry) => entry.award),
          stats: normalizedSeasonType === "all" ? stats : stats.splits?.[normalizedSeasonType] || createZeroedSeasonStats()
        };
      })
      .filter((entry) => {
        const total =
          (entry.stats?.games || 0) +
          (entry.stats?.passing?.att || 0) +
          (entry.stats?.rushing?.att || 0) +
          (entry.stats?.receiving?.targets || 0) +
          (entry.stats?.defense?.tackles || 0) +
          (entry.stats?.kicking?.fga || 0) +
          (entry.stats?.punting?.punts || 0);
        return normalizedSeasonType === "all" ? true : total > 0;
      })
      .sort((a, b) => a.year - b.year);
    return {
      playerId: player.id,
      player: player.name,
      pos: player.position,
      status: player.status,
      seasonType: normalizedSeasonType,
      timeline
    };
  }

  getTeamHistory(teamId) {
    return {
      teamId,
      teamName: teamById(this.league, teamId)?.name || teamId,
      seasons: this.statBook.getTeamSeasonTable({ team: teamId }).sort((a, b) => a.year - b.year),
      championships: this.league.champions.filter((entry) => entry.championTeamId === teamId)
    };
  }

  getPlayerAwards(playerId, year = null) {
    return (this.league.awards || [])
      .filter((award) => (year == null ? true : award.year === year))
      .flatMap((award) =>
        Object.entries(award)
          .filter(([key, value]) => key !== "year" && value?.playerId === playerId)
          .map(([key]) => ({ year: award.year, award: key }))
      );
  }

  runRealismVerification({ seasons = 12, seedOffset = 9_973 } = {}) {
    const simYears = normalizeCount(seasons, 1, 30, 12);
    const snapshot = JSON.parse(JSON.stringify(this.toSnapshot()));
    const shiftedSeed = Number(snapshot.rngSeed || Date.now()) + Number(seedOffset || 0);
    snapshot.rngSeed = shiftedSeed;
    if (snapshot.rngStreams?.baseSeed != null) snapshot.rngStreams.baseSeed = shiftedSeed;

    const clone = GameSession.fromSnapshot(snapshot, (seed) => new this.rng.constructor(seed));
    clone.simulateSeasons(simYears, { runOffseasonAfterLast: true });

    const simulatedYears = [...new Set(clone.statBook.teamSeasonArchive.map((row) => row.year))]
      .sort((a, b) => a - b)
      .slice(-simYears);

    const seasonSnapshots = simulatedYears.map((year) =>
      buildPositionCalibrationSnapshot({
        league: clone.league,
        year,
        profile: clone.realismProfile
      })
    );

    const seasonByPosition = {};
    for (const [position, details] of Object.entries(clone.realismProfile.positions || {})) {
      const metrics = {};
      for (const [metricPath, target] of Object.entries(details.metrics || {})) {
        let weighted = 0;
        let sampleWeight = 0;
        for (const snap of seasonSnapshots) {
          const sampleSize = snap?.[position]?.sampleSize || 0;
          const actual = snap?.[position]?.averages?.[metricPath] || 0;
          weighted += actual * Math.max(1, sampleSize);
          sampleWeight += Math.max(1, sampleSize);
        }
        const actualAverage = sampleWeight ? weighted / sampleWeight : 0;
        const drift = percentDrift(actualAverage, Number(target) || 0);
        metrics[metricPath] = {
          target: Number((Number(target) || 0).toFixed(2)),
          actual: Number(actualAverage.toFixed(2)),
          driftPct: Number((drift * 100).toFixed(2)),
          status: driftStatus(Math.abs(drift))
        };
      }
      seasonByPosition[position] = {
        yearsObserved: simulatedYears.length,
        metrics
      };
    }

    const careerSnapshot = buildCareerCalibrationSnapshot({
      league: clone.league,
      profile: clone.careerRealismProfile,
      includeActive: true
    });

    const careerByPosition = {};
    for (const [position, details] of Object.entries(clone.careerRealismProfile.positions || {})) {
      const metrics = {};
      for (const [metricPath, target] of Object.entries(details.metrics || {})) {
        const actual = careerSnapshot?.[position]?.averages?.[metricPath] || 0;
        const drift = percentDrift(actual, Number(target) || 0);
        metrics[metricPath] = {
          target: Number((Number(target) || 0).toFixed(2)),
          actual: Number(actual.toFixed(2)),
          driftPct: Number((drift * 100).toFixed(2)),
          status: driftStatus(Math.abs(drift), { warn: 0.18, fail: 0.35 })
        };
      }
      careerByPosition[position] = {
        sampleSize: careerSnapshot?.[position]?.sampleSize || 0,
        minCareerSeasons: details.minCareerSeasons || 1,
        minCareerGames: details.minCareerGames || 0,
        qualifiers: details.qualifiers || {},
        metrics
      };
    }

    const flattenStatuses = (block) =>
      Object.values(block).flatMap((entry) => Object.values(entry.metrics || {}).map((metric) => metric.status));
    const seasonStatuses = flattenStatuses(seasonByPosition);
    const careerStatuses = flattenStatuses(careerByPosition);
    const statusSummary = {
      season: {
        onTarget: seasonStatuses.filter((s) => s === "on-target").length,
        watch: seasonStatuses.filter((s) => s === "watch").length,
        outOfRange: seasonStatuses.filter((s) => s === "out-of-range").length
      },
      career: {
        onTarget: careerStatuses.filter((s) => s === "on-target").length,
        watch: careerStatuses.filter((s) => s === "watch").length,
        outOfRange: careerStatuses.filter((s) => s === "out-of-range").length
      }
    };

    const report = {
      generatedAt: Date.now(),
      simulatedYears,
      sourceProfiles: {
        season: clone.realismProfile?.meta || null,
        career: clone.careerRealismProfile?.meta || null
      },
      seasonByPosition,
      careerByPosition,
      retirementPolicy: {
        maxAgeByPosition: POSITION_MAX_AGE_LIMITS,
        winningRetentionEnabled: this.getLeagueSettings().retirementWinningRetention !== false,
        overrideMinWinningPct: this.getLeagueSettings().retirementOverrideMinWinningPct ?? 0.55
      },
      statusSummary
    };
    this.lastRealismVerificationReport = report;
    return report;
  }

  getQaReport(year = this.currentYear) {
    const target = {
      pointsPerGame: 22.4,
      passingYardsPerAttempt: 7.1,
      sackRate: 0.064,
      interceptionRate: 0.024,
      rushYardsPerAttempt: 4.3
    };
    const teams = this.statBook.getTeamSeasonTable({ year });
    const ppg = teams.length ? teams.reduce((sum, row) => sum + row.pf / 17, 0) / teams.length : 0;

    const passing = this.statBook.getPlayerSeasonTable("passing", { year });
    const attempts = passing.reduce((sum, row) => sum + (row.att || 0), 0);
    const passYds = passing.reduce((sum, row) => sum + (row.yds || 0), 0);
    const sacks = passing.reduce((sum, row) => sum + (row.sacks || 0), 0);
    const ints = passing.reduce((sum, row) => sum + (row.int || 0), 0);

    const rushing = this.statBook.getPlayerSeasonTable("rushing", { year });
    const rushAtt = rushing.reduce((sum, row) => sum + (row.att || 0), 0);
    const rushYds = rushing.reduce((sum, row) => sum + (row.yds || 0), 0);

    const actual = {
      pointsPerGame: Number(ppg.toFixed(2)),
      passingYardsPerAttempt: Number((attempts ? passYds / attempts : 0).toFixed(3)),
      sackRate: Number((attempts ? sacks / (attempts + sacks) : 0).toFixed(4)),
      interceptionRate: Number((attempts ? ints / attempts : 0).toFixed(4)),
      rushYardsPerAttempt: Number((rushAtt ? rushYds / rushAtt : 0).toFixed(3))
    };

    return {
      year,
      target,
      actual,
      deltas: {
        pointsPerGame: Number((actual.pointsPerGame - target.pointsPerGame).toFixed(2)),
        passingYardsPerAttempt: Number((actual.passingYardsPerAttempt - target.passingYardsPerAttempt).toFixed(3)),
        sackRate: Number((actual.sackRate - target.sackRate).toFixed(4)),
        interceptionRate: Number((actual.interceptionRate - target.interceptionRate).toFixed(4)),
        rushYardsPerAttempt: Number((actual.rushYardsPerAttempt - target.rushYardsPerAttempt).toFixed(3))
      },
      calibration: this.lastCalibrationReport
    };
  }

  exportState() {
    const playerSeasonTables = Object.fromEntries(
      TABLE_CATEGORIES.map((category) => [category, this.statBook.getPlayerSeasonTable(category)])
    );
    const playerCareerTables = Object.fromEntries(
      TABLE_CATEGORIES.map((category) => [category, this.statBook.getPlayerCareerTable(category)])
    );

    return {
      meta: {
        game: GAME_NAME,
        yearsSimulated: this.seasonsSimulated,
        startYear: this.startYear,
        endYear: this.currentYear - (this.phase === "regular-season" ? 1 : 0),
        activePlayers: this.league.players.length,
        retiredPlayers: this.league.retiredPlayers.length
      },
      league: this.league,
      champions: this.league.champions,
      awards: this.league.awards,
      teamSeasonTable: this.statBook.getTeamSeasonTable(),
      playerSeasonTables,
      playerCareerTables,
      records: this.statBook.getRecords(),
      lastCalibrationReport: this.lastCalibrationReport,
      lastRealismVerificationReport: this.lastRealismVerificationReport
    };
  }
}
