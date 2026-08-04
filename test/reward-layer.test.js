import test from "node:test";
import assert from "node:assert/strict";

import {
  ACHIEVEMENTS,
  deriveControlledGame,
  deriveWinStreak,
  evaluateAchievements
} from "../public/lib/achievements.js";
import {
  buildWeekRecapModel,
  buildDraftPickVerdict,
  buildTradeVerdict
} from "../public/lib/rewardBeats.js";

const TEAM = "BUF";

function box(week, teamScore, oppScore, { home = true, opp = "MIA", seasonType = "regular" } = {}) {
  return home
    ? { gameId: `g${week}`, week, seasonType, homeTeamId: TEAM, homeScore: teamScore, awayTeamId: opp, awayScore: oppScore }
    : { gameId: `g${week}`, week, seasonType, awayTeamId: TEAM, awayScore: teamScore, homeTeamId: opp, homeScore: oppScore };
}

test("deriveControlledGame reads the exact receipted box score, home or away", () => {
  const rows = [box(5, 27, 20), box(4, 10, 31, { home: false })];
  const home = deriveControlledGame(rows, TEAM, 5);
  assert.equal(home.won, true);
  assert.equal(home.margin, 7);
  assert.equal(home.opponent, "MIA");
  const away = deriveControlledGame(rows, TEAM, 4);
  assert.equal(away.won, false);
  assert.equal(away.margin, -21);
  assert.equal(away.home, false);
  assert.equal(deriveControlledGame(rows, TEAM, 3), null, "a bye week yields no game, not a fake one");
});

test("deriveWinStreak counts consecutive wins from the most recent game", () => {
  assert.equal(deriveWinStreak([box(3, 20, 10), box(2, 24, 14), box(1, 7, 30)], TEAM), 2);
  assert.equal(deriveWinStreak([box(2, 7, 30), box(1, 40, 0)], TEAM), 0);
  assert.equal(deriveWinStreak([], TEAM), 0);
});

test("weekly achievements unlock only from receipted results and never twice", () => {
  const ctx = {
    event: { type: "week-advanced" },
    d: {},
    game: { won: true, teamScore: 41, oppScore: 0, margin: 41 },
    streak: 5,
    record: { wins: 5, losses: 0 }
  };
  const unlocked = evaluateAchievements(ctx, {});
  const ids = unlocked.map((a) => a.id);
  for (const expected of ["first-win", "blowout-30", "shutout", "forty-burger", "streak-3", "streak-5", "perfect-start"]) {
    assert.ok(ids.includes(expected), `${expected} unlocks`);
  }
  assert.ok(!ids.includes("streak-8"), "streak-8 requires 8 wins");

  const earned = Object.fromEntries(ids.map((id) => [id, { earnedAt: "2026-01-01" }]));
  assert.deepEqual(evaluateAchievements(ctx, earned), [], "already-earned trophies never re-award");
});

test("missing data never awards: empty context unlocks nothing weekly", () => {
  const unlocked = evaluateAchievements({ event: { type: "week-advanced" }, d: {}, game: null, streak: 0, record: null }, {});
  assert.deepEqual(unlocked.map((a) => a.id), []);
});

test("career achievements derive from gmLegacy source values", () => {
  const ctx = {
    event: { type: "season-complete", wins: 13, losses: 4, rank: 1 },
    d: { gmLegacy: { playoffAppearances: 2, superBowlWins: 3, seasonsServed: 11 } },
    game: null,
    streak: 0,
    record: null
  };
  const ids = evaluateAchievements(ctx, {}).map((a) => a.id);
  for (const expected of ["first-season", "winning-season", "twelve-wins", "top-seed", "playoff-berth", "champion", "dynasty", "decade-gm"]) {
    assert.ok(ids.includes(expected), `${expected} unlocks`);
  }
  assert.ok(!ids.includes("quarter-century"), "25 seasons not reached");
});

test("draft verdicts are deterministic functions of grade and round", () => {
  const draft = { currentPick: 40, slots: Array.from({ length: 64 }, (_, i) => ({ round: i < 32 ? 1 : 2 })) };
  assert.equal(buildDraftPickVerdict({ grade: 80 }, draft).verdict, "steal");
  assert.equal(buildDraftPickVerdict({ grade: 80 }, { currentPick: 3, slots: [{ round: 1 }, { round: 1 }, { round: 1 }] }).verdict, "blue-chip");
  assert.equal(buildDraftPickVerdict({ grade: 70 }, draft).verdict, "solid");
  assert.equal(buildDraftPickVerdict({ grade: 40 }, { currentPick: 5, slots: [null, null, null, null, { round: 1 }] }).verdict, "reach");
  assert.equal(buildDraftPickVerdict({}, draft).verdict, "unknown");
});

test("trade verdicts scale with the receipted value edge", () => {
  assert.equal(buildTradeVerdict({ myDelta: 20, theirDelta: 2 }).label, "Grand Theft Roster");
  assert.equal(buildTradeVerdict({ myDelta: 8, theirDelta: 1 }).label, "Sharp Deal");
  assert.equal(buildTradeVerdict({ myDelta: 1, theirDelta: -1 }).label, "Fair Exchange");
  assert.equal(buildTradeVerdict({ myDelta: -10, theirDelta: 5 }).label, "Costly Move");
});

test("week recap model derives headline, score line, and standings truthfully", () => {
  const dashboard = {
    controlledTeamId: TEAM,
    controlledTeam: { abbrev: TEAM },
    latestStandings: [
      { team: "KC", wins: 6, losses: 0 },
      { team: TEAM, wins: 5, losses: 1 }
    ]
  };
  const model = buildWeekRecapModel({
    game: { won: true, teamScore: 24, oppScore: 21, margin: 3, week: 6, home: true, opponent: "MIA", seasonType: "regular" },
    dashboard
  });
  assert.equal(model.headline, "Escape Act");
  assert.equal(model.record, "5–1");
  assert.equal(model.rank, 2);
  assert.match(model.scoreLine, /^24–21 vs /);
  assert.equal(buildWeekRecapModel({ game: null, dashboard }), null, "no game — no recap");
});

test("registry hygiene: unique ids, tiers, and honest check functions", () => {
  const ids = new Set();
  for (const achievement of ACHIEVEMENTS) {
    assert.ok(!ids.has(achievement.id), `duplicate id ${achievement.id}`);
    ids.add(achievement.id);
    assert.ok(["bronze", "silver", "gold", "legend"].includes(achievement.tier));
    assert.equal(typeof achievement.check, "function");
    assert.ok(achievement.name && achievement.desc && achievement.icon);
  }
  assert.ok(ACHIEVEMENTS.length >= 25, "registry offers a real trophy case");
});
