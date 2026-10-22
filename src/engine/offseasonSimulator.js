import { teamLabel } from "../domain/teamLabel.js";
import { measureDevelopmentPerformance, revisePlayerPotential } from "../domain/livingPotential.js";
import { getSportRules } from "../sport/registry.js";
import {
  CONTRACT_RULES,
  FREE_AGENCY_RULES,
  FIELDABLE_DEPTH,
  ROSTER_TEMPLATE,
  FULL_ROSTER_TEMPLATE,
  ROSTER_STRUCTURE,
  PRACTICE_SQUAD_TEMPLATE,
  POSITION_MAX_AGE_LIMITS
} from "../config.js";
import { createDraftClass, createSyntheticPlayer } from "../domain/playerFactory.js";
import { TALENT_DISTRIBUTION } from "../domain/talentDistribution.js";
import { advanceContractYear, buildContract, contractMarketOptions } from "../domain/contracts.js";
import { calculatePositionOverall, developmentDelta, positionRatingKeys, GROWTH_WINDOW_MAX_AGE } from "../domain/ratings.js";
import {
  measurePotentialCentre,
  measurePotentialGapCentre,
  potentialReversionFor
} from "../domain/potentialReversion.js";
import { getAllTeamPlayers, getRosterCandidates, recalculateAllTeamRatings } from "../domain/teamFactory.js";
import { enforceRosterAndCapCompliance, normalizeRosterSlots, selectReleasable, releaseRanking, currentYearCapSaving, releaseToFreeAgency, capSpaceForTeam } from "./capCompliance.js";
import { clamp } from "../utils/rng.js";
import { finalizeFootballServiceSeason } from '../domain/playerService.js';
import { finalizePensionPlanYear } from '../domain/pensionService.js';
import { projectCapCarryover } from '../domain/capCarryover.js';
import { retainedRosterCompensationCap } from '../domain/earnedPracticeCap.js';
import { openNextFinancialYear, financialYearForLeague } from '../data/nflSalaryCap.js';
import {settleCpuInjuryClaims} from '../domain/injuryClaimNegotiation.js';
import { minimumSalaryForSeason } from '../data/nflSalaryMinimum.js';
import { practiceSalaryForSeason } from '../data/nflPracticeSalary.js';
import { buildPracticeContract } from '../domain/practiceContracts.js';
import { validatePracticeSquadAddition } from '../domain/practiceSquadEligibility.js';
import { admitUndraftedFreeAgents } from '../domain/undraftedFreeAgency.js';
import { draftCohortSize } from '../domain/draftCohort.js';
import { resetReserveListsForYear } from '../domain/reserveLists.js';
import { recordElevationPracticeRejoin,recordPermanentElevationActivation } from '../domain/standardElevations.js';
import { assertAnnualElevationInjuryContractTransition } from '../domain/elevationInjuryPay.js';
import { advancePreRolloverMedicalCalendar } from '../domain/preRolloverMedicalCalendar.js';
import {startOffseasonMedicalCalendar,advanceOffseasonMedicalCalendar,validateSnapshotOffseasonMedicalCalendar} from '../domain/offseasonMedicalCalendar.js';

// Fictional CPU development preference, not an expected future rating or an
// observed NFL coefficient. Current position grade stays dominant: upside
// can bridge at most six points and expires with the canonical growth window.
// Revised ceilings already account for setbacks; do not debit injuries twice.
function practiceDevelopmentValue(player) {
  const overall = Number(player.overall);
  if (!Number.isFinite(overall)) return 0;
  const age = Number(player.age), potential = Number(player.potential);
  if (!Number.isFinite(age) || age < 18 || age > GROWTH_WINDOW_MAX_AGE
    || !Number.isFinite(potential)) return overall;
  const remaining = Math.min(1, (GROWTH_WINDOW_MAX_AGE - age + 1) / 5);
  return overall + Math.min(6, Math.max(0, potential - overall) * .25) * remaining;
}

// Run after active-roster compliance and slot assignment. This is optional
// development depth, so it never cuts an incumbent or fabricates a player to
// fill a quota. Existing contracts remain authoritative. No football RNG draw
// is needed to price the scheduled weekly minimum.
export function replenishCpuPracticeSquads(league, { excludeTeamIds = [], onSigning = null } = {}) {
  const excluded = new Set(excludeTeamIds);
  const { activeLimit, practiceLimit } = ROSTER_STRUCTURE;
  const year = financialYearForLeague(league);
  const signings = [], shortfalls = [];
  const available = league.players.filter(player => player.status === 'active' && player.teamId === 'FA')
    // Premium free agents pursue active offers. A cheap practice contract must
    // not become an alternative path to acquire them after the market closes.
    .filter(player => player.overall < 74)
    .sort((a, b) => b.overall - a.overall || String(a.id).localeCompare(String(b.id)));
  const teams = [...league.teams].sort((a, b) =>
    (a.season?.wins || 0) - (b.season?.wins || 0) ||
    (b.season?.losses || 0) - (a.season?.losses || 0) || String(a.id).localeCompare(String(b.id)));
  for (const team of teams) {
    if (excluded.has(team.id)) continue;
    const roster = getRosterCandidates(league, team.id);
    const practice = roster.filter(player => player.rosterSlot === 'practice');
    // Active depth comes first; do not turn an unfinished active roster into
    // a practice squad while the mandatory depth pass reports a shortage.
    if (roster.filter(player => player.rosterSlot !== 'practice').length < activeLimit) continue;
    const active = roster.filter(player => player.rosterSlot !== 'practice');
    if (Object.entries(FIELDABLE_DEPTH).some(([position, band]) => active.filter(player => player.position === position).length < band.min)) continue;
    let budget = capSpaceForTeam(league, team.id);
    while (practice.length < practiceLimit) {
      // Development-room targets are preferences, not eligibility rules. They
      // stop a high-rated specialist pool monopolizing practice depth while
      // permitting other available positions when a preferred room is empty.
      const gap = position => Math.max(0, (PRACTICE_SQUAD_TEMPLATE[position] || 0) - practice.filter(player => player.position === position).length);
      const ranked = available.filter(player => player.teamId === 'FA')
        .sort((a, b) => gap(b.position) - gap(a.position)
          || practiceDevelopmentValue(b) - practiceDevelopmentValue(a)
          || b.overall - a.overall || String(a.id).localeCompare(String(b.id)));
      let player = null, contract = null;
      for (const candidate of ranked) {
        if (!validatePracticeSquadAddition({ players: practice, player: candidate, settings: league.settings || {}, capacity: practiceLimit }).ok) continue;
        const offer = buildPracticeContract(candidate, { year });
        if (offer.capHit > budget) continue;
        player = candidate; contract = offer; break;
      }
      if (!player) break;
      player.teamId = team.id;
      player.rosterSlot = 'practice';
      player.contract = contract;
      recordElevationPracticeRejoin(player,{teamId:team.id});
      practice.push(player);
      budget -= contract.capHit;
      const receipt = { teamId: team.id, player, contract, emergency: false, practice: true };
      signings.push(receipt);
      if (typeof onSigning === 'function') onSigning(receipt);
    }
    if (practice.length < practiceLimit) shortfalls.push({ teamId: team.id, missing: practiceLimit - practice.length });
  }
  return { signings, shortfalls };
}

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

export function progressPlayer(player, rng, context = {}) {
  // S90 — the club's development environment arrives as a continuous, zero-centred
  // tilt and is folded into the curve's single unbiased rounding. `developmentBonus`
  // remains the rounded, player-facing presentation of the same quantity and is no
  // longer what the engine progresses on. Older callers that only carry the rounded
  // integer still work, and still get the value they asked for.
  // Absent is a legitimate state — the headless `runOffseason` façade passes no
  // development context at all — and means zero tilt. Present-but-not-a-number is
  // not legitimate and must not be defaulted with `|| 0`, because NaN is falsy and
  // that idiom would launder a corrupt environment into a silent zero: the club's
  // development would stop applying and nothing anywhere would fail.
  const rawTilt = context.developmentEnvironmentTilt ?? context.developmentBonus ?? null;
  const environmentTilt = rawTilt === null ? 0 : Number(rawTilt);
  if (!Number.isFinite(environmentTilt)) {
    throw new TypeError(`progressPlayer: development environment must be finite, received ${rawTilt}`);
  }
  // S91 — the league-centred pull back toward the player's own potential. Same
  // discipline as the tilt above: absent is legitimate (a caller outside the
  // offseason seam, e.g. a unit test driving one player), present-but-not-finite
  // is not, and must never be laundered to zero by `|| 0`.
  const rawReversion = context.potentialReversion ?? null;
  const potentialReversion = rawReversion === null ? 0 : Number(rawReversion);
  if (!Number.isFinite(potentialReversion)) {
    throw new TypeError(`progressPlayer: potential reversion must be finite, received ${rawReversion}`);
  }
  // S102 — the league's measured mean potential, the centre the trait term
  // differentiates against. Same discipline again: absent is legitimate (a
  // caller outside the offseason seam gets the declared neutral centre),
  // present-but-not-finite must throw rather than be laundered to a default
  // that would silently turn the differentiator back into a subsidy.
  const rawCentre = context.potentialCentre ?? null;
  if (rawCentre !== null && !Number.isFinite(Number(rawCentre))) {
    throw new TypeError(`progressPlayer: potential centre must be finite, received ${rawCentre}`);
  }
  const proposedDelta = developmentDelta(player, rng, {
    environmentTilt,
    potentialReversion,
    potentialHeadroomCentre: context.potentialHeadroomCentre ?? null,
    ...(rawCentre === null ? {} : { potentialCentre: Number(rawCentre) })
  });
  // S108 — the overall this player carried into the offseason. Returned with
  // the result so the caller can record the move; until S108 the only record
  // of a player's annual development was the ratings it had already overwritten.
  const before = Number(player.overall);
  // Potential is an actionable ceiling. Existing saves can already be above
  // it; those players decline through the normal curve rather than being
  // instantly rewritten. Positive growth cannot cross the current projection.
  const delta = proposedDelta > 0 && Number.isFinite(Number(player.potential))
    ? Math.min(proposedDelta, Math.max(0, Math.floor(Number(player.potential) - before))) : proposedDelta;
  const ratingKeys = Object.keys(player.ratings);
  const focusRatings = (context.focusRatings || []).filter((key) => ratingKeys.includes(key));
  // rng.shuffle is called unconditionally and identically to before, so the RNG
  // stream position is unchanged by this fix (S86 [audit #3]).
  const randomKeys = rng.shuffle(ratingKeys.filter((key) => !focusRatings.includes(key)));
  const touched = [...focusRatings.slice(0, 2), ...randomKeys].slice(0, 4);

  // S86 [audit #3] — the delta must reach the attributes the position is graded
  // on, or the declared ageFactors curve never materialises in `overall`.
  // Weighted keys carry the curve; the shuffled `touched` keys stay as flavour
  // on everything else. Deduped so no key receives the delta twice.
  const gradedKeys = positionRatingKeys(player.position).filter((key) => key in player.ratings);
  const bumped = new Set([...gradedKeys, ...touched]);
  for (const key of bumped) {
    player.ratings[key] = clamp(player.ratings[key] + delta, 40, 99);
  }
  // Awareness tracks the curve at half rate, but only when it is not already a
  // graded key — otherwise it would take the delta one and a half times.
  if (!bumped.has("awareness")) {
    player.ratings.awareness = clamp(player.ratings.awareness + Math.round(delta / 2), 40, 99);
  }
  player.overall = calculatePositionOverall(player.position, player.ratings);
  player.morale = clamp((player.morale || 72) + Math.round(Number(context.moraleDelta || 0)), 35, 99);
  player.reinjuryRisk = clamp((player.reinjuryRisk || 0) - Number(context.recoveryBonus || 0), 0, 0.55);
  // No RNG draw is added or removed by returning this: every seeded league
  // develops exactly as it did before the move was recorded.
  return { before, after: Number(player.overall), delta };
}

export function expireContracts(league) {
  assertAnnualElevationInjuryContractTransition(league);
  for (const player of activePlayers(league)) {
    if(player.contract?.kind==='weekly-practice-contract-v1') {
      player.practiceContractHistory||=[];
      player.practiceContractHistory.push(structuredClone(player.contract));
    }
    player.contract = advanceContractYear(player.contract);
    if (player.contract.yearsRemaining <= 0) {
      // Remember where he played: the incumbent club gets first refusal in the
      // retention window, and the compensatory formula needs to know who lost
      // him. (S67)
      if (player.teamId && player.teamId !== "FA" && player.teamId !== "WAIVER") {
        player.lastTeamId = player.teamId;
      }
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

export function applyAgingProgressionAndRetirements(league, year, rng, options = {}) {
  assertAnnualElevationInjuryContractTransition(league);
  if ((league.sportId || 'football') === 'football') {
    finalizePensionPlanYear(league, year);
    finalizeFootballServiceSeason(league, year);
  }
  const keep = [];
  const performance = measureDevelopmentPerformance(league, year);
  for (const player of activePlayers(league)) revisePlayerPotential(player, { year, performance: performance.get(player.id) ?? null });
  const teamsById = new Map(league.teams.map((team) => [team.id, team]));
  // S91 — measured once per offseason, from the league actually being simulated,
  // BEFORE any player is progressed, so every player this offseason is reverted
  // against the same centre. Deliberately applied here rather than supplied
  // through `developmentContext`: reversion is a property of the league, not of
  // a club, and the headless `runOffseason` facade passes no development context
  // at all — a context-borne fix would silently not apply on the exact path the
  // career-realism regression runs.
  const reversionCentres = measurePotentialGapCentre(league);
  // S102 — measured here for the same reasons and on the same schedule: once
  // per offseason, from the league as it stood before anyone was progressed, so
  // every player is differentiated against the same centre.
  const { potentialCentre } = measurePotentialCentre(league);
  // S108 — the development ledger. One row per progressed player, captured
  // from the returned move rather than re-derived, so the record is exactly
  // what the engine did. Retirees stay in it with `retired: true`: the S107
  // gate showed that dropping them selects on the outcome.
  const progressed = [];
  for (const player of activePlayers(league)) {
    const team = teamsById.get(player.teamId) || null;
    player.age += 1;
    const accruedSeason = countsAsAccruedSeason(player, year);
    if (accruedSeason) {
      player.experience += 1;
      player.seasonsPlayed += 1;
    }
    const supplied = typeof options.developmentContext === "function" ? options.developmentContext(player, team) || {} : {};
    const context = {
      ...supplied,
      potentialCentre,
      potentialHeadroomCentre: -reversionCentres.gapCentre,
      potentialReversion: potentialReversionFor(player, reversionCentres)
    };
    const move = progressPlayer(player, rng, context);
    const row = {
      playerId: player.id,
      teamId: player.teamId,
      name: player.name,
      position: player.position,
      age: player.age,
      before: move.before,
      after: move.after,
      change: move.after - move.before,
      potential: Number.isFinite(Number(player.potential)) ? Number(player.potential) : null,
      potentialRevision: player.lastPotentialRevision || null,
      trait: player.developmentTrait || null,
      retired: false
    };
    progressed.push(row);
    const chance = retirementChance(player, team, {
      ...options,
      seasonYear: year
    });
    // S102 — the pool's exit rule. Derived from the club the player is on at
    // this point in the offseason rather than pushed from every signing site,
    // so a player the market picked up is reset by the fact of being rostered
    // and no call site can forget to clear the counter.
    // The counter is only carried by players who are actually unsigned, and is
    // dropped the moment one is rostered — writing a `0` onto all ~1,600 active
    // players would put a field in every save payload to record a fact about a
    // few hundred of them.
    const unsigned = !team && (player.teamId === "FA" || player.teamId === "WAIVER");
    if (unsigned) player.unsignedOffseasons = Number(player.unsignedOffseasons || 0) + 1;
    else if (player.unsignedOffseasons) delete player.unsignedOffseasons;
    const outOfTheLeague =
      unsigned && player.unsignedOffseasons >= FREE_AGENCY_RULES.maxConsecutiveUnsignedOffseasons;
    // `rng.chance` is consumed for every player either way. Short-circuiting it
    // for a forced exit would shift the RNG stream and silently re-calibrate
    // every league that has ever been generated from a seed.
    const rolled = rng.chance(chance);
    if (rolled || outOfTheLeague) {
      player.status = "retired";
      player.retiredYear = year;
      player.teamId = "RET";
      player.retirementOverride = null;
      player.retirementReason = rolled ? "retired" : "unsigned-out-of-league";
      league.retiredPlayers.push(player);
      row.retired = true;
    } else {
      keep.push(player);
    }
  }
  league.players = keep;
  return { progressed };
}

/**
 * What a club must sign to stay fieldable.
 *
 * S104 - this measured the club's **active** roster against `ROSTER_TEMPLATE`,
 * which is the shape a league is *generated* in, not a shape any running club
 * is obliged to hold. Once `assignFieldableActiveRoster` began allocating the
 * twelve discretionary slots on merit, a club's active room counts legitimately
 * differ from the generation template - so reading the template here would have
 * reported a permanent shortfall in whichever room lost the merit pass and sent
 * the free-agency backstop shopping for it every single offseason. That is a
 * new accumulator, installed by the fix for the old one.
 *
 * Two corrections, and the second was measured after the first got it wrong.
 *
 * It counts the **whole** roster rather than the active slice: a club with a
 * fourth cornerback on its practice squad does not need to sign one off the
 * street, and counting only the active slice made a slotting decision look like
 * a personnel shortfall.
 *
 * And it reads `FULL_ROSTER_TEMPLATE`, not the fieldable minimum. Pointing it
 * at `FIELDABLE_DEPTH[pos].min` was tried first and measured: the minimums sum
 * to 41, so clubs restocked to 41 and nothing pulled them back up. The league
 * drained 2,208 -> 1,905 over ten seasons, the practice squad fell from 16 per
 * club to 6.5, and the active roster's dispersion drift went out-of-range
 * because the top-53 filter weakened as the population it selected from shrank.
 * That is the S103 moving-denominator defect with its sign flipped, installed
 * by the fix for it. The floor has to be the roster a club actually carries.
 */
function teamNeeds(league, teamId, template = FULL_ROSTER_TEMPLATE) {
  const roster = getRosterCandidates(league, teamId);
  const counts = {};
  for (const p of roster) counts[p.position] = (counts[p.position] || 0) + 1;
  return Object.entries(template)
    .map(([position, need]) => ({ position, missing: Math.max(0, need - (counts[position] || 0)),
      fieldableMissing: Math.max(0, (FIELDABLE_DEPTH[position]?.min || 0) - (counts[position] || 0)) }))
    .filter((x) => x.missing > 0)
    .sort((a, b) => b.fieldableMissing - a.fieldableMissing || b.missing - a.missing);
}

export function rosterDepthShortfalls(league) {
  return league.teams.map(team => ({ teamId: team.id,
    positions: teamNeeds(league, team.id).map(need => ({ position: need.position, missing: need.missing }))
  })).filter(row => row.positions.length);
}

function rookieContract(round, overall, rng, options = {}) {
  const base = 4_900_000 - (round - 1) * 480_000;
  const salary = clamp(Math.round(base + overall * 11_000 + rng.int(-220_000, 220_000)), 850_000, 7_500_000);
  return buildContract({
    overall,
    years: 4,
    salary,
    minSalary: CONTRACT_RULES.minSalary,
    maxSalary: 7_500_000,
    ...options,
    rng
  });
}

function veteranContract(overall, rng, options = {}) {
  return buildContract({
    overall,
    years: rng.int(CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears),
    minSalary: CONTRACT_RULES.minSalary,
    ...options,
    rng
  });
}

function capSpace(league, teamId) {
  const roster = getAllTeamPlayers(league, teamId);
  const used = roster.reduce((sum, p) => sum + (p.contract?.capHit || 0), 0);
  const capLedger = league.capLedger?.[teamId] || {};
  const capForYear = (league.teamCapOverride?.[teamId] || getSportRules(league.sportId).structure.salaryCap) + (capLedger.rollover || 0);
  const deadCapCurrentYear = capLedger.deadCapCurrentYear || 0;
  return capForYear - used - deadCapCurrentYear - retainedRosterCompensationCap(capLedger);
}

function runDraft(league, year, rng) {
  const draftClass = createDraftClass({ size: draftCohortSize(league.teams.length*getSportRules(league.sportId).draft.rounds), year, rng, familyAnchors:[...league.players,...(league.retiredPlayers || [])] });
  const order = league.teams
    .slice()
    .sort((a, b) => teamWinPct(a) - teamWinPct(b) || a.season.pointsFor - b.season.pointsFor);

  for (let round = 1; round <= getSportRules(league.sportId).draft.rounds; round += 1) {
    for (const team of order) {
      const needs = teamNeeds(league, team.id);
      const neededPositionSet = new Set(needs.map((n) => n.position));
      let pickIndex = draftClass.findIndex((p) => neededPositionSet.has(p.position));
      if (pickIndex < 0) pickIndex = 0;
      const prospect = draftClass.splice(pickIndex, 1)[0];
      if (!prospect) continue;
      prospect.teamId = team.id;
      prospect.contract = rookieContract(round, prospect.overall, rng, contractMarketOptions(league, prospect));
      prospect.profile.source = "drafted";
      league.players.push(prospect);
    }
  }
  return admitUndraftedFreeAgents(league, { year: financialYearForLeague(league),
    completed: true, available: draftClass, selections: [] }, { year: financialYearForLeague(league) });
}

/**
 * Roster-legality backstop — NOT the free-agency market.
 *
 * Until S67 this function was the only thing that ever moved an expiring player
 * to a new club, which meant the league's entire free-agent class was assigned
 * by roster-template arithmetic in the same tick that expired it. It now runs
 * *after* the real market has closed (GameSession's `free-agency` stage) and
 * exists only to keep clubs roster-legal with whatever the market left behind.
 *
 * Two authority rules hold:
 *   - `excludeTeamIds` teams are never signed for. The controlled franchise is
 *     passed in by GameSession, so the backstop cannot write a roster the GM
 *     owns (the S63 franchise-authority boundary guards the command seam; this
 *     engine is not a command and would otherwise walk straight past it).
 *   - Every signing it does make is announced through `onSigning`, so 200+
 *     league-wide moves stop being invisible to the transaction ledger.
 */
export function runFreeAgencyBackstop(league, year, rng, { excludeTeamIds = [], onSigning = null, onRelease = null } = {}) {
  const excluded = new Set(excludeTeamIds.filter(Boolean));
  const faPool = league.players
    .filter((p) => p.status === "active" && p.teamId === "FA")
    .sort((a, b) => b.overall - a.overall);

  const announce = (payload) => {
    if (typeof onSigning === "function") onSigning(payload);
  };

  // Worst teams shop first (reverse standings) instead of raw array order —
  // the market models competition, not alphabet privilege (S62).
  const shoppingOrder = [...league.teams].sort(
    (a, b) =>
      (a.season?.wins || 0) - (b.season?.wins || 0) ||
      (b.season?.losses || 0) - (a.season?.losses || 0) ||
      String(a.id).localeCompare(String(b.id))
  );
  const shortfalls = [];
  for (const team of shoppingOrder) {
    const needs = teamNeeds(league, team.id, ROSTER_TEMPLATE);
    if (excluded.has(team.id)) {
      // The GM owns this roster. Report the hole; do not fill it for them.
      if (needs.length) {
        shortfalls.push({
          teamId: team.id,
          positions: needs.map((need) => ({ position: need.position, missing: need.missing }))
        });
      }
      continue;
    }
    // Plan a complete funded minimum before releasing anyone. Surplus may
    // finance essential depth, but a trapped club must not lose players for a
    // signing it still cannot afford. Use the same minimum/dead-money authority
    // as ordinary compliance; no cap balances or contract terms are forgiven.
    const fundingReleases = new Set();
    const quotedOffers = new Map();
    const quote = player => {
      if (!quotedOffers.has(player.id)) quotedOffers.set(player.id,
        veteranContract(player.overall, rng, contractMarketOptions(league, player)));
      return quotedOffers.get(player.id);
    };
    const remainingMinimumCost = signing => teamNeeds(league, team.id, ROSTER_TEMPLATE)
      .reduce((total, need) => {
        const remaining = Math.max(0, need.fieldableMissing - (need.position === signing.position ? 1 : 0));
        if (!remaining) return total;
        const costs = faPool.filter(p => p.id !== signing.id && p.position === need.position && !fundingReleases.has(p.id))
          .map(p => quote(p).capHit).sort((a,b)=>a-b);
        // Missing market supply stays an estimate until an emergency player
        // receives real terms; no salary or cap charge is fabricated here.
        const floor = minimumSalaryForSeason(financialYearForLeague(league), 0).salary;
        return total + Array.from({length:remaining},(_,i)=>costs[i]??floor).reduce((sum,cost)=>sum+cost,0);
      },0);
    const fundMinimum = cost => {
      const room = capSpace(league, team.id);
      if (room >= cost) return true;
      const roster = getRosterCandidates(league, team.id);
      const releasable = selectReleasable(roster,
        // Preserve scarce talent when a weaker surplus player can finance the
        // hole. Value density breaks quality ties; it cannot make a star the
        // first cut solely because his contract is larger.
        releaseRanking(roster).filter(player => currentYearCapSaving(player) > 0)
          .sort((a,b)=>a.overall-b.overall), roster.length);
      const plan = [];
      let funded = room;
      for (const player of releasable) {
        plan.push(player);
        funded += currentYearCapSaving(player);
        if (funded >= cost) break;
      }
      if (funded < cost) return false;
      for (const player of plan) {
        releaseToFreeAgency(league, player, { onRelease, reason: 'minimum-depth-funding' });
        fundingReleases.add(player.id);
        faPool.push(player);
      }
      faPool.sort((a,b)=>b.overall-a.overall);
      return capSpace(league, team.id) >= cost;
    };
    // Complete every room's fieldable minimum before buying optional depth.
    // Sorting rooms alone is insufficient: a room's extras can spend the
    // salary budget needed for another room's missing starter/specialist.
    for (const minimumPass of [true, false]) {
      // Annual active offers fill the active depth template. Buying all69
      // places here spends practice funding on annual contracts before the
      // separate eligible weekly practice market can run. Count owned depth
      // across slots so an existing candidate is not purchased twice; slot
      // assignment and funded activation remain their own authority below.
      const currentNeeds = teamNeeds(league, team.id, ROSTER_TEMPLATE);
      if (!minimumPass && currentNeeds.some(need => need.fieldableMissing > 0)) break;
      const passNeeds = currentNeeds.map(need => ({ ...need,
        missing: minimumPass ? need.fieldableMissing : need.missing
      })).filter(need => need.missing > 0);
      for (const need of passNeeds) {
      for (let slot = 0; slot < need.missing; slot += 1) {
        // Positional preferences may differ from the generated53-player
        // shape. Once owned depth reaches the active limit, only an unmet
        // fieldable minimum justifies another annual signing.
        if (!minimumPass && getRosterCandidates(league, team.id).length >= ROSTER_STRUCTURE.activeLimit) break;
        const market = faPool.filter(p => p.position === need.position);
        const available = market.filter(p=>!fundingReleases.has(p.id));
        // An expensive first choice must not hide affordable remaining depth.
        // Draw each considered player's ordinary offer once, then select the
        // first affordable offer in the existing quality order.
        let candidate = null, contract = null;
        let budget = capSpace(league, team.id);
        let offerBudget = budget;
        let prioritizeAffordableDepth = false;
        if (!minimumPass) {
          // Discretionary depth should not spend the last dollars on one
          // optional player when cheaper depth can fund the whole structure.
          // These are salary-floor planning estimates, not reserved cap charges.
          const held = getRosterCandidates(league, team.id).length + 1;
          const financialYear = financialYearForLeague(league);
          const activeFloor = minimumSalaryForSeason(financialYear, 0).salary;
          const missingActive = Math.max(0, ROSTER_STRUCTURE.activeLimit - held);
          const missingPractice = Math.min(ROSTER_STRUCTURE.practiceLimit,
            Math.max(0, ROSTER_STRUCTURE.activeLimit + ROSTER_STRUCTURE.practiceLimit - held));
          const practiceFloor = practiceSalaryForSeason(financialYear).minimum
            * getSportRules(league.sportId).structure.regularSeasonWeeks;
          const reserve = missingActive * activeFloor + missingPractice * practiceFloor;
          // If the full structure is unaffordable, shop for the cheapest real
          // depth instead. Salary floors alone understate offered service and
          // bonus terms and cannot protect the next active signing.
          if (budget >= reserve + activeFloor) offerBudget = budget - reserve;
          else prioritizeAffordableDepth = true;
        }
        const quotes = [];
        for (const player of available) {
          const offer = quote(player);
          quotes.push({ player, offer });
          const remainingMinimum = minimumPass ? remainingMinimumCost(player) : 0;
          if (!prioritizeAffordableDepth && offer.capHit + remainingMinimum <= offerBudget) { candidate = player; contract = offer; break; }
        }
        if (!candidate && !minimumPass) {
          // Available service/bonus terms may exceed the planning floors.
          // Complete active depth with the cheapest real affordable quote;
          // never invent cheap terms or report the planned squad as funded.
          const cheapest = quotes.filter(row=>row.offer.capHit<=budget)
            .sort((a,b)=>a.offer.capHit-b.offer.capHit)[0];
          if (cheapest) { candidate=cheapest.player;contract=cheapest.offer; }
        }
        if (!candidate && minimumPass && quotes.length &&
          fundMinimum(Math.min(...quotes.map(row=>row.offer.capHit)))) {
          budget = capSpace(league, team.id);
          const funded = quotes.filter(row=>row.offer.capHit<=budget).sort((a,b)=>a.offer.capHit-b.offer.capHit)[0];
          candidate = funded.player; contract = funded.offer;
        }
        if (!candidate && market.length === 0) {
          // Fabricating a player is a last resort for roster legality only,
          // and it leaves an explicit receipt instead of silently conjuring
          // talent out of thin air.
          const replacement = createSyntheticPlayer({
            teamId: team.id,
            position: need.position,
            year,
            rng,
            talentBand: TALENT_DISTRIBUTION.reserve
          });
          replacement.contract = veteranContract(replacement.overall, rng, contractMarketOptions(league, replacement));
          if (replacement.contract.capHit > budget &&
            !(minimumPass && fundMinimum(replacement.contract.capHit))) continue;
          replacement.provenance = "emergency-depth-signing";
          league.players.push(replacement);
          if (Array.isArray(league.newsLog)) {
            league.newsLog.unshift({
              id: `news-emergency-depth-${year}-${team.id}-${need.position}-${league.newsLog.length}`,
              type: "emergency-depth-signing",
              year,
              teamIds: [team.id],
              headline: `${teamLabel(league, team.id)} sign emergency ${need.position} depth off the street`,
              detail: `The ${need.position} market was empty — a journeyman was signed to keep the roster legal.`
            });
          }
          announce({ teamId: team.id, player: replacement, contract: replacement.contract, emergency: true });
          continue;
        }
        if (!candidate) continue;
        candidate.teamId = team.id;
        candidate.contract = contract;
        candidate.rosterSlot = 'active';
        recordPermanentElevationActivation(candidate,{teamId:team.id,year:financialYearForLeague(league)});
        faPool.splice(faPool.indexOf(candidate), 1);
        announce({ teamId: team.id, player: candidate, contract, emergency: false });
      }
    }
    }
    const remaining = teamNeeds(league, team.id);
    if (remaining.length) shortfalls.push({ teamId: team.id,
      positions: remaining.map(need => ({ position: need.position, missing: need.missing })) });
  }
  return { shortfalls, remainingFreeAgents: faPool.length };
}

// Re-exported from the compliance authority so there is exactly one definition
// of the roster structure. The previous local copy hard-coded 53 and applied no
// upper bound, which is what let the practice population grow without limit.
export { normalizeRosterSlots } from "./capCompliance.js";

export function reconcileLegacyCapBoundary(league, completedYear, previousBoundaryApplied = null) {
  if (!Number.isInteger(completedYear)) throw new TypeError('Cap reconciliation requires a completed league year');
  if (!league.capLedger) league.capLedger = {};
  for (const team of league.teams) {
    const current = league.capLedger[team.id] || { rollover: 0, deadCapCurrentYear: 0, deadCapNextYear: 0 };
    if (Number.isInteger(current.rolloverAppliedThroughYear) && current.rolloverAppliedThroughYear >= completedYear) continue;
    // Aging/expiry may already have changed payroll. Preserve published cap
    // funding rather than reconstructing historical unused room from it.
    league.capLedger[team.id] = { ...current,
      ...(previousBoundaryApplied === false ? { deadCapCurrentYear: current.deadCapNextYear || 0, deadCapNextYear: 0, earnedPracticeCurrentYear: 0,
        ...(current.elevationCharges ? {elevationCharges:[]} : {}),
        ...(current.elevationInjuryCharges ? {elevationInjuryCharges:[]} : {}),
        ...(current.injurySalaryClaimCharges ? {injurySalaryClaimCharges:[]} : {}),
      ...(current.admittedInjuryCharges ? {admittedInjuryCharges:[]} : {}) } : {}),
      rolloverAppliedThroughYear: completedYear,
      rolloverPolicy: 'legacy-resume-preserved-funding-v1',
      rolloverReconciliation: previousBoundaryApplied === false ? 'pending-charge-transition-applied'
        : previousBoundaryApplied === true ? 'completed-balances-preserved' : 'unknown-history-balances-preserved'
    };
  }
}

export function applyCapRollover(league, { completedYear = league.year } = {}) {
  if (!Number.isInteger(completedYear)) throw new TypeError('Cap rollover requires a completed league year');
  if (!league.capLedger) league.capLedger = {};
  for (const team of league.teams) {
    const roster = getAllTeamPlayers(league, team.id);
    const used = roster.reduce((sum, player) => sum + (player.contract?.capHit || 0), 0);
    const current = league.capLedger[team.id] || {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    if (Number.isInteger(current.rolloverAppliedThroughYear) && current.rolloverAppliedThroughYear >= completedYear) continue;
    // S101 — this was the only cap reader in the engine that ignored the grown
    // cap. `GameSession.startSeason` raises the cap 4.5%/yr into
    // `league.teamCapOverride`; computing rollover against the flat base meant
    // that by simulated season 8 every club banked ~$1.09M against ~$84M of real
    // space, so "bank space this year to strike in free agency next year" — a
    // core GM lever — silently stopped existing. Nothing errored; the number just
    // went to zero. The override-with-flat-fallback form is required: the
    // headless `runOffseason` path never calls `startSeason` and so has no
    // override, which is why line 264 already reads it exactly this way.
    const capForYear = (league.teamCapOverride?.[team.id] || getSportRules(league.sportId).structure.salaryCap) + (current.rollover || 0);
    const capSpace = capForYear - used - (current.deadCapCurrentYear || 0) - retainedRosterCompensationCap(current);
    // Modern fictional clubs elect full carryover of unused prior-year room.
    // Older saved economies retain their declared fractional/capped policy.
    const carryover = projectCapCarryover(league, capSpace);
    league.capLedger[team.id] = {
      ...current,
      rollover: carryover.amount,
      deadCapCurrentYear: current.deadCapNextYear || 0,
      deadCapNextYear: 0,
      rolloverAppliedThroughYear: completedYear,
      earnedPracticeCurrentYear: 0,
      ...(current.elevationCharges ? {elevationCharges:[]} : {}),
      ...(current.elevationInjuryCharges ? {elevationInjuryCharges:[]} : {}),
      ...(current.injurySalaryClaimCharges ? {injurySalaryClaimCharges:[]} : {}),
      ...(current.admittedInjuryCharges ? {admittedInjuryCharges:[]} : {}),
      rolloverPolicy: carryover.policy
    };
  }
}

/**
 * Whole-offseason façade.
 *
 * The interactive game no longer calls this — GameSession drives the individual
 * phases from its own pipeline so each named stage does the thing it is named
 * for (S67). This composition is preserved verbatim for the headless callers
 * that still want one call: `src/engine/leagueSimulator.js` and the 100-year
 * realism career regression. Changing the order here changes calibration.
 */
export function runOffseason({
  league,
  year,
  rng,
  skipDraft = false,
  retirementSettings = {},
  developmentContext = null,
  excludeTeamIds = [],
  onSigning = null,
  onRelease = null
}) {
  // Validate and preview an anchored summer interval before any expiry,
  // aging, market activity or RNG use. A refused calendar is not a season.
  validateSnapshotOffseasonMedicalCalendar(league);
  if(league.offseasonMedicalCalendar?.some(row=>row.sourceYear===year))
    advanceOffseasonMedicalCalendar(structuredClone(league),{completedYear:year,stage:'camp-cuts'});
  advancePreRolloverMedicalCalendar(league,{completedYear:year,preserveAdmittedRights:true,annualTransition:true});
  const priorRolloverApplied=league.teams.some(team=>league.capLedger?.[team.id]?.rolloverAppliedThroughYear>=year);
  assertAnnualElevationInjuryContractTransition(league);
  applyCapRollover(league, { completedYear: year });
  openNextFinancialYear(league, year);
  if(!priorRolloverApplied)startOffseasonMedicalCalendar(league,{completedYear:year});
  settleCpuInjuryClaims(league,{excludeTeamIds});
  resetReserveListsForYear(league, year + 1);
  expireContracts(league);
  applyAgingProgressionAndRetirements(league, year, rng, {
    ...retirementSettings,
    developmentContext
  });
  const undrafted = skipDraft ? null : runDraft(league, year, rng);
  const backstop = runFreeAgencyBackstop(league, year, rng, { excludeTeamIds, onSigning, onRelease });
  advanceOffseasonMedicalCalendar(league,{completedYear:year,stage:'camp-cuts'});
  // Compliance runs after the market has closed and before slots are assigned:
  // the backstop may legitimately push a club over its limits while filling a
  // hole, and re-slotting a roster we are about to trim would be wasted work.
  const compliance = enforceRosterAndCapCompliance(league, { excludeTeamIds, onRelease });
  normalizeRosterSlots(league, { excludeTeamIds });
  const practice = replenishCpuPracticeSquads(league, { excludeTeamIds, onSigning });
  recalculateAllTeamRatings(league);
  return { ...backstop, remainingFreeAgents: league.players.filter(player => player.status === 'active' && player.teamId === 'FA').length, compliance, practice, undrafted };
}
