import { CONTRACT_RULES, FIELDABLE_DEPTH, NFL_STRUCTURE, ROSTER_STRUCTURE } from "../config.js";
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
  // S102 — read the persisted amortization schedule.
  //
  // This read `contract.capYears`, which was never a field on a persisted
  // contract: `normalizeContract` computed a `capYears` local and discarded it,
  // so this expression always fell through to `yearsRemaining`. That was
  // invisible while `capHit` was *also* being re-derived from the remaining
  // term — the two wrong answers agreed. Now that the schedule is persisted as
  // `prorationYears`, reading anything else would make this function and the
  // contract's own cap hit disagree about the same quantity, which is the
  // "declare a shape twice and it drifts" failure this project keeps paying
  // for. `capYears` is kept in the chain only as a fossil-tolerant fallback.
  //
  // The convergence property the comment below depends on is unaffected: the
  // charge is still bounded by the cap hit, so the current-year saving stays
  // non-negative and the trim loop still makes progress on every release.
  const schedule = Number(
    contract.prorationYears || contract.capYears || contract.yearsRemaining || 1
  );
  return Math.max(0, Math.round(Number(contract.signingBonus || 0) / Math.max(1, schedule)));
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
      // Keep the best `limit` players, except that a player the club needs to
      // field a legal offensive line is not "surplus" merely because a backup
      // quarterback out-rates him (S104 - see `selectReleasable`, which guards a
      // COUNT; `fieldableProtectedIds` is deliberately NOT the rule here, and
      // its own note says why protecting individuals from release was wrong).
      const order = roster.slice().sort(byQualityThenId).reverse();
      const surplus = selectReleasable(roster, order, roster.length - limit);
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
      // S104 - value density is not position-neutral, so an unprotected cap cut
      // strips the expensive rooms (the line, the front seven) and keeps the
      // cheap high-rated ones. The fieldable minimum is off the table; if only
      // protected players could free money the club is genuinely trapped and
      // stays visible in `stillOverCap`, which is the S89 design.
      const [candidate] = selectReleasable(
        roster,
        releaseRanking(roster).filter((player) => currentYearCapSaving(player) > 0),
        1
      );
      if (!candidate) break;
      released.push(releaseToFreeAgency(league, candidate, { onRelease, reason: "cap" }));
    }
    if (capSpaceForTeam(league, team.id) < 0) stillOverCap.push(team.id);
  }

  return { released, stillOverCap };
}

/** Best-first, with a stable tiebreak so a fixed seed always produces the same league. */
function byQualityThenId(a, b) {
  return Number(b.overall || 0) - Number(a.overall || 0) || String(a.id).localeCompare(String(b.id));
}

/**
 * Choose the active roster as a **fieldable depth chart** rather than a
 * leaderboard.
 *
 * S104. This was `roster.sort(byOverall).slice(0, 53)`, and that is not a
 * football team — it is the 53 highest-rated employees of a football team. The
 * distinction is measurable, because a rating is not comparable across
 * positions: quarterbacks and specialists rate several points above a league
 * mean by construction, so a pure ranking promotes them and demotes the rooms
 * that actually decide games. Measured over ten seasons on the canonical seed,
 * the active quarterback room went from 4.1% of the league's active players to
 * **11.6%** and specialists 4.1% -> 8.1%, while the offensive line fell
 * 18.4% -> 16.0% and the front seven 30.6% -> 22.2%. Clubs were dressing six
 * quarterbacks and four kickers.
 *
 * Three passes, in this order, and the order is the whole design:
 *
 *   1. **Minimums.** Each room takes its best `FIELDABLE_DEPTH[pos].min`. This
 *      is what the club has to put on the field, so it is bought first and at
 *      whatever quality the club has.
 *   2. **Merit, capped.** Remaining slots go to the best players left, skipping
 *      any room already at its `max`. This is where a club's actual roster
 *      judgement lives — 12 of the 53 on a full roster.
 *   3. **Legality.** If the club still has empty active slots (it is short of
 *      bodies at some position), they are filled from whatever remains,
 *      ignoring `max`. A club must always field a legal roster; a structural
 *      preference must never be able to shrink one.
 *
 * A minimum alone would not have fixed this and it is worth saying why: nothing
 * in a minimum stops a sixth quarterback from out-rating a fourth cornerback
 * and taking the slot on merit, which is exactly how the room grew. The `max`
 * is the term that binds.
 *
 * Pure and exported so the property can be asserted directly on a roster,
 * without simulating a decade to observe it.
 */
export function assignFieldableActiveRoster(roster, { activeLimit = ROSTER_STRUCTURE.activeLimit } = {}) {
  const ranked = roster.slice().sort(byQualityThenId);
  const active = [];
  const taken = new Set();
  const countByPosition = {};

  const claim = (player) => {
    taken.add(player.id);
    active.push(player);
    countByPosition[player.position] = (countByPosition[player.position] || 0) + 1;
  };

  // 1 - fieldable minimums.
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    if (active.length >= activeLimit) break;
    const room = ranked.filter((player) => player.position === position && !taken.has(player.id));
    for (const player of room.slice(0, band.min)) {
      if (active.length >= activeLimit) break;
      claim(player);
    }
  }

  // 2 - merit, bounded by each room's declared ceiling.
  for (const player of ranked) {
    if (active.length >= activeLimit) break;
    if (taken.has(player.id)) continue;
    const band = FIELDABLE_DEPTH[player.position];
    if (band && (countByPosition[player.position] || 0) >= band.max) continue;
    claim(player);
  }

  // 3 - legality outranks structure: never field a short roster to honour a max.
  for (const player of ranked) {
    if (active.length >= activeLimit) break;
    if (taken.has(player.id)) continue;
    claim(player);
  }

  return { active, activeIds: taken, countByPosition };
}

/**
 * The club's best `min` players at each position — its projected starters and
 * key backups.
 *
 * Used to decide who is paid like a starter at generation. **Not** used to
 * decide who may be released: see `selectReleasable`, and the note there on why
 * protecting these individuals from release was measurably wrong.
 */
export function fieldableProtectedIds(roster) {
  const ranked = roster.slice().sort(byQualityThenId);
  const protectedIds = new Set();
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    const room = ranked.filter((player) => player.position === position);
    for (const player of room.slice(0, band.min)) protectedIds.add(player.id);
  }
  return protectedIds;
}

/**
 * Walk a release order and take the players a club can actually afford to lose.
 *
 * S104 — both release paths were position-blind, and neither scalar they ranked
 * by is neutral with respect to position. The roster-limit cut released the
 * tail by overall; the cap cut released by value density (overall per dollar),
 * which is enormous for a quarterback or kicker on a rookie deal and tiny for a
 * starting offensive lineman. So the club that had to get legal did it by
 * cutting linemen, every time.
 *
 * **The first version of this guard protected the wrong thing, and measuring it
 * is what showed that.** It computed the club's best `min` players at each
 * position and made those individuals unreleasable. That is not the fieldability
 * constraint — it is a no-trade clause. Driven on the S91 camp-cuts fixture at
 * seed 20260817, a club $129.0M over the cap carried two of its three monstrous
 * contracts on "protected" players, so the trim loop could not reach them and
 * bottomed out at the 53-man floor still **$27.8M over**, reporting itself
 * trapped. It was not trapped; it had eleven other linemen.
 *
 * What a club may not do is drop **below** the minimum at a position. Who fills
 * that minimum is a personnel decision the club is entitled to get wrong: a
 * roster with twelve linemen can release its best one and still take the field.
 * So the guard is a count, evaluated as the cuts accumulate, and the release
 * order is unchanged — this only removes moves that would produce a roster the
 * club could not dress.
 */
export function selectReleasable(roster, order, count) {
  if (count <= 0) return [];
  const remaining = {};
  for (const player of roster) {
    remaining[player.position] = (remaining[player.position] || 0) + 1;
  }
  const chosen = [];
  for (const player of order) {
    if (chosen.length >= count) break;
    const band = FIELDABLE_DEPTH[player.position];
    const held = remaining[player.position] || 0;
    if (band && held - 1 < band.min) continue;
    remaining[player.position] = held - 1;
    chosen.push(player);
  }
  return chosen;
}

/**
 * Re-slot each club's roster against the declared structure.
 *
 * Replaces the old unbounded `normalizeRosterSlots`, which labelled the top 53
 * active and *every* remaining player practice with no upper bound — the reason
 * the practice population grew without limit. S104 replaced the *ranking* it
 * used with a fieldable depth chart; see `assignFieldableActiveRoster`.
 */
export function normalizeRosterSlots(league) {
  for (const team of league.teams) {
    const roster = getAllTeamPlayers(league, team.id);
    const { activeIds } = assignFieldableActiveRoster(roster);
    for (const player of roster) {
      player.rosterSlot = activeIds.has(player.id) ? "active" : "practice";
    }
  }
}

/** Declared ceiling sanity — exported so tests can bind the constant to the curve. */
export const CAP_COMPLIANCE_PROFILE = Object.freeze({
  version: "2026-s89-compliance",
  activeLimit: ROSTER_STRUCTURE.activeLimit,
  practiceLimit: ROSTER_STRUCTURE.practiceLimit,
  maxSalary: CONTRACT_RULES.maxSalary,
  fieldableDepth: FIELDABLE_DEPTH
});
