import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { POTENTIAL_HEADROOM_PROFILE, resolvePotential } from "../src/domain/playerFactory.js";

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
    if (!(headroom > 0) || headroom > 5) {
      violations.push(`${position} mean potential ${potential.toFixed(1)} vs mean overall ${overall.toFixed(1)}`);
    }
  }
  return violations;
}

test("no player is generated past his own ceiling, and every room's potential sits just above its overall", () => {
  for (const seed of SEEDS) {
    const { players } = leagueOf(seed);
    assert.ok(players.length > 2000, `seed ${seed}: expected a full league`);
    assert.deepEqual(potentialScaleViolations(players, (player) => Number(player.potential)), [], `seed ${seed}`);
    assert.ok(players.every((player) => Number(player.potential) <= 99));
  }
});

test("potential follows the position scale overall is measured on", () => {
  // Measured on four seeds at landing: QB 83.3-84.4, TE 75.7-76.4. Under the
  // position-blind draw both rooms sat at ~80.
  const { players } = leagueOf(SEEDS[0]);
  const rooms = roomMeans(players, (player) => Number(player.potential));
  assert.ok(rooms.get("QB").potential - rooms.get("TE").potential > 4, JSON.stringify(Object.fromEntries(rooms)));
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
  assert.ok(above > 0.25, `the reconstructed draw should reproduce the measured ~37%; got ${(above * 100).toFixed(1)}%`);
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
  assert.ok(room70 > 0 && room70 < 12, `a 70 keeps part of his room; got +${room70}`);
  assert.ok(room92 < room70 / 2, `a 92 keeps little room to grow; got +${room92} against +${room70} at 70`);

  assert.equal(resolvePotential({ overall: 99, age: young, headroom: superstarMax }), 99);
  assert.equal(resolvePotential({ overall: 60, age: young, headroom: 0 }), 60);

  // Corrupt input must fail where potential is written, never become a NaN ceiling.
  assert.throws(() => resolvePotential({ overall: NaN, age: young, headroom: 4 }), /overall must be finite/);
  assert.throws(() => resolvePotential({ overall: 70, age: undefined, headroom: 4 }), /age must be finite/);
  assert.throws(() => resolvePotential({ overall: 70, age: young, headroom: "x" }), /headroom must be finite/);
});

test("the player profile surfaces the potential the engine develops against", () => {
  const { session, players } = leagueOf(SEEDS[0]);
  const rookies = players.filter((player) => Number(player.age) <= POTENTIAL_HEADROOM_PROFILE.fullHeadroomAge).slice(0, 12);
  assert.ok(rookies.length >= 5, "expected young players in a generated league");
  for (const player of rookies) {
    const surfaced = session.getPlayerProfile(player.id)?.player;
    assert.equal(surfaced?.potential, player.potential, `profile potential disagrees with the engine for ${player.id}`);
    assert.ok(surfaced.potential >= surfaced.overall, `${player.id} surfaces a negative development runway`);
  }
});
