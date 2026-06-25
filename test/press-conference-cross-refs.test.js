import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { generatePressConference } from "../src/engine/pressConference.js";
import { recordGameResult } from "../src/engine/rivalryDNA.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLeague({ heat = 0 } = {}) {
  const league = { newsLog: [], rivalries: {}, teams: [{ id: "MIA", season: { streak: 1 } }] };
  if (heat > 0) {
    // Seed a rivalry via recordGameResult until heat reaches the desired level
    const close = heat >= 60;
    for (let i = 0; i < Math.ceil(heat / 10); i++) {
      const margin = close ? 3 : 24;
      recordGameResult(league, {
        homeTeamId: "MIA",
        awayTeamId: "BUF",
        homeScore: 21,
        awayScore: 21 - margin
      }, 2025, i + 1);
    }
  }
  return league;
}

function makeWeekResult({ homeScore = 28, awayScore = 21, week = 7 } = {}) {
  return {
    week,
    games: [{ homeTeamId: "MIA", awayTeamId: "BUF", homeScore, awayScore }]
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("pc-cross-refs: deterministic id — no Math.random", () => {
  const src = readFileSync(new URL("../src/engine/pressConference.js", import.meta.url), "utf8");
  assert.ok(!src.includes("Math.random"), "pressConference.js must not use Math.random");
});

test("pc-cross-refs: id uses teamSuffix not random noise", () => {
  const league = makeLeague();
  generatePressConference(league, makeWeekResult(), "MIA", 2025);
  const ids = league.newsLog.map((n) => n.id);
  assert.ok(ids.every((id) => id.endsWith("-mia")), "all IDs end with team suffix '-mia'");
});

test("pc-cross-refs: same game produces same IDs on re-run", () => {
  const league1 = makeLeague();
  generatePressConference(league1, makeWeekResult(), "MIA", 2025);
  const ids1 = league1.newsLog.map((n) => n.id);

  const league2 = makeLeague();
  generatePressConference(league2, makeWeekResult(), "MIA", 2025);
  const ids2 = league2.newsLog.map((n) => n.id);

  assert.deepEqual(ids1, ids2, "IDs are identical across runs");
});

test("pc-cross-refs: generates 2 items in newsLog", () => {
  const league = makeLeague();
  generatePressConference(league, makeWeekResult(), "MIA", 2025);
  assert.equal(league.newsLog.length, 2);
  const subtypes = league.newsLog.map((n) => n.subtype);
  assert.ok(subtypes.includes("head-coach"), "has head-coach item");
  assert.ok(subtypes.includes("gm-analyst"), "has gm-analyst item");
});

test("pc-cross-refs: low rivalry heat (<60) uses standard tone, not rivalry tone", () => {
  const league = makeLeague({ heat: 0 });
  generatePressConference(league, makeWeekResult(), "MIA", 2025);
  const coachItem = league.newsLog.find((n) => n.subtype === "head-coach");
  assert.notEqual(coachItem.tone, "rivalry", "low heat should not produce rivalry tone");
});

test("pc-cross-refs: high rivalry heat (>=60) sets tone to 'rivalry'", () => {
  const league = makeLeague({ heat: 70 });
  generatePressConference(league, makeWeekResult(), "MIA", 2025);
  const coachItem = league.newsLog.find((n) => n.subtype === "head-coach");
  assert.equal(coachItem.tone, "rivalry", "high heat produces rivalry tone");
});

test("pc-cross-refs: rivalry item carries rivalryHeat field", () => {
  const league = makeLeague({ heat: 70 });
  generatePressConference(league, makeWeekResult(), "MIA", 2025);
  const coachItem = league.newsLog.find((n) => n.subtype === "head-coach");
  assert.ok(typeof coachItem.rivalryHeat === "number", "rivalryHeat is a number");
  assert.ok(coachItem.rivalryHeat >= 60, "rivalryHeat reflects the seeded heat");
});

test("pc-cross-refs: rivalry win quote does not appear on low-heat game", () => {
  const league = makeLeague({ heat: 0 });
  generatePressConference(league, makeWeekResult({ homeScore: 28, awayScore: 7 }), "MIA", 2025);
  const coachItem = league.newsLog.find((n) => n.subtype === "head-coach");
  assert.ok(!coachItem.quote.includes("rivalry"), "low heat coach quote should not mention rivalry explicitly");
});

test("pc-cross-refs: loss in rivalry game uses rivalry loss quote bank", () => {
  const league = makeLeague({ heat: 70 });
  // MIA loses as away team
  const weekResult = {
    week: 7,
    games: [{ homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 30, awayScore: 14 }]
  };
  generatePressConference(league, weekResult, "MIA", 2025);
  const coachItem = league.newsLog.find((n) => n.subtype === "head-coach");
  assert.equal(coachItem.tone, "rivalry", "rivalry tone on loss");
  assert.equal(coachItem.isWin, false, "isWin is false");
});

test("pc-cross-refs: no-op when controlledTeam has no game this week", () => {
  const league = makeLeague();
  const weekResult = { week: 7, games: [{ homeTeamId: "NYJ", awayTeamId: "BUF", homeScore: 20, awayScore: 17 }] };
  generatePressConference(league, weekResult, "MIA", 2025);
  assert.equal(league.newsLog.length, 0, "nothing added when MIA didn't play");
});

test("pc-cross-refs: newsLog capped at 50", () => {
  const league = makeLeague();
  league.newsLog = new Array(50).fill({ id: "old", type: "press-conference" });
  generatePressConference(league, makeWeekResult(), "MIA", 2025);
  assert.ok(league.newsLog.length <= 50, "newsLog does not exceed 50");
});
