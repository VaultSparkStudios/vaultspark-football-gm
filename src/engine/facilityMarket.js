/**
 * facilityMarket.js — the rest of the league starts building too (S93).
 *
 * ── The measurement that made this necessary ────────────────────────────────
 *
 * The league-wide standard deviation of `owner.facilities.training` was measured
 * across a live seeded decade:
 *
 *     season      0      3      6     10
 *     trainSd  5.66   5.66   5.66   5.66
 *
 * Identical to the last reported digit, ten simulated seasons apart. Facilities
 * were written once by `buildFranchiseEconomics` and **never again by anything**.
 * The only writer in the entire codebase was the player's Settings tab.
 *
 * That is why pricing the player's dial (`src/domain/facilityInvestment.js`) is
 * only half a fix. Pricing a free advantage while leaving all thirty-two rival
 * clubs frozen forever converts it from an advantage nobody competes for into a
 * purchase nobody competes for. It also quietly weakens S90's own guarantee: the
 * development environment is defined *relative to the league's measured centres*,
 * and a centre that can never move is a constant wearing a measurement's clothes
 * — the exact failure `LEAGUE_AVERAGE_POTENTIAL` (S71) and the S90 literals were
 * rescued from.
 *
 * And it is a franchise-fantasy failure before it is a correctness one. A league
 * whose development environments can never change is a league where the club you
 * happen to inherit determines a decade of player development, which is the
 * opposite of the promise the game makes.
 *
 * ── Why the policy is derived, never rolled ────────────────────────────────
 *
 * A club's appetite is a function of its own live state — cash, owner
 * personality, championship priority, and how far behind the league centre it
 * sits. The only stochastic element is a tie-break, drawn from `derivedRng` on a
 * (year, team) key rather than from the session stream, for the same reason the
 * coaching market derives its candidates: a policy that consumed the shared RNG
 * stream would change every downstream draw in the league, so a save with this
 * feature and a save without it would diverge in ways that have nothing to do
 * with facilities. `test/session93-owner-capital-authority.test.js` asserts the
 * stream is untouched.
 *
 * Every investment goes through `evaluateFacilityInvestment` /
 * `applyFacilityInvestment`, so the AI and the player share exactly one cost
 * model. The AI cannot buy anything the player could not buy at the same price.
 */

import { clamp, derivedRng } from "../utils/rng.js";
import {
  FACILITY_KEYS,
  FACILITY_INVESTMENT_PROFILE,
  applyFacilityInvestment,
  chargeFacilityUpkeep,
  evaluateFacilityInvestment,
  totalFacilityUpkeep
} from "../domain/facilityInvestment.js";

export const FACILITY_MARKET_PROFILE = Object.freeze({
  version: "2026-s93-ai-capital",
  /** Cash a club insists on holding beyond the hard reserve before it will build. */
  comfortCash: 90_000_000,
  /** Owner-personality appetite for capital projects. */
  personalityAppetite: Object.freeze({
    "legacy-builder": 1,
    "win-now": 0.7,
    "player-friendly": 0.85,
    "profit-first": 0.35
  }),
  /** How strongly a deficit against the league centre pulls investment. */
  deficitWeight: 0.09,
  /** Championship priority above this behaves as a builder regardless of personality. */
  championshipDrive: 78,
  /** Appetite below this and the club sits the year out. */
  investmentThreshold: 0.5
});

const facilityLevel = (team, facility) =>
  Number(team?.owner?.facilities?.[facility] ?? FACILITY_INVESTMENT_PROFILE.floor);

/**
 * The league's own mean level for each facility.
 *
 * Measured, not declared — a club invests to close the gap against the league it
 * is actually in, so the target moves as the league builds.
 */
export function measureFacilityCentres(league) {
  const teams = league?.teams || [];
  const centres = {};
  for (const key of FACILITY_KEYS) {
    const values = teams
      .map((team) => Number(team?.owner?.facilities?.[key]))
      .filter((value) => Number.isFinite(value));
    centres[key] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : FACILITY_INVESTMENT_PROFILE.floor;
  }
  return centres;
}

/**
 * How much capital appetite one club has this year, in [0, 1].
 *
 * Exported so a test can assert the shape directly — that a thin-cash
 * profit-first owner does not build, and a flush championship-driven owner does —
 * without simulating a decade to infer it.
 */
export function facilityAppetite(team, centres) {
  const profile = FACILITY_MARKET_PROFILE;
  const owner = team?.owner || {};
  const cash = Number(owner.cash) || 0;
  const cashRoom = clamp(
    (cash - FACILITY_INVESTMENT_PROFILE.minimumCashReserve) /
      Math.max(1, profile.comfortCash - FACILITY_INVESTMENT_PROFILE.minimumCashReserve),
    0,
    1.4
  );
  const personality = profile.personalityAppetite[owner.personality] ?? 0.7;
  const championships = Number(owner.priorities?.championships) || 70;
  const drive = championships >= profile.championshipDrive ? 1 : personality;
  const deficit = Math.max(
    0,
    ...FACILITY_KEYS.map((key) => (centres[key] ?? 0) - facilityLevel(team, key))
  );
  return clamp(cashRoom * Math.max(personality, drive) * (0.55 + deficit * profile.deficitWeight), 0, 1.4);
}

/**
 * The facility this club would build next: the one it is furthest behind the
 * league on, with a derived tie-break so two identically-placed clubs do not
 * both pile into the same wing every year.
 */
function chooseFacility(team, centres, year) {
  const rng = derivedRng(`facility-choice|${year}|${team?.id}`);
  let best = null;
  for (const key of FACILITY_KEYS) {
    const deficit = (centres[key] ?? 0) - facilityLevel(team, key);
    const score = deficit + rng.float(-0.35, 0.35);
    if (!best || score > best.score) best = { key, score };
  }
  return best?.key || FACILITY_KEYS[0];
}

/**
 * One league-year of facility upkeep and rival facility investment.
 *
 * The controlled franchise is excluded from *investment* by design: the player's
 * capital is the player's decision, and an AI that spent it would be the
 * authority hole this session closed, rebuilt from the other side. It is NOT
 * excluded from *upkeep* — paying for what you own is an economic fact of owning
 * it, not a command anyone chooses to issue.
 *
 * @returns {{ investments: Array, upkeep: Array, centres: Object, skipped: number }}
 */
export function runFacilityInvestmentRound({ league, year, controlledTeamId = null } = {}) {
  const controlled = String(controlledTeamId || "").toUpperCase();
  const investments = [];
  const upkeep = [];
  let skipped = 0;

  // Upkeep is charged FIRST, and to every club including the controlled one.
  // Order matters: a club decides what it can afford to build out of the cash it
  // still holds after paying for what it already owns, which is what stops the
  // league ratcheting to a flat ceiling. See facilityUpkeepCost for the
  // measurement that made this necessary.
  for (const team of league?.teams || []) {
    if (!team?.owner) continue;
    const result = chargeFacilityUpkeep(team.owner);
    if (result.degraded) upkeep.push({ teamId: team.id, ...result });
  }

  // Centres are measured AFTER upkeep so investment reacts to the league as it
  // actually stands this year, not as it stood before the bills came due.
  const centres = measureFacilityCentres(league);

  for (const team of league?.teams || []) {
    if (!team?.owner) continue;
    if (String(team.id).toUpperCase() === controlled) continue;

    const appetite = facilityAppetite(team, centres);
    if (appetite < FACILITY_MARKET_PROFILE.investmentThreshold) {
      skipped += 1;
      continue;
    }
    const facility = chooseFacility(team, centres, year);
    const points = clamp(Math.round(appetite * FACILITY_INVESTMENT_PROFILE.annualPointAllowance), 1, FACILITY_INVESTMENT_PROFILE.annualPointAllowance);
    const verdict = evaluateFacilityInvestment(team.owner, year, facility, points);
    if (!verdict.ok || verdict.quote.granted <= 0) {
      skipped += 1;
      continue;
    }
    applyFacilityInvestment(team.owner, year, facility, verdict.quote);
    investments.push({
      teamId: team.id,
      facility,
      points: verdict.quote.granted,
      from: verdict.quote.current,
      to: verdict.quote.target,
      cost: verdict.quote.cost
    });
  }

  return { investments, upkeep, centres, skipped };
}
