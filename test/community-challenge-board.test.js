import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createCommunityStatsHandler, createMemoryRateLimiter } from "../src/community/server.js";
import { CommunityStore } from "../src/community/communityStore.js";
import { aggregateCommunitySnapshot } from "../src/community/aggregateCommunitySnapshot.js";
import { CHALLENGE_BOARD_MIN_GMS, CHALLENGE_OBJECTIVES, summarizeChallengeBoard, weeklyObjective } from "../src/community/challengeContract.js";

const ALLOWED_ORIGIN = "https://playfranchisearchitect.com";
const NOW = Date.parse("2026-11-19T12:00:00Z");
const WEEK = "2026-W47";
const OBJECTIVE = weeklyObjective(WEEK);
const MID = Math.round((OBJECTIVE.min + OBJECTIVE.max) / 2);

async function withServer(store, run, options = {}) {
  const server = http.createServer(createCommunityStatsHandler({ store, origins: new Set([ALLOWED_ORIGIN]), challengeClock: () => NOW, ...options }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, "close"); }
}

const jsonPost = (url, payload, headers = {}) => fetch(url, {
  method: "POST",
  headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json", ...headers },
  body: JSON.stringify(payload)
});
const capability = async (origin, participantId, purpose) =>
  (await (await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId, ...(purpose ? { purpose } : {}) })).json()).capability;
const postScore = (origin, participantId, token, entry, headers = {}) =>
  jsonPost(`${origin}/community/v1/challenge/score`, { schemaVersion: "1.0", participantId, capability: token, entry }, headers);
const entry = (overrides = {}) => ({ week: WEEK, objective: OBJECTIVE.id, score: MID, ...overrides });

function stubStore(extra = {}) {
  const saved = [];
  return {
    saved,
    health: async () => ({ ok: true }),
    snapshot: async () => aggregateCommunitySnapshot([]),
    cache: null,
    saveChallengeScore: async (...args) => { saved.push(args); return { accepted: 1, best: args[1].score }; },
    challengeBoard: async (week) => summarizeChallengeBoard(week, []),
    ...extra
  };
}

test("a score is accepted with a sharing capability and stored as week, goal and score only", async () => {
  const store = stubStore();
  await withServer(store, async (origin) => {
    const id = "browser_sharing_on_000001";
    const token = await capability(origin, id);
    const response = await postScore(origin, id, token, { ...entry(), teamName: "Secret Franchise", playerName: "Secret Player", handle: "gm_ace" });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true, accepted: 1, best: MID });
    assert.deepEqual(store.saved, [[id, { week: WEEK, objective: OBJECTIVE.id, score: MID }]]);
    assert.doesNotMatch(JSON.stringify(store.saved), /Secret|gm_ace/);
  });
});

test("a score is refused without sharing: no capability, a made-up one, or a feedback-only one", async () => {
  const store = stubStore();
  await withServer(store, async (origin) => {
    const id = "browser_sharing_off_00001";
    assert.equal((await postScore(origin, id, "", entry())).status, 401);
    assert.equal((await postScore(origin, id, "x".repeat(48), entry())).status, 401);
    const feedbackOnly = await capability(origin, id, "feedback");
    assert.equal((await postScore(origin, id, feedbackOnly, entry())).status, 401, "a feedback capability cannot post a score");
    const other = await capability(origin, "browser_someone_else_0001");
    assert.equal((await postScore(origin, id, other, entry())).status, 401, "another browser's capability is refused");
    assert.deepEqual(store.saved, []);
  });
});

test("a score that does not fit the week's goal is refused, not stored", async () => {
  const store = stubStore();
  const wrongGoal = CHALLENGE_OBJECTIVES.find((objective) => objective.id !== OBJECTIVE.id).id;
  const bad = [
    entry({ score: OBJECTIVE.max + 1 }),
    entry({ score: OBJECTIVE.min - 1 }),
    entry({ score: 12.5 }),
    entry({ score: "12" }),
    entry({ score: null }),
    entry({ objective: wrongGoal }),
    entry({ week: "2026-W30" }),
    entry({ week: "2026-W49" }),
    entry({ week: "next week" })
  ];
  await withServer(store, async (origin) => {
    const id = "browser_bad_scores_000001";
    for (const candidate of bad) {
      const token = await capability(origin, id);
      const response = await postScore(origin, id, token, candidate);
      assert.equal(response.status, 400, JSON.stringify(candidate));
    }
    const token = await capability(origin, id);
    assert.equal((await jsonPost(`${origin}/community/v1/challenge/score`, { schemaVersion: "1.0", participantId: id, capability: token })).status, 400, "no entry");
    assert.equal((await jsonPost(`${origin}/community/v1/challenge/score`, { schemaVersion: "2.0", participantId: id, capability: token, entry: entry() })).status, 400);
    assert.equal((await jsonPost(`${origin}/community/v1/challenge/score`, { schemaVersion: "1.0", participantId: "short", capability: token, entry: entry() })).status, 400);
    assert.deepEqual(store.saved, []);
  }, { challengeScoreRateLimit: createMemoryRateLimiter({ limit: 100, windowMs: 60_000 }) });
});

test("scores need an allowed browser origin and are limited per address", async () => {
  const store = stubStore();
  await withServer(store, async (origin) => {
    const id = "browser_rate_limit_000001";
    const token = await capability(origin, id);
    assert.equal((await postScore(origin, id, token, entry(), { Origin: "https://attacker.example" })).status, 403);
    const noOrigin = await fetch(`${origin}/community/v1/challenge/score`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "1.0", participantId: id, capability: token, entry: entry() })
    });
    assert.equal(noOrigin.status, 403);
    assert.equal((await postScore(origin, id, token, entry())).status, 202);
    assert.equal((await postScore(origin, id, token, entry({ score: MID + 1 }))).status, 202);
    const limited = await postScore(origin, id, token, entry({ score: MID + 2 }));
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal(store.saved.length, 2);
  }, { challengeScoreRateLimit: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }) });
});

test("the board route gives the same board to every caller and nothing below five browsers", async () => {
  let scores = Array(CHALLENGE_BOARD_MIN_GMS - 1).fill(MID);
  const asked = [];
  const store = stubStore({ challengeBoard: async (week) => { asked.push(week); return summarizeChallengeBoard(week, scores); } });
  await withServer(store, async (origin) => {
    const hidden = await fetch(`${origin}/community/v1/challenge/board?week=${WEEK}`, { headers: { Origin: ALLOWED_ORIGIN } });
    assert.equal(hidden.status, 200);
    assert.deepEqual(await hidden.json(), { schemaVersion: "1.0", week: WEEK, objective: OBJECTIVE.id, status: "not-enough-scores" });

    scores = Array(12).fill(MID);
    const first = await (await fetch(`${origin}/community/v1/challenge/board?week=${WEEK}`, { headers: { Origin: ALLOWED_ORIGIN } })).json();
    const second = await (await fetch(`${origin}/community/v1/challenge/board?week=${WEEK}&participantId=browser_someone_else_0001`)).json();
    assert.deepEqual(second, first);
    assert.equal(first.gms, 12);
    assert.equal("median" in first || "topDecile" in first, false, "no single browser's score is published");
    assert.deepEqual(first.buckets.map((bucket) => bucket.count), [12]);
    assert.deepEqual(asked, [WEEK, WEEK, WEEK], "only the week reaches the store");

    for (const bad of ["", "?week=2026-W30", "?week=2026-W49", "?week=abc", "?week=2026-W47%27%3B--"]) {
      assert.equal((await fetch(`${origin}/community/v1/challenge/board${bad}`)).status, 400, bad);
    }
  });
});

// ── The store ────────────────────────────────────────────────────────────────

class ScorePool {
  constructor() { this.scores = []; this.receipts = 0; }
  async query(sql, params = []) {
    if (/CREATE SCHEMA/.test(sql)) return {};
    if (/^INSERT INTO community_stats\.challenge_scores\(participant_hash,week_key,objective,score\) VALUES\(\$1,\$2,\$3,\$4\) ON CONFLICT \(participant_hash,week_key\) DO UPDATE SET score=GREATEST\(community_stats\.challenge_scores\.score, EXCLUDED\.score\) RETURNING score$/.test(sql)) {
      const [participantHash, weekKey, objective, score] = params;
      const existing = this.scores.find((row) => row.participant_hash === participantHash && row.week_key === weekKey);
      if (existing) { existing.score = Math.max(existing.score, score); return { rowCount: 1, rows: [{ score: existing.score }] }; }
      this.scores.push({ participant_hash: participantHash, week_key: weekKey, objective, score, received_at: new Date() });
      return { rowCount: 1, rows: [{ score }] };
    }
    if (/^SELECT score FROM community_stats\.challenge_scores WHERE week_key=\$1 AND objective=\$2 LIMIT \$3$/.test(sql)) {
      const [weekKey, objective, limit] = params;
      return { rows: this.scores.filter((row) => row.week_key === weekKey && row.objective === objective).slice(0, limit).map((row) => ({ score: row.score })) };
    }
    if (/^DELETE FROM community_stats\.challenge_scores WHERE participant_hash=\$1$/.test(sql)) {
      const before = this.scores.length;
      this.scores = this.scores.filter((row) => row.participant_hash !== params[0]);
      return { rowCount: before - this.scores.length };
    }
    if (/^DELETE FROM community_stats\.challenge_scores WHERE received_at < now\(\) - \(\$1::int \* interval '1 day'\)$/.test(sql)) {
      assert.ok(Number.isInteger(params[0]) && params[0] > 0, "retention days are a bound parameter");
      const cutoff = Date.now() - params[0] * 24 * 60 * 60 * 1000;
      const before = this.scores.length;
      this.scores = this.scores.filter((row) => row.received_at.getTime() >= cutoff);
      return { rowCount: before - this.scores.length };
    }
    if (/^DELETE FROM community_stats\.(receipts|feedback|diagnostics) WHERE /.test(sql)) return { rowCount: 0 };
    throw new Error(`ScorePool: unhandled query: ${sql}`);
  }
  async end() {}
}

function makeStore(clock) {
  const pool = new ScorePool();
  const keyPath = path.join(os.tmpdir(), `fa-challenge-board-test-${Math.random().toString(36).slice(2)}`, "pepper");
  return { pool, store: new CommunityStore({ pool, keyPath, ...(clock ? { clock } : {}) }) };
}

test("one score per browser per week is kept, and it is the best one", async () => {
  const { pool, store } = makeStore();
  assert.deepEqual(await store.saveChallengeScore("player-1", entry({ score: MID })), { accepted: 1, best: MID });
  assert.deepEqual(await store.saveChallengeScore("player-1", entry({ score: MID - 3 })), { accepted: 1, best: MID }, "a worse run does not replace a better one");
  assert.deepEqual(await store.saveChallengeScore("player-1", entry({ score: MID + 4 })), { accepted: 1, best: MID + 4 });
  await store.saveChallengeScore("player-1", { week: "2026-W46", objective: weeklyObjective("2026-W46").id, score: weeklyObjective("2026-W46").min });
  await store.saveChallengeScore("player-2", entry({ score: MID }));
  assert.equal(pool.scores.length, 3, "one row per browser per week");
  assert.deepEqual(Object.keys(pool.scores[0]).sort(), ["objective", "participant_hash", "received_at", "score", "week_key"]);
  assert.ok(pool.scores.every((row) => /^[0-9a-f]{64}$/.test(row.participant_hash)));
  assert.doesNotMatch(JSON.stringify(pool.scores), /player-1|player-2/, "the browser identifier itself is never stored");
});

test("the stored board stays hidden until five browsers have posted, however often one browser posts", async () => {
  let now = new Date("2026-11-19T12:00:00Z");
  const { store } = makeStore(() => now);
  const hidden = { schemaVersion: "1.0", week: WEEK, objective: OBJECTIVE.id, status: "not-enough-scores" };
  for (let repeat = 0; repeat < 12; repeat += 1) await store.saveChallengeScore("player-1", entry({ score: OBJECTIVE.min + repeat }));
  assert.deepEqual(await store.challengeBoard(WEEK), hidden, "one browser posting twelve times is still one browser");
  for (let browser = 2; browser <= CHALLENGE_BOARD_MIN_GMS - 1; browser += 1) await store.saveChallengeScore(`player-${browser}`, entry());
  assert.deepEqual(await store.challengeBoard(WEEK), hidden);
  await store.saveChallengeScore(`player-${CHALLENGE_BOARD_MIN_GMS}`, entry());
  const board = await store.challengeBoard(WEEK);
  assert.equal(board.status, "live");
  assert.equal(board.gms, CHALLENGE_BOARD_MIN_GMS);
  assert.equal(board.buckets.reduce((sum, bucket) => sum + bucket.count, 0), CHALLENGE_BOARD_MIN_GMS);
  assert.doesNotMatch(JSON.stringify(board), /player|[0-9a-f]{64}/);
  assert.equal(await store.challengeBoard(WEEK), board, "the board is cached briefly");
  // A published board moves only in steps of five browsers, so comparing two
  // reads never shows what one browser added.
  now = new Date(now.getTime() + 61_000);
  for (let browser = 6; browser <= 9; browser += 1) await store.saveChallengeScore(`player-${browser}`, entry());
  assert.equal(await store.challengeBoard(WEEK), board, "four more browsers do not move the published board");
  await store.saveChallengeScore("player-10", entry());
  const moved = await store.challengeBoard(WEEK);
  assert.equal(moved.gms, 10, "the fifth one does");
  assert.deepEqual(await store.challengeBoard("2026-W46"), { schemaVersion: "1.0", week: "2026-W46", objective: weeklyObjective("2026-W46").id, status: "not-enough-scores" });
});

test("turning sharing off deletes that browser's scores and the board drops back below the threshold", async () => {
  const { pool, store } = makeStore();
  for (let browser = 1; browser <= CHALLENGE_BOARD_MIN_GMS; browser += 1) await store.saveChallengeScore(`player-${browser}`, entry());
  assert.equal((await store.challengeBoard(WEEK)).status, "live");
  assert.deepEqual(await store.deleteParticipant("player-3"), { deleted: 1 });
  assert.equal(pool.scores.length, CHALLENGE_BOARD_MIN_GMS - 1);
  assert.equal((await store.challengeBoard(WEEK)).status, "not-enough-scores", "the cached board is dropped with the deleted score");
});

test("challenge scores expire with the same 30-day sweep as everything else", async () => {
  let now = new Date();
  const { pool, store } = makeStore(() => now);
  await store.saveChallengeScore("player-1", entry());
  await store.saveChallengeScore("player-2", entry());
  pool.scores[0].received_at = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  now = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  await store.cleanupIfDue();
  assert.equal(pool.scores.length, 1);
});
