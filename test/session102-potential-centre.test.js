import test from "node:test";
import assert from "node:assert/strict";
import { LEAGUE_AVERAGE_POTENTIAL, developmentDelta } from "../src/domain/ratings.js";
import { measurePotentialCentre, POTENTIAL_REVERSION_PROFILE } from "../src/domain/potentialReversion.js";
import { progressPlayer } from "../src/engine/offseasonSimulator.js";
import { RNG } from "../src/utils/rng.js";

// ── S102 · the differentiator is measured, not declared ───────────────────────
//
// `developmentDelta`'s trait term is `(potential - centre) / 20`, and that
// centre has been a literal every time it has been written. At 70, against a
// league sitting at 79.9, it handed every player a standing +0.50 an offseason;
// S91 caught that and replaced the literal 70 with the literal 80. But the
// league does not stay at 80 — survivorship selects for potential, so the
// active roster's mean potential climbs 79.92 -> 83.57 over ten simulated
// seasons on seed 2026, and by then the constant is stale by 3.65 points and
// the differentiator is a league-wide subsidy again.
//
// This is the same shape, in the same function, for the third time. The
// reversion term beside it was de-literalized in S91 for exactly this reason;
// the trait term was not.

const SAMPLE = POTENTIAL_REVERSION_PROFILE.minimumCentreSample;

/** A league whose mean potential is `centre`, symmetric about it. */
function leagueAtPotential(centre, count = SAMPLE + 40) {
  return {
    players: Array.from({ length: count }, (unused, i) => ({
      id: `p${i}`,
      status: "active",
      overall: centre - 3,
      potential: centre + (i % 11) - 5
    }))
  };
}

const meanOf = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test("the centre is measured from the league that is actually being progressed", () => {
  const measured = measurePotentialCentre(leagueAtPotential(84));
  assert.equal(measured.source, "measured");
  assert.ok(Math.abs(measured.potentialCentre - 84) < 0.5, `measured ${measured.potentialCentre}, expected ~84`);
});

test("a population too small to be a league falls back to the declared centre, and says so", () => {
  const measured = measurePotentialCentre(leagueAtPotential(84, 12));
  assert.equal(measured.source, "declared");
  assert.equal(measured.potentialCentre, LEAGUE_AVERAGE_POTENTIAL);
});

test("retired players do not vote on the centre", () => {
  const league = leagueAtPotential(80);
  for (let i = 0; i < 100; i += 1) league.players.push({ status: "retired", overall: 40, potential: 40 });
  const measured = measurePotentialCentre(league);
  assert.ok(Math.abs(measured.potentialCentre - 80) < 0.5, `retired players moved the centre to ${measured.potentialCentre}`);
});

/**
 * The trait term summed over the league, with variance removed. This is the
 * quantity that must be ~0: the term is a differentiator, so it may move
 * development between players and must never mint it for all of them.
 */
function meanTraitFactor(league, centre) {
  return meanOf(league.players.map((player) => (player.potential - centre) / 20));
}

test("against a measured centre the trait term redistributes and does not mint", () => {
  for (const leagueCentre of [79.9, 82, 83.57, 88]) {
    const league = leagueAtPotential(leagueCentre);
    const { potentialCentre } = measurePotentialCentre(league);
    assert.ok(
      Math.abs(meanTraitFactor(league, potentialCentre)) < 0.02,
      `league at ${leagueCentre} still mints ${meanTraitFactor(league, potentialCentre)} per player per offseason`
    );
  }
});

// NEGATIVE CONTROL — the declared literal, on the league the game actually
// reaches by season 10. If this does not report a subsidy, the test above is
// proving nothing.
test("negative control: the declared centre subsidises an inflated league", () => {
  const league = leagueAtPotential(83.57); // the measured season-10 active roster
  const subsidy = meanTraitFactor(league, LEAGUE_AVERAGE_POTENTIAL);
  assert.ok(
    subsidy > 0.15,
    `the stale literal must hand out a visible standing bonus, measured ~+0.18/offseason — got ${subsidy}`
  );
  // And it compounds: ten offseasons of it is well over a full rating point.
  assert.ok(subsidy * 10 > 1.5, "the subsidy must be large enough to matter over a franchise");
});

test("developmentDelta honours the centre it is given", () => {
  const player = { age: 27, potential: 84, ratings: {} };
  const noVariance = { float: () => 0, shuffle: (list) => list };

  const atDeclared = developmentDelta(player, noVariance, { potentialCentre: LEAGUE_AVERAGE_POTENTIAL });
  const atMeasured = developmentDelta(player, noVariance, { potentialCentre: 84 });
  assert.ok(
    atDeclared > atMeasured || atDeclared === atMeasured,
    "a player exactly at his league's centre must not out-earn himself measured against a lower one"
  );

  // The raw arithmetic, so the direction is unambiguous rather than inferred
  // through the rounding.
  const raw = (centre) => (84 - centre) / 20;
  assert.equal(raw(84), 0, "a player at the centre is not differentiated at all");
  assert.ok(raw(LEAGUE_AVERAGE_POTENTIAL) > 0, "measured against a stale centre he collects a bonus");
});

test("an absent centre is legitimate and means the declared neutral centre", () => {
  const player = { age: 27, potential: 90, ratings: {} };
  const noVariance = { float: () => 0, shuffle: (list) => list };
  assert.equal(
    developmentDelta(player, noVariance, {}),
    developmentDelta(player, noVariance, { potentialCentre: LEAGUE_AVERAGE_POTENTIAL }),
    "callers with no league to measure must behave exactly as before"
  );
});

test("a corrupt centre throws instead of being laundered into a default", () => {
  const player = { age: 27, potential: 90, ratings: { speed: 70 } };
  assert.throws(
    () => developmentDelta(player, new RNG(1), { potentialCentre: Number.NaN }),
    /potentialCentre must be finite/
  );
  assert.throws(
    () => progressPlayer({ ...player, overall: 70 }, new RNG(1), { potentialCentre: "not a number" }),
    /potential centre must be finite/
  );
});
