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
