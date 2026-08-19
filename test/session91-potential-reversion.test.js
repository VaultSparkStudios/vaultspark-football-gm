import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { RNG } from "../src/utils/rng.js";
import { developmentDelta, PLAYER_DEVELOPMENT_PROFILE } from "../src/domain/ratings.js";
import {
  POTENTIAL_REVERSION_PROFILE,
  ZERO_CENTRED_REVERSION_TOLERANCE,
  measurePotentialGapCentre,
  potentialReversionFor,
  progressedPopulation
} from "../src/domain/potentialReversion.js";
import {
  LEAGUE_DISTRIBUTION_TARGET,
  buildDistributionReceipt,
  splitActivePopulation,
  summarizeLeagueProgression
} from "../src/stats/progressionParity.js";
import { capSpaceForTeam, currentYearCapSaving } from "../src/engine/capCompliance.js";

/* ------------------------------------------------------------------ *
 * 1. The conservation law. This is the whole guarantee of the fix.
 * ------------------------------------------------------------------ */

test("potential reversion is zero-sum across exactly the population it is applied to", () => {
  const session = createSession({ seed: 20260306, startYear: 2026 });
  const centres = measurePotentialGapCentre(session.league);
  const population = progressedPopulation(session.league);

  assert.equal(centres.source, "measured");
  assert.equal(centres.sampleSize, population.length);
  assert.ok(population.length >= POTENTIAL_REVERSION_PROFILE.minimumCentreSample);

  const mean =
    population.reduce((sum, player) => sum + potentialReversionFor(player, centres), 0) / population.length;

  assert.ok(
    Math.abs(mean) <= ZERO_CENTRED_REVERSION_TOLERANCE,
    `league mean reversion ${mean.toFixed(4)} must be within +/-${ZERO_CENTRED_REVERSION_TOLERANCE} of zero`
  );
});

test("NEGATIVE CONTROL — the uncentred form this replaces is a league-wide subsidy the tolerance rejects", () => {
  // The obvious implementation, `rate * (potential - overall)`, is what this
  // module exists NOT to be. A generated league sits ~2.9 points below its own
  // mean potential, so the naive form pays every player a standing raise. If
  // this assertion ever fails, the tolerance above has stopped being able to
  // tell a differentiator from a subsidy and is worthless.
  const session = createSession({ seed: 20260306, startYear: 2026 });
  const population = progressedPopulation(session.league);
  const naiveMean =
    population.reduce(
      (sum, player) => sum + POTENTIAL_REVERSION_PROFILE.rate * (player.potential - player.overall),
      0
    ) / population.length;

  assert.ok(
    naiveMean > ZERO_CENTRED_REVERSION_TOLERANCE,
    `the uncentred form must be detectably positive; measured ${naiveMean.toFixed(4)}`
  );
});

test("reversion pulls over-achievers down and under-achievers up, symmetrically", () => {
  const centres = { gapCentre: 0 };
  const over = potentialReversionFor({ overall: 92, potential: 80 }, centres);
  const under = potentialReversionFor({ overall: 68, potential: 80 }, centres);
  assert.ok(over < 0, "a player above his potential must be pulled down");
  assert.ok(under > 0, "a player below his potential must be pulled up");
  assert.equal(Math.abs(over), Math.abs(under), "the pull must be symmetric");

  // Symmetric clamp — an asymmetric one is a subsidy wearing a clamp's clothes.
  const extremeOver = potentialReversionFor({ overall: 99, potential: 40 }, centres);
  const extremeUnder = potentialReversionFor({ overall: 40, potential: 99 }, centres);
  assert.equal(extremeOver, POTENTIAL_REVERSION_PROFILE.minReversion);
  assert.equal(extremeUnder, POTENTIAL_REVERSION_PROFILE.maxReversion);
});

test("a corrupt reversion is rejected, never laundered into a silent zero", () => {
  const rng = new RNG(7);
  const player = { age: 24, potential: 82, ratings: {} };
  assert.throws(
    () => developmentDelta(player, rng, { potentialReversion: Number.NaN }),
    /potentialReversion must be finite/
  );
  assert.throws(
    () => potentialReversionFor({ overall: Number.NaN, potential: 80 }, { gapCentre: 0 }),
    /must be finite/
  );
});

test("reversion rides the single unbiased rounding and costs no RNG draws", () => {
  // The RNG stream position must be identical with and without the term, or
  // every seeded receipt in the project silently reseats.
  const withReversion = new RNG(4242);
  const withoutReversion = new RNG(4242);
  const player = { age: 27, potential: 84, ratings: {} };
  for (let i = 0; i < 25; i += 1) {
    developmentDelta(player, withReversion, { potentialReversion: 1.4 });
    developmentDelta(player, withoutReversion, {});
  }
  assert.equal(withReversion.float(0, 1), withoutReversion.float(0, 1));
});

test("the declared development profile records that it now reverts", () => {
  assert.equal(PLAYER_DEVELOPMENT_PROFILE.version, "2026-s91-reverting");
});

/* ------------------------------------------------------------------ *
 * 2. The gate stops measuring a blended population.
 * ------------------------------------------------------------------ */

test("progression parity is measured on rostered players, and reports the pool separately", () => {
  const session = createSession({ seed: 20260306, startYear: 2026 });
  const league = session.league;
  const teamIds = new Set(league.teams.map((team) => team.id));

  // Plant an unrostered pool that is materially worse than the league. If the
  // gated mean is a blend, this drags it; if it is rostered-only, it cannot.
  const donors = league.players.filter((player) => teamIds.has(player.teamId)).slice(0, 300);
  const before = summarizeLeagueProgression(league).meanOverall;
  for (const player of donors) {
    player.teamId = "FA";
    player.overall = 55;
  }
  const after = summarizeLeagueProgression(league);

  assert.equal(after.population.basis, "rostered");
  assert.equal(after.population.unrostered.count, 300);
  assert.equal(after.population.unrostered.meanOverall, 55);
  assert.ok(
    after.population.blended.meanOverall < after.meanOverall,
    "the blended reading must be visibly dragged by the pool"
  );
  assert.ok(
    Math.abs(after.meanOverall - before) <= 0.5,
    `the gated mean must not follow the pool: ${before} -> ${after.meanOverall}`
  );
});

test("splitActivePopulation partitions active players with no double counting", () => {
  const session = createSession({ seed: 20260306, startYear: 2026 });
  const { active, rostered, unrostered } = splitActivePopulation(session.league);
  assert.equal(rostered.length + unrostered.length, active.length);
  assert.ok(rostered.length > 0);
});

/* ------------------------------------------------------------------ *
 * 3. The distributional gate, with a negative control built from the
 *    real pre-fix measurement rather than an invented one.
 * ------------------------------------------------------------------ */

test("NEGATIVE CONTROL — the distributional gate rejects the measured pre-fix league", () => {
  // These are the S91 probe's actual readings for seed 20260306 across 12
  // seasons on live pre-fix code. A gate that calls this league calibrated is
  // not a gate. Proving it goes red on a known real defect is the only reason
  // to believe it when it goes green.
  const preFix = buildDistributionReceipt({
    start: { stdDevOverall: 4.498, elite90PlusPct: 0.3, population: { rostered: { count: 1568 } } },
    end: { stdDevOverall: 5.987, elite90PlusPct: 4.0, population: { rostered: { count: 2182 } } },
    observedSeasons: 12
  });
  assert.equal(preFix.status, "out-of-range", JSON.stringify(preFix));
  assert.equal(preFix.eliteStatus, "out-of-range");

  // And the sharper half of the point: by season 12 dispersion drift alone has
  // fallen back to "watch" while the elite tail is still out of range. A
  // single-statistic gate would have shipped this.
  assert.notEqual(preFix.dispersionStatus, "out-of-range");
});

test("the distributional gate accepts a league that holds its shape", () => {
  const steady = buildDistributionReceipt({
    start: { stdDevOverall: 4.5, elite90PlusPct: 0.4, population: { rostered: { count: 1600 } } },
    end: { stdDevOverall: 4.7, elite90PlusPct: 1.1, population: { rostered: { count: 2180 } } },
    observedSeasons: 12
  });
  assert.equal(steady.status, "on-target", JSON.stringify(steady));
});

/* ------------------------------------------------------------------ *
 * 4. Camp cuts must actually cut.
 * ------------------------------------------------------------------ */

test("camp cuts hold the cap against the league that comes to rest, not an intermediate one", () => {
  // The offseason's compliance pass ran in the `free-agency` stage, and `draft`
  // and `udfa` then add a full rookie class of contracts after it. So a club
  // could finish the offseason over the cap having never been examined in that
  // state. Measured at seed 20260817, IND ended the 2028 offseason $3.3M over
  // with 68 players — fifteen clear of the 53-man floor — and one release fixed
  // it. It was never trapped; enforcement had simply already happened.
  //
  // Driven directly rather than through eight simulated seasons so the property
  // is pinned by a fast test as well as by the long-shard regression.
  const session = createSession({ seed: 20260817, startYear: 2026, controlledTeamId: "BUF" });
  const league = session.league;
  const target = league.teams.find((team) => team.id !== session.controlledTeamId);

  // A freshly generated league carries 49 players a club, which is BELOW the
  // 53-man floor the trim loop refuses to cut past — so the fixture must first
  // put the club clear of that floor, or it would be testing the trapped path
  // rather than the enforcement path. Bodies are borrowed from a third club.
  const donorId = league.teams.find((team) => team.id !== target.id && team.id !== session.controlledTeamId).id;
  const donors = league.players.filter((player) => player.teamId === donorId && player.status === "active").slice(0, 12);
  for (const player of donors) player.teamId = target.id;

  const roster = league.players.filter((player) => player.teamId === target.id && player.status === "active");
  assert.ok(roster.length > 53, `fixture needs a club above the active-roster floor, got ${roster.length}`);
  for (const player of roster.slice(0, 3)) {
    player.contract = { ...(player.contract || {}), capHit: 40_000_000, signingBonus: 0, capYears: 1, yearsRemaining: 2, deadCapRemaining: 0 };
  }
  assert.ok(capSpaceForTeam(league, target.id) < 0, "fixture must actually breach the cap");

  const result = session.enforceLeagueLegality();

  assert.ok(result.released > 0, "camp cuts must release someone when a club is over the cap");
  assert.ok(
    capSpaceForTeam(league, target.id) >= 0,
    `camp cuts must restore legality: ${capSpaceForTeam(league, target.id)}`
  );
  assert.deepEqual(result.stillOverCap, [], JSON.stringify(result));
});

test("camp cuts never touch the controlled franchise", () => {
  // The GM's own over-cap roster is their decision, and every automated roster
  // move in this engine respects that boundary. A legality pass that quietly
  // cut the player's roster would be the worst possible place to break it.
  const session = createSession({ seed: 20260817, startYear: 2026, controlledTeamId: "BUF" });
  const league = session.league;
  const mine = league.players.filter((player) => player.teamId === "BUF" && player.status === "active");
  for (const player of mine.slice(0, 12)) {
    player.contract = { ...(player.contract || {}), capHit: 40_000_000, signingBonus: 0, capYears: 1, yearsRemaining: 2, deadCapRemaining: 0 };
  }
  const before = mine.length;

  session.enforceLeagueLegality();

  const after = league.players.filter((player) => player.teamId === "BUF" && player.status === "active").length;
  assert.equal(after, before, "the controlled franchise must keep its roster and its own decision");
  assert.ok(capSpaceForTeam(league, "BUF") < 0, "and must remain visibly over the cap rather than silently trimmed");
});

test("a release is only chosen when it actually frees current-year cap space", () => {
  // The trim loop may only cut down to the 53-man floor, so it has a bounded
  // number of releases. A contract whose cap hit is entirely this year's
  // prorated bonus frees nothing when released, and spending a release on one
  // can leave a club over the cap while a release that would have cleared it
  // was still available.
  assert.equal(currentYearCapSaving({ contract: { capHit: 8_000_000, signingBonus: 8_000_000, capYears: 1 } }), 0);
  assert.equal(currentYearCapSaving({ contract: { capHit: 8_000_000, signingBonus: 4_000_000, capYears: 1 } }), 4_000_000);
  assert.equal(currentYearCapSaving({ contract: { capHit: 8_000_000, signingBonus: 0 } }), 8_000_000);
  assert.equal(currentYearCapSaving({ contract: {} }), 0);
});

test("the distributional gate refuses to certify a sample too small to judge", () => {
  const thin = buildDistributionReceipt({
    start: { stdDevOverall: 4.5, elite90PlusPct: 0, population: { rostered: { count: 12 } } },
    end: { stdDevOverall: 9.9, elite90PlusPct: 40, population: { rostered: { count: 14 } } },
    observedSeasons: 5
  });
  assert.equal(thin.status, "incomplete");
  assert.equal(thin.adequateSample, false);
  assert.equal(thin.annualStdDevDrift, null);
  assert.ok(LEAGUE_DISTRIBUTION_TARGET.minimumSample >= 200);
});
