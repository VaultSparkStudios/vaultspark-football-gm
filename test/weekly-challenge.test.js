import test from "node:test";
import assert from "node:assert/strict";
import { decodeChallengeCode, encodeChallengeCode } from "../public/lib/challengeCodes.js";
import {
  challengeFromSearch,
  challengeLink,
  decodeChallengeInput,
  isoWeek,
  weeklyChallenge,
  weeklyChallengeWeekForSeed
} from "../public/lib/weeklyChallenge.js";

const TEAMS = ["BUF", "MIA", "NE", "NYJ", "KC", "LV", "DEN", "LAC"];

test("ISO weeks match the calendar, including the year-boundary weeks", () => {
  assert.equal(isoWeek(new Date("2026-11-11T12:00:00Z")).key, "2026-W46");
  // 1 January 2027 is a Friday, so it still belongs to the last week of 2026.
  assert.equal(isoWeek(new Date("2027-01-01T12:00:00Z")).key, "2026-W53");
  // 29 December 2025 is a Monday whose Thursday falls in 2026.
  assert.equal(isoWeek(new Date("2025-12-29T00:00:00Z")).key, "2026-W01");
  assert.equal(isoWeek(Number.NaN), null);
});

test("two browsers in the same week get the same league, whatever order they list the clubs in", () => {
  const monday = weeklyChallenge(TEAMS, new Date("2026-11-09T00:00:01Z"));
  const sunday = weeklyChallenge([...TEAMS].reverse(), new Date("2026-11-15T23:59:59Z"));
  assert.ok(monday);
  assert.deepEqual(sunday, monday);
  assert.equal(monday.key, "2026-W46");
  assert.ok(TEAMS.includes(monday.teamId));
  assert.deepEqual(decodeChallengeCode(monday.code), {
    seed: monday.seed,
    startYear: 2026,
    teamId: monday.teamId,
    rivalSeasons: null,
    rivalName: null
  });
});

test("the next week is a different league", () => {
  const seeds = new Set();
  for (let week = 0; week < 12; week += 1) {
    seeds.add(weeklyChallenge(TEAMS, new Date(Date.UTC(2026, 0, 5) + week * 7 * 86_400_000)).seed);
  }
  assert.equal(seeds.size, 12);
});

test("no clubs means no challenge rather than a made-up club", () => {
  assert.equal(weeklyChallenge([], new Date("2026-11-11T00:00:00Z")), null);
  assert.equal(weeklyChallenge(["not a club!"], new Date("2026-11-11T00:00:00Z")), null);
});

test("a weekly league is recognised by its seed for a few weeks, and other seeds are not", () => {
  const now = new Date("2026-11-11T00:00:00Z");
  const challenge = weeklyChallenge(TEAMS, now);
  assert.equal(weeklyChallengeWeekForSeed(challenge.seed, now).week, 46);
  assert.equal(weeklyChallengeWeekForSeed(challenge.seed, new Date("2026-11-25T00:00:00Z")).week, 46);
  assert.equal(weeklyChallengeWeekForSeed(challenge.seed + 1, now), null);
  assert.equal(weeklyChallengeWeekForSeed(null, now), null);
});

test("a challenge link round-trips, and a damaged one is reported instead of ignored", () => {
  const code = encodeChallengeCode({ seed: 42, startYear: 2026, teamId: "KC", rivalSeasons: 3, rivalName: "Sam" });
  const link = challengeLink(code, "https://example.test/game.html?x=1#top");
  assert.equal(new URL(link).pathname, "/game.html");
  assert.equal(new URL(link).hash, "");
  assert.deepEqual(challengeFromSearch(new URL(link).search).decoded, decodeChallengeCode(code));
  assert.deepEqual(decodeChallengeInput(link), decodeChallengeCode(code));
  assert.deepEqual(decodeChallengeInput(`  ${code}  `), decodeChallengeCode(code));
  assert.deepEqual(challengeFromSearch("?challenge=WEEKLY"), { weekly: true });
  assert.deepEqual(challengeFromSearch(`?challenge=${code.slice(0, -1)}x`), { invalid: true });
  assert.equal(challengeFromSearch("?other=1"), null);
  assert.equal(decodeChallengeInput("https://example.test/?challenge=weekly"), null);
  assert.equal(decodeChallengeInput("nonsense"), null);
});
