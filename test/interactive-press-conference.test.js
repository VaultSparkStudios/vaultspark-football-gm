import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PRESS_RESPONSE_CATALOG,
  PRESS_RESPONSE_IDS,
  openPressQuestion,
  answerPressQuestion,
  getPendingPressQuestion,
  getPressReceipts,
  getLastPressResponse,
  describeEffects
} from "../src/engine/pressRoom.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

const CONTROLLED = "BUF";

function fakeLeague() {
  return {
    teams: [
      { id: "BUF", chemistry: 70, owner: { patience: 0.55, fanInterest: 70 } },
      { id: "NYJ", chemistry: 70, owner: { patience: 0.55, fanInterest: 70 } }
    ]
  };
}

function openLoss(league, overrides = {}) {
  return openPressQuestion(league, {
    teamId: "BUF", year: 2026, week: 4, isWin: false, margin: 24,
    streak: -2, opponent: "NYJ", score: "10–34", topPerformer: null, ...overrides
  });
}

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(String(k), String(v)); },
    removeItem(k) { data.delete(String(k)); }
  };
}

// ── The catalog ───────────────────────────────────────────────────────────────

test("three postures are offered, plus an honest skip", () => {
  assert.deepEqual(PRESS_RESPONSE_IDS, ["back-the-room", "take-the-blame", "put-on-notice"]);
  assert.ok(PRESS_RESPONSE_CATALOG.decline, "declining must be a real, catalogued choice");
  for (const id of [...PRESS_RESPONSE_IDS, "decline"]) {
    const response = PRESS_RESPONSE_CATALOG[id];
    assert.ok(response.quote.win && response.quote.loss, `${id} must have a line for both outcomes`);
    assert.ok(response.effects.win && response.effects.loss, `${id} must have effects for both outcomes`);
    assert.ok(response.reasons.win && response.reasons.loss, `${id} must explain itself`);
  }
});

test("skipping is never a silent no-op — it costs something and says so", () => {
  const decline = PRESS_RESPONSE_CATALOG.decline;
  assert.ok(decline.effects.loss.fanInterest < 0, "saying nothing after a loss must cost something");
  assert.ok(decline.effects.loss.patience < 0);
  assert.notEqual(describeEffects(decline.effects.loss), "no measurable movement");
});

test("the three postures pull in genuinely different directions", () => {
  const loyal = PRESS_RESPONSE_CATALOG["back-the-room"].effects.loss;
  const accountable = PRESS_RESPONSE_CATALOG["take-the-blame"].effects.loss;
  const demanding = PRESS_RESPONSE_CATALOG["put-on-notice"].effects.loss;

  assert.ok(loyal.chemistry > 0 && loyal.patience < 0, "backing the room buys the locker room and costs the owner");
  assert.ok(accountable.patience > 0, "accountability buys owner patience");
  assert.ok(demanding.chemistry < 0 && demanding.fanInterest > 0, "notice costs the room and plays to the crowd");
  // If two options were strictly better than a third, there would be no decision.
  assert.notDeepEqual(loyal, accountable);
  assert.notDeepEqual(accountable, demanding);
});

test("effect descriptions state real numbers rather than vague copy", () => {
  assert.match(describeEffects({ chemistry: 3, fanInterest: -1, patience: -0.012 }), /locker room \+3/);
  assert.match(describeEffects({ chemistry: 3, fanInterest: -1, patience: -0.012 }), /fans -1/);
  assert.match(describeEffects({ chemistry: 3, fanInterest: -1, patience: -0.012 }), /owner -1\.2/);
  assert.equal(describeEffects({}), "no measurable movement");
});

// ── Opening the question ──────────────────────────────────────────────────────

test("the question is phrased from the actual result", () => {
  const league = fakeLeague();
  const blowout = openLoss(league);
  assert.match(blowout.question, /24-point loss to NYJ/);
  assert.equal(blowout.options.length, 3);
  assert.ok(blowout.skip);

  const league2 = fakeLeague();
  const skid = openPressQuestion(league2, {
    teamId: "BUF", year: 2026, week: 9, isWin: false, margin: 3, streak: -4, opponent: "MIA", score: "17–20"
  });
  assert.match(skid.question, /4 straight/);
});

test("opening is idempotent and never reopens an answered question", () => {
  const league = fakeLeague();
  const first = openLoss(league);
  const again = openLoss(league);
  assert.equal(again.id, first.id, "re-opening the same week returns the same question");

  answerPressQuestion(league, { teamId: "BUF", responseId: "take-the-blame" });
  assert.equal(openLoss(league), null, "an answered week must not reopen");
  assert.equal(getPendingPressQuestion(league, "BUF"), null);
});

test("a pending question belongs to exactly one franchise", () => {
  const league = fakeLeague();
  openLoss(league);
  assert.ok(getPendingPressQuestion(league, "BUF"));
  assert.equal(getPendingPressQuestion(league, "NYJ"), null);
});

// ── Answering, and its consequences ───────────────────────────────────────────

test("answering moves owner patience, fan interest and chemistry, with receipts", () => {
  const league = fakeLeague();
  const team = league.teams[0];
  openLoss(league);

  const result = answerPressQuestion(league, { teamId: "BUF", responseId: "take-the-blame" });
  assert.equal(result.ok, true);
  assert.ok(team.chemistry > 70, "owning the loss steadies the room");
  assert.ok(team.owner.patience > 0.55, "and buys owner patience");
  assert.ok(team.owner.fanInterest < 70, "at a cost with the fans");

  const [receipt] = getPressReceipts(league);
  assert.equal(receipt.responseId, "take-the-blame");
  assert.ok(receipt.reasons.length > 0, "every movement must name its reason");
  assert.ok(receipt.reasons.some((line) => /owned the loss in public/.test(line)));
});

test("consequences are bounded and clamped at the edges", () => {
  const league = fakeLeague();
  league.teams[0].chemistry = 99;
  league.teams[0].owner.patience = 0.94;
  league.teams[0].owner.fanInterest = 99;

  openPressQuestion(league, {
    teamId: "BUF", year: 2026, week: 2, isWin: true, margin: 30, streak: 3, opponent: "NYJ", score: "40–10"
  });
  answerPressQuestion(league, { teamId: "BUF", responseId: "put-on-notice" });

  assert.ok(league.teams[0].chemistry <= 100 && league.teams[0].chemistry >= 0);
  assert.ok(league.teams[0].owner.patience <= 0.95);
  assert.ok(league.teams[0].owner.fanInterest <= 100);
});

test("answering is deterministic — same state and choice, same numbers", () => {
  const run = () => {
    const league = fakeLeague();
    openLoss(league);
    answerPressQuestion(league, { teamId: "BUF", responseId: "put-on-notice" });
    const team = league.teams[0];
    return [team.chemistry, team.owner.patience, team.owner.fanInterest];
  };
  assert.deepEqual(run(), run());
});

test("a stale question is rejected instead of applying to the wrong game", () => {
  const league = fakeLeague();
  const pending = openLoss(league);
  const stale = answerPressQuestion(league, {
    teamId: "BUF", responseId: "take-the-blame", questionId: `${pending.id}-old`
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reasonCode, "press-stale-question");
  assert.ok(getPendingPressQuestion(league, "BUF"), "a rejected answer must leave the question open");
});

test("answering rejects an unknown response, another franchise, and an empty podium", () => {
  const league = fakeLeague();
  assert.equal(answerPressQuestion(league, { teamId: "BUF", responseId: "back-the-room" }).reasonCode, "press-no-pending");

  openLoss(league);
  assert.equal(answerPressQuestion(league, { teamId: "NYJ", responseId: "back-the-room" }).reasonCode, "press-wrong-team");
  assert.equal(answerPressQuestion(league, { teamId: "BUF", responseId: "nonsense" }).reasonCode, "press-unknown-response");
  assert.ok(getPendingPressQuestion(league, "BUF"), "no failed answer consumes the question");
});

// ── The promise: the whole point ──────────────────────────────────────────────

test("a promise is only made after a loss — posturing after a win is not a debt", () => {
  const lost = fakeLeague();
  openLoss(lost);
  assert.equal(answerPressQuestion(lost, { teamId: "BUF", responseId: "put-on-notice" }).promised, true);

  const won = fakeLeague();
  openPressQuestion(won, {
    teamId: "BUF", year: 2026, week: 4, isWin: true, margin: 24, streak: 2, opponent: "NYJ", score: "34–10"
  });
  assert.equal(answerPressQuestion(won, { teamId: "BUF", responseId: "put-on-notice" }).promised, false);
});

test("backing the room makes no promise, so nothing can be broken", () => {
  const league = fakeLeague();
  openLoss(league);
  assert.equal(answerPressQuestion(league, { teamId: "BUF", responseId: "back-the-room" }).promised, false);
});

test("last week's answer is remembered only if last week was actually last week", () => {
  const league = fakeLeague();
  openLoss(league); // week 4
  answerPressQuestion(league, { teamId: "BUF", responseId: "put-on-notice" });

  assert.ok(getLastPressResponse(league, { year: 2026, week: 5 }), "the very next week remembers");
  assert.equal(getLastPressResponse(league, { year: 2026, week: 6 }), null, "two weeks later does not");
  assert.equal(getLastPressResponse(league, { year: 2027, week: 5 }), null, "and neither does next season");
});

test("the follow-up quote resolves against the GM's own words, not the engine's tone", async () => {
  const { default: fs } = await import("node:fs");
  const source = fs.readFileSync(new URL("../src/engine/pressConference.js", import.meta.url), "utf8");
  assert.match(source, /getLastPressResponse/, "the follow-up must read the player's answer");
  assert.match(
    source,
    /if \(lastResponse\)/,
    "the player's own answer must take precedence over the inferred engine tone"
  );
});

// ── Live integration ──────────────────────────────────────────────────────────

test("a real season opens a real podium the GM can answer", () => {
  const session = new GameSession({ rng: new RNG(6363), startYear: 2026, controlledTeamId: CONTROLLED, mode: "play" });
  let pending = null;
  for (let week = 0; week < 5 && !pending; week += 1) {
    session.advanceWeek();
    pending = session.getPressRoom().pending;
  }
  assert.ok(pending, "a played controlled-team game must open the podium");
  assert.equal(pending.teamId, CONTROLLED);
  assert.equal(pending.options.length, 3);
  assert.ok(pending.question.length > 10);

  const answered = session.answerPressQuestion({ responseId: "take-the-blame" });
  assert.equal(answered.ok, true, answered.error);
  assert.equal(session.getPressRoom().pending, null);
  assert.equal(session.getPressRoom().receipts[0].responseId, "take-the-blame");
});

test("the dashboard carries the press room so the browser needs no extra fetch", () => {
  const session = new GameSession({ rng: new RNG(2121), startYear: 2026, controlledTeamId: CONTROLLED, mode: "play" });
  session.advanceWeek();
  const dashboard = session.getDashboardState();
  assert.ok(dashboard.pressRoom, "dashboard must expose the press room");
  assert.ok("pending" in dashboard.pressRoom && Array.isArray(dashboard.pressRoom.receipts));
});

test("both adapters serve the podium, and the authority boundary guards it", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => { let t = 0; return () => 1_700_000_000_000 + t++; })(),
    scheduler: (fn) => fn()
  });
  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 6363, startYear: 2026, controlledTeamId: CONTROLLED, mode: "play", eraProfile: "modern" }
  });

  const read = await runtime.request("/api/press-conference");
  assert.equal(read.status, 200);
  assert.equal(read.payload.ok, true);

  // Answering for a rival franchise must be refused by the S63 authority seam.
  const foreign = await runtime.request("/api/press-conference", {
    method: "POST",
    body: { teamId: "NYJ", responseId: "back-the-room" }
  });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.payload.reasonCode, "team-authority");

  // And the route must exist in both adapters, not just this one.
  const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(server, /url\.pathname === "\/api\/press-conference"/);
});

test("answering through the adapter round-trips a fresh dashboard", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => { let t = 0; return () => 1_700_000_000_000 + t++; })(),
    scheduler: (fn) => fn()
  });
  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 5151, startYear: 2026, controlledTeamId: CONTROLLED, mode: "play", eraProfile: "modern" }
  });

  let pending = null;
  for (let week = 0; week < 5 && !pending; week += 1) {
    await runtime.request("/api/advance-week", { method: "POST", body: {} });
    const read = await runtime.request("/api/press-conference");
    pending = read.payload.pending;
  }
  assert.ok(pending, "the adapter must surface a real pending question");

  const answered = await runtime.request("/api/press-conference", {
    method: "POST",
    body: { teamId: CONTROLLED, responseId: "put-on-notice", questionId: pending.id }
  });
  assert.equal(answered.status, 200, answered.payload?.error);
  assert.equal(answered.payload.receipt.responseId, "put-on-notice");
  assert.ok(answered.payload.state, "the response must carry fresh state for the browser");
  assert.equal(answered.payload.pressRoom.pending, null);

  const stale = await runtime.request("/api/press-conference", {
    method: "POST",
    body: { teamId: CONTROLLED, responseId: "put-on-notice", questionId: pending.id }
  });
  assert.equal(stale.status, 400, "the podium is closed; answering again is not a 200");
});
