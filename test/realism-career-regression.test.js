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
  assert.equal(report.numericIntegrity.status, "pass", JSON.stringify(report.numericIntegrity));
  assert.equal(report.numericIntegrity.source.truncated, false);
  assert.equal(report.numericIntegrity.simulated.truncated, false);
});
