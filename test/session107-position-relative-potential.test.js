import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { POTENTIAL_HEADROOM_PROFILE, resolvePotential, resolvePotentialReadiness, createSyntheticPlayer } from "../src/domain/playerFactory.js";
import { calculatePositionOverall, positionRatingWeights } from "../src/domain/ratings.js";
import { PLAYER_ATTRIBUTE_KEYS } from "../src/config.js";
import { RNG } from "../src/utils/rng.js";

// S107 — potential is headroom above the player's own overall. See the doc
// comment on `POTENTIAL_HEADROOM_PROFILE` for the measurement that landed it.

const SEEDS = [20260306, 8121];

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const leagues = new Map();
function leagueOf(seed) {
  if (!leagues.has(seed)) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
    const players = session.league.players.filter((player) => player.status !== "retired");
    leagues.set(seed, { session, players });
  }
  return leagues.get(seed);
}

function roomMeans(players, potentialOf) {
  const rooms = new Map();
  for (const player of players) {
    if (!rooms.has(player.position)) rooms.set(player.position, []);
    rooms.get(player.position).push(player);
  }
  return new Map(
    [...rooms].map(([position, room]) => [
      position,
      { overall: mean(room.map((player) => Number(player.overall))), potential: mean(room.map(potentialOf)) }
    ])
  );
}

/** The two properties the position-blind draw violated, as one reusable judgement. */
function potentialScaleViolations(players, potentialOf) {
  const violations = [];
  const above = players.filter((player) => Number(player.overall) > potentialOf(player)).length;
  if (above > 0) violations.push(`${above} of ${players.length} generated above their own potential`);
  const rooms = roomMeans(players, potentialOf);
  for (const [position, { overall, potential }] of rooms) {
    const headroom = potential - overall;
    // The requested larger growth contrast replaces the old five-point mean
    // bound. Individual ceilings still cannot exceed the trait's maximum draw.
    if (!(headroom > 0) || headroom > POTENTIAL_HEADROOM_PROFILE.headroomByTrait.SUPERSTAR[1]) {
      violations.push(`${position} mean potential ${potential.toFixed(1)} vs mean overall ${overall.toFixed(1)}`);
    }
  }
  return violations;
}

test("no player is generated past his own ceiling, and every room has positive growth headroom", () => {
  for (const seed of SEEDS) {
    const { players } = leagueOf(seed);
    assert.ok(players.length > 2000, `seed ${seed}: expected a full league`);
    assert.deepEqual(potentialScaleViolations(players, (player) => Number(player.potential)), [], `seed ${seed}`);
    assert.ok(players.every((player) => Number(player.potential) <= 99));
  }
});

test("potential follows the position scale overall is measured on", () => {
  // Equal readiness and age means equal headroom across position labels. The
  // old QB/TE four-point difference was caused by position rating subsidies;
  // it is deliberately removed by the calibrated talent generator.
  assert.equal(resolvePotential({ overall: 65, age: 23, headroom: 25 }), 90);
  assert.equal(resolvePotential({ overall: 85, age: 23, headroom: 25 }), 99);
  for (const { players } of [leagueOf(SEEDS[0]), leagueOf(SEEDS[1])]) {
    assert.ok(players.some(p => p.position === "TE" && p.overall < 75 && p.potential - p.overall >= 20));
    assert.ok(players.some(p => p.position === "QB" && p.overall < 75 && p.potential - p.overall >= 20));
  }
});

test("NEGATIVE CONTROL — the same judgement rejects the position-blind draw it replaced", () => {
  // The draw exactly as it shipped until S107, applied to the same players
  // through a separate stream so the league itself is untouched.
  const { session, players } = leagueOf(SEEDS[0]);
  const rng = new session.rng.constructor(4411);
  const blind = new Map(
    players.map((player) => {
      const trait = player.developmentKey;
      const value =
        trait === "SUPERSTAR" ? rng.int(84, 98) : trait === "HIDDEN" ? rng.int(76, 94) : trait === "BUST" ? rng.int(58, 76) : rng.int(68, 90);
      return [player.id, value];
    })
  );
  const blindPotential = (player) => blind.get(player.id);

  const above = players.filter((player) => Number(player.overall) > blindPotential(player)).length / players.length;
  assert.ok(above > 0.05, `the blind draw must still produce ceiling violations on the broader talent population; got ${(above * 100).toFixed(1)}%`);
  assert.ok(potentialScaleViolations(players, blindPotential).length > 0, "the judgement must reject the defect it was written for");

  const rooms = roomMeans(players, blindPotential);
  assert.ok(Math.abs(rooms.get("QB").potential - rooms.get("TE").potential) < 2.5, "the blind draw ignores position");
});

test("headroom closes with age and with proximity to the 99 ceiling, and never goes negative", () => {
  const profile = POTENTIAL_HEADROOM_PROFILE;
  const [, superstarMax] = profile.headroomByTrait.SUPERSTAR;

  const openOverall = 99 - profile.ceilingTaperSpan;
  assert.equal(resolvePotential({ overall: openOverall, age: profile.fullHeadroomAge, headroom: 12 }), openOverall + 12);
  assert.equal(resolvePotential({ overall: openOverall, age: profile.closedHeadroomAge, headroom: 12 }), openOverall);
  assert.equal(resolvePotential({ overall: 70, age: profile.closedHeadroomAge, headroom: 12 }), 70);
  assert.equal(resolvePotential({ overall: 70, age: 36, headroom: superstarMax }), 70);

  const young = profile.fullHeadroomAge;
  const fullRoomOverall = 99 - profile.ceilingTaperSpan;
  assert.equal(
    resolvePotential({ overall: fullRoomOverall, age: young, headroom: 12 }) - fullRoomOverall,
    12,
    "a player a full taper span below the ceiling keeps all his room"
  );
  const room70 = resolvePotential({ overall: 70, age: young, headroom: 12 }) - 70;
  const room92 = resolvePotential({ overall: 92, age: young, headroom: 12 }) - 92;
  assert.equal(room70, 12, "a raw 70 now retains the full drawn upside");
  assert.ok(room92 < room70 / 2, `a 92 keeps little room to grow; got +${room92} against +${room70} at 70`);

  assert.equal(resolvePotential({ overall: 99, age: young, headroom: superstarMax }), 99);
  assert.equal(resolvePotential({ overall: 60, age: young, headroom: 0 }), 60);

  // Corrupt input must fail where potential is written, never become a NaN ceiling.
  assert.throws(() => resolvePotential({ overall: NaN, age: young, headroom: 4 }), /overall must be finite/);
  assert.throws(() => resolvePotential({ overall: 70, age: undefined, headroom: 4 }), /age must be finite/);
  assert.throws(() => resolvePotential({ overall: 70, age: young, headroom: "x" }), /headroom must be finite/);
  assert.throws(() => resolvePotential({ overall: 70, age: young, headroom: 10, readiness: NaN }), /readiness must be finite/);
});

test("equal-overall raw athletes and polished players have different attribute-shaped runway across every position", () => {
  const capacityKeys = new Set([...PLAYER_ATTRIBUTE_KEYS.physical, "throwPower"]);
  for (const position of ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"]) {
    const weights = positionRatingWeights(position);
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    const fraction = Object.entries(weights).filter(([key]) => capacityKeys.has(key)).reduce((sum, [, value]) => sum + value, 0) / total;
    const attributes = physical => Object.fromEntries(Object.keys(weights).map(key => [key,
      capacityKeys.has(key) ? physical : (70 - fraction * physical) / (1 - fraction)]));
    const raw = attributes(82), polished = attributes(58);
    assert.equal(calculatePositionOverall(position, raw), 70, position);
    assert.equal(calculatePositionOverall(position, polished), 70, position);
    const rawCopy = structuredClone(raw);
    const rawReadiness = resolvePotentialReadiness(position, raw), polishedReadiness = resolvePotentialReadiness(position, polished);
    assert.ok(rawReadiness > 1 && polishedReadiness < 1, position);
    const rawPotential = resolvePotential({ overall: 70, age: 23, headroom: 20, readiness: rawReadiness });
    const polishedPotential = resolvePotential({ overall: 70, age: 23, headroom: 20, readiness: polishedReadiness });
    assert.ok(rawPotential >= polishedPotential + 4, `${position}: ${rawPotential} vs ${polishedPotential}`);
    assert.deepEqual(raw, rawCopy, "readiness must not mutate ratings");
    assert.equal(resolvePotentialReadiness(position, { ...raw, cosmeticRating: 99 }), rawReadiness);
    const missing = { ...raw }; delete missing[Object.keys(weights)[0]];
    assert.equal(resolvePotentialReadiness(position, missing), 1, "missing observations must not assert a raw/polished profile");
    assert.equal(resolvePotentialReadiness(position, { ...raw, [Object.keys(weights)[0]]: NaN }), 1);
  }
  assert.equal(resolvePotentialReadiness("unknown", {}), 1);
  for (const missing of [null, undefined, [], 0, "missing"]) assert.equal(resolvePotentialReadiness("WR", missing), 1);
});

test("creation applies readiness once, preserves each trait ceiling and persists its origin", () => {
  const rng = new RNG(120);
  for (let i = 0; i < 400; i++) {
    const player = createSyntheticPlayer({ teamId: "BUF", position: ["WR", "QB", "OL", "K"][i % 4], year: 2026, rng, draft: true });
    const origin = player.developmentOrigin;
    assert.equal(origin.model, POTENTIAL_HEADROOM_PROFILE.version);
    assert.equal(origin.readiness, resolvePotentialReadiness(player.position, player.ratings));
    assert.ok(origin.adjustedHeadroom <= POTENTIAL_HEADROOM_PROFILE.headroomByTrait[player.developmentKey][1]);
    assert.equal(player.potential, resolvePotential({ overall: player.overall, age: player.age, headroom: origin.adjustedHeadroom }));
    assert.deepEqual(JSON.parse(JSON.stringify(player)).developmentOrigin, origin);
    const beforeSeed = rng.seed;
    resolvePotentialReadiness(player.position, player.ratings);
    assert.equal(rng.seed, beforeSeed);
  }
});

test("the player profile surfaces the potential the engine develops against", () => {
  const { session, players } = leagueOf(SEEDS[0]);
  const rookies = players.filter((player) => Number(player.age) <= POTENTIAL_HEADROOM_PROFILE.fullHeadroomAge).slice(0, 12);
  assert.ok(rookies.length >= 5, "expected young players in a generated league");
  for (const player of rookies) {
    const surfaced = session.getPlayerProfile(player.id)?.player;
    assert.equal(surfaced?.potential, player.potential, `profile potential disagrees with the engine for ${player.id}`);
    assert.ok(surfaced.potential >= surfaced.overall, `${player.id} surfaces a negative development runway`);
    assert.equal(surfaced.developmentOrigin, undefined, "raw creation inputs are not public scouting evidence");
    assert.equal(surfaced.profile.developmentOrigin, undefined);
  }
  const restored = createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  for (const player of rookies) assert.deepEqual(restored.league.players.find(row => row.id === player.id).developmentOrigin, player.developmentOrigin);
});
