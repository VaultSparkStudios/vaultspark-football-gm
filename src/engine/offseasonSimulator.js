import { CONTRACT_RULES, NFL_STRUCTURE, POSITION_MAX_AGE_LIMITS, ROSTER_TEMPLATE } from "../config.js";
import { createDraftClass, createSyntheticPlayer } from "../domain/playerFactory.js";
import { advanceContractYear, buildContract } from "../domain/contracts.js";
import { calculatePositionOverall, developmentDelta } from "../domain/ratings.js";
import { getAllTeamPlayers, getTeamPlayers, recalculateAllTeamRatings } from "../domain/teamFactory.js";
import { clamp } from "../utils/rng.js";

function activePlayers(league) {
  return league.players.filter((p) => p.status === "active");
}

function teamWinPct(team) {
  const g = team.season.wins + team.season.losses + team.season.ties;
  if (!g) return 0;
  return (team.season.wins + team.season.ties * 0.5) / g;
}

function positionMaxAge(position) {
  return POSITION_MAX_AGE_LIMITS[position] || 40;
}

function retirementChance(player, team = null, { winningRetention = true, seasonYear = null } = {}) {
  const maxAge = positionMaxAge(player.position);
  if (player.age > maxAge) return 1;

  let chance;
  if (player.position === "K" || player.position === "P") {
    if (player.age <= 30) chance = 0.0002;
    else if (player.age <= 34) chance = 0.004;
    else if (player.age <= 37) chance = 0.018;
    else if (player.age <= 40) chance = 0.06;
    else if (player.age <= 43) chance = 0.14;
    else chance = 0.3 + (player.age - 43) * 0.12;
  } else if (player.age <= 26) chance = 0.0003;
  else if (player.age <= 28) chance = 0.01;
  else if (player.age <= 30) chance = 0.04;
  else if (player.age <= 32) chance = 0.1;
  else if (player.age <= 34) chance = 0.2;
  else if (player.age <= 36) chance = 0.35;
  else if (player.age <= 38) chance = 0.55;
  else chance = 0.72 + (player.age - 38) * 0.1;

  if (player.age >= maxAge) chance = Math.max(chance, 0.94);
  else if (player.age >= maxAge - 1) chance = Math.max(chance, 0.72);
  else if (player.age >= maxAge - 2) chance = Math.max(chance, 0.58);

  const winPct = team ? teamWinPct(team) : 0;
  if (winningRetention) {
    if (winPct >= 0.67) chance *= 0.82;
    else if (winPct >= 0.55) chance *= 0.92;
    else if (winPct <= 0.33) chance *= 1.1;
  }

  if ((player.overall || 70) >= 90) chance *= 0.86;
  else if ((player.overall || 70) >= 84) chance *= 0.93;
  else if ((player.overall || 70) <= 68) chance *= 1.08;

  const priorSeason = seasonYear != null ? player.seasonStats?.[seasonYear] : null;
  const priorGames = Number(priorSeason?.games || 0);
  const priorStarts = Number(priorSeason?.gamesStarted || 0);
  const unsignedVeteran = player.teamId === "FA" || player.teamId === "WAIVER";
  const inactiveLastSeason = priorGames <= 0;

  // Aging veterans with low participation should phase out faster.
  if (player.age >= 26 && priorGames > 0 && priorGames <= 8) chance *= 1.22;
  if (player.age >= 27 && priorStarts <= 3) chance *= 1.24;
  if (player.age >= 27 && (player.overall || 70) <= 74) chance *= 1.16;
  if (player.age >= 29 && (player.overall || 70) <= 70) chance *= 1.18;
  if (player.age >= 26 && inactiveLastSeason) chance *= player.position === "K" || player.position === "P" ? 1.08 : 1.34;
  if (unsignedVeteran && player.age >= 27) chance *= player.position === "K" || player.position === "P" ? 1.04 : 1.24;
  if (unsignedVeteran && player.age >= 30) chance *= player.position === "K" || player.position === "P" ? 1.08 : 1.38;

  // Position-level attrition adjustments to keep career length in NFL-like bands.
  if (player.position === "RB" && player.age >= 27) chance *= 1.34;
  if ((player.position === "WR" || player.position === "TE") && player.age >= 29) chance *= 1.22;
  if (player.position === "OL" && player.age >= 30) chance *= 1.16;
  if ((player.position === "LB" || player.position === "DB" || player.position === "DL") && player.age >= 30) {
    chance *= player.position === "LB" ? 1.18 : 1.14;
  }
  if ((player.position === "K" || player.position === "P") && player.age >= 40) chance *= 1.02;
  if ((player.position === "K" || player.position === "P") && priorGames >= 15 && (player.overall || 70) >= 76) {
    chance *= 0.86;
  }

  // Productive starters should still have room for extended runs.
  if (priorStarts >= 12 && (player.overall || 70) >= 84) chance *= 0.9;

  if (player.retirementOverride?.active) {
    const minWinningPct = clamp(Number(player.retirementOverride.minWinningPct ?? 0.55), 0.3, 0.9);
    const teamMatch = !player.retirementOverride.teamId || player.retirementOverride.teamId === player.teamId;
    if (teamMatch && winPct >= minWinningPct && player.age <= maxAge) return 0;
    chance *= 0.82;
  }

  return clamp(chance, 0, 0.99);
}

function countsAsAccruedSeason(player, year) {
  const priorSeason = player.seasonStats?.[year];
  const games = Number(priorSeason?.games || 0);
  const starts = Number(priorSeason?.gamesStarted || 0);
  if (games >= 6) return true;
  if (starts >= 3) return true;
  if ((player.teamId || "FA") !== "FA" && (player.teamId || "FA") !== "WAIVER" && games > 0) return true;
  if (player.position === "K" || player.position === "P") return games >= 4;
  return false;
}

function progressPlayer(player, rng, context = {}) {
  const delta = developmentDelta(player, rng) + Math.round(Number(context.developmentBonus || 0));
  const ratingKeys = Object.keys(player.ratings);
  const focusRatings = (context.focusRatings || []).filter((key) => ratingKeys.includes(key));
  const randomKeys = rng.shuffle(ratingKeys.filter((key) => !focusRatings.includes(key)));
  const touched = [...focusRatings.slice(0, 2), ...randomKeys].slice(0, 4);
  for (const key of touched) {
    player.ratings[key] = clamp(player.ratings[key] + delta, 40, 99);
  }
  player.ratings.awareness = clamp(player.ratings.awareness + Math.round(delta / 2), 40, 99);
  player.overall = calculatePositionOverall(player.position, player.ratings);
  player.morale = clamp((player.morale || 72) + Math.round(Number(context.moraleDelta || 0)), 35, 99);
  player.reinjuryRisk = clamp((player.reinjuryRisk || 0) - Number(context.recoveryBonus || 0), 0, 0.55);
}

function expireContracts(league) {
  for (const player of activePlayers(league)) {
    player.contract = advanceContractYear(player.contract);
    if (player.contract.yearsRemaining <= 0) {
      player.teamId = "FA";
      player.contract = {
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
  }
}

function applyAgingProgressionAndRetirements(league, year, rng, options = {}) {
  const keep = [];
  const teamsById = new Map(league.teams.map((team) => [team.id, team]));
  for (const player of activePlayers(league)) {
    const team = teamsById.get(player.teamId) || null;
    player.age += 1;
    const accruedSeason = countsAsAccruedSeason(player, year);
    if (accruedSeason) {
      player.experience += 1;
      player.seasonsPlayed += 1;
    }
    const context = typeof options.developmentContext === "function" ? options.developmentContext(player, team) || {} : {};
    progressPlayer(player, rng, context);
    const chance = retirementChance(player, team, {
      ...options,
      seasonYear: year
    });
    if (rng.chance(chance)) {
      player.status = "retired";
      player.retiredYear = year;
      player.teamId = "RET";
      player.retirementOverride = null;
      league.retiredPlayers.push(player);
    } else {
      keep.push(player);
    }
  }
  league.players = keep;
}

function teamNeeds(league, teamId) {
  const roster = getTeamPlayers(league, teamId);
  const counts = {};
  for (const p of roster) counts[p.position] = (counts[p.position] || 0) + 1;
  return Object.entries(ROSTER_TEMPLATE)
    .map(([position, need]) => ({ position, missing: Math.max(0, need - (counts[position] || 0)) }))
    .filter((x) => x.missing > 0)
    .sort((a, b) => b.missing - a.missing);
}

function rookieContract(round, overall, rng) {
  const base = 4_900_000 - (round - 1) * 480_000;
  const salary = clamp(Math.round(base + overall * 11_000 + rng.int(-220_000, 220_000)), 850_000, 7_500_000);
  return buildContract({
    overall,
    years: 4,
    salary,
    minSalary: 850_000,
    maxSalary: 7_500_000,
    rng
  });
}

function veteranContract(overall, rng) {
  return buildContract({
    overall,
    years: rng.int(CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears),
    minSalary: 850_000,
    maxSalary: 20_000_000,
    rng
  });
}

function capSpace(league, teamId) {
  const roster = getAllTeamPlayers(league, teamId);
  const used = roster.reduce((sum, p) => sum + (p.contract?.capHit || 0), 0);
  const capLedger = league.capLedger?.[teamId] || {};
  const capForYear = (league.teamCapOverride?.[teamId] || NFL_STRUCTURE.salaryCap) + (capLedger.rollover || 0);
  const deadCapCurrentYear = capLedger.deadCapCurrentYear || 0;
  return capForYear - used - deadCapCurrentYear;
}

function runDraft(league, year, rng) {
  const draftClass = createDraftClass({ size: 256, year, rng });
  const order = league.teams
    .slice()
    .sort((a, b) => teamWinPct(a) - teamWinPct(b) || a.season.pointsFor - b.season.pointsFor);

  for (let round = 1; round <= 7; round += 1) {
    for (const team of order) {
      const needs = teamNeeds(league, team.id);
      const neededPositionSet = new Set(needs.map((n) => n.position));
      let pickIndex = draftClass.findIndex((p) => neededPositionSet.has(p.position));
      if (pickIndex < 0) pickIndex = 0;
      const prospect = draftClass.splice(pickIndex, 1)[0];
      if (!prospect) continue;
      prospect.teamId = team.id;
      prospect.contract = rookieContract(round, prospect.overall, rng);
      prospect.profile.source = "drafted";
      league.players.push(prospect);
    }
  }
}

function runFreeAgency(league, year, rng) {
  const faPool = league.players
    .filter((p) => p.status === "active" && p.teamId === "FA")
    .sort((a, b) => b.overall - a.overall);

  for (const team of league.teams) {
    const needs = teamNeeds(league, team.id);
    for (const need of needs) {
      for (let slot = 0; slot < need.missing; slot += 1) {
        let candidateIndex = faPool.findIndex((p) => p.position === need.position && p.contract.capHit === 0);
        if (candidateIndex < 0) candidateIndex = faPool.findIndex((p) => p.position === need.position);
        if (candidateIndex < 0) {
          const replacement = createSyntheticPlayer({
            teamId: team.id,
            position: need.position,
            year,
            rng
          });
          replacement.overall = clamp(replacement.overall - rng.int(4, 14), 52, 78);
          replacement.contract = veteranContract(replacement.overall, rng);
          league.players.push(replacement);
          continue;
        }
        const candidate = faPool[candidateIndex];
        const contract = veteranContract(candidate.overall, rng);
        if (capSpace(league, team.id) < contract.capHit) continue;
        candidate.teamId = team.id;
        candidate.contract = contract;
        faPool.splice(candidateIndex, 1);
      }
    }
  }
}

function normalizeRosterSlots(league) {
  for (const team of league.teams) {
    const roster = getAllTeamPlayers(league, team.id).sort((a, b) => b.overall - a.overall);
    roster.forEach((player, index) => {
      player.rosterSlot = index < 53 ? "active" : "practice";
    });
  }
}

function applyCapRollover(league) {
  if (!league.capLedger) league.capLedger = {};
  for (const team of league.teams) {
    const roster = getAllTeamPlayers(league, team.id);
    const used = roster.reduce((sum, player) => sum + (player.contract?.capHit || 0), 0);
    const current = league.capLedger[team.id] || {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    const capForYear = NFL_STRUCTURE.salaryCap + (current.rollover || 0);
    const capSpace = capForYear - used - (current.deadCapCurrentYear || 0);
    const nextRollover = clamp(Math.round(Math.max(0, capSpace) * 0.48), 0, 35_000_000);
    league.capLedger[team.id] = {
      rollover: nextRollover,
      deadCapCurrentYear: current.deadCapNextYear || 0,
      deadCapNextYear: 0
    };
  }
}

export function runOffseason({ league, year, rng, skipDraft = false, retirementSettings = {}, developmentContext = null }) {
  expireContracts(league);
  applyAgingProgressionAndRetirements(league, year, rng, {
    ...retirementSettings,
    developmentContext
  });
  if (!skipDraft) runDraft(league, year, rng);
  runFreeAgency(league, year, rng);
  normalizeRosterSlots(league);
  applyCapRollover(league);
  recalculateAllTeamRatings(league);
}

