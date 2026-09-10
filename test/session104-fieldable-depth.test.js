import test from "node:test";
import assert from "node:assert/strict";
import {
  FIELDABLE_DEPTH,
  PRACTICE_SQUAD_TEMPLATE,
  ROSTER_STRUCTURE,
  ROSTER_TEMPLATE
} from "../src/config.js";
import {
  assignFieldableActiveRoster,
  capSpaceForTeam,
  currentYearCapSaving,
  enforceRosterAndCapCompliance,
  normalizeRosterSlots,
  releaseRanking,
  releaseToFreeAgency,
  selectReleasable
} from "../src/engine/capCompliance.js";
import { DRAFT_POSITION_WEIGHTS, createDraftClass } from "../src/domain/playerFactory.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { RNG } from "../src/utils/rng.js";

const sum = (object, selector = (value) => value) =>
  Object.values(object).reduce((total, value) => total + selector(value), 0);

/**
 * The arithmetic that binds three constants to each other.
 *
 * `CONTRACT_RULES.maxSalary` sat unreachable for years because a declared
 * ceiling was never bound to the curve that had to reach it. These three tables
 * have the same exposure: `ROSTER_TEMPLATE` has to fill exactly the active
 * roster, `PRACTICE_SQUAD_TEMPLATE` exactly the practice squad, and every count
 * in the first has to be a legal value under `FIELDABLE_DEPTH`. None of that is
 * checkable by reading one of them.
 */
test("the roster tables fill the declared structure and lie inside the fieldable bands", () => {
  assert.equal(sum(ROSTER_TEMPLATE), ROSTER_STRUCTURE.activeLimit);
  assert.equal(sum(PRACTICE_SQUAD_TEMPLATE), ROSTER_STRUCTURE.practiceLimit);

  const minTotal = sum(FIELDABLE_DEPTH, (band) => band.min);
  const maxTotal = sum(FIELDABLE_DEPTH, (band) => band.max);
  assert.ok(
    minTotal <= ROSTER_STRUCTURE.activeLimit && ROSTER_STRUCTURE.activeLimit <= maxTotal,
    `activeLimit ${ROSTER_STRUCTURE.activeLimit} must be reachable inside [${minTotal}, ${maxTotal}]`
  );
  // Strictly inside, not merely reachable: if the minimums summed to exactly 53
  // the "merit" pass would have no slots and clubs would hold one identical
  // roster shape forever.
  assert.ok(minTotal < ROSTER_STRUCTURE.activeLimit, "minimums must leave discretionary slots");

  for (const [position, count] of Object.entries(ROSTER_TEMPLATE)) {
    const band = FIELDABLE_DEPTH[position];
    assert.ok(band, `${position} has no declared fieldable band`);
    assert.ok(
      count >= band.min && count <= band.max,
      `${position} generation count ${count} is outside its band [${band.min}, ${band.max}]`
    );
  }
  for (const position of Object.keys(PRACTICE_SQUAD_TEMPLATE)) {
    assert.ok(ROSTER_TEMPLATE[position], `${position} is on the practice squad but not the active template`);
  }
});

/**
 * A roster shaped like the defect, so the assertion fails against the code this
 * replaces rather than only passing against the code that replaced it.
 *
 * The pre-S104 rule was `sort(byOverall).slice(0, activeLimit)`. It is computed
 * explicitly here rather than restored in the source, and the test asserts the
 * two rules disagree — a green that did not show the disagreement would prove
 * nothing about which rule is running.
 */
test("the active roster is a fieldable depth chart, not a leaderboard", () => {
  const players = [];
  let id = 0;
  const add = (position, count, overall) => {
    for (let i = 0; i < count; i += 1) {
      players.push({ id: `p${String(id += 1).padStart(3, "0")}`, position, overall: overall - i });
    }
  };
  // The measured shape: quarterbacks and specialists rating far above the line.
  add("QB", 10, 95);
  add("K", 5, 93);
  add("P", 4, 92);
  add("WR", 12, 88);
  add("RB", 8, 86);
  add("TE", 6, 85);
  add("DB", 12, 80);
  add("LB", 10, 74);
  add("DL", 10, 72);
  add("OL", 10, 60);

  const legacyActive = players
    .slice()
    .sort((a, b) => b.overall - a.overall || String(a.id).localeCompare(String(b.id)))
    .slice(0, ROSTER_STRUCTURE.activeLimit);
  const legacyCount = (position) => legacyActive.filter((p) => p.position === position).length;

  // Negative control — the rule this replaces really does produce the defect.
  assert.equal(legacyCount("QB"), 10, "pre-fix rule should dress all ten quarterbacks");
  assert.ok(legacyCount("OL") < FIELDABLE_DEPTH.OL.min, "pre-fix rule should leave the line unfieldable");

  const { active, countByPosition } = assignFieldableActiveRoster(players);
  assert.equal(active.length, ROSTER_STRUCTURE.activeLimit);

  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    const held = countByPosition[position] || 0;
    const available = players.filter((p) => p.position === position).length;
    assert.ok(held >= Math.min(band.min, available), `${position} below its fieldable minimum: ${held}`);
    assert.ok(held <= band.max, `${position} above its declared ceiling: ${held}`);
  }
  // Quarterback is capped at its ceiling; the line is bought to its floor and
  // no further, because on this roster it is genuinely the worst room and the
  // twelve discretionary slots correctly go elsewhere. Both numbers matter: the
  // ceiling is what stops the drift, the floor is what keeps the club fieldable.
  assert.equal(countByPosition.QB, FIELDABLE_DEPTH.QB.max);
  assert.equal(countByPosition.OL, FIELDABLE_DEPTH.OL.min);
  assert.ok(countByPosition.OL > legacyCount("OL"), "the fix must dress more linemen than the ranking did");
  assert.ok(countByPosition.QB < legacyCount("QB"), "the fix must dress fewer quarterbacks than the ranking did");

  // Every player dressed is at least as good as some player not dressed at the
  // same position: the structure decides the shape, quality still decides who.
  for (const position of Object.keys(FIELDABLE_DEPTH)) {
    const dressed = active.filter((p) => p.position === position).map((p) => p.overall);
    const benched = players
      .filter((p) => p.position === position && !active.includes(p))
      .map((p) => p.overall);
    if (dressed.length && benched.length) {
      assert.ok(Math.min(...dressed) >= Math.max(...benched), `${position} dressed a worse player over a better one`);
    }
  }
});

test("legality outranks the ceiling when a club is short of bodies", () => {
  // Only two rooms exist, and their maxima sum to far less than 53. The club
  // must still dress everyone it has rather than field a short roster.
  const players = [];
  for (let i = 0; i < 40; i += 1) players.push({ id: `q${i}`, position: "QB", overall: 80 - i * 0.1 });
  for (let i = 0; i < 20; i += 1) players.push({ id: `k${i}`, position: "K", overall: 70 - i * 0.1 });

  const { active } = assignFieldableActiveRoster(players);
  assert.equal(active.length, ROSTER_STRUCTURE.activeLimit);
});

/**
 * S104's headline: intake was uniform across positions while demand was not.
 */
test("draft intake is proportional to roster demand, not uniform across positions", () => {
  const positions = Object.keys(DRAFT_POSITION_WEIGHTS);
  assert.deepEqual(positions.slice().sort(), Object.keys(ROSTER_TEMPLATE).slice().sort());
  // Punters are drafted. Excluding them while every club needs one is why the
  // only route to a punter was a manufactured emergency-depth signing.
  assert.ok(DRAFT_POSITION_WEIGHTS.P > 0);

  const rng = new RNG(20260306);
  const classPlayers = createDraftClass({ size: 4096, year: 2026, rng });
  const counts = {};
  for (const player of classPlayers) counts[player.position] = (counts[player.position] || 0) + 1;

  // The share the pre-S104 draw actually produced: `rng.pick` over the nine
  // drafted positions, punter excluded. Using `1 / positions.length` here would
  // silently measure against a uniform draw that never existed.
  const legacyUniformShare = 1 / positions.filter((position) => position !== "P").length;
  for (const [position, weight] of Object.entries(DRAFT_POSITION_WEIGHTS)) {
    const expected = weight / sum(DRAFT_POSITION_WEIGHTS);
    const observed = (counts[position] || 0) / classPlayers.length;
    assert.ok(
      Math.abs(observed - expected) < 0.02,
      `${position} intake ${(observed * 100).toFixed(1)}% is not its demand ${(expected * 100).toFixed(1)}%`
    );
  }

  // Negative control — the two rooms whose supply/demand gap drove the drift
  // are exactly the ones a uniform draw gets wrong, and by a margin far outside
  // the tolerance above.
  const qbShare = counts.QB / classPlayers.length;
  const olShare = counts.OL / classPlayers.length;
  assert.ok(
    legacyUniformShare - qbShare > 0.04,
    `a uniform draw supplied ${(legacyUniformShare * 100).toFixed(1)}% quarterbacks against a demand of ${(qbShare * 100).toFixed(1)}%`
  );
  assert.ok(
    olShare - legacyUniformShare > 0.04,
    `a uniform draw supplied ${(legacyUniformShare * 100).toFixed(1)}% linemen against a demand of ${(olShare * 100).toFixed(1)}%`
  );
});

/**
 * The property that makes a drift statistic possible at all.
 *
 * A generated league used to hold 49 players per club and an empty practice
 * squad, then fill to 69 over the following decade — so `rostered` gained ~39%
 * of itself across the measurement window and `activeRosterOnly` acquired a
 * selection filter it did not start with. Neither population existed at both
 * ends of the window, which is a prior test both of them failed.
 */
test("a generated league starts at the roster structure it is measured against", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const limit = ROSTER_STRUCTURE.activeLimit + ROSTER_STRUCTURE.practiceLimit;

  assert.equal(session.league.teams.length, 32);
  for (const team of session.league.teams) {
    const roster = session.league.players.filter((p) => p.teamId === team.id && p.status === "active");
    assert.equal(roster.length, limit, `${team.id} generated with ${roster.length} players, not ${limit}`);
    const active = roster.filter((p) => (p.rosterSlot || "active") === "active");
    assert.equal(active.length, ROSTER_STRUCTURE.activeLimit, `${team.id} dressed ${active.length}`);
    assert.equal(roster.length - active.length, ROSTER_STRUCTURE.practiceLimit);

    for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
      const held = active.filter((p) => p.position === position).length;
      assert.ok(held >= band.min, `${team.id} cannot field ${position}: ${held} < ${band.min}`);
      assert.ok(held <= band.max, `${team.id} dressed ${held} at ${position}, above ${band.max}`);
    }
  }
});

/**
 * A generated league must be able to afford the roster it is generated with.
 *
 * This is the invariant S104 broke first and loudest. Adding a 16-man practice
 * squad on ordinary market contracts put **all 32 clubs over a 255M cap before
 * a snap was played** - median space -50.1M, worst -84.7M - against a measured
 * baseline of zero over-cap clubs and 43.4M median headroom. The compliance
 * pass would then have laundered it by cutting twenty players per club in the
 * first offseason, so nothing would have gone red; the league would simply have
 * started as fiction. Pricing the roster by role and the generation-time
 * affordability pass are what close it, and this asserts the closure across
 * seeds rather than on the canonical one alone.
 */
test("every generated club can afford its own roster", () => {
  for (const seed of [20260306, 2026, 8121, 4242]) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
    for (const team of session.league.teams) {
      const space = capSpaceForTeam(session.league, team.id);
      assert.ok(
        space >= 0,
        `seed ${seed}: ${team.id} is generated $${(space / 1e6).toFixed(1)}M over the cap`
      );
    }
  }
});

/**
 * The guard on the release paths is a **count**, not a list of protected people.
 *
 * The first version of it protected each club's best `min` players at every
 * position outright, which is a no-trade clause rather than a fieldability
 * rule. Driven on the S91 camp-cuts fixture it left a club that was $129.0M
 * over the cap sitting at the 53-man floor still $27.8M over and reporting
 * itself trapped - while holding eleven linemen it was never allowed to touch.
 * This asserts the distinction directly: a club deep over the cap gets legal,
 * stays fieldable, and its very best lineman is not categorically safe.
 */
test("a club deep over the cap can still cut its way to legality", () => {
  const session = createSession({ seed: 20260817, startYear: 2026, controlledTeamId: "BUF" });
  const league = session.league;
  const target = league.teams.find((team) => team.id !== "BUF");
  const roster = league.players.filter((p) => p.teamId === target.id && p.status === "active");

  // Three contracts no club could carry, deliberately placed on the players a
  // "protect the starters" rule would have made untouchable.
  const ranked = roster.slice().sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0));
  for (const player of ranked.slice(0, 3)) {
    player.contract = {
      ...(player.contract || {}),
      capHit: 40_000_000,
      salary: 40_000_000,
      baseSalary: 40_000_000,
      signingBonus: 0,
      prorationYears: 1,
      yearsRemaining: 2,
      deadCapRemaining: 0
    };
  }
  assert.ok(capSpaceForTeam(league, target.id) < 0, "fixture must actually breach the cap");

  const result = session.enforceLeagueLegality();
  assert.ok(result.released > 0);
  assert.ok(
    capSpaceForTeam(league, target.id) >= 0,
    `the club must reach legality, not report itself trapped: $${(capSpaceForTeam(league, target.id) / 1e6).toFixed(1)}M`
  );
  assert.deepEqual(result.stillOverCap, [], JSON.stringify(result));

  const after = league.players.filter((p) => p.teamId === target.id && p.status === "active");
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    const held = after.filter((p) => p.position === position).length;
    assert.ok(held >= band.min, `and it must still be able to dress ${position}: ${held} < ${band.min}`);
  }
});

/**
 * `selectReleasable` refuses only the move that would break the roster.
 */
test("the release guard blocks the cut below a minimum and permits the one above it", () => {
  const roster = [];
  for (let i = 0; i < FIELDABLE_DEPTH.OL.min; i += 1) roster.push({ id: `ol${i}`, position: "OL", overall: 70 });
  for (let i = 0; i < 6; i += 1) roster.push({ id: `db${i}`, position: "DB", overall: 70 });

  // The line is exactly at its minimum: no lineman may go.
  assert.deepEqual(selectReleasable(roster, roster.filter((p) => p.position === "OL"), 1), []);

  // Add one and the worst lineman becomes releasable - the count is what is
  // protected, not any particular player.
  const withDepth = [...roster, { id: "ol-extra", position: "OL", overall: 60 }];
  const chosen = selectReleasable(withDepth, [withDepth.at(-1)], 1);
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].id, "ol-extra");
});

/**
 * Releases were position-blind, and neither scalar they ranked by is neutral.
 * Value density (overall per dollar) is largest for a cheap high-rated room and
 * smallest for a starting lineman, so an unprotected cap cut strips the line.
 */
test("neither release path can cut a club below a fieldable roster", () => {
  const session = createSession({ seed: 4242, startYear: 2026, controlledTeamId: "BUF" });
  const league = session.league;
  const target = league.teams.find((team) => team.id !== "BUF");
  const roster = league.players.filter((p) => p.teamId === target.id && p.status === "active");

  // Price the line like a real line and the quarterbacks like rookies, then put
  // the club deep enough over the cap that it has to cut its way back.
  for (const player of roster) {
    const expensive = player.position === "OL" || player.position === "DL";
    const capHit = expensive ? 18_000_000 : 900_000;
    player.contract = {
      ...(player.contract || {}),
      salary: capHit,
      baseSalary: capHit,
      capHit,
      signingBonus: 0,
      guaranteed: 0,
      prorationYears: 1,
      yearsRemaining: 2,
      deadCapRemaining: 0,
      restructureCount: 0
    };
  }

  const countByPosition = (players, position) => players.filter((p) => p.position === position).length;

  // Negative control — the pre-S104 cap loop, reproduced explicitly on a clone
  // rather than restored in the source: identical to the live loop except that
  // it does not exclude the fieldable minimum. It has to actually strip the
  // line, in the shape the defect was observed, or the green below proves
  // nothing about which loop is running.
  const control = structuredClone(league);
  let guard = 0;
  while (capSpaceForTeam(control, target.id) < 0 && guard < 200) {
    guard += 1;
    const live = control.players.filter((p) => p.teamId === target.id && p.status === "active");
    if (live.length <= ROSTER_STRUCTURE.activeLimit) break;
    const candidate = releaseRanking(live).find((player) => currentYearCapSaving(player) > 0);
    if (!candidate) break;
    releaseToFreeAgency(control, candidate, { reason: "cap" });
  }
  const controlRoster = control.players.filter((p) => p.teamId === target.id && p.status === "active");
  assert.ok(
    countByPosition(controlRoster, "OL") < FIELDABLE_DEPTH.OL.min ||
      countByPosition(controlRoster, "DL") < FIELDABLE_DEPTH.DL.min,
    `the pre-fix loop was expected to leave the club unfieldable, but held ${countByPosition(controlRoster, "OL")} OL and ${countByPosition(controlRoster, "DL")} DL`
  );

  enforceRosterAndCapCompliance(league, { excludeTeamIds: ["BUF"] });
  normalizeRosterSlots(league);

  const after = league.players.filter((p) => p.teamId === target.id && p.status === "active");
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    const held = after.filter((p) => p.position === position).length;
    assert.ok(held >= band.min, `${target.id} was cut below a fieldable ${position}: ${held} < ${band.min}`);
  }
  const active = after.filter((p) => (p.rosterSlot || "active") === "active");
  assert.ok(active.length <= ROSTER_STRUCTURE.activeLimit);
});
