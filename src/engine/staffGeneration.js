/**
 * staffGeneration.js — derived, deterministic coaching staff (S63 second-order).
 *
 * ── The bug this exists to fix ──────────────────────────────────────────────
 *
 * The words below describe a defect this module *fixed*, not live debt.
 * innovation-pack:ignore
 *
 * `GameSession`'s league normalizer filled missing coaching staff, and rebuilt
 * every owner profile, with a stub random source:
 *
 *     buildStaffProfile({ int: () => 76, pick: (items) => items[0] }, team.staff)
 *     buildOwnerProfile({ int: () => 76, float: () => 1, … }, team.owner)
 *
 * The stub is there for a good reason — a normalizer must not draw from the
 * session RNG stream, or replaying a save would desync. But `createLeagueBase`
 * does not build staff, so in the browser runtime this *safety net became the
 * primary generator*. Measured on a fresh browser league (2026-08-01):
 *
 *     distinct playcalling across 32 teams : [76]
 *     distinct yearsRemaining              : [76]   ← domain range is 1–7
 *     distinct staff names league-wide     : 3
 *     distinct team.coaching.offense       : [76]
 *     distinct owner personality           : ["profit-first"]
 *
 * So in the entire deployed zero-backend game, coaching was a flat constant.
 * Every team had the same coordinators, the same tendency archetype (`pick`
 * always returned the first option), and identical `team.coaching` — which
 * feeds play calling, player development, discipline and, as of S63, how much
 * of an opponent's soft side a staff can exploit. A whole dimension of the
 * simulation was silently switched off, and `yearsRemaining: 76` was plainly
 * corrupt against its own 1–7 domain.
 *
 * ── The fix ─────────────────────────────────────────────────────────────────
 *
 * Keep the constraint (no session-RNG draws in a normalizer) and drop the
 * constant. `derivedRng` in src/utils/rng.js returns an RNG-shaped object whose
 * values are derived from a seed key — fully deterministic, so replays and
 * saves are stable, while every team gets its own staff and owner.
 *
 * Existing saves are unaffected: both profile builders preserve any value
 * already present, so only genuinely missing state is generated.
 */

import { derivedRng } from "../utils/rng.js";

/**
 * Stable identity for a league/team pair, used as the generation seed.
 * Falls back through the fields a league may carry so the key is always defined.
 */
export function staffSeedKey(league, teamId) {
  const identity =
    league?.leagueId || league?.franchiseId || `y${league?.year ?? league?.currentYear ?? 0}`;
  return `staff|${identity}|${teamId}`;
}

/**
 * The derived source for staff and owner generation.
 * Thin alias over the shared utility so callers read at the right altitude.
 */
export function derivedStaffRng(seedKey) {
  return derivedRng(seedKey);
}
