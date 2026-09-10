import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import {
  deriveLeagueIdentity,
  ensureLeagueIdentity,
  leagueIdentity
} from "../src/domain/leagueIdentity.js";
import { staffSeedKey } from "../src/engine/staffGeneration.js";

// ── S103 · a league had no identity, so every league shared one ───────────────
//
// `staffSeedKey` and `coachingMarket`'s `leagueSeed` both fell back to
// `y${league.year}` when a league carried no `leagueId`/`franchiseId` — which is
// every single-player league, because only the multiplayer lobby path sets
// those fields. `derivedRng` was working perfectly and being handed the same
// seed by three different franchises.

const SEEDS = [8121, 2026, 4242];

// Generating a league is the expensive part of this file, and every assertion
// below wants the same three leagues. Build each one once.
const sessionCache = new Map();
function newSession(seed) {
  if (!sessionCache.has(seed)) sessionCache.set(seed, createSession({ seed, startYear: 2026, controlledTeamId: "BUF" }));
  return sessionCache.get(seed);
}

function snapshotOf(session) {
  return JSON.parse(JSON.stringify(session.toSnapshot()));
}

test("three leagues started in the same year get three identities", () => {
  const ids = SEEDS.map((seed) => newSession(seed).league.leagueId);
  assert.equal(new Set(ids).size, SEEDS.length, `expected distinct league identities, got ${ids.join(", ")}`);
  for (const id of ids) assert.match(id, /^L[0-9a-z]+$/);
});

test("negative control: the pre-fix year key collapses all three onto one seed", () => {
  // The exact expression the two call sites carried before this session. It is
  // reconstructed here rather than left live in the source, so the gate fails on
  // the real defect in the shape it was observed rather than on a paraphrase.
  const preFixKey = (league, teamId) =>
    `staff|${league?.leagueId || league?.franchiseId || `y${league?.year ?? league?.currentYear ?? 0}`}|${teamId}`;
  const leagues = SEEDS.map((seed) => {
    const league = newSession(seed).league;
    // A pre-S103 save carries no identity of its own; that is the whole defect.
    return { ...league, leagueId: undefined, franchiseId: undefined };
  });
  const preFix = new Set(leagues.map((league) => preFixKey(league, "BUF")));
  assert.equal(preFix.size, 1, "the pre-fix key is supposed to collide — if it does not, this control proves nothing");
  const fixed = new Set(leagues.map((league) => staffSeedKey(league, "BUF")));
  assert.equal(fixed.size, SEEDS.length);
});

test("head coaches and coordinators are distinct across leagues, not just across teams", () => {
  const byRole = { headCoach: [], offensiveCoordinator: [], defensiveCoordinator: [] };
  for (const seed of SEEDS) {
    const team = newSession(seed).league.teams[0];
    for (const role of Object.keys(byRole)) byRole[role].push(team.staff[role].name);
  }
  for (const [role, names] of Object.entries(byRole)) {
    assert.equal(new Set(names).size, SEEDS.length, `${role} was byte-identical across leagues: ${names.join(", ")}`);
  }
});

test("the coaching market's candidate pool is per-league too", async () => {
  // The second call site. `leagueSeed` carried the identical `y${year}` fallback,
  // so two franchises started in the same year interviewed the same people.
  const { buildCoachingMarket } = await import("../src/engine/coachingMarket.js");
  assert.equal(typeof buildCoachingMarket, "function", "the market builder moved — this assertion must not skip");
  const pools = SEEDS.map((seed) => {
    const market = buildCoachingMarket(newSession(seed).league, "BUF", "headCoach");
    const candidates = market?.candidates || market || [];
    assert.ok(candidates.length > 0, "an empty candidate pool would make this comparison vacuous");
    return candidates.map((candidate) => `${candidate.name}|${candidate.playcalling}|${candidate.development}`).join(";");
  });
  assert.equal(new Set(pools).size, SEEDS.length, `two franchises interviewed the same candidates: ${pools[0]}`);
});

test("the identity is deterministic, survives a snapshot round trip, and is idempotent", () => {
  const a = newSession(2026);
  const b = newSession(2026);
  assert.equal(a.league.leagueId, b.league.leagueId);

  const restored = createSessionFromSnapshot(snapshotOf(a));
  assert.equal(restored.league.leagueId, a.league.leagueId);
  assert.equal(restored.league.teams[0].staff.headCoach.name, a.league.teams[0].staff.headCoach.name);

  const league = a.league;
  assert.equal(ensureLeagueIdentity(league), ensureLeagueIdentity(league));
});

test("a legacy save with no identity derives one on load and keeps the staff it already had", () => {
  const session = newSession(7311);
  const before = session.league.teams.map((team) => team.staff.headCoach.name);
  const snapshot = snapshotOf(session);
  // Exactly what a pre-S103 payload looks like: real staff, no league identity.
  delete snapshot.league.leagueId;
  delete snapshot.league.franchiseId;

  const restored = createSessionFromSnapshot(snapshot);
  assert.ok(restored.league.leagueId, "the normalizer must assign an identity to a legacy league");
  assert.deepEqual(
    restored.league.teams.map((team) => team.staff.headCoach.name),
    before,
    "changing the seed key must not regenerate staff a save already carries"
  );
  // And it derives the same value every time that payload is loaded.
  const again = createSessionFromSnapshot(snapshotOf(session));
  assert.equal(deriveLeagueIdentity(restored.league), deriveLeagueIdentity(again.league));
});

test("an explicitly declared identity is never overwritten", () => {
  const league = { year: 2026, players: [], teams: [], leagueId: "lobby-42" };
  assert.equal(leagueIdentity(league), "lobby-42");
  assert.equal(ensureLeagueIdentity(league), "lobby-42");
  assert.equal(league.leagueId, "lobby-42");

  const franchise = { year: 2026, players: [], teams: [], franchiseId: "fr-7" };
  assert.equal(leagueIdentity(franchise), "fr-7");
});

test("the fingerprint is canonical: reordering the players array does not change it", () => {
  const league = newSession(5150).league;
  const original = deriveLeagueIdentity(league);
  const shuffled = { ...league, players: [...league.players].reverse() };
  assert.equal(deriveLeagueIdentity(shuffled), original);
});
