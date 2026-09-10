import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { createZeroedSeasonStats } from "../src/domain/playerFactory.js";
import { runOffseason } from "../src/engine/offseasonSimulator.js";

test("offseason only accrues seasons for players who actually played", () => {
  const session = createSession({ seed: 4040, startYear: 2026, controlledTeamId: "BUF" });
  const year = session.currentYear;

  const unsigned = session.league.players.find((player) => player.teamId === "BUF" && player.position === "K");
  assert.ok(unsigned);
  unsigned.teamId = "FA";
  unsigned.age = 25;
  unsigned.seasonsPlayed = 5;
  unsigned.experience = 5;
  unsigned.contract = {
    salary: 0,
    yearsRemaining: 0,
    capHit: 0,
    baseSalary: 0,
    signingBonus: 0,
    guaranteed: 0,
    deadCapRemaining: 0,
    restructureCount: 0
  };
  unsigned.seasonStats[year] = createZeroedSeasonStats();

  const starter = session.league.players.find((player) => player.teamId === "BUF" && player.position === "RB");
  assert.ok(starter);
  starter.age = 24;
  starter.seasonsPlayed = 3;
  starter.experience = 3;
  starter.seasonStats[year] = createZeroedSeasonStats();
  starter.seasonStats[year].games = 15;
  starter.seasonStats[year].gamesStarted = 10;

  runOffseason({ league: session.league, year, rng: session.rng, skipDraft: true });

  const unsignedAfter =
    session.league.players.find((player) => player.id === unsigned.id) ||
    session.league.retiredPlayers.find((player) => player.id === unsigned.id);
  const starterAfter =
    session.league.players.find((player) => player.id === starter.id) ||
    session.league.retiredPlayers.find((player) => player.id === starter.id);

  assert.ok(unsignedAfter);
  assert.ok(starterAfter);
  assert.equal(unsignedAfter.seasonsPlayed, 5);
  assert.equal(unsignedAfter.experience, 5);
  assert.equal(starterAfter.seasonsPlayed, 4);
  assert.equal(starterAfter.experience, 4);
});

test("career realism verification keeps targeted positions within guardrails", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const report = session.runRealismVerification({ seasons: 1 });

  assert.ok(report.simulatedYears.length >= 1);
  assert.equal(typeof report.statusSummary.season.outOfRange, "number");
  assert.equal(typeof report.statusSummary.career.outOfRange, "number");

  for (const position of ["WR", "TE", "OL", "LB", "K"]) {
    assert.ok(report.careerByPosition[position]?.metrics, `${position} career metrics missing`);
  }

  const rbMetrics = report.careerByPosition.RB.metrics;
  assert.ok(rbMetrics.seasonsPlayed);
  assert.ok(rbMetrics["careerStats.games"]);
  assert.ok(report.careerByPosition.K.metrics["careerStats.kicking.fga"]);
});

test("a deterministic decade satisfies progression parity and finite-number integrity", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const report = session.runRealismVerification({ seasons: 10 });

  assert.equal(report.progression.observedSeasons, 10);

  // S91 opened this assertion at `status === "watch"` rather than
  // `on-target`, disclosed against a ceiling declared `judgement-not-measured`
  // because this project had no NFL elite-density authority anywhere in
  // `src/data`. S92 built one (`src/data/nflEliteDensityBaseline.js`, sourced
  // from AP First-Team All-Pro and Pro Bowl honor-slot counts against the real
  // NFL's active-roster population) and re-measured — which also surfaced a
  // second, independent defect: the S91 gate read elite density from
  // `population.rostered`, which blends the active roster with the practice
  // squad. Practice-squad players are structurally ineligible for either real
  // honor this baseline anchors to, and measured here they hold zero 90+
  // players (0/496, both seeds) — so blending them in only ever dilutes the
  // ratio. Correcting the population to `activeRosterOnly` (the real anchor's
  // population) moves the SAME 57-58 elite players from a 2.6-2.7% reading to
  // 3.4%, which is `watch` rather than `out-of-range` against the sourced
  // 1.53%/5.19% band. Neither the ceiling nor the reversion rate was tuned to
  // reach that verdict — the population match and the external anchor did.
  assert.equal(report.progression.globalStatus, "on-target", JSON.stringify(report.progression));
  assert.ok(Math.abs(report.progression.annualMeanOverallDrift) <= report.progression.target.onTargetMaxAbs);
  assert.equal(report.progression.distribution.adequateSample, true);
  assert.notEqual(report.progression.distribution.eliteStatus, "out-of-range", JSON.stringify(report.progression.distribution));
  assert.equal(
    report.progression.end.population.practiceSquad.elite90Plus,
    0,
    "the practice squad negative control: if this ever moves off zero, the activeRosterOnly-vs-rostered gap this test documents has changed and the comment above needs re-measuring"
  );
  // S102 — the dispersion arm, asserted for the first time.
  //
  // S101 recorded that this regression asserted only the arms that passed:
  // `globalStatus` and `eliteStatus` were checked and `dispersionStatus` was
  // not, while the engine's own receipt read `out-of-range` on every probed
  // seed. The reason it could not be asserted turned out not to be the
  // generator — it was that this arm was reading a different population from
  // the elite arm beside it. `LEAGUE_DISTRIBUTION_TARGET` has declared
  // "active-roster overall dispersion and elite density" since S92, S92 moved
  // the elite arm onto `activeRosterOnly`, and the dispersion arm kept reading
  // the blended active-roster-plus-practice-squad `stdDevOverall`. Measured
  // through this same call on seed 2026:
  //
  //     blended `rostered`   sd 4.318 -> 6.048   (drift 0.173/season, out-of-range)
  //     `activeRosterOnly`   sd 4.318 -> 4.690   (drift 0.037/season, on-target)
  //
  // The arm was reporting a defect in a statistic no target declared. Nothing
  // about the ceiling or the reversion rate was touched to reach this verdict;
  // the population match did it, and the blended reading it used to report is
  // still published beside it as `distribution.blendedRostered` so the contrast
  // stays visible rather than being quietly dropped.
  assert.notEqual(
    report.progression.distribution.dispersionStatus,
    "out-of-range",
    JSON.stringify(report.progression.distribution)
  );
  assert.equal(
    report.progression.distribution.endStdDevOverall,
    Number(Number(report.progression.end.population.activeRosterOnly.stdDevOverall).toFixed(3)),
    "the dispersion arm must read the same population the elite arm does"
  );
  assert.equal(
    report.progression.distribution.blendedRostered.gated,
    false,
    "the pre-S102 blended reading must stay published, and must stay ungated"
  );

  // S102 — the parity target's own denominator is load-bearing, and the same
  // drift on the active roster is several times larger. Not gated (this target
  // declares `rostered`), but it must be published.
  assert.equal(report.progression.activeRosterMeanOverallDrift.gated, false);
  assert.equal(
    typeof report.progression.activeRosterMeanOverallDrift.annualMeanOverallDrift,
    "number",
    "the active-roster contrast must be measured, not omitted"
  );

  // S104 — the denominator stopped moving, so this block now asserts the
  // opposite of what it asserted in S103, and that inversion is the finding.
  //
  // S103 built `compositionShift` to stop this gate reporting `on-target` while
  // its verdict was actually being produced by its own denominator: the
  // practice squad arrived from 0% of the rostered population to 22.7% of it
  // across the measured window, contributing a between-group −0.197/season that
  // cancelled a within-group +0.269 `watch` into a blended +0.072 `on-target`.
  // S103 could not fix it — re-pointing at `activeRosterOnly` read 0.303/season,
  // `out-of-range` — so it shipped the finding as a gated fact instead.
  //
  // The cause was never the choice of population. A generated league was built
  // at 49 players a club with an EMPTY practice squad and filled to 69 over the
  // following decade, so `rostered` gained 39% of itself mid-window and
  // `activeRosterOnly` acquired a selection filter it did not start with. S104
  // generates the league at the structure the rules declare — 53 active plus a
  // full 16-man practice squad — and both populations now exist at both ends.
  // Measured on this same call:
  //
  //     practice-squad weight   23.2% -> 22.7%   (was 0% -> 22.7%)
  //     between-group drift     +0.003/season    (was -0.197)
  //     within-group drift      +0.040 on-target (was +0.269 watch)
  //     blended drift           +0.044 on-target
  //     activeRosterOnly        +0.107 on-target (was +0.303 out-of-range)
  //
  // So the gate's two terms now agree about the verdict, and the guard reports
  // `development-dominated` rather than `verdict-changed-by-composition`.
  //
  // **The detector is still proved to fire**, and it has to be — a guard that
  // only ever reports the healthy state proves nothing. Its negative controls
  // are fixture-driven and live in `test/session102-gated-population.test.js`
  // ("negative control: the blended denominator reports a drift the gated one
  // does not", and "a fixture with no practice squad measures exactly what it
  // always did"), which construct the pre-S104 shape explicitly rather than
  // relying on the canonical league to stay broken.
  //
  // The re-point S103 deferred is deliberately still not taken. `rostered` is
  // now a valid drift statistic — it exists at both ends of its window — and
  // reads well inside `onTargetMaxAbs`, so there is no measured reason left to
  // move a declared population. Moving it would trade a comfortable margin for
  // a tighter one to no end.
  const shift = report.progression.compositionShift;
  assert.equal(shift.gated, false);
  assert.ok(
    Math.abs(shift.withinGroupAnnualDrift + shift.betweenGroupAnnualDrift - shift.blendedAnnualDrift) <= 0.002,
    `shift-share must reconstruct the whole: ${JSON.stringify(shift)}`
  );
  // A tolerance, not equality: both sides are built from means already rounded
  // to two places by `summarizePlayers`, so demanding an exact match would be
  // asserting the rounding rather than the decomposition.
  assert.ok(
    Math.abs(shift.blendedAnnualDrift - report.progression.annualMeanOverallDrift) <= 0.005,
    `the decomposition must decompose the gated reading: ${shift.blendedAnnualDrift} vs ${report.progression.annualMeanOverallDrift}`
  );
  assert.equal(
    shift.status,
    "development-dominated",
    `this gate's verdict must be produced by development, not by its denominator: ${JSON.stringify(shift)}`
  );
  assert.equal(shift.blendedWouldClassifyAs, "on-target");
  assert.equal(
    shift.withinGroupWouldClassifyAs,
    "on-target",
    "the league the GM competes in must agree with the gate that measures it"
  );
  assert.ok(
    Math.abs(shift.betweenGroupAnnualDrift) <= 0.02,
    `the denominator must be holding still: ${JSON.stringify(shift)}`
  );

  const practice = shift.groups.find((group) => group.group === "practiceSquad");
  assert.ok(practice, JSON.stringify(shift.groups));
  // The property that makes this gate's statistic meaningful at all: the
  // practice squad is a real, roughly constant share of the population at both
  // ends of the window, rather than something that arrives during it.
  assert.ok(
    practice.startWeightPct > 15,
    `the practice squad must exist at the START of the window: ${JSON.stringify(practice)}`
  );
  assert.ok(
    Math.abs(practice.endWeightPct - practice.startWeightPct) <= 5,
    `and must hold roughly that share at the end: ${JSON.stringify(practice)}`
  );

  // The S103 contrast, re-measured: pointing this target at the active roster
  // would now classify on-target too. Recorded so that if it ever drifts back
  // toward the 0.303 that forced S103's deferral, this test says so.
  assert.equal(
    report.progression.activeRosterMeanOverallDrift.wouldClassifyAs,
    "on-target",
    JSON.stringify(report.progression.activeRosterMeanOverallDrift)
  );

  assert.equal(report.numericIntegrity.status, "pass", JSON.stringify(report.numericIntegrity));
  assert.equal(report.numericIntegrity.source.truncated, false);
  assert.equal(report.numericIntegrity.simulated.truncated, false);
});
