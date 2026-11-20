import test from "node:test";
import assert from "node:assert/strict";
import { isoWeek, weeklyChallenge, weeklyChallengeForLeague } from "../public/lib/weeklyChallenge.js";
import {
  CHALLENGE_BOARD_MIN_GMS,
  CHALLENGE_OBJECTIVES,
  buildChallengeShareText,
  challengePercentile,
  challengeScoreBlocks,
  formatChallengeScore,
  normalizeChallengeScore,
  openChallengeWeeks,
  scoreWeeklyChallenge,
  summarizeChallengeBoard,
  weeklyChallengeStanding,
  weeklyObjective
} from "../public/lib/weeklyChallengeScoreContract.js";
import * as serviceContract from "../src/community/challengeContract.js";
import { firstSeasonTotals, updateGmLegacyAfterSeason } from "../src/engine/gmLegacyScore.js";

const TEAMS = ["BUF", "KC", "DAL", "GB", "SF", "PHI", "NE", "MIA"];
const NOW = new Date("2026-11-19T12:00:00Z"); // 2026-W47
const WEEK = isoWeek(NOW).key;
const SEASON = { teamId: null, wins: 11, losses: 5, ties: 1, pointsFor: 431, pointsAgainst: 352, capSpace: 18_460_000 };
const weekKeys = Array.from({ length: 60 }, (_, index) => isoWeek(Date.UTC(2026, 0, 5) + index * 7 * 86_400_000).key);

test("each week has one goal, the same in every browser and on the service", () => {
  assert.equal(WEEK, "2026-W47");
  const seen = new Set();
  for (const key of weekKeys) {
    const objective = weeklyObjective(key);
    assert.ok(CHALLENGE_OBJECTIVES.includes(objective), `${key} picks a listed goal`);
    assert.equal(weeklyObjective(key), objective);
    assert.equal(serviceContract.weeklyObjective(key), objective, "the service reads the same goal");
    seen.add(objective.id);
  }
  assert.equal(seen.size, CHALLENGE_OBJECTIVES.length, "every goal comes up over a year");
  for (const bad of ["", "2026-W00", "2026-W54", "2026-47", "weekly", null, 202647]) assert.equal(weeklyObjective(bad), null);
});

test("the score is the stated formula for each goal", () => {
  assert.equal(scoreWeeklyChallenge("most-wins", SEASON), 23);
  assert.equal(scoreWeeklyChallenge("cap-room", SEASON), 184);
  assert.equal(scoreWeeklyChallenge("point-margin", SEASON), 79);
  assert.equal(scoreWeeklyChallenge("most-points", SEASON), 431);
  assert.equal(scoreWeeklyChallenge("cap-room", { ...SEASON, wins: 8, losses: 8 }), 0, "cap space only counts with a winning record");
  assert.equal(scoreWeeklyChallenge("cap-room", { ...SEASON, capSpace: -4_000_000 }), 0, "being over the cap scores nothing");
  assert.equal(scoreWeeklyChallenge("point-margin", { ...SEASON, pointsFor: 200, pointsAgainst: 410 }), -210);
});

test("the same results give the same score, and every score stays inside its goal's range", () => {
  let state = 12345;
  const next = (limit) => { state = (Math.imul(state, 1103515245) + 12345) >>> 0; return state % limit; };
  for (let round = 0; round < 400; round += 1) {
    const wins = next(18);
    const ties = next(18 - wins);
    const result = { wins, ties, losses: 17 - wins - ties, pointsFor: next(2000), pointsAgainst: next(2000), capSpace: (next(900) - 300) * 1_000_000 };
    for (const objective of CHALLENGE_OBJECTIVES) {
      const score = scoreWeeklyChallenge(objective.id, result);
      assert.equal(score, scoreWeeklyChallenge(objective.id, { ...result }), "same results, same score");
      assert.ok(Number.isInteger(score) && score >= objective.min && score <= objective.max, `${objective.id} ${score} is in range`);
      assert.equal([...challengeScoreBlocks(objective.id, score)].length, 5);
    }
  }
});

test("a season that could not have happened, or lacks what the goal needs, has no score", () => {
  assert.equal(scoreWeeklyChallenge("most-wins", { wins: 18, losses: 0, ties: 0 }), null, "more games than a season holds");
  assert.equal(scoreWeeklyChallenge("most-wins", { wins: 0, losses: 0, ties: 0 }), null, "no games played");
  assert.equal(scoreWeeklyChallenge("most-wins", { wins: -1, losses: 5 }), null);
  assert.equal(scoreWeeklyChallenge("most-wins", { wins: 9.5, losses: 7 }), null);
  assert.equal(scoreWeeklyChallenge("most-points", { wins: 9, losses: 8, pointsFor: null, pointsAgainst: 300 }), null, "an older save without points is not scored as zero");
  assert.equal(scoreWeeklyChallenge("cap-room", { wins: 9, losses: 8, capSpace: null }), null);
  assert.equal(scoreWeeklyChallenge("cap-room", { wins: 9, losses: 8, capSpace: Number.NaN }), null);
  assert.equal(scoreWeeklyChallenge("no-such-goal", SEASON), null);
  assert.equal(scoreWeeklyChallenge("most-wins", null), null);
});

test("two browsers on the same weekly league with the same results reach the same score", () => {
  const challenge = weeklyChallenge(TEAMS, NOW);
  const meta = (overrides = {}) => ({ seed: challenge.seed, startYear: challenge.startYear, controlledTeamId: challenge.teamId, currentYear: challenge.startYear + 1, firstSeason: { ...SEASON, teamId: challenge.teamId }, ...overrides });
  const first = weeklyChallengeStanding(meta(), TEAMS, NOW);
  const second = weeklyChallengeStanding(meta(), [...TEAMS].reverse().map((id) => id.toLowerCase()), new Date("2026-11-22T23:00:00Z"));
  assert.equal(first.state, "scored");
  assert.deepEqual(second, first);
  assert.equal(first.week.key, WEEK);
  assert.equal(first.objective, weeklyObjective(WEEK));
  assert.equal(first.score, scoreWeeklyChallenge(first.objective.id, SEASON));

  assert.equal(weeklyChallengeStanding(meta({ currentYear: challenge.startYear, firstSeason: null }), TEAMS, NOW).state, "playing");
  assert.equal(weeklyChallengeStanding(meta({ firstSeason: null }), TEAMS, NOW).state, "unscored");
  assert.equal(weeklyChallengeStanding(meta({ firstSeason: { teamId: challenge.teamId, wins: 9, losses: 8, ties: 0, pointsFor: null, pointsAgainst: null, capSpace: null } }), TEAMS, NOW).state,
    first.objective.id === "most-wins" ? "scored" : "unscored");
  const otherClub = TEAMS.find((id) => id !== challenge.teamId);
  assert.equal(weeklyChallengeStanding(meta({ controlledTeamId: otherClub }), TEAMS, NOW).state, "other-setup");
  assert.equal(weeklyChallengeStanding(meta({ startYear: challenge.startYear + 3 }), TEAMS, NOW).state, "other-setup");
  assert.equal(weeklyChallengeStanding(meta({ seed: challenge.seed + 1 }), TEAMS, NOW), null, "an ordinary league is not a challenge");
  assert.equal(weeklyChallengeStanding(meta(), TEAMS, new Date("2027-03-01T00:00:00Z")), null, "a week that closed long ago is not scored");
  assert.equal(weeklyChallengeForLeague(meta(), [], NOW).asSetUp, false, "without the club list the setup cannot be confirmed");
});

test("a board entry is exactly week, goal and score, and impossible entries are refused", () => {
  const objective = weeklyObjective(WEEK);
  const good = { week: WEEK, objective: objective.id, score: objective.max };
  assert.deepEqual(normalizeChallengeScore({ ...good, teamName: "Secret Franchise", playerName: "Secret Player", save: {} }, { now: NOW }), good);
  assert.deepEqual(normalizeChallengeScore({ ...good, score: objective.min }, { now: NOW }), { ...good, score: objective.min });
  const other = CHALLENGE_OBJECTIVES.find((entry) => entry.id !== objective.id);
  assert.equal(normalizeChallengeScore({ ...good, objective: other.id }, { now: NOW }), null, "not that week's goal");
  assert.equal(normalizeChallengeScore({ ...good, score: objective.max + 1 }, { now: NOW }), null);
  assert.equal(normalizeChallengeScore({ ...good, score: objective.min - 1 }, { now: NOW }), null);
  assert.equal(normalizeChallengeScore({ ...good, score: 10.5 }, { now: NOW }), null);
  assert.equal(normalizeChallengeScore({ ...good, score: "10" }, { now: NOW }), null);
  assert.equal(normalizeChallengeScore({ ...good, score: Number.NaN }, { now: NOW }), null);
  assert.equal(normalizeChallengeScore({ ...good, week: "2026-W30" }, { now: NOW }), null, "a closed week");
  assert.equal(normalizeChallengeScore({ ...good, week: "2026-W49" }, { now: NOW }), null, "a week that has not started");
  assert.equal(normalizeChallengeScore(null, { now: NOW }), null);
  assert.deepEqual(openChallengeWeeks(NOW), ["2026-W47", "2026-W46", "2026-W45", "2026-W44", "2026-W43"]);
  assert.ok(openChallengeWeeks(new Date("2026-11-22T23:30:00Z")).includes("2026-W48"), "a clock running a day fast is tolerated");
});

test("the board shows nothing below five browsers and only counts of five or more above it", () => {
  const objective = weeklyObjective(WEEK);
  const spread = (count) => Array.from({ length: count }, (_, index) => objective.min + Math.round(((objective.max - objective.min) * index) / Math.max(1, count - 1)));
  for (let count = 0; count < CHALLENGE_BOARD_MIN_GMS; count += 1) {
    assert.deepEqual(summarizeChallengeBoard(WEEK, spread(count)), { schemaVersion: "1.0", week: WEEK, objective: objective.id, status: "not-enough-scores" });
  }
  for (const count of [5, 6, 9, 23, 49, 50, 211]) {
    const scores = spread(count);
    const board = summarizeChallengeBoard(WEEK, scores);
    assert.equal(board.status, "live");
    assert.equal(board.gms, count);
    assert.ok(board.buckets.every((bucket) => bucket.count >= CHALLENGE_BOARD_MIN_GMS), "no bucket counts fewer than five browsers");
    assert.equal(board.buckets.reduce((sum, bucket) => sum + bucket.count, 0), count);
    assert.equal(board.buckets[0].min, objective.min);
    assert.equal(board.buckets.at(-1).max, objective.max);
    board.buckets.slice(1).forEach((bucket, index) => assert.equal(bucket.min, board.buckets[index].max + 1, "buckets leave no gaps"));
    assert.deepEqual(summarizeChallengeBoard(WEEK, [...scores].reverse()), board, "the board does not depend on order or on who asks");
    assert.deepEqual(Object.keys(board).sort(), ["buckets", "gms", "objective", "schemaVersion", "status", "week"]);
  }
  assert.equal(summarizeChallengeBoard(WEEK, [1, 2, 3, 4, "x", null, objective.max + 5, 2.5]).status, "not-enough-scores", "entries that are not scores are not counted");
  assert.equal(summarizeChallengeBoard("not-a-week", [1, 2, 3, 4, 5]), null);
});

test("no order statistic is published: a median would be one browser's exact score", () => {
  const objective = weeklyObjective(WEEK);
  const secret = objective.min + 137;
  const board = summarizeChallengeBoard(WEEK, [objective.min, objective.min, secret, objective.max, objective.max]);
  assert.equal(board.status, "live");
  assert.equal(JSON.stringify(board).includes(String(secret)), false, "the middle score appears nowhere on the board");
});

test("the share of GMs beaten is read off the board", () => {
  const objective = weeklyObjective(WEEK);
  const low = objective.min + objective.bucket;
  const high = objective.min + objective.bucket * 9;
  const board = summarizeChallengeBoard(WEEK, [...Array(30).fill(low), ...Array(30).fill(high)]);
  assert.equal(board.buckets.length, 2);
  assert.equal(challengePercentile(board, objective.min), 0);
  assert.equal(challengePercentile(board, objective.max), 99, "never 100: your own score is on the board");
  const between = challengePercentile(board, board.buckets[1].min);
  assert.equal(between, 50);
  for (let score = objective.min; score < objective.max; score += objective.bucket) {
    assert.ok(challengePercentile(board, score) <= challengePercentile(board, score + objective.bucket), "a better score never beats fewer GMs");
  }
  assert.equal(challengePercentile(summarizeChallengeBoard(WEEK, [1, 2]), 5), null);
  assert.equal(challengePercentile(null, 5), null);
});

test("the share text states the week, the goal, the result and the link, and nothing about the league", () => {
  const text = buildChallengeShareText({ week: WEEK, objectiveId: "most-wins", score: 23, link: "https://playfranchisearchitect.com/?challenge=VSFC1.abc.0000", percentile: 62 });
  const lines = text.split("\n");
  assert.equal(lines[0], "Franchise Architect: Football — Week 47 Challenge");
  assert.equal(lines[1], "Goal: Win the most games with this club in one season.");
  assert.equal(lines[2], "My score: 11.5 wins");
  assert.equal([...lines[3]].length, 5);
  assert.match(lines[3], /^[\u{1F7E9}⬜]+$/u);
  assert.equal(lines[4], "Beat 62% of GMs");
  assert.equal(lines[5], "Same league, same club: https://playfranchisearchitect.com/?challenge=VSFC1.abc.0000");
  assert.equal(buildChallengeShareText({ week: WEEK, objectiveId: "most-wins", score: 23 }).split("\n").length, 4, "no board line and no link when there is none");
  assert.equal(buildChallengeShareText({ week: WEEK, objectiveId: "nope", score: 23 }), "");
  assert.equal(formatChallengeScore("most-wins", 2), "1 win");
  assert.equal(formatChallengeScore("cap-room", 184), "$18.4M in cap space");
  assert.equal(formatChallengeScore("point-margin", 79), "+79 point differential");
  assert.equal(formatChallengeScore("point-margin", -12), "-12 point differential");
  assert.equal(formatChallengeScore("most-points", 431), "431 points scored");
});

test("a finished season keeps the totals the challenge is scored from", () => {
  const league = {
    teams: [{ id: "BUF", season: { wins: 11, losses: 5, ties: 1, pointsFor: 431, pointsAgainst: 352 }, chemistry: 75 }],
    champions: []
  };
  assert.equal(firstSeasonTotals(league, 2026), null, "nothing until the season has finished");
  updateGmLegacyAfterSeason(league, "BUF", 2026, { capSummary: { salaryCap: 250_000_000, usedCap: 231_540_000, deadCap: 0, capSpace: 18_460_000 } });
  league.teams[0].season = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
  updateGmLegacyAfterSeason(league, "BUF", 2027, { capSummary: { capSpace: 1 } });
  assert.deepEqual(firstSeasonTotals(league, 2026), { teamId: "BUF", wins: 11, losses: 5, ties: 1, pointsFor: 431, pointsAgainst: 352, capSpace: 18_460_000 });
  assert.equal(scoreWeeklyChallenge("cap-room", firstSeasonTotals(league, 2026)), 184);

  const older = { teams: [{ id: "BUF", season: { wins: 9, losses: 8 } }], champions: [] };
  updateGmLegacyAfterSeason(older, "BUF", 2026);
  assert.deepEqual(firstSeasonTotals(older, 2026), { teamId: "BUF", wins: 9, losses: 8, ties: 0, pointsFor: null, pointsAgainst: null, capSpace: null }, "a missing total is null, never zero");
});

test("the game reports the league's own seed and its finished first season, so a weekly league is recognised and scored", async () => {
  const { createLocalApiRuntime } = await import("../src/app/api/localApiRuntime.js");
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
  const runtime = createLocalApiRuntime({ storage, scheduler: (fn) => fn() });
  const setup = await runtime.request("/api/setup/init");
  const teamIds = (setup.payload.teams || []).map((team) => team.id);
  assert.ok(teamIds.length > 8, "setup lists the clubs");
  const challenge = weeklyChallenge(teamIds, NOW);
  await runtime.request("/api/new-league", {
    method: "POST", body: { seed: challenge.seed, startYear: challenge.startYear, controlledTeamId: challenge.teamId, mode: "play", eraProfile: "modern" }
  });
  const session = runtime.getSession();
  assert.notEqual(session.rng.seed, challenge.seed, "the generator has moved on from the league seed, so it cannot identify the league");

  const playing = (await runtime.request("/api/speedrun/status")).payload.leagueMeta;
  assert.equal(playing.seed, challenge.seed, "the league's own seed is reported");
  assert.equal(playing.startYear, challenge.startYear);
  assert.equal(playing.controlledTeamId, challenge.teamId);
  assert.equal(playing.currentYear, challenge.startYear);
  assert.equal(playing.firstSeason, null);
  const leagueTeamIds = session.league.teams.map((team) => team.id);
  assert.equal(weeklyChallengeStanding(playing, leagueTeamIds, NOW).state, "playing", "the clubs in play pick the same challenge club as setup did");

  // Stand in for a played season: write the club's totals and close the year the way the engine does.
  Object.assign(session.league.teams.find((team) => team.id === challenge.teamId).season, { wins: 11, losses: 5, ties: 1, pointsFor: 431, pointsAgainst: 352 });
  updateGmLegacyAfterSeason(session.league, challenge.teamId, challenge.startYear, { capSummary: { ...session.getTeamCapSummary(challenge.teamId), capSpace: 18_460_000 } });
  const finished = (await runtime.request("/api/speedrun/status")).payload.leagueMeta;
  assert.deepEqual(finished.firstSeason, { ...SEASON, teamId: challenge.teamId });
  const standing = weeklyChallengeStanding(finished, leagueTeamIds, NOW);
  assert.equal(standing.state, "scored");
  assert.equal(standing.score, scoreWeeklyChallenge(weeklyObjective(WEEK).id, SEASON));
});

test("the in-game panel is loaded on demand and never becomes part of boot", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (file) => readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
  const app = read("app.js");
  assert.match(app, /import\("\.\/lib\/weeklyChallengePanel\.js"\)/, "app.js loads the panel with a dynamic import");
  assert.doesNotMatch(app, /^import [^\n]*weeklyChallenge/m, "and never with a static one");
  assert.ok(JSON.parse(read("boot-manifest.json")).lazyRoots.includes("lib/weeklyChallengePanel.js"), "the boot budget watches for a leak");
  const { staticGraphFor } = await import("../scripts/check-browser-boot-budget.mjs");
  assert.deepEqual((await staticGraphFor("app.js")).filter((file) => /weeklyChallenge/.test(file)), []);
  const panel = read("lib/weeklyChallengePanel.js");
  assert.match(panel, /import\("\.\/weeklyChallengeScoreContract\.js"\)/, "the scoring rules load only for a weekly league");
  assert.match(panel, /import\("\.\/weeklyChallengeBoard\.js"\)/);
  const playerFacing = [panel, read("lib/weeklyChallengeScoreContract.js"), read("lib/weeklyChallengeBoard.js")].join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const strings = [...playerFacing.matchAll(/`([^`]*)`|"([^"\n]*)"/g)].map((match) => match[1] ?? match[2]).filter((text) => / /.test(text));
  for (const text of strings) assert.doesNotMatch(text, /\b(receipt|shard|canon|founder|allowlist|thesis|ledger)\b|\bS\d{2,3}\b/i, text);
});

// ── The browser side: nothing leaves with sharing off ────────────────────────

const CONSENT = "fa:community-participation:v1";
const PARTICIPANT = "fa:community-participant:v1";
let sequence = 0;

async function browser(entries, run) {
  const keys = ["window", "fetch"];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map(entries);
  const calls = [];
  const h = { values, calls, respond: () => new Response("{}", { status: 404 }) };
  const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { localStorage, addEventListener() {}, dispatchEvent() {} } });
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async (url, init = {}) => {
      const parsed = new URL(url);
      const call = { path: parsed.pathname.split("/community/v1/")[1], search: parsed.search, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, credentials: init.credentials };
      calls.push(call);
      return h.respond(call);
    } });
    h.module = await import(`../public/lib/weeklyChallengeBoard.js?score-test=${++sequence}`);
    await run(h);
  } finally {
    for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; }
  }
}

const currentEntry = () => {
  const week = isoWeek().key;
  const objective = weeklyObjective(week);
  return { week, objective: objective.id, score: objective.par[0] };
};

test("with sharing off no score is posted and the board is not even asked for", async () => {
  await browser([[CONSENT, "declined"], [PARTICIPANT, "browser-with-sharing-off-0001"]], async (h) => {
    assert.deepEqual(await h.module.submitChallengeScore(currentEntry()), { status: "off" });
    assert.equal(await h.module.fetchChallengeBoard(currentEntry().week), null);
    assert.deepEqual(h.calls, []);
  });
  await browser([], async (h) => {
    assert.deepEqual(await h.module.submitChallengeScore(currentEntry()), { status: "off" });
    assert.equal(await h.module.fetchChallengeBoard(currentEntry().week), null);
    assert.deepEqual(h.calls, []);
  });
});

test("with sharing on a score is posted once, as week, goal and score only", async () => {
  const id = "browser-with-sharing-on-00001";
  await browser([[CONSENT, "participating"], [PARTICIPANT, id]], async (h) => {
    const entry = currentEntry();
    const board = summarizeChallengeBoard(entry.week, Array(7).fill(entry.score));
    h.respond = (call) => {
      if (call.path === "capability") return new Response(JSON.stringify({ capability: "fixture-capability-for-score-test", expiresAt: new Date(Date.now() + 60_000).toISOString(), remainingUses: 8 }), { status: 201 });
      if (call.path === "challenge/score") return new Response(JSON.stringify({ ok: true, accepted: 1, best: entry.score }), { status: 202 });
      if (call.path === "challenge/board") return new Response(JSON.stringify(board), { status: 200 });
      return new Response("{}", { status: 404 });
    };
    assert.deepEqual(await h.module.submitChallengeScore({ ...entry, teamName: "Secret Franchise" }), { status: "sent" });
    const posts = h.calls.filter((call) => call.path === "challenge/score");
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].body, { schemaVersion: "1.0", participantId: id, entry, capability: "fixture-capability-for-score-test" });
    assert.equal(posts[0].credentials, "omit");
    assert.doesNotMatch(JSON.stringify(h.calls), /Secret/);

    assert.deepEqual(await h.module.submitChallengeScore(entry), { status: "already-sent" });
    assert.equal(h.calls.filter((call) => call.path === "challenge/score").length, 1, "the same score is not posted twice in one visit");
    assert.deepEqual(await h.module.submitChallengeScore({ ...entry, score: entry.score + 1 }), { status: "sent" }, "a better score is posted");
    assert.deepEqual(await h.module.submitChallengeScore({ ...entry, objective: "no-such-goal" }), { status: "invalid" });

    assert.deepEqual(await h.module.fetchChallengeBoard(entry.week), board);
    const read = h.calls.find((call) => call.path === "challenge/board");
    assert.equal(read.search, `?week=${entry.week}`);
    assert.equal(read.body, null, "reading the board sends nothing about this browser");
    assert.equal(read.credentials, "omit");
  });
});

test("a failed post is reported, not thrown, and is tried again next time", async () => {
  await browser([[CONSENT, "participating"], [PARTICIPANT, "browser-with-sharing-on-00002"]], async (h) => {
    h.respond = (call) => call.path === "capability"
      ? new Response(JSON.stringify({ capability: "fixture-capability-for-score-test", expiresAt: new Date(Date.now() + 60_000).toISOString(), remainingUses: 8 }), { status: 201 })
      : new Response("{}", { status: 503 });
    const first = await h.module.submitChallengeScore(currentEntry());
    assert.equal(first.status, "failed");
    assert.equal((await h.module.submitChallengeScore(currentEntry())).status, "failed");
    assert.equal(h.calls.filter((call) => call.path === "challenge/score").length, 2);
    assert.equal(await h.module.fetchChallengeBoard(currentEntry().week), null);
  });
});
