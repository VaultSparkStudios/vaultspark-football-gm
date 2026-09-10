import {
  CONTRACT_RULES,
  FREE_AGENCY_RULES,
  FULL_ROSTER_TEMPLATE,
  NFL_STRUCTURE,
  POSITION_MAX_AGE_LIMITS
} from "../config.js";
import { createDraftClass, createSyntheticPlayer } from "../domain/playerFactory.js";
import { advanceContractYear, buildContract } from "../domain/contracts.js";
import { calculatePositionOverall, developmentDelta, positionRatingKeys } from "../domain/ratings.js";
import {
  measurePotentialCentre,
  measurePotentialGapCentre,
  potentialReversionFor
} from "../domain/potentialReversion.js";
import { getAllTeamPlayers, recalculateAllTeamRatings } from "../domain/teamFactory.js";
import { enforceRosterAndCapCompliance, normalizeRosterSlots } from "./capCompliance.js";
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
  const delta = developmentDelta(player, rng, {
    environmentTilt,
    potentialReversion,
    ...(rawCentre === null ? {} : { potentialCentre: Number(rawCentre) })
  });
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
}

export function expireContracts(league) {
  for (const player of activePlayers(league)) {
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
  const keep = [];
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
      potentialReversion: potentialReversionFor(player, reversionCentres)
    };
    progressPlayer(player, rng, context);
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
    } else {
      keep.push(player);
    }
  }
  league.players = keep;
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
function teamNeeds(league, teamId) {
  const roster = getAllTeamPlayers(league, teamId);
  const counts = {};
  for (const p of roster) counts[p.position] = (counts[p.position] || 0) + 1;
  return Object.entries(FULL_ROSTER_TEMPLATE)
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
    minSalary: CONTRACT_RULES.minSalary,
    maxSalary: 7_500_000,
    rng
  });
}

function veteranContract(overall, rng) {
  return buildContract({
    overall,
    years: rng.int(CONTRACT_RULES.minYears, CONTRACT_RULES.maxYears),
    minSalary: CONTRACT_RULES.minSalary,
    maxSalary: CONTRACT_RULES.maxSalary,
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
export function runFreeAgencyBackstop(league, year, rng, { excludeTeamIds = [], onSigning = null } = {}) {
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
    const needs = teamNeeds(league, team.id);
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
    for (const need of needs) {
      for (let slot = 0; slot < need.missing; slot += 1) {
        let candidateIndex = faPool.findIndex((p) => p.position === need.position && p.contract.capHit === 0);
        if (candidateIndex < 0) candidateIndex = faPool.findIndex((p) => p.position === need.position);
        if (candidateIndex < 0) {
          // Fabricating a player is a last resort for roster legality only,
          // and it leaves an explicit receipt instead of silently conjuring
          // talent out of thin air.
          const replacement = createSyntheticPlayer({
            teamId: team.id,
            position: need.position,
            year,
            rng
          });
          replacement.overall = clamp(replacement.overall - rng.int(4, 14), 52, 78);
          replacement.contract = veteranContract(replacement.overall, rng);
          replacement.provenance = "emergency-depth-signing";
          league.players.push(replacement);
          if (Array.isArray(league.newsLog)) {
            league.newsLog.unshift({
              id: `news-emergency-depth-${year}-${team.id}-${need.position}-${league.newsLog.length}`,
              type: "emergency-depth-signing",
              year,
              teamIds: [team.id],
              headline: `${team.id} sign emergency ${need.position} depth off the street`,
              detail: `The ${need.position} market was empty — a journeyman was signed to keep the roster legal.`
            });
          }
          announce({ teamId: team.id, player: replacement, contract: replacement.contract, emergency: true });
          continue;
        }
        const candidate = faPool[candidateIndex];
        const contract = veteranContract(candidate.overall, rng);
        if (capSpace(league, team.id) < contract.capHit) continue;
        candidate.teamId = team.id;
        candidate.contract = contract;
        faPool.splice(candidateIndex, 1);
        announce({ teamId: team.id, player: candidate, contract, emergency: false });
      }
    }
  }
  return { shortfalls, remainingFreeAgents: faPool.length };
}

// Re-exported from the compliance authority so there is exactly one definition
// of the roster structure. The previous local copy hard-coded 53 and applied no
// upper bound, which is what let the practice population grow without limit.
export { normalizeRosterSlots } from "./capCompliance.js";

export function applyCapRollover(league) {
  if (!league.capLedger) league.capLedger = {};
  for (const team of league.teams) {
    const roster = getAllTeamPlayers(league, team.id);
    const used = roster.reduce((sum, player) => sum + (player.contract?.capHit || 0), 0);
    const current = league.capLedger[team.id] || {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    // S101 — this was the only cap reader in the engine that ignored the grown
    // cap. `GameSession.startSeason` raises the cap 4.5%/yr into
    // `league.teamCapOverride`; computing rollover against the flat base meant
    // that by simulated season 8 every club banked ~$1.09M against ~$84M of real
    // space, so "bank space this year to strike in free agency next year" — a
    // core GM lever — silently stopped existing. Nothing errored; the number just
    // went to zero. The override-with-flat-fallback form is required: the
    // headless `runOffseason` path never calls `startSeason` and so has no
    // override, which is why line 264 already reads it exactly this way.
    const capForYear = (league.teamCapOverride?.[team.id] || NFL_STRUCTURE.salaryCap) + (current.rollover || 0);
    const capSpace = capForYear - used - (current.deadCapCurrentYear || 0);
    const nextRollover = clamp(Math.round(Math.max(0, capSpace) * 0.48), 0, 35_000_000);
    league.capLedger[team.id] = {
      rollover: nextRollover,
      deadCapCurrentYear: current.deadCapNextYear || 0,
      deadCapNextYear: 0
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
  expireContracts(league);
  applyAgingProgressionAndRetirements(league, year, rng, {
    ...retirementSettings,
    developmentContext
  });
  if (!skipDraft) runDraft(league, year, rng);
  const backstop = runFreeAgencyBackstop(league, year, rng, { excludeTeamIds, onSigning });
  // Compliance runs after the market has closed and before slots are assigned:
  // the backstop may legitimately push a club over its limits while filling a
  // hole, and re-slotting a roster we are about to trim would be wasted work.
  const compliance = enforceRosterAndCapCompliance(league, { excludeTeamIds, onRelease });
  normalizeRosterSlots(league);
  applyCapRollover(league);
  recalculateAllTeamRatings(league);
  return { ...backstop, compliance };
}
