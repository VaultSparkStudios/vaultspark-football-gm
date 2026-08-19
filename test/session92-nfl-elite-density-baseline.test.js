import test from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../src/runtime/bootstrap.js";
import {
  NFL_ACTIVE_ROSTER_LIMIT,
  NFL_CLUB_COUNT,
  NFL_ACTIVE_ROSTER_POPULATION,
  NFL_FIRST_TEAM_ALL_PRO_SLOTS,
  NFL_PRO_BOWL_SLOTS,
  NFL_ELITE_DENSITY_BASELINE
} from "../src/data/nflEliteDensityBaseline.js";
import {
  LEAGUE_DISTRIBUTION_TARGET,
  buildDistributionReceipt,
  splitActivePopulation,
  summarizeLeagueProgression
} from "../src/stats/progressionParity.js";

/* ------------------------------------------------------------------ *
 * 1. The baseline itself is a derivation, not a re-typed literal.
 * ------------------------------------------------------------------ */

test("the NFL elite-density baseline is derived from its declared inputs, not a re-typed constant", () => {
  assert.equal(NFL_ACTIVE_ROSTER_LIMIT, 53);
  assert.equal(NFL_CLUB_COUNT, 32);
  assert.equal(NFL_ACTIVE_ROSTER_POPULATION, 53 * 32);

  assert.equal(
    NFL_ELITE_DENSITY_BASELINE.firstTeamAllProPct,
    Math.round((NFL_FIRST_TEAM_ALL_PRO_SLOTS / NFL_ACTIVE_ROSTER_POPULATION) * 100 * 100) / 100
  );
  assert.equal(
    NFL_ELITE_DENSITY_BASELINE.proBowlPct,
    Math.round((NFL_PRO_BOWL_SLOTS / NFL_ACTIVE_ROSTER_POPULATION) * 100 * 100) / 100
  );
  // The floor (tightest honor) must sit strictly below the watch line
  // (broader honor), or the band this baseline provides is not a band.
  assert.ok(NFL_ELITE_DENSITY_BASELINE.firstTeamAllProPct < NFL_ELITE_DENSITY_BASELINE.proBowlPct);
  assert.equal(NFL_ELITE_DENSITY_BASELINE.provenance, "sourced-nfl-honors-analogy");
});

test("the distributional gate reads its ceiling and watch line from the sourced baseline, not a private literal", () => {
  assert.equal(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctCeiling, NFL_ELITE_DENSITY_BASELINE.firstTeamAllProPct);
  assert.equal(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctWatchCeiling, NFL_ELITE_DENSITY_BASELINE.proBowlPct);
  assert.equal(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctProvenance, "sourced-nfl-honors-analogy");
  assert.notEqual(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctProvenance, "judgement-not-measured");
});

/* ------------------------------------------------------------------ *
 * 2. The population fix: practice squad is not the honor's population.
 * ------------------------------------------------------------------ */

test("activeRosterOnly and practiceSquad partition rostered with no double counting", () => {
  // A freshly generated league carries 49 players a club (below the 53-man
  // active floor), all defaulted to `rosterSlot: "active"` — the practice
  // squad only populates later, once camp cuts / roster moves run. So this
  // is a hand-built fixture, not `createSession`, to pin the partition
  // property against a league that actually has both populations present
  // (as the live decade probe below does at season-end: 1681 active / 496
  // practice, seed 20260306).
  const league = {
    teams: [{ id: "BUF" }, { id: "MIA" }],
    players: [
      ...Array.from({ length: 53 }, (_, i) => ({
        id: `BUF-active-${i}`,
        teamId: "BUF",
        overall: 75,
        age: 26,
        status: "active",
        rosterSlot: "active"
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `BUF-practice-${i}`,
        teamId: "BUF",
        overall: 65,
        age: 23,
        status: "active",
        rosterSlot: "practice"
      }))
    ]
  };
  const { rostered, activeRosterOnly, practiceSquad } = splitActivePopulation(league);
  assert.equal(activeRosterOnly.length + practiceSquad.length, rostered.length);
  assert.equal(activeRosterOnly.length, 53);
  assert.equal(practiceSquad.length, 10);
});

test("a player with no rosterSlot set defaults to the active roster, matching the rest of the engine's convention", () => {
  const league = {
    teams: [{ id: "BUF" }],
    players: [
      { id: "p1", teamId: "BUF", overall: 80, age: 26, status: "active" }, // rosterSlot undefined
      { id: "p2", teamId: "BUF", overall: 70, age: 26, status: "active", rosterSlot: "practice" }
    ]
  };
  const { activeRosterOnly, practiceSquad } = splitActivePopulation(league);
  assert.equal(activeRosterOnly.length, 1);
  assert.equal(activeRosterOnly[0].id, "p1");
  assert.equal(practiceSquad.length, 1);
  assert.equal(practiceSquad[0].id, "p2");
});

test("NEGATIVE CONTROL — a pool of elite players parked on the practice squad must inflate activeRosterOnly density by zero", () => {
  const teamIds = [..."ABCDEFGH"].map((letter) => `T${letter}`);
  const league = {
    teams: teamIds.map((id) => ({ id })),
    players: [
      // A normal-shaped active roster, no elites.
      ...teamIds.flatMap((teamId) =>
        Array.from({ length: 53 }, (_, i) => ({
          id: `${teamId}-active-${i}`,
          teamId,
          overall: 75,
          age: 26,
          status: "active",
          rosterSlot: "active"
        }))
      ),
      // A practice squad stacked with 90+ talent — a fixture that would be
      // absurd for a real club, and exactly the shape this test exists to
      // reject: the gate must not credit these toward activeRosterOnly.
      ...teamIds.flatMap((teamId) =>
        Array.from({ length: 5 }, (_, i) => ({
          id: `${teamId}-practice-elite-${i}`,
          teamId,
          overall: 95,
          age: 24,
          status: "active",
          rosterSlot: "practice"
        }))
      )
    ]
  };
  const summary = summarizeLeagueProgression(league);
  assert.equal(summary.population.activeRosterOnly.elite90PlusPct, 0);
  assert.ok(summary.population.practiceSquad.elite90PlusPct > 0);
  assert.ok(
    summary.population.rostered.elite90PlusPct > 0,
    "the blended rostered reading DOES see them — that is exactly the mismatch activeRosterOnly exists to avoid"
  );
});

/* ------------------------------------------------------------------ *
 * 3. buildDistributionReceipt prefers activeRosterOnly, with a fallback
 *    chain that keeps older fixtures (session91's own tests) working.
 * ------------------------------------------------------------------ */

test("buildDistributionReceipt prefers population.activeRosterOnly over population.rostered when both are present", () => {
  const receipt = buildDistributionReceipt({
    start: { stdDevOverall: 4.5, population: { rostered: { count: 1600, elite90PlusPct: 0.4 }, activeRosterOnly: { count: 1600, elite90PlusPct: 0.4 } } },
    end: {
      stdDevOverall: 4.7,
      population: {
        rostered: { count: 2180, elite90PlusPct: 2.6 },
        activeRosterOnly: { count: 1681, elite90PlusPct: 3.4 }
      }
    },
    observedSeasons: 10
  });
  assert.equal(receipt.endElite90PlusPct, 3.4, JSON.stringify(receipt));
});

test("buildDistributionReceipt falls back to population.rostered when activeRosterOnly is absent (session91-era fixtures)", () => {
  // The fallback's job is reading the right NUMBER from an older-shaped
  // fixture, not reproducing a classification verdict tied to a ceiling that
  // has since been re-sourced against a different population (activeRosterOnly).
  // A 4.0% rostered-basis reading is expected to classify differently now
  // than it did under S91's rostered-calibrated ceiling — that is the correct
  // consequence of the populations no longer matching, not a fallback bug.
  const receipt = buildDistributionReceipt({
    start: { stdDevOverall: 4.5, elite90PlusPct: 0.3, population: { rostered: { count: 1568 } } },
    end: { stdDevOverall: 5.987, elite90PlusPct: 4.0, population: { rostered: { count: 2182 } } },
    observedSeasons: 12
  });
  assert.equal(receipt.endElite90PlusPct, 4.0, JSON.stringify(receipt));
  assert.equal(receipt.adequateSample, true);
});

/* ------------------------------------------------------------------ *
 * 4. The measured resolution: same elite players, corrected denominator.
 * ------------------------------------------------------------------ */

test("a simulated decade: the sourced baseline resolves the S91-disclosed watch without tuning the engine", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const report = session.runRealismVerification({ seasons: 10 });
  const { activeRosterOnly, rostered, practiceSquad } = report.progression.end.population;

  // The practice squad's elite count must be materially smaller than the
  // active roster's — it is real depth talent, not a parking lot for stars.
  assert.ok(practiceSquad.elite90Plus <= activeRosterOnly.elite90Plus * 0.2, JSON.stringify(practiceSquad));
  // Correcting the denominator (not the elite count) is what moves the ratio.
  assert.ok(activeRosterOnly.elite90PlusPct > rostered.elite90PlusPct);
  assert.notEqual(report.progression.distribution.eliteStatus, "out-of-range", JSON.stringify(report.progression.distribution));
});
