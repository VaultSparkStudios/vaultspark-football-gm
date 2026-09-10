/**
 * leagueIdentity.js — one identity for a league, derived once and persisted.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 *
 * A generated league has never carried an identity of its own. Three separate
 * subsystems needed one, and each invented its own fallback:
 *
 *   src/engine/staffGeneration.js   `league.leagueId || league.franchiseId || y${year}`
 *   src/engine/coachingMarket.js    `league.leagueId || league.franchiseId || y${year}`
 *   src/engine/gmDecisionAuthority  `franchiseId || leagueId || fa-${startYear}-${teamId}`
 *
 * `leagueId` and `franchiseId` are set by the multiplayer lobby path only, so in
 * every single-player league — which is every league the game actually ships —
 * all three fell through to a key built from the start year. The year is not an
 * identity: it is the same number for every league anyone starts in 2026.
 *
 * Measured (S102, three seeds 8121 / 2026 / 4242): byte-identical head-coach
 * names across all three leagues. The same holds for the coaching market's
 * candidate pool, which is keyed the same way — two franchises started in the
 * same year interview the same coordinators, with the same names and the same
 * ratings, forever. `derivedRng` did its job perfectly; it was handed the same
 * seed.
 *
 * ── The fix ─────────────────────────────────────────────────────────────────
 *
 * Give the league an identity, derive it from what the league already persists,
 * and assign it once so it is stable for the life of the save.
 *
 * The fingerprint is built from the start year plus a canonical sample of
 * **player ids**, because player ids are the only per-league content that
 * actually varies: `createSyntheticPlayer` mints them as
 * `P${year}-${teamId}-${position}-${rng}`, whereas `buildRandomizedTeamIdentities`
 * takes only the year and therefore produces identical teams for every seed.
 * A team-derived fingerprint would have reproduced the exact bug it fixes.
 *
 * Three properties this has to have, and does:
 *
 *  1. **No RNG draw.** This runs inside the league normalizer, which must never
 *     touch the session stream or a replayed save desyncs (the S63 constraint).
 *     `fnv1a` is a pure hash of a string.
 *  2. **Stable across loads.** Derived once and written to `league.leagueId`,
 *     so the value persists in the snapshot from the first normalize onward and
 *     every later load reads it rather than re-deriving it. A legacy save
 *     re-derives from its own stored players, which do not change between two
 *     loads of the same payload, so the first derivation is already stable.
 *  3. **Additive.** A new optional string field on the league. No snapshot
 *     schema break, nothing to migrate, and a league that already carries a
 *     `leagueId` (the multiplayer lobby path) keeps it untouched.
 */

import { fnv1a } from "../utils/rng.js";

export const LEAGUE_IDENTITY_VERSION = "2026-s103-content-derived";

/**
 * How many player ids the fingerprint samples.
 *
 * The ids are sorted first, so this is a canonical sample rather than a
 * roster-order-dependent one — a league whose players array has been reordered
 * (trades, waivers, a save round trip) fingerprints identically. 64 ids across
 * a ~1,570-player league is far more entropy than a 32-bit output can carry;
 * the bound exists so the cost does not scale with a hundred-season roster.
 */
export const IDENTITY_SAMPLE_SIZE = 64;

function fingerprintSource(league) {
  const year = Number(league?.startYear ?? league?.year ?? league?.currentYear ?? 0);
  const ids = [];
  for (const player of league?.players || []) {
    const id = player?.id;
    if (typeof id === "string" && id) ids.push(id);
  }
  ids.sort();
  const sample = ids.slice(0, IDENTITY_SAMPLE_SIZE);
  const teamCount = Array.isArray(league?.teams) ? league.teams.length : 0;
  return `${LEAGUE_IDENTITY_VERSION}|y${Number.isFinite(year) ? year : 0}|t${teamCount}|n${ids.length}|${sample.join(",")}`;
}

/**
 * Derive a league identity from persisted content. Pure — no mutation, no RNG.
 *
 * Two independent 32-bit hashes are concatenated rather than one, because the
 * value is used as a `derivedRng` seed key for several thousand derived draws
 * across a franchise's life and a 32-bit identity space would collide between
 * two of the player's own saves at a rate worth avoiding.
 */
export function deriveLeagueIdentity(league) {
  const source = fingerprintSource(league);
  const high = fnv1a(source) >>> 0;
  const low = fnv1a(`${source}|salt`) >>> 0;
  return `L${high.toString(36)}${low.toString(36)}`;
}

/**
 * The identity to use, without mutating the league.
 *
 * A league that carries an explicit `leagueId`/`franchiseId` — the multiplayer
 * lobby path — keeps it. Everything else derives.
 */
export function leagueIdentity(league) {
  const declared = league?.leagueId || league?.franchiseId;
  if (typeof declared === "string" && declared) return declared;
  return deriveLeagueIdentity(league);
}

/**
 * Assign the identity so it persists, and return it.
 *
 * Called once from the league normalizer, before any consumer keys off it.
 * Idempotent: a second call reads back the value the first one wrote.
 */
export function ensureLeagueIdentity(league) {
  if (!league || typeof league !== "object") return null;
  const declared = league.leagueId || league.franchiseId;
  if (typeof declared === "string" && declared) return declared;
  const derived = deriveLeagueIdentity(league);
  league.leagueId = derived;
  return derived;
}
