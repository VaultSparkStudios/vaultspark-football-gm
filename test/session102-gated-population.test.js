import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDistributionReceipt,
  buildProgressionParityReceipt,
  splitActivePopulation,
  summarizeLeagueProgression,
  LEAGUE_DISTRIBUTION_TARGET
} from "../src/stats/progressionParity.js";

// ── S102 · the distribution gate's two arms read one population ───────────────
//
// `LEAGUE_DISTRIBUTION_TARGET` declares itself as "active-roster overall
// dispersion and elite density", and S92 moved the ELITE arm onto
// `activeRosterOnly` for a stated reason: All-Pro honors are drawn from the
// active roster, and the practice squad is structurally ineligible for them.
// The DISPERSION arm beside it kept reading `stdDevOverall` off the blended
// `rostered` population, so a receipt that describes itself as "two readings"
// of one league was two readings of two different leagues.
//
// It is not a rounding difference — it reverses the verdict. Measured through
// `runRealismVerification({ seasons: 10 })` on seed 2026, the same path
// `realism-career-regression` asserts on:
//
//     blended `rostered`   sd 4.318 -> 6.048   (drift 0.173/season, out-of-range)
//     `activeRosterOnly`   sd 4.318 -> 4.690   (drift 0.037/season, on-target)
//
// This is why the dispersion arm could never be asserted: it was reporting a
// defect in a statistic no target declared.
//
// The PARITY target is a separate thing and is left alone: it declares
// "rostered-player mean overall annual drift", and `rostered` is what it
// measures. That its own choice of denominator is load-bearing — the same drift
// reads +0.055/season rostered and +0.282/season active-roster-only — is
// published as an ungated diagnostic rather than acted on here. Re-pointing a
// declared target at a population that turns it red is a calibration decision,
// not a bug fix.

const TEAM_IDS = ["AAA", "BBB", "CCC", "DDD"];

/**
 * A league whose active roster and practice squad differ sharply, so the two
 * denominators cannot agree by accident.
 */
function fixtureLeague({ activeOverall, practiceOverall, activePerTeam = 60, practicePerTeam = 16 }) {
  const players = [];
  let id = 0;
  for (const teamId of TEAM_IDS) {
    for (let i = 0; i < activePerTeam; i += 1) {
      players.push({
        id: `a${id++}`,
        status: "active",
        teamId,
        rosterSlot: "active",
        position: "WR",
        age: 26,
        overall: activeOverall + (i % 5) - 2,
        potential: 90
      });
    }
    for (let i = 0; i < practicePerTeam; i += 1) {
      players.push({
        id: `p${id++}`,
        status: "active",
        teamId,
        rosterSlot: "practice",
        position: "WR",
        age: 23,
        overall: practiceOverall + (i % 5) - 2,
        potential: 80
      });
    }
  }
  return { teams: TEAM_IDS.map((teamId) => ({ id: teamId })), players };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test("the blended reading stays reported, so nothing is hidden by being ungated", () => {
  const league = fixtureLeague({ activeOverall: 80, practiceOverall: 60 });
  const summary = summarizeLeagueProgression(league);

  assert.ok(summary.population.rostered.count > summary.population.activeRosterOnly.count);
  assert.ok(
    summary.population.rostered.meanOverall < summary.population.activeRosterOnly.meanOverall,
    "the blended population must still be measured and visible"
  );

  const receipt = buildDistributionReceipt({ start: summary, end: summary, observedSeasons: 10 });
  assert.equal(receipt.blendedRostered.gated, false, "the contrast reading must be reported, never gated");
  assert.equal(receipt.blendedRostered.endMeanOverall, summary.population.rostered.meanOverall);
});

test("both arms of the distribution gate read the same population", () => {
  const start = summarizeLeagueProgression(fixtureLeague({ activeOverall: 76, practiceOverall: 58 }));
  const end = summarizeLeagueProgression(fixtureLeague({ activeOverall: 76, practiceOverall: 40 }));

  const receipt = buildDistributionReceipt({ start, end, observedSeasons: 10 });

  // The active roster did not move at all between these two leagues; only the
  // practice squad collapsed. A gate reading the blend would report a large
  // dispersion drift for a league whose gated population is unchanged.
  assert.equal(receipt.annualStdDevDrift, 0, "the practice squad must not be able to move the dispersion arm");
  assert.equal(receipt.dispersionStatus, "on-target");
  assert.notEqual(
    receipt.blendedRostered.startStdDevOverall,
    receipt.blendedRostered.endStdDevOverall,
    "the fixture must actually move the blended reading, or this proves nothing"
  );
});

// NEGATIVE CONTROL — the pre-S102 arithmetic, written out rather than restored,
// must report the defect this fix removes.
test("negative control: the blended denominator reports a drift the gated one does not", () => {
  const start = summarizeLeagueProgression(fixtureLeague({ activeOverall: 76, practiceOverall: 58 }));
  const end = summarizeLeagueProgression(fixtureLeague({ activeOverall: 76, practiceOverall: 40 }));

  const blendedDrift =
    (end.population.rostered.stdDevOverall - start.population.rostered.stdDevOverall) / 10;

  assert.ok(
    Math.abs(blendedDrift) > LEAGUE_DISTRIBUTION_TARGET.stdDevDriftOnTargetMaxAbs,
    `the pre-fix denominator must break the on-target line (measured ${blendedDrift})`
  );
});

test("the distribution target measures the population it declares", () => {
  assert.match(
    LEAGUE_DISTRIBUTION_TARGET.metric,
    /active-roster/,
    "the target declares its population; the implementation must match the declaration"
  );
  const summary = summarizeLeagueProgression(fixtureLeague({ activeOverall: 78, practiceOverall: 60 }));
  const receipt = buildDistributionReceipt({ start: summary, end: summary, observedSeasons: 10 });

  assert.equal(
    receipt.endStdDevOverall,
    Number(summary.population.activeRosterOnly.stdDevOverall.toFixed(3)),
    "the dispersion arm must read the active roster"
  );
  assert.equal(
    receipt.endElite90PlusPct,
    summary.population.activeRosterOnly.elite90PlusPct,
    "the elite arm must read the same population as the dispersion arm"
  );
  assert.notEqual(
    receipt.endStdDevOverall,
    Number(summary.population.rostered.stdDevOverall.toFixed(3)),
    "the fixture must make the two populations disagree, or this proves nothing"
  );
});

test("the parity target still measures the rostered population it declares", () => {
  const summary = summarizeLeagueProgression(fixtureLeague({ activeOverall: 78, practiceOverall: 60 }));
  assert.equal(summary.population.basis, "rostered");
  assert.equal(summary.meanOverall, summary.population.rostered.meanOverall);
});

test("the active-roster mean drift is published, and published as ungated", () => {
  // The finding must not be silently dropped just because it is not gated.
  const start = summarizeLeagueProgression(fixtureLeague({ activeOverall: 76, practiceOverall: 60 }));
  const end = summarizeLeagueProgression(fixtureLeague({ activeOverall: 79, practiceOverall: 60 }));

  const parity = buildProgressionParityReceipt({ start, end, seasons: 10, seed: 7 });
  const reported = parity.activeRosterMeanOverallDrift;

  assert.equal(reported.gated, false, "this reading must never become a gate by accident");
  assert.ok(Math.abs(reported.annualMeanOverallDrift - 0.3) < 0.02, "the active roster moved 3 points over 10 seasons");
  assert.equal(typeof reported.wouldClassifyAs, "string", "it must say what it would have been classified as");

  // And the gated arm is unchanged by the presence of the diagnostic.
  assert.ok(
    parity.annualMeanOverallDrift < reported.annualMeanOverallDrift,
    "the blended gated drift must be the smaller number — that divergence is the finding"
  );
});

test("a fixture with no practice squad measures exactly what it always did", () => {
  // Hand-built fixtures carry no `rosterSlot` and default to the active roster,
  // so this change must be inert for every caller that has no practice squad.
  const league = {
    teams: TEAM_IDS.map((teamId) => ({ id: teamId })),
    players: TEAM_IDS.flatMap((teamId, teamIndex) =>
      Array.from({ length: 60 }, (unused, i) => ({
        id: `n${teamIndex}-${i}`,
        status: "active",
        teamId,
        position: "WR",
        age: 26,
        overall: 75 + (i % 7)
      }))
    )
  };
  const split = splitActivePopulation(league);
  assert.equal(split.activeRosterOnly.length, split.rostered.length);

  const summary = summarizeLeagueProgression(league);
  assert.equal(summary.meanOverall, summary.population.rostered.meanOverall);

  const parity = buildProgressionParityReceipt({ start: summary, end: summary, seasons: 5, seed: 1 });
  assert.equal(parity.annualMeanOverallDrift, 0);
});
