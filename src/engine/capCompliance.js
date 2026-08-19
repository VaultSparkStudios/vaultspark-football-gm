import { CONTRACT_RULES, NFL_STRUCTURE, ROSTER_STRUCTURE } from "../config.js";
import { getAllTeamPlayers } from "../domain/teamFactory.js";

/**
 * Roster and salary-cap compliance authority.
 *
 * Until S89 nothing in this engine could ever release a player. `runOffseason`
 * expired contracts, aged and retired players, drafted 224 new contracts a year
 * and re-sorted rosters — but every club kept every player it had ever acquired
 * until that player retired, and no stage could bring an over-cap club back
 * under the cap. A seeded 20-season probe made the consequence measurable:
 *
 *   - clubs over the $255M cap by season: 0, 0, 1, 2, 10, 27, 30, then 31 of 32
 *     for every remaining season; median club finished season 20 at -$89M and
 *     the worst at -$226M;
 *   - the league grew 1,568 -> 2,919 players (+86%) with active rosters pinned
 *     at 53, i.e. the entire surplus accumulated on an unbounded practice squad
 *     (50 -> 468 players in eight seasons, ~37 per club against a real 16).
 *
 * A cap that every club violates is not a constraint, and it silently voids the
 * cost of every decision the game asks a General Manager to make. This module is
 * the missing authority: one deterministic release path, used by both the roster
 * limit and the cap ceiling.
 *
 * Two boundaries hold, and both are load-bearing:
 *
 *   - **Franchise authority.** `excludeTeamIds` clubs are never touched. The
 *     controlled franchise is passed in by GameSession exactly as it is to
 *     `runFreeAgencyBackstop`, so the engine can never cut a player out from
 *     under the GM who signed them. An over-cap player-controlled club stays
 *     over the cap, keeps its existing cap alerts, and remains the player's
 *     problem to solve — which is the decision the game is about.
 *   - **Releases are not free.** Every release accrues the contract's remaining
 *     dead money against the club's ledger, so trimming to legality carries the
 *     same consequence it carries in the real sport. A costless cut would just
 *     relocate the fiction rather than remove it.
 */

/** Cap charge a club currently carries, counting practice contracts and dead money. */
export function capUsedByTeam(league, teamId) {
  const roster = getAllTeamPlayers(league, teamId);
  return roster.reduce((sum, player) => sum + Number(player.contract?.capHit || 0), 0);
}

/** The club's cap for this year, including any rollover and per-team override. */
export function capForTeam(league, teamId) {
  const ledger = league.capLedger?.[teamId] || {};
  const base = league.teamCapOverride?.[teamId] || NFL_STRUCTURE.salaryCap;
  return base + Number(ledger.rollover || 0);
}

/** Positive when the club has room; negative when it is illegal. */
export function capSpaceForTeam(league, teamId) {
  const ledger = league.capLedger?.[teamId] || {};
  return capForTeam(league, teamId) - capUsedByTeam(league, teamId) - Number(ledger.deadCapCurrentYear || 0);
}

/**
 * Release order: worst value per dollar first.
 *
 * Ranking by overall alone would cut a cheap depth player before an expensive
 * declining one and barely move the cap; ranking by cap hit alone would cut the
 * best player on the roster. Value density (overall per $M of cap hit) cuts the
 * contracts a real front office cuts. Ties break on player id so a fixed seed
 * always produces the same league.
 */
export function releaseRanking(roster) {
  return roster
    .slice()
    .sort((a, b) => {
      const aHit = Math.max(1, Number(a.contract?.capHit || 0));
      const bHit = Math.max(1, Number(b.contract?.capHit || 0));
      const aDensity = Number(a.overall || 0) / aHit;
      const bDensity = Number(b.overall || 0) / bHit;
      if (aDensity !== bDensity) return aDensity - bDensity;
      if (Number(a.overall || 0) !== Number(b.overall || 0)) return Number(a.overall || 0) - Number(b.overall || 0);
      return String(a.id).localeCompare(String(b.id));
    });
}

/**
 * Move one player to the free-agent pool and charge the club its dead money.
 *
 * The player stays `status: "active"` — they are employable, just unemployed —
 * which is exactly the shape `runFreeAgencyBackstop` looks for (`teamId === "FA"`).
 */
/**
 * This year's already-prorated signing bonus — the portion of a released
 * player's cap hit that stays on the books.
 *
 * Held as one function because two places need it and a quantity declared twice
 * will drift: `releaseToFreeAgency` charges it, and `currentYearCapSaving`
 * predicts it in order to choose a release worth making.
 */
function currentYearProration(contract = {}) {
  return Math.max(
    0,
    Math.round(Number(contract.signingBonus || 0) / Math.max(1, Number(contract.capYears || contract.yearsRemaining || 1)))
  );
}

/**
 * What releasing this player actually frees up against the current year's cap.
 *
 * S91 — this exists because "release the worst value per dollar" is not the same
 * question as "release someone who helps". The saving is `capHit - proration`,
 * which is non-negative but can be exactly **zero**: a contract whose cap hit is
 * entirely this year's prorated bonus costs a roster spot to release and frees
 * nothing. The trim loop may only cut down to the 53-man floor, so it gets a
 * bounded number of releases; spending any of them on a zero-saving cut can
 * leave a club trapped over the cap while a release that would have cleared it
 * was still available.
 */
export function currentYearCapSaving(player) {
  const contract = player?.contract || {};
  const capHit = Math.max(0, Number(contract.capHit || 0));
  return Math.max(0, capHit - Math.min(capHit, currentYearProration(contract)));
}

export function releaseToFreeAgency(league, player, { onRelease = null, reason = "cap" } = {}) {
  const teamId = player.teamId;
  const contract = player.contract || {};
  const capHit = Math.max(0, Number(contract.capHit || 0));

  // Dead money splits the way it does in the real sport, and the split is what
  // makes compliance converge at all. The first implementation of this charged
  // the whole `deadCapRemaining` (signing bonus plus 35% of guarantees) against
  // the current year — which for a large contract exceeds its own cap hit, so
  // every release made the club *less* legal and the trim loop ran to its guard
  // limit without ever reaching compliance. Measured, not theorised: 31 of 32
  // clubs stayed illegal with that model in place.
  //
  // What a club actually sheds by cutting a player is the base salary. This
  // year's already-prorated signing bonus stays on the books, and whatever
  // guaranteed money remains accelerates into next year. So the current-year
  // saving is exactly the base salary — always non-negative, so the loop always
  // makes progress — and the club still pays in full, just on the real schedule.
  const proration = currentYearProration(contract);
  const deadNow = Math.min(capHit, proration);
  const deadNext = Math.max(0, Math.round(Number(contract.deadCapRemaining || 0)) - deadNow);
  const deadMoney = deadNow + deadNext;

  if (!league.capLedger) league.capLedger = {};
  const ledger = league.capLedger[teamId] || { rollover: 0, deadCapCurrentYear: 0, deadCapNextYear: 0 };
  ledger.deadCapCurrentYear = Number(ledger.deadCapCurrentYear || 0) + deadNow;
  ledger.deadCapNextYear = Number(ledger.deadCapNextYear || 0) + deadNext;
  league.capLedger[teamId] = ledger;

  player.teamId = "FA";
  player.rosterSlot = "active";
  if (player.contract) player.contract.yearsRemaining = 0;
  if (typeof onRelease === "function") onRelease({ teamId, player, deadMoney, reason });
  return { teamId, playerId: player.id, deadMoney, reason };
}

/**
 * Enforce the declared roster structure, then the salary cap, for every club.
 *
 * Roster limits run first: a club that is both oversized and over the cap should
 * shed its surplus bodies before it starts cutting into the roster it is allowed
 * to keep. Cap trimming then stops at the active-roster floor — a club may not
 * cut its way below a fieldable team, so a genuinely trapped club stays illegal
 * and visible rather than being silently laundered into legality.
 */
export function enforceRosterAndCapCompliance(league, { excludeTeamIds = [], onRelease = null } = {}) {
  const excluded = new Set(excludeTeamIds.filter(Boolean));
  const released = [];
  const stillOverCap = [];

  for (const team of league.teams) {
    if (excluded.has(team.id)) continue;

    // ── roster structure ────────────────────────────────────────────────────
    const limit = ROSTER_STRUCTURE.activeLimit + ROSTER_STRUCTURE.practiceLimit;
    let roster = getAllTeamPlayers(league, team.id);
    if (roster.length > limit) {
      // Keep the best `limit` players; the surplus is the tail by quality.
      const surplus = roster
        .slice()
        .sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0) || String(a.id).localeCompare(String(b.id)))
        .slice(limit);
      for (const player of surplus) {
        released.push(releaseToFreeAgency(league, player, { onRelease, reason: "roster-limit" }));
      }
    }

    // ── salary cap ──────────────────────────────────────────────────────────
    let guard = 0;
    while (capSpaceForTeam(league, team.id) < 0 && guard < 200) {
      guard += 1;
      roster = getAllTeamPlayers(league, team.id);
      if (roster.length <= ROSTER_STRUCTURE.activeLimit) break; // never field an illegal team
      // S91 — cut someone whose release actually frees money. The loop has a
      // bounded number of releases (down to the 53-man floor and no further), so
      // a zero-saving cut is not merely useless, it spends one of them. Among
      // releases that do free space, the existing worst-value-per-dollar order
      // still decides who goes, so the front office's judgement is unchanged;
      // this only stops it from making a move that cannot help. If nothing frees
      // space the club is genuinely trapped and stays visible in `stillOverCap`,
      // which is the S89 design and is deliberately not laundered here.
      const candidate = releaseRanking(roster).find((player) => currentYearCapSaving(player) > 0);
      if (!candidate) break;
      released.push(releaseToFreeAgency(league, candidate, { onRelease, reason: "cap" }));
    }
    if (capSpaceForTeam(league, team.id) < 0) stillOverCap.push(team.id);
  }

  return { released, stillOverCap };
}

/**
 * Re-slot each club's roster against the declared structure.
 *
 * Replaces the old unbounded `normalizeRosterSlots`, which labelled the top 53
 * active and *every* remaining player practice with no upper bound — the reason
 * the practice population grew without limit.
 */
export function normalizeRosterSlots(league) {
  for (const team of league.teams) {
    const roster = getAllTeamPlayers(league, team.id).sort(
      (a, b) => Number(b.overall || 0) - Number(a.overall || 0) || String(a.id).localeCompare(String(b.id))
    );
    roster.forEach((player, index) => {
      player.rosterSlot = index < ROSTER_STRUCTURE.activeLimit ? "active" : "practice";
    });
  }
}

/** Declared ceiling sanity — exported so tests can bind the constant to the curve. */
export const CAP_COMPLIANCE_PROFILE = Object.freeze({
  version: "2026-s89-compliance",
  activeLimit: ROSTER_STRUCTURE.activeLimit,
  practiceLimit: ROSTER_STRUCTURE.practiceLimit,
  maxSalary: CONTRACT_RULES.maxSalary
});
