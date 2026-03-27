/**
 * S4 Engine Systems — Smoke Tests
 *
 * Covers: beatReporter, rivalryDNA, injurySystem, gmLegacyScore, draftCombine
 * Each test verifies: init, one meaningful cycle, and output shape.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── beatReporter ──────────────────────────────────────────────────────────────

import {
  initNewsLog,
  reportWeeklyResults,
  reportPlayerMilestones,
  reportStreaks,
  reportSignificantInjury,
  reportTrade,
  reportFreeAgentSigning
} from "../src/engine/beatReporter.js";

test("beatReporter: initNewsLog creates empty log", () => {
  const league = {};
  initNewsLog(league);
  assert.ok(Array.isArray(league.newsLog));
  assert.equal(league.newsLog.length, 0);
});

test("beatReporter: reportWeeklyResults adds blowout headline", () => {
  const league = { teams: [] };
  const weekResult = {
    week: 5,
    games: [{ homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 42, awayScore: 7 }]
  };
  reportWeeklyResults(league, weekResult, 2026);
  assert.ok(league.newsLog.length >= 1);
  const blowout = league.newsLog.find((n) => n.type === "blowout");
  assert.ok(blowout, "should generate blowout headline");
  assert.ok(blowout.headline.includes("BUF"));
});

test("beatReporter: reportWeeklyResults handles missing games gracefully", () => {
  const league = {};
  reportWeeklyResults(league, null, 2026);
  // should not throw
});

test("beatReporter: reportStreaks adds win-streak headline for 5+ wins", () => {
  const league = {
    teams: [
      { id: "BUF", season: { wins: 10, losses: 1, streak: 6 } },
      { id: "MIA", season: { wins: 3, losses: 8, streak: 2 } }
    ]
  };
  reportStreaks(league, 2026, 12);
  const streak = league.newsLog?.find((n) => n.type === "streak");
  assert.ok(streak, "should generate streak headline");
  assert.equal(streak.teamIds[0], "BUF");
});

test("beatReporter: reportPlayerMilestones captures QB 4000-yard season", () => {
  const player = {
    id: "p1",
    name: "Josh Allen",
    position: "QB",
    teamId: "BUF",
    seasonStats: {
      2026: { passing: { yards: 4050, yardsLast: 3900, td: 28 } }
    }
  };
  const league = {};
  reportPlayerMilestones(league, [player], 2026, 14);
  const milestone = league.newsLog?.find((n) => n.type === "milestone");
  assert.ok(milestone, "should fire 4000-yard milestone");
  assert.ok(milestone.headline.includes("4,000"));
});

test("beatReporter: reportSignificantInjury adds injury headline for multi-week", () => {
  const player = {
    id: "p2",
    name: "Stefon Diggs",
    position: "WR",
    teamId: "BUF",
    injury: { type: "IR (4W)", weeksRemaining: 4 }
  };
  const league = {};
  reportSignificantInjury(league, player, 2026, 8);
  const injury = league.newsLog?.find((n) => n.type === "injury");
  assert.ok(injury, "should generate injury headline");
  assert.ok(injury.headline.includes("Diggs"));
});

test("beatReporter: reportSignificantInjury ignores questionable status", () => {
  const player = {
    id: "p3",
    name: "Zack Moss",
    position: "RB",
    teamId: "BUF",
    injury: { type: "Questionable", weeksRemaining: 0 }
  };
  const league = {};
  reportSignificantInjury(league, player, 2026, 8);
  assert.equal(league.newsLog?.filter((n) => n.type === "injury").length, 0);
});

test("beatReporter: reportTrade generates trade headline", () => {
  const league = {};
  reportTrade(league, "BUF", "MIA", "Diggs", 2026, 9);
  const trade = league.newsLog?.find((n) => n.type === "trade");
  assert.ok(trade);
  assert.ok(trade.headline.includes("Diggs"));
});

test("beatReporter: news log caps at 50 items", () => {
  const league = {};
  for (let i = 0; i < 60; i++) {
    reportTrade(league, "BUF", "MIA", `Player${i}`, 2026, 1);
  }
  assert.ok(league.newsLog.length <= 50);
});

// ── rivalryDNA ────────────────────────────────────────────────────────────────

import {
  initRivalries,
  recordGameResult,
  recordWeekRivalries,
  getRivalryContext,
  getTeamRivalries,
  boostRivalryHeat
} from "../src/engine/rivalryDNA.js";

test("rivalryDNA: initRivalries creates empty rivalries map", () => {
  const league = {};
  initRivalries(league);
  assert.deepEqual(league.rivalries, {});
});

test("rivalryDNA: recordGameResult creates rivalry entry on first game", () => {
  const league = {};
  recordGameResult(league, { homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 27, awayScore: 24 }, 2026, 5);
  const entry = Object.values(league.rivalries)[0];
  assert.ok(entry, "rivalry entry should exist");
  assert.equal(entry.teams.length, 2);
  assert.ok(entry.heat > 0);
  assert.equal(entry.history.length, 1);
});

test("rivalryDNA: close game (≤3 pts) increases heat by 10", () => {
  const league = {};
  recordGameResult(league, { homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 20, awayScore: 17 }, 2026, 5);
  const entry = Object.values(league.rivalries)[0];
  assert.equal(entry.heat, 20); // base 10 + delta 10
});

test("rivalryDNA: blowout (>21 pts) decreases heat", () => {
  const league = {};
  recordGameResult(league, { homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 42, awayScore: 7 }, 2026, 5);
  const entry = Object.values(league.rivalries)[0];
  assert.equal(entry.heat, 7); // base 10 - 3
});

test("rivalryDNA: recordWeekRivalries processes all games in a week", () => {
  const league = {};
  const weekResult = {
    week: 5,
    games: [
      { homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 27, awayScore: 24 },
      { homeTeamId: "NE", awayTeamId: "NYJ", homeScore: 14, awayScore: 10 }
    ]
  };
  recordWeekRivalries(league, weekResult, 2026);
  assert.equal(Object.keys(league.rivalries).length, 2);
});

test("rivalryDNA: getRivalryContext returns correct win tallies", () => {
  const league = {};
  recordGameResult(league, { homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 27, awayScore: 20 }, 2026, 5);
  recordGameResult(league, { homeTeamId: "MIA", awayTeamId: "BUF", homeScore: 31, awayScore: 14 }, 2026, 12);
  const ctx = getRivalryContext(league, "BUF", "MIA");
  assert.ok(ctx);
  assert.equal(ctx.teamAWins + ctx.teamBWins, 2);
  assert.equal(ctx.totalMeetings, 2);
});

test("rivalryDNA: boostRivalryHeat caps at 100", () => {
  const league = {};
  recordGameResult(league, { homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 17, awayScore: 14 }, 2026, 1);
  boostRivalryHeat(league, "BUF", "MIA", 200);
  const entry = Object.values(league.rivalries)[0];
  assert.equal(entry.heat, 100);
});

test("rivalryDNA: getTeamRivalries only returns entries with heat ≥25", () => {
  const league = {};
  // Low-heat game
  recordGameResult(league, { homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 40, awayScore: 0 }, 2026, 1);
  const hot = getTeamRivalries(league, "BUF");
  assert.equal(hot.length, 0, "blowout-only rivalry should be below threshold");
});

// ── injurySystem ──────────────────────────────────────────────────────────────

import {
  rollInjuryCheck,
  getSeverity,
  applyInjury,
  rollGameInjuries,
  advanceInjuryRecovery,
  getInjuryReport,
  getDepthVulnerabilities
} from "../src/engine/injurySystem.js";

const mockRng = (val) => ({ next: () => val });

test("injurySystem: rollInjuryCheck returns false for already-injured player", () => {
  const player = { position: "QB", age: 28, injury: { weeksRemaining: 3 } };
  assert.equal(rollInjuryCheck(player, mockRng(0.0001)), false);
});

test("injurySystem: getSeverity returns valid severity entry", () => {
  const severity = getSeverity(mockRng(0.1)); // low roll → first bucket
  assert.ok(severity.type, "should have type");
  assert.ok(typeof severity.weeksRemaining === "number");
});

test("injurySystem: applyInjury sets player injury and increments reinjuryRisk", () => {
  const player = { reinjuryRisk: 0 };
  applyInjury(player, { type: "Out 1W", weeksRemaining: 1 });
  assert.deepEqual(player.injury, { type: "Out 1W", weeksRemaining: 1 });
  assert.ok(player.reinjuryRisk > 0);
});

test("injurySystem: rollGameInjuries returns array (may be empty with unfavourable rng)", () => {
  const players = [
    { position: "QB", age: 28, status: "active" },
    { position: "RB", age: 24, status: "active" }
  ];
  // rng always above threshold → no injuries
  const injured = rollGameInjuries(players, [], mockRng(1.0));
  assert.ok(Array.isArray(injured));
  assert.equal(injured.length, 0);
});

test("injurySystem: rollGameInjuries injures player when rng is below threshold", () => {
  const players = [
    { position: "RB", age: 24, status: "active" }
  ];
  // rng at 0 → always below any contact rate
  const injured = rollGameInjuries(players, [], mockRng(0.0));
  assert.equal(injured.length, 1);
  assert.ok(injured[0].player.injury);
});

test("injurySystem: advanceInjuryRecovery decrements weeks remaining", () => {
  const league = {
    players: [
      { id: "p1", injury: { type: "Out 1W", weeksRemaining: 2 }, status: "active" }
    ]
  };
  advanceInjuryRecovery(league);
  assert.equal(league.players[0].injury.weeksRemaining, 1);
});

test("injurySystem: advanceInjuryRecovery clears injury at 0 weeks", () => {
  const league = {
    players: [
      { id: "p1", injury: { type: "Questionable", weeksRemaining: 0 }, status: "active" }
    ]
  };
  advanceInjuryRecovery(league);
  assert.equal(league.players[0].injury, null);
});

test("injurySystem: getInjuryReport filters to active injured players", () => {
  const league = {
    players: [
      { id: "p1", name: "A", position: "QB", teamId: "BUF", overall: 90, status: "active", injury: { type: "IR (4W)", weeksRemaining: 4 } },
      { id: "p2", name: "B", position: "RB", teamId: "BUF", overall: 80, status: "active", injury: null },
      { id: "p3", name: "C", position: "WR", teamId: "MIA", overall: 85, status: "active", injury: { type: "Out 1W", weeksRemaining: 1 } }
    ]
  };
  const report = getInjuryReport(league, "BUF");
  assert.equal(report.length, 1);
  assert.equal(report[0].id, "p1");
});

test("injurySystem: getDepthVulnerabilities returns alert for 2+ week injuries", () => {
  const league = {
    players: [
      { id: "p1", name: "Josh Allen", position: "QB", teamId: "BUF", overall: 96, status: "active", injury: { type: "IR (4W)", weeksRemaining: 4 } }
    ]
  };
  const vulns = getDepthVulnerabilities(league, "BUF");
  assert.equal(vulns.length, 1);
  assert.ok(vulns[0].alert.includes("Josh Allen"));
});

// ── gmLegacyScore ─────────────────────────────────────────────────────────────

import {
  initGmLegacy,
  updateGmLegacyAfterSeason,
  computeGmLegacyScore,
  getGmLegacySummary
} from "../src/engine/gmLegacyScore.js";

test("gmLegacyScore: initGmLegacy creates default legacy record", () => {
  const league = {};
  const legacy = initGmLegacy(league);
  assert.equal(legacy.seasonsServed, 0);
  assert.equal(legacy.superBowlWins, 0);
  assert.ok(Array.isArray(legacy.seasonHistory));
});

test("gmLegacyScore: initGmLegacy is idempotent", () => {
  const league = {};
  initGmLegacy(league);
  league.gmLegacy.superBowlWins = 2;
  initGmLegacy(league);
  assert.equal(league.gmLegacy.superBowlWins, 2);
});

test("gmLegacyScore: updateGmLegacyAfterSeason increments seasonsServed", () => {
  const league = {
    teams: [{ id: "BUF", season: { wins: 12, losses: 5 }, cap: {}, chemistry: 75 }],
    champions: [],
    currentYear: 2026
  };
  updateGmLegacyAfterSeason(league, "BUF", 2026);
  assert.equal(league.gmLegacy.seasonsServed, 1);
  assert.equal(league.gmLegacy.totalWins, 12);
});

test("gmLegacyScore: updateGmLegacyAfterSeason records playoff appearance", () => {
  const league = {
    teams: [{ id: "BUF", season: { wins: 13, losses: 4, playoffSeed: 1 }, cap: {}, chemistry: 80 }],
    champions: [],
    currentYear: 2026
  };
  updateGmLegacyAfterSeason(league, "BUF", 2026);
  assert.equal(league.gmLegacy.playoffAppearances, 1);
});

test("gmLegacyScore: computeGmLegacyScore returns zero state for empty legacy", () => {
  const result = computeGmLegacyScore({ seasonsServed: 0 });
  assert.equal(result.score, 0);
  assert.equal(result.grade, "—");
});

test("gmLegacyScore: computeGmLegacyScore produces reasonable score for dominant dynasty", () => {
  const legacy = {
    seasonsServed: 10,
    totalWins: 130,
    totalLosses: 40,
    playoffAppearances: 9,
    superBowlWins: 4,
    capGradeTotal: 750,
    cultureGradeTotal: 820,
    seasonHistory: []
  };
  const result = computeGmLegacyScore(legacy);
  assert.ok(result.score >= 65, `expected score ≥65, got ${result.score}`);
  assert.ok(["A+", "A", "A-", "B+"].includes(result.grade));
  assert.ok(result.label.includes("Dynasty") || result.label.includes("Perennial"));
});

test("gmLegacyScore: getGmLegacySummary returns null when no legacy exists", () => {
  const league = {};
  assert.equal(getGmLegacySummary(league), null);
});

// ── draftCombine ──────────────────────────────────────────────────────────────

import {
  runCombineForProspect,
  applyCombineToScouting,
  runLeagueCombine,
  getCombineSummary
} from "../src/engine/draftCombine.js";

test("draftCombine: runCombineForProspect returns grade and events", () => {
  const prospect = { id: "d1", name: "Josh", position: "WR", overall: 78 };
  const rng = { next: () => 0.6 };
  const result = runCombineForProspect(prospect, rng);
  assert.ok(result, "should return a result");
  assert.equal(result.prospectId, "d1");
  assert.ok(typeof result.grade === "number");
  assert.ok(result.grade >= 35 && result.grade <= 99);
  assert.ok(result.events && typeof result.events === "object");
});

test("draftCombine: applyCombineToScouting narrows confidence for elite grade", () => {
  const prospect = { id: "d1", position: "WR", overall: 85, scoutingConfidence: 50 };
  const combineResult = { grade: 82, events: {} };
  applyCombineToScouting(prospect, combineResult);
  assert.ok(prospect.scoutingConfidence < 50, "elite combine should narrow confidence");
});

test("draftCombine: applyCombineToScouting widens confidence for poor grade", () => {
  const prospect = { id: "d2", position: "RB", overall: 65, scoutingConfidence: 50 };
  const combineResult = { grade: 38, events: {} };
  applyCombineToScouting(prospect, combineResult);
  assert.ok(prospect.scoutingConfidence > 50, "poor combine should widen confidence");
});

test("draftCombine: runLeagueCombine runs all prospects", () => {
  const draftClass = [
    { id: "d1", name: "Prospect A", position: "QB", overall: 80, scoutingConfidence: 50 },
    { id: "d2", name: "Prospect B", position: "WR", overall: 75, scoutingConfidence: 50 }
  ];
  const rng = { next: () => 0.5 };
  const results = runLeagueCombine(draftClass, rng);
  assert.equal(results.length, 2);
  // Each prospect should now have combineResults
  assert.ok(draftClass[0].combineResults);
  assert.ok(draftClass[1].combineResults);
});

test("draftCombine: getCombineSummary returns sorted grades", () => {
  const draftClass = [
    { id: "d1", name: "A", position: "QB", overall: 80, combineResults: { grade: 70, events: {} } },
    { id: "d2", name: "B", position: "WR", overall: 75, combineResults: { grade: 85, events: {} } }
  ];
  const summary = getCombineSummary(draftClass);
  assert.equal(summary[0].grade, 85, "higher grade should be first");
});
