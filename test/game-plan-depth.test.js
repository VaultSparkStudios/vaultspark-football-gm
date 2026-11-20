/**
 * The weekly game-plan dials: pace, run-pass lean, coverage.
 *
 * Weekly tactics were once silent no-ops for 85 sessions because the plan was
 * rebuilt after the choice was written to it. The dials ride the same
 * staged-and-consumed entry as the tactic (src/runtime/weeklyTactic.js), so
 * every claim here is proved by running the engine:
 *
 *   1. neutral is exactly a no-op — the same box scores, byte for byte;
 *   2. every non-neutral position reaches the simulator through the real
 *      command path and moves its own statistic in the stated direction;
 *   3. a value the game does not know is refused at the command boundary, in
 *      the dev server and in the in-browser runtime alike.
 *
 * Measured sizes. Population: one club against each of the other 31, home and
 * away, 40 games per matchup and venue on a freshly generated league; three
 * leagues (seed 1000 BUF, 2000 CHI, 3000 DEN); 7,440 games per position; CPU
 * clubs neutral; same game seeds for every position. Shift against neutral:
 *
 *   pace      slow          plays -4.5% (both teams)  giveaways -9.3%   PF -4.2% PA -4.5%
 *             hurry-up      plays +4.5% (both teams)  giveaways +8.5%   PF +4.4% PA +4.6%
 *   lean      lean run      rushes +6.2%  passes -3.1%  20+ passes for -2.9%  PF -1.8%
 *             lean pass     rushes -6.3%  passes +3.0%  20+ passes for +2.9%  sacks taken +4.2%
 *   coverage  play it safe  interceptions -9.2%  deep completions allowed -6.5%  PA -0.1%
 *             take chances  interceptions +8.7%  deep completions allowed +6.1%  PA +0.1%
 *
 * Every shift is single-digit: the plan matters at the margin. Turnovers are
 * rare in this engine (about one every three games per club), so their shifts
 * need thousands of games to see and are ordered here only in the large sample.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "../scripts/lib/safe-spawn.mjs";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSession } from "../src/runtime/bootstrap.js";
import { executeAdvanceWeekCommand, validateAdvanceWeekCommand } from "../src/runtime/advanceWeekCommand.js";
import { applyGamePlanDepth, stagePendingWeeklyTactic, consumePendingWeeklyTactic } from "../src/runtime/weeklyTactic.js";
import { simulateMatch } from "../src/engine/gameSimulator.js";
import { NEUTRAL_EFFECTS, gamePlanEffects, possessionRange } from "../src/engine/gamePlanDepth.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { RNG } from "../src/utils/rng.js";
import {
  GAME_PLAN_DIMENSIONS,
  activeGamePlan,
  describeGamePlan,
  neutralGamePlan,
  normalizeGamePlan,
  parseGamePlanRequest
} from "../public/lib/gamePlanDepth.js";
import { composeWeeklyPlan, describeWeeklyPlanReceipt } from "../public/lib/weeklyPlanComposer.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NON_NEUTRAL = GAME_PLAN_DIMENSIONS.flatMap((dimension) =>
  dimension.options.filter((option) => option.id !== dimension.neutral).map((option) => ({ [dimension.key]: option.id }))
);

// ── the declaration ──────────────────────────────────────────────────────────

test("three dials, three positions each, neutral in the middle", () => {
  assert.deepEqual(GAME_PLAN_DIMENSIONS.map((dimension) => dimension.key), ["pace", "lean", "coverage"]);
  for (const dimension of GAME_PLAN_DIMENSIONS) {
    assert.equal(dimension.options.length, 3);
    assert.equal(dimension.options[1].id, dimension.neutral, `${dimension.key}: the neutral position is the middle one`);
    for (const option of dimension.options) {
      assert.ok(option.label && option.trade, `${dimension.key}/${option.id} states what it trades`);
      assert.doesNotMatch(`${option.label} ${option.trade}`, /receipt|thesis|ledger|authority/i);
    }
  }
  assert.equal(NON_NEUTRAL.length, 6);
});

test("anything missing or unknown reads as neutral, and neutral leaves no trace", () => {
  const neutral = neutralGamePlan();
  assert.deepEqual(neutral, { pace: "normal", lean: "balanced", coverage: "balanced" });
  for (const junk of [undefined, null, "hurry-up", 7, [], {}, { pace: "warp" }, { tempo: "hurry-up" }, { pace: 3 }]) {
    assert.deepEqual(normalizeGamePlan(junk), neutral);
    assert.equal(activeGamePlan(junk), null);
  }
  assert.equal(activeGamePlan(neutral), null);
  assert.deepEqual(activeGamePlan({ ...neutral, lean: "lean-run" }), { lean: "lean-run" });
  assert.equal(describeGamePlan(neutral), "");
  assert.equal(describeGamePlan({ pace: "hurry-up", coverage: "safe" }), "pace: hurry-up · coverage: play it safe");
});

test("neutral effects are literal zeros and ones; an old weekly plan reads as neutral", () => {
  for (const plan of [null, undefined, {}, { passLeanDelta: 0.1 }, { gamePlan: null }, { gamePlan: {} }, { gamePlan: neutralGamePlan() }, { gamePlan: { pace: "warp" } }]) {
    assert.equal(gamePlanEffects(plan), NEUTRAL_EFFECTS, "a plan with no dial off neutral returns the shared neutral object");
  }
  for (const [key, value] of Object.entries(NEUTRAL_EFFECTS)) {
    if (key === "active") assert.equal(value, false);
    else if (key.endsWith("Scale")) assert.equal(value, 1, `${key} must scale by exactly 1`);
    else assert.equal(value, 0, `${key} must add exactly 0`);
  }
  assert.deepEqual(possessionRange([10, 12], NEUTRAL_EFFECTS, NEUTRAL_EFFECTS), [10, 12]);
  // Either club's pace moves the drive budget for both.
  const hurry = gamePlanEffects({ gamePlan: { pace: "hurry-up" } });
  const slow = gamePlanEffects({ gamePlan: { pace: "slow" } });
  assert.deepEqual(possessionRange([10, 12], hurry, NEUTRAL_EFFECTS), [10, 13]);
  assert.deepEqual(possessionRange([10, 12], NEUTRAL_EFFECTS, slow), [9, 12]);
  // The other half of the pace trade: a rushed offense is looser with the ball.
  // (Giveaways are too rare to order in a test-sized sample — about one every
  // three games — so the size is recorded from the 7,440-game measurement.)
  assert.ok(hurry.giveawayScale > 1 && hurry.giveawayScale <= 1.1);
  assert.ok(slow.giveawayScale < 1 && slow.giveawayScale >= 0.9);
});

// ── neutral is a no-op ───────────────────────────────────────────────────────

function runWeeks(payloadFor, weeks = 2, seed = 77123) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
  const outcomes = [];
  for (let week = 0; week < weeks; week += 1) {
    const outcome = executeAdvanceWeekCommand(session, payloadFor(week));
    assert.equal(outcome.ok, true, outcome.error);
    outcomes.push(outcome);
  }
  return { session, outcomes };
}

function boxScores(outcomes) {
  return JSON.stringify(outcomes.map((outcome) => outcome.results.map((result) => result.games)));
}

function controlledGames(outcomes, teamId = "BUF") {
  return outcomes.flatMap((outcome) => outcome.results.flatMap((result) => result.games || []))
    .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId);
}

function strategyOf(game, teamId = "BUF") {
  return game.homeTeamId === teamId ? game.homeStrategy : game.awayStrategy;
}

let baselineRun = null;
function baseline() {
  baselineRun ||= runWeeks(() => ({}));
  return baselineRun;
}

test("a neutral game plan produces the same box scores as sending no game plan at all", { timeout: 300_000 }, () => {
  const base = boxScores(baseline().outcomes);
  const explicitNeutral = runWeeks(() => ({ gamePlan: neutralGamePlan() }));
  assert.equal(boxScores(explicitNeutral.outcomes), base, "every dial at its middle must not change a single box score");
  assert.equal(JSON.stringify(explicitNeutral.session.rng), JSON.stringify(baseline().session.rng),
    "and must leave the league's random stream exactly where it was");
  for (const outcome of explicitNeutral.outcomes) {
    assert.equal("gamePlanApplied" in outcome, false, "a neutral plan is not reported as applied");
  }
  for (const game of controlledGames(explicitNeutral.outcomes)) {
    assert.equal(strategyOf(game)?.gamePlan, undefined, "a neutral plan writes nothing onto the weekly plan");
  }
});

test("one game, same seed: a neutral plan object draws the same random numbers as none", () => {
  const session = createSession({ seed: 4411, startYear: 2026, controlledTeamId: "BUF" });
  const play = (decorate) => {
    const team = session.league.teams.find((entry) => entry.id === "BUF");
    team.weeklyPlan = session.buildWeeklyPlan("BUF", "MIA");
    decorate(team.weeklyPlan);
    const rng = new RNG(90210);
    const { result } = simulateMatch({
      league: session.league, statBook: session.statBook, homeTeamId: "BUF", awayTeamId: "MIA",
      year: 2026, week: 2, rng, mode: session.mode
    });
    const { homeStrategy, awayStrategy, ...game } = result;
    return JSON.stringify({ game, next: rng.int(0, 1_000_000) });
  };
  const none = play(() => {});
  assert.equal(play((plan) => { plan.gamePlan = neutralGamePlan(); }), none);
  assert.equal(play((plan) => { plan.gamePlan = {}; }), none);
  assert.equal(play((plan) => applyGamePlanDepth(plan, neutralGamePlan())), none);
  assert.notEqual(play((plan) => applyGamePlanDepth(plan, { pace: "hurry-up" })), none);
});

// ── staged and consumed through the real command path ───────────────────────

test("every non-neutral position reaches the simulator and changes the league result", { timeout: 600_000 }, () => {
  const base = boxScores(baseline().outcomes);
  for (const gamePlan of NON_NEUTRAL) {
    const label = JSON.stringify(gamePlan);
    const run = runWeeks(() => ({ gamePlan }));
    const games = controlledGames(run.outcomes);
    assert.ok(games.length > 0, "the controlled club must have played");
    for (const game of games) {
      // The game result records the weekly plan the simulator actually read.
      assert.deepEqual(strategyOf(game).gamePlan, gamePlan, `${label} was not on the plan the simulator read`);
      const opponentStrategy = game.homeTeamId === "BUF" ? game.awayStrategy : game.homeStrategy;
      assert.equal(opponentStrategy?.gamePlan, undefined, "a CPU club never carries a dial");
    }
    assert.notEqual(boxScores(run.outcomes), base,
      `${label} produced box scores identical to a neutral plan — the choice never reached the simulator`);
    assert.deepEqual(run.outcomes[0].gamePlanApplied, gamePlan);
    assert.equal(run.session.pendingWeeklyTactic ?? null, null, "nothing may stay staged after the advance");
  }
});

test("a dial lasts one week: it is consumed once and never leaks into the next", { timeout: 300_000 }, () => {
  const session = createSession({ seed: 77123, startYear: 2026, controlledTeamId: "BUF" });
  const first = executeAdvanceWeekCommand(session, { gamePlan: { pace: "hurry-up", coverage: "take-chances" }, weeklyTacticOverride: "run-heavy" });
  assert.equal(first.ok, true);
  const played = controlledGames([first])[0];
  assert.deepEqual(strategyOf(played).gamePlan, { pace: "hurry-up", coverage: "take-chances" });
  assert.equal(strategyOf(played).tacticalOverride.id, "run-heavy", "the dials ride beside the tactic, on the same staged entry");
  const team = session.league.teams.find((entry) => entry.id === "BUF");
  assert.equal(team.weeklyPlan?.gamePlan, undefined, "the standing weekly plan is restored after the week");

  const second = executeAdvanceWeekCommand(session, {});
  assert.equal(second.ok, true);
  for (const game of controlledGames([second])) {
    assert.equal(strategyOf(game).gamePlan, undefined, "next week must not inherit last week's dials");
  }
});

test("staging is one entry: dials alone, tactic alone, or both", () => {
  const session = { league: { teams: [{ id: "BUF", weeklyPlan: { passLeanDelta: 0 } }] } };
  stagePendingWeeklyTactic(session, "BUF", null, neutralGamePlan());
  assert.equal(session.pendingWeeklyTactic ?? null, null, "an all-neutral plan stages nothing");
  stagePendingWeeklyTactic(session, "BUF", null, { lean: "lean-pass", pace: "normal" });
  assert.deepEqual(session.pendingWeeklyTactic, { teamId: "BUF", tacticPlan: null, gamePlan: { lean: "lean-pass" } });
  consumePendingWeeklyTactic(session);
  assert.equal(session.pendingWeeklyTactic, null);
  assert.deepEqual(session.league.teams[0].weeklyPlan, { passLeanDelta: 0, gamePlan: { lean: "lean-pass" } });
});

// ── each position moves its own statistic ────────────────────────────────────

// Population: BUF against each of the other 31 clubs, home and away, on one
// freshly generated league (seed 2026), `reps` games per matchup and venue;
// the same game seed is used for every position. CPU clubs are neutral.
let sampleSession = null;
function sample(gamePlan, reps) {
  sampleSession ||= createSession({ seed: 2026, startYear: 2026, controlledTeamId: "BUF" });
  const session = sampleSession;
  const league = session.league;
  const me = league.teams.find((team) => team.id === "BUF");
  const totals = { games: 0, plays: 0, rush: 0, pass: 0, giveaways: 0, interceptionsMade: 0, deepCompletionsAllowed: 0, bigPassesAllowed: 0, shortCompletionsAllowed: 0 };
  league.teams.forEach((opponent, index) => {
    if (opponent.id === "BUF") return;
    for (const home of [true, false]) {
      for (let rep = 0; rep < reps; rep += 1) {
        me.weeklyPlan = session.buildWeeklyPlan("BUF", opponent.id);
        opponent.weeklyPlan = session.buildWeeklyPlan(opponent.id, "BUF");
        applyGamePlanDepth(me.weeklyPlan, gamePlan);
        const { result: game } = simulateMatch({
          league, statBook: session.statBook,
          homeTeamId: home ? "BUF" : opponent.id, awayTeamId: home ? opponent.id : "BUF",
          year: 2026, week: 2, rng: new RNG(500_000 + index * 1009 + (home ? 7 : 13) + rep * 31), mode: session.mode
        });
        const side = home ? "home" : "away";
        const other = home ? "away" : "home";
        const plays = game.boxScore.playByPlay;
        const count = (offense, predicate) => plays.filter((play) => play.offenseTeamId === offense && predicate(play)).length;
        totals.games += 1;
        totals.rush += game[`${side}RushPlays`];
        totals.pass += game[`${side}PassPlays`];
        totals.plays += game[`${side}RushPlays`] + game[`${side}PassPlays`] + game[`${other}RushPlays`] + game[`${other}PassPlays`];
        totals.giveaways += count("BUF", (play) => play.type === "interception" || play.type === "fumble");
        totals.interceptionsMade += count(opponent.id, (play) => play.type === "interception");
        totals.deepCompletionsAllowed += count(opponent.id, (play) => play.type === "pass" && play.depthBucket === "deep");
        totals.shortCompletionsAllowed += count(opponent.id, (play) => play.type === "pass" && play.depthBucket === "short");
        totals.bigPassesAllowed += count(opponent.id, (play) => play.type === "pass" && Number(play.yards) >= 20);
      }
    }
  });
  return totals;
}

const SAMPLE_REPS = Object.freeze({ small: 4, large: 40 });
const sampleCache = new Map();
function measured(gamePlan, size) {
  const key = `${size}:${JSON.stringify(gamePlan)}`;
  if (!sampleCache.has(key)) sampleCache.set(key, sample(gamePlan, SAMPLE_REPS[size]));
  return sampleCache.get(key);
}

function assertOrdered(low, middle, high, pick, label, { minShift = 0.01, maxShift = 0.25 } = {}) {
  const [a, b, c] = [low, middle, high].map(pick);
  assert.ok(a < b && b < c, `${label}: expected ${a} < ${b} < ${c}`);
  for (const [name, value] of [["low", a], ["high", c]]) {
    const shift = Math.abs(value / b - 1);
    assert.ok(shift >= minShift, `${label}: the ${name} position moved only ${(shift * 100).toFixed(1)}% — not a measurable lever`);
    assert.ok(shift <= maxShift, `${label}: the ${name} position moved ${(shift * 100).toFixed(1)}% — the plan should matter at the margin`);
  }
}

test("pace: slow it down means fewer plays for both teams, hurry-up means more", { timeout: 300_000 }, () => {
  const slow = measured({ pace: "slow" }, "small");
  const normal = measured(null, "small");
  const hurry = measured({ pace: "hurry-up" }, "small");
  assert.equal(slow.games, 248);
  assertOrdered(slow, normal, hurry, (row) => row.plays, "plays per game, both teams", { maxShift: 0.09 });
});

test("run-pass lean: lean run means more carries and fewer throws, lean pass the reverse", { timeout: 300_000 }, () => {
  const run = measured({ lean: "lean-run" }, "small");
  const balanced = measured(null, "small");
  const pass = measured({ lean: "lean-pass" }, "small");
  assertOrdered(pass, balanced, run, (row) => row.rush, "rush attempts");
  assertOrdered(run, balanced, pass, (row) => row.pass, "pass attempts", { maxShift: 0.09 });
  // The lean moves the mix, not the volume.
  const total = (row) => row.rush + row.pass;
  assert.ok(Math.abs(total(run) / total(balanced) - 1) < 0.02);
  assert.ok(Math.abs(total(pass) / total(balanced) - 1) < 0.02);
});

test("coverage: take chances buys interceptions with deep completions; play it safe is the reverse", { timeout: 900_000 }, () => {
  const safe = measured({ coverage: "safe" }, "large");
  const balanced = measured(null, "large");
  const chances = measured({ coverage: "take-chances" }, "large");
  assert.equal(balanced.games, 2480);
  assertOrdered(safe, balanced, chances, (row) => row.interceptionsMade, "interceptions made", { minShift: 0.03 });
  assertOrdered(safe, balanced, chances, (row) => row.deepCompletionsAllowed, "deep completions allowed");
  assertOrdered(safe, balanced, chances, (row) => row.bigPassesAllowed, "20+ yard passes allowed", { minShift: 0.005 });
  // The other side of the trade: tight coverage underneath when taking chances.
  assert.ok(chances.shortCompletionsAllowed < balanced.shortCompletionsAllowed);
  assert.ok(safe.shortCompletionsAllowed > balanced.shortCompletionsAllowed);
});

// ── the command boundary ─────────────────────────────────────────────────────

const INVALID_GAME_PLANS = Object.freeze([
  { pace: "warp-speed" },
  { lean: "lean-run", coverage: "gamble-everything" },
  { tempo: "hurry-up" },
  { pace: 2 },
  { pace: { id: "slow" } },
  "hurry-up",
  ["hurry-up"],
  7
]);

test("the plan request parser refuses what it does not know and accepts every declared position", () => {
  for (const invalid of INVALID_GAME_PLANS) {
    const parsed = parseGamePlanRequest(invalid);
    assert.equal(parsed.ok, false, `${JSON.stringify(invalid)} must be refused`);
    assert.ok(parsed.error.length > 0);
    assert.doesNotMatch(parsed.error, /receipt|thesis|ledger|authority/i);
  }
  assert.deepEqual(parseGamePlanRequest(undefined), { ok: true, gamePlan: null });
  assert.deepEqual(parseGamePlanRequest(null), { ok: true, gamePlan: null });
  assert.deepEqual(parseGamePlanRequest({}), { ok: true, gamePlan: null });
  assert.deepEqual(parseGamePlanRequest({ pace: null, lean: "balanced" }), { ok: true, gamePlan: null });
  for (const gamePlan of NON_NEUTRAL) assert.deepEqual(parseGamePlanRequest(gamePlan), { ok: true, gamePlan });
});

test("the advance-week command refuses an unknown game plan before anything moves", () => {
  const session = createSession({ seed: 77123, startYear: 2026, controlledTeamId: "BUF" });
  const before = { week: session.currentWeek, rng: JSON.stringify(session.rng) };
  for (const invalid of INVALID_GAME_PLANS) {
    const outcome = executeAdvanceWeekCommand(session, { count: 1, gamePlan: invalid });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.status, 400);
    assert.equal(outcome.reasonCode, "ADVANCE_WEEK_UNKNOWN_GAME_PLAN");
  }
  assert.equal(session.currentWeek, before.week);
  assert.equal(JSON.stringify(session.rng), before.rng, "a refused plan must not touch the league");
  assert.equal(session.pendingWeeklyTactic ?? null, null);
  const valid = validateAdvanceWeekCommand(session, { gamePlan: { pace: "slow", lean: "balanced" } });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.gamePlan, { pace: "slow" });
  assert.equal("gamePlan" in validateAdvanceWeekCommand(session, { gamePlan: neutralGamePlan() }), false);
});

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

async function startServer() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())));
  const saveDir = await fs.mkdtemp(path.join(os.tmpdir(), "franchise-game-plan-"));
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), VSFGM_RATE_LIMIT_PER_MIN: "1000", VSFGM_SAVE_DIR: saveDir },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const deadline = Date.now() + 60_000;
  while (!output.includes("running at http://localhost:")) {
    if (child.exitCode != null) throw new Error(`server exited early: ${output}`);
    if (Date.now() > deadline) { child.kill(); throw new Error(`server start timeout: ${output}`); }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return {
    // One connection per request (agent: false). The in-browser runtime is
    // exercised between server calls, and a kept-alive socket the server has
    // since idled out would fail the next request for reasons unrelated to
    // the plan.
    request(route, options = {}) {
      return new Promise((resolve, reject) => {
        const body = options.body ? JSON.stringify(options.body) : null;
        const request = http.request({
          host: "127.0.0.1", port, path: route, method: options.method || "GET", agent: false,
          headers: { "Content-Type": "application/json", ...(body ? { "Content-Length": Buffer.byteLength(body) } : null) }
        }, (response) => {
          let text = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => { text += chunk; });
          response.on("end", () => {
            try { resolve({ status: response.statusCode, payload: JSON.parse(text) }); } catch (error) { reject(error); }
          });
        });
        request.on("error", reject);
        request.end(body || undefined);
      });
    },
    async close() {
      if (child.exitCode == null) {
        child.kill();
        await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000).unref?.())]);
      }
      if (child.exitCode == null) child.kill("SIGKILL");
      await fs.rm(saveDir, { recursive: true, force: true });
    }
  };
}

test("both runtimes refuse an unknown game plan and accept a real one, identically", { timeout: 300_000 }, async () => {
  const local = createLocalApiRuntime({ storage: memoryStorage(), scheduler: (fn) => fn() });
  const server = await startServer();
  try {
    const transports = [["in-browser runtime", local], ["dev server", server]];
    const league = { method: "POST", body: { seed: 77123, startYear: 2026, controlledTeamId: "BUF", mode: "play" } };
    for (const [name, transport] of transports) {
      const created = await transport.request("/api/new-league", league);
      assert.equal(created.status, 200, `${name}: new league`);
    }

    // One of each kind of bad input; the full list is refused at the shared
    // command seam above, which both transports call with the body as sent.
    for (const invalid of [{ pace: "warp-speed" }, { tempo: "hurry-up" }, "hurry-up", ["hurry-up"]]) {
      const responses = [];
      for (const [name, transport] of transports) {
        const refused = await transport.request("/api/advance-week", { method: "POST", body: { count: 1, gamePlan: invalid } });
        assert.equal(refused.status, 400, `${name}: ${JSON.stringify(invalid)} must be refused`);
        assert.equal(refused.payload.ok, false);
        assert.equal(refused.payload.reasonCode, "ADVANCE_WEEK_UNKNOWN_GAME_PLAN");
        responses.push(refused.payload);
      }
      assert.deepEqual(responses[0], responses[1], "both runtimes give the same refusal");
    }
    for (const [name, transport] of transports) {
      const state = await transport.request("/api/state");
      assert.equal(state.payload.currentWeek, 1, `${name}: a refused plan must not advance the week`);
    }

    const gamePlan = { pace: "hurry-up", lean: "lean-run", coverage: "safe" };
    const accepted = [];
    for (const [name, transport] of transports) {
      const advanced = await transport.request("/api/advance-week", { method: "POST", body: { count: 1, gamePlan } });
      assert.equal(advanced.status, 200, `${name}: ${advanced.payload.error || ""}`);
      assert.deepEqual(advanced.payload.gamePlanApplied, gamePlan);
      assert.equal(advanced.payload.state.currentWeek, 2);
      const game = controlledGames([advanced.payload])[0];
      assert.deepEqual(strategyOf(game).gamePlan, gamePlan, `${name}: the simulator read the plan`);
      accepted.push(`${game.homeTeamId} ${game.homeScore}-${game.awayScore} ${game.awayTeamId} ${game.homeRushPlays}/${game.homePassPlays}`);
    }
    assert.equal(accepted[0], accepted[1], "the same plan on the same seed plays the same game in both runtimes");
  } finally {
    await server.close();
  }
});

// ── the plan modal's contract with the request ───────────────────────────────

// What public/lib/gamePlanDials.js hands the composer for a modal selection.
function modalSelection(selection) {
  const dials = activeGamePlan(selection);
  return dials ? { dials, summary: describeGamePlan(dials) } : null;
}

test("the composed weekly plan sends only the dials moved off neutral and names them in the summary line", async () => {
  const withDials = await composeWeeklyPlan({
    phase: "regular-season",
    collectTactic: async () => "run-heavy",
    collectGamePlan: () => modalSelection({ pace: "hurry-up", lean: "balanced", coverage: "take-chances" })
  });
  assert.deepEqual(withDials.body, { count: 1, weeklyTacticOverride: "run-heavy", gamePlan: { pace: "hurry-up", coverage: "take-chances" } });
  assert.deepEqual(withDials.receipt.plan.gamePlan, { pace: "hurry-up", coverage: "take-chances" });
  const summary = describeWeeklyPlanReceipt(withDials.receipt);
  assert.match(summary.detail, /tactic: run heavy · pace: hurry-up · coverage: take chances/);
  assert.doesNotMatch(summary.detail, /receipt|thesis|ledger|authority/i);

  const dialsOnly = await composeWeeklyPlan({
    phase: "regular-season",
    collectTactic: async () => null,
    collectGamePlan: async () => modalSelection({ lean: "lean-pass" })
  });
  assert.deepEqual(dialsOnly.body, { count: 1, gamePlan: { lean: "lean-pass" } });
  assert.match(describeWeeklyPlanReceipt(dialsOnly.receipt).detail, /run-pass lean: lean pass/);
  // What the composer sends is exactly what the command boundary accepts.
  assert.deepEqual(parseGamePlanRequest(dialsOnly.body.gamePlan), { ok: true, gamePlan: { lean: "lean-pass" } });

  for (const nothing of [modalSelection(neutralGamePlan()), null, undefined, {}, { dials: {} }, { dials: [] }]) {
    const neutral = await composeWeeklyPlan({
      phase: "regular-season",
      collectTactic: async () => "run-heavy",
      collectGamePlan: () => nothing
    });
    assert.deepEqual(neutral.body, { count: 1, weeklyTacticOverride: "run-heavy" });
    assert.equal("gamePlan" in neutral.receipt.plan, false);
    assert.doesNotMatch(describeWeeklyPlanReceipt(neutral.receipt).detail, /pace|lean|coverage/);
  }
});

test("the dials load on demand: the boot graph carries the choice, never the table", async () => {
  const read = (relative) => fs.readFile(new URL(relative, import.meta.url), "utf8");
  const [composer, flow, app, html, manifest] = await Promise.all([
    read("../public/lib/weeklyPlanComposer.js"),
    read("../public/lib/gameFlow.js"),
    read("../public/app.js"),
    read("../public/game.html"),
    read("../public/boot-manifest.json")
  ]);
  for (const [name, source] of [["weeklyPlanComposer.js", composer], ["gameFlow.js", flow], ["app.js", app]]) {
    assert.doesNotMatch(source, /^import [^;]*gamePlanD(?:epth|ials)\.js/m, `${name} must not import the dials statically`);
  }
  assert.match(flow, /import\("\.\/gamePlanDials\.js"\)/);
  assert.match(app, /import\("\.\/lib\/gamePlanDials\.js"\)/);
  assert.match(app, /gamePlanDials: true/, "the weekly plan asks for the dials");
  assert.equal((app.match(/gamePlanDials: true/g) || []).length, 1, "only the weekly plan — not the multi-week auto-plan");
  assert.match(html, /<div id="gamePlanDepth" class="game-plan-depth"[^>]* hidden><\/div>/);
  const lazyRoots = JSON.parse(manifest).lazyRoots;
  assert.ok(lazyRoots.includes("lib/gamePlanDials.js") && lazyRoots.includes("lib/gamePlanDepth.js"));
});

test("the opening week and a bye stay neutral: the dials are never read", async () => {
  let asked = 0;
  const collectGamePlan = () => { asked += 1; return modalSelection({ pace: "hurry-up" }); };
  const opening = await composeWeeklyPlan({ phase: "regular-season", openingWeek: true, collectGamePlan });
  assert.deepEqual(opening.body, { count: 1 });
  const bye = await composeWeeklyPlan({ phase: "regular-season", onBye: true, collectGamePlan });
  assert.deepEqual(bye.body, { count: 1 });
  assert.equal(asked, 0);
  assert.equal("gamePlan" in opening.receipt.plan, false);
});
