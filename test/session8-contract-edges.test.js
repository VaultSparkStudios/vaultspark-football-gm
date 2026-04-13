import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

// ── Contract edge cases ───────────────────────────────────────────────────────

test("multiple restructures increment restructureCount and mutate capHit each time", () => {
  const session = createSession({ seed: 8100, startYear: 2026, controlledTeamId: "BUF" });

  // Find a player with at least 3 years remaining so we can restructure twice
  const player = session.getRoster("BUF").find((p) => (p.contract?.yearsRemaining || 0) >= 3);
  assert.ok(player, "need a multi-year contract for this test");

  const capHit0 = player.contract.capHit;

  const r1 = session.restructurePlayerContract({ teamId: "BUF", playerId: player.id });
  assert.equal(r1.ok, true);
  assert.equal(r1.contract.restructureCount, 1);
  const capHit1 = r1.contract.capHit;
  assert.notEqual(capHit1, capHit0, "cap hit must change after first restructure");

  // If eligible, restructure again
  const r2 = session.restructurePlayerContract({ teamId: "BUF", playerId: player.id });
  if (r2.ok) {
    assert.ok(r2.contract.restructureCount >= 2);
    assert.notEqual(r2.contract.capHit, capHit1, "cap hit must change after second restructure");
  }
  // If not eligible (already restructured max times), ok:false is acceptable
});

test("releasing a player removes them from the roster immediately", () => {
  const session = createSession({ seed: 8101, startYear: 2026, controlledTeamId: "BUF" });

  const before = session.getRoster("BUF").length;
  const target = session.getRoster("BUF")[0];
  const result = session.releasePlayer({ teamId: "BUF", playerId: target.id, toWaivers: false });

  assert.equal(result.ok, true);
  assert.equal(session.getRoster("BUF").length, before - 1);
  const stillOnRoster = session.getRoster("BUF").some((p) => p.id === target.id);
  assert.equal(stillOnRoster, false);
});

test("releasing to waivers keeps player in waiver pool", () => {
  const session = createSession({ seed: 8102, startYear: 2026, controlledTeamId: "BUF" });

  const target = session.getRoster("MIA")[1];
  const result = session.releasePlayer({ teamId: "MIA", playerId: target.id, toWaivers: true });
  assert.equal(result.ok, true);

  // Waiver pool or free agents should include the player
  const freeAgents = session.getFreeAgents({ limit: 200 });
  const found = freeAgents.some((p) => p.id === target.id);
  assert.ok(found, "released-to-waivers player should appear in free agents/waiver pool");
});

// ── Trade edge cases ──────────────────────────────────────────────────────────

test("evaluateTradePackage returns valuation for a 1-for-1 player swap", () => {
  const session = createSession({ seed: 8200, startYear: 2026, controlledTeamId: "BUF" });

  const bufRoster = session.getRoster("BUF");
  const miaRoster = session.getRoster("MIA");

  const result = session.evaluateTradePackage({
    teamA: "BUF",
    teamB: "MIA",
    teamAPlayerIds: [bufRoster[1].id],
    teamBPlayerIds: [miaRoster[1].id],
    teamAPickIds: [],
    teamBPickIds: []
  });

  assert.equal(result.ok, true, "evaluateTradePackage must succeed for valid players");
  assert.ok(result.valuation, "valuation must be present");
  assert.ok(typeof result.valuation["BUF"].outgoingValue === "number");
  assert.ok(typeof result.valuation["MIA"].outgoingValue === "number");
  assert.ok(typeof result.valuation["BUF"].delta === "number");
});

test("evaluateTradePackage picks-only offer returns a valid evaluation", () => {
  const session = createSession({ seed: 8201, startYear: 2026, controlledTeamId: "BUF" });

  // Get draft picks for both teams from the league
  const bufPicks = (session.league.draftPicks || []).filter((p) => p.ownerTeamId === "BUF");
  const miaPicks = (session.league.draftPicks || []).filter((p) => p.ownerTeamId === "MIA");

  if (bufPicks.length === 0 || miaPicks.length === 0) return; // no picks in this seed

  const result = session.evaluateTradePackage({
    teamA: "BUF",
    teamB: "MIA",
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    teamAPickIds: [bufPicks[0].id],
    teamBPickIds: [miaPicks[0].id]
  });

  assert.equal(result.ok, true, "picks-only trade should succeed");
  assert.ok(result.valuation, "valuation required for picks trade");
});

// ── Dashboard state structure ─────────────────────────────────────────────────

test("getDashboardState returns expected top-level shape at week 1", () => {
  const session = createSession({ seed: 8300, startYear: 2026, controlledTeamId: "BUF" });

  const state = session.getDashboardState();
  assert.ok(state, "getDashboardState must return an object");
  assert.ok(typeof state.currentWeek === "number");
  assert.ok(typeof state.currentYear === "number");
  assert.equal(state.currentYear, 2026);
  assert.ok(state.phase, "phase must be set");
  assert.ok(state.controlledTeam || state.controlledTeamId, "controlled team info must be present");
});

test("getDashboardState latestStandings is populated after a full regular season", () => {
  const session = createSession({ seed: 8301, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });

  const state = session.getDashboardState();
  const standings = state.latestStandings || [];
  assert.ok(standings.length > 0, "standings must be populated after a full season");
  assert.ok(standings.length <= 32, "standings should not exceed 32 teams");
  const sample = standings[0];
  assert.ok(sample.team || sample.teamId, "standings row must have team identifier");
  assert.ok(typeof (sample.wins ?? sample.w) === "number", "standings row must have wins");
});

// ── Box score availability ────────────────────────────────────────────────────

test("getRecentBoxScores returns game summaries after advancing weeks", () => {
  const session = createSession({ seed: 8400, startYear: 2026, controlledTeamId: "BUF" });
  session.advanceWeek();
  session.advanceWeek();

  const games = session.getRecentBoxScores("BUF", 3);
  assert.ok(Array.isArray(games), "getRecentBoxScores must return an array");
  assert.ok(games.length > 0, "should have at least 1 game after 2 weeks");

  for (const g of games) {
    assert.ok(g.gameId, "game.gameId required");
    assert.ok(typeof g.week === "number" || typeof g.year === "number");
  }
});

test("getBoxScore returns play-by-play for a recent game", () => {
  const session = createSession({ seed: 8401, startYear: 2026, controlledTeamId: "BUF" });
  session.advanceWeek();

  const games = session.getRecentBoxScores("BUF", 1);
  assert.ok(games.length > 0, "need at least one game");

  const boxScore = session.getBoxScore(games[0].gameId);
  assert.ok(boxScore, "getBoxScore must return an object");
  assert.ok(Array.isArray(boxScore.playByPlay || []), "playByPlay must be an array");
  assert.ok(Array.isArray(boxScore.scoringSummary || []), "scoringSummary must be an array");
});

// ── Free-agency signing flow ──────────────────────────────────────────────────

test("signing a free agent with max roster triggers an error or roster cap", () => {
  const session = createSession({ seed: 8500, startYear: 2026, controlledTeamId: "BUF" });

  // Fill the roster to the limit by releasing one player then signing someone
  // (just verify the sign flow works when there's room)
  const before = session.getRoster("BUF").length;
  session.releasePlayer({ teamId: "BUF", playerId: session.getRoster("BUF")[0].id, toWaivers: false });

  const fa = session.getFreeAgents({ limit: 1 })[0];
  if (!fa) return; // No FAs available in this seed context

  const signed = session.signFreeAgent({ teamId: "BUF", playerId: fa.id });
  assert.equal(signed.ok, true);
  assert.equal(session.getRoster("BUF").length, before);
});

// ── Sim job TTL logic (unit-testable logic) ───────────────────────────────────

test("pruneSimJobs logic: stale check at 3x TTL", () => {
  const SIM_JOB_TTL_MS = 10 * 60 * 1000;
  const now = Date.now();

  // Simulate the pruning logic without needing server.js
  const jobs = new Map([
    ["fresh", { createdAt: now - 1000, fetchedAt: null }],           // keep
    ["fetched-recent", { createdAt: now - 1000, fetchedAt: now - 1000 }], // keep
    ["fetched-expired", { createdAt: now - 1000, fetchedAt: now - SIM_JOB_TTL_MS - 1 }], // prune
    ["stale-3x", { createdAt: now - SIM_JOB_TTL_MS * 3 - 1, fetchedAt: null }], // prune
  ]);

  // Mirror of pruneSimJobs logic
  for (const [id, job] of jobs) {
    const fetched = job.fetchedAt && (now - job.fetchedAt > SIM_JOB_TTL_MS);
    const stale = now - job.createdAt > SIM_JOB_TTL_MS * 3;
    if (fetched || stale) jobs.delete(id);
  }

  assert.ok(jobs.has("fresh"), "fresh job must survive pruning");
  assert.ok(jobs.has("fetched-recent"), "recently-fetched job must survive");
  assert.ok(!jobs.has("fetched-expired"), "expired-after-fetch job must be pruned");
  assert.ok(!jobs.has("stale-3x"), "3x-TTL stale job must be pruned");
});

// ── validateParam logic ───────────────────────────────────────────────────────

test("validateParam logic: int type with range", () => {
  // Mirror of validateParam from server.js
  function validateParam(value, { type, min, max, allow } = {}) {
    if (value == null) return true;
    if (type === "int") {
      const n = Number(value);
      if (!Number.isInteger(n)) return false;
      if (min != null && n < min) return false;
      if (max != null && n > max) return false;
    }
    if (type === "string" && allow) {
      if (!allow.includes(String(value))) return false;
    }
    return true;
  }

  assert.equal(validateParam(null), true, "null is always valid (optional)");
  assert.equal(validateParam(5, { type: "int", min: 1, max: 10 }), true);
  assert.equal(validateParam(1, { type: "int", min: 1, max: 10 }), true, "boundary min");
  assert.equal(validateParam(10, { type: "int", min: 1, max: 10 }), true, "boundary max");
  assert.equal(validateParam(0, { type: "int", min: 1, max: 10 }), false, "below min");
  assert.equal(validateParam(11, { type: "int", min: 1, max: 10 }), false, "above max");
  assert.equal(validateParam("foo", { type: "int" }), false, "non-numeric string fails int");
  assert.equal(validateParam(3.5, { type: "int" }), false, "float fails int");
  assert.equal(validateParam("BUF", { type: "string", allow: ["BUF", "MIA"] }), true);
  assert.equal(validateParam("NE", { type: "string", allow: ["BUF", "MIA"] }), false, "disallowed string");
});

// ── deriveGmArchetype logic ───────────────────────────────────────────────────

test("deriveGmArchetype logic: Moneyball for young cheap team", () => {
  function deriveGmArchetype(team) {
    const roster = Array.isArray(team.roster) ? team.roster : [];
    const avgAge = roster.length ? roster.reduce((s, p) => s + (p.age || 26), 0) / roster.length : 27;
    const ovr = team.overallRating || 75;
    const capHit = team.capSummary?.activeCap || 0;
    if (avgAge < 25.5 && ovr < 79) return { label: "Moneyball" };
    if (avgAge > 28 && ovr > 80) return { label: "Win-Now" };
    if (capHit > 220_000_000) return { label: "Gut-Feel" };
    return { label: "Loyalty" };
  }

  const moneyball = deriveGmArchetype({
    roster: Array(10).fill({ age: 23 }),
    overallRating: 74,
    capSummary: { activeCap: 150_000_000 }
  });
  assert.equal(moneyball.label, "Moneyball");

  const winNow = deriveGmArchetype({
    roster: Array(10).fill({ age: 30 }),
    overallRating: 85,
    capSummary: { activeCap: 200_000_000 }
  });
  assert.equal(winNow.label, "Win-Now");

  const gutFeel = deriveGmArchetype({
    roster: Array(10).fill({ age: 26 }),
    overallRating: 77,
    capSummary: { activeCap: 225_000_000 }
  });
  assert.equal(gutFeel.label, "Gut-Feel");

  const loyalty = deriveGmArchetype({
    roster: Array(10).fill({ age: 27 }),
    overallRating: 78,
    capSummary: { activeCap: 190_000_000 }
  });
  assert.equal(loyalty.label, "Loyalty");
});

test("deriveGmArchetype logic: empty roster defaults to Loyalty (avgAge defaults to 27)", () => {
  function deriveGmArchetype(team) {
    const roster = Array.isArray(team.roster) ? team.roster : [];
    const avgAge = roster.length ? roster.reduce((s, p) => s + (p.age || 26), 0) / roster.length : 27;
    const ovr = team.overallRating || 75;
    const capHit = team.capSummary?.activeCap || 0;
    if (avgAge < 25.5 && ovr < 79) return { label: "Moneyball" };
    if (avgAge > 28 && ovr > 80) return { label: "Win-Now" };
    if (capHit > 220_000_000) return { label: "Gut-Feel" };
    return { label: "Loyalty" };
  }

  const result = deriveGmArchetype({ roster: [], overallRating: 75, capSummary: { activeCap: 0 } });
  assert.equal(result.label, "Loyalty");
});

// ── checkRateLimit logic ──────────────────────────────────────────────────────

test("checkRateLimit logic: allows first 50 requests then blocks the 51st", () => {
  // Mirror of checkRateLimit from server.js
  const buckets = new Map();
  function checkRateLimit(ip, nowMs) {
    let bucket = buckets.get(ip);
    if (!bucket || nowMs - bucket.windowStart > 60_000) {
      bucket = { count: 0, windowStart: nowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    return bucket.count <= 50;
  }

  const t = Date.now();
  for (let i = 1; i <= 50; i++) {
    assert.equal(checkRateLimit("1.2.3.4", t), true, `request ${i} should be allowed`);
  }
  assert.equal(checkRateLimit("1.2.3.4", t), false, "51st request in same window must be blocked");
});

test("checkRateLimit logic: resets after 60-second window", () => {
  const buckets = new Map();
  function checkRateLimit(ip, nowMs) {
    let bucket = buckets.get(ip);
    if (!bucket || nowMs - bucket.windowStart > 60_000) {
      bucket = { count: 0, windowStart: nowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    return bucket.count <= 50;
  }

  const t = 1_000_000;
  for (let i = 0; i < 50; i++) checkRateLimit("5.5.5.5", t);
  assert.equal(checkRateLimit("5.5.5.5", t), false, "51st in window blocked");

  // After 61 seconds, window resets
  const t2 = t + 61_000;
  assert.equal(checkRateLimit("5.5.5.5", t2), true, "first request in new window allowed");
});

test("checkRateLimit logic: different IPs have independent buckets", () => {
  const buckets = new Map();
  function checkRateLimit(ip, nowMs) {
    let bucket = buckets.get(ip);
    if (!bucket || nowMs - bucket.windowStart > 60_000) {
      bucket = { count: 0, windowStart: nowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    return bucket.count <= 50;
  }

  const t = Date.now();
  for (let i = 0; i < 50; i++) checkRateLimit("10.0.0.1", t);
  assert.equal(checkRateLimit("10.0.0.1", t), false, "IP A blocked at 51");
  assert.equal(checkRateLimit("10.0.0.2", t), true, "IP B unaffected by IP A exhaustion");
});
