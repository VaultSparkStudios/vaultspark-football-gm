import test from "node:test";
import assert from "node:assert/strict";
import { RNG } from "../src/utils/rng.js";
import { choosePlayType, chooseFourthDownDecision, isClockUrgent, fieldGoalDistanceFromPosition } from "../src/engine/playCalling.js";
import { simulateGame } from "../src/engine/gameSimulator.js";
import { createSession } from "../src/runtime/bootstrap.js";

function passRateOver(trials, situation, offenseContext) {
  const rng = new RNG(12345);
  let passes = 0;
  for (let i = 0; i < trials; i += 1) {
    if (choosePlayType(situation, offenseContext, rng) === "pass") passes += 1;
  }
  return passes / trials;
}

test("choosePlayType leans pass on long distance and run on short/goal-line distance", () => {
  const offenseContext = { passLean: 0.55 };
  const longDistanceRate = passRateOver(4000, { down: 2, distance: 12, fieldPosition: 50 }, offenseContext);
  const shortDistanceRate = passRateOver(4000, { down: 2, distance: 1, fieldPosition: 50 }, offenseContext);
  assert.ok(longDistanceRate > shortDistanceRate + 0.2, `long=${longDistanceRate.toFixed(2)} short=${shortDistanceRate.toFixed(2)}`);
});

test("choosePlayType leans pass on third/fourth-and-long and honors trailing clock urgency", () => {
  const offenseContext = { passLean: 0.5 };
  const earlyDown = passRateOver(4000, { down: 1, distance: 10, fieldPosition: 50 }, offenseContext);
  const thirdLong = passRateOver(4000, { down: 3, distance: 9, fieldPosition: 50 }, offenseContext);
  assert.ok(thirdLong > earlyDown + 0.1, `3rd-long=${thirdLong.toFixed(2)} early=${earlyDown.toFixed(2)}`);

  const neutralClock = passRateOver(4000, { down: 1, distance: 10, fieldPosition: 50, scoreDifferential: -10, elapsedSeconds: 1000 }, offenseContext);
  const urgentTrailing = passRateOver(4000, { down: 1, distance: 10, fieldPosition: 50, scoreDifferential: -10, elapsedSeconds: 3500 }, offenseContext);
  assert.ok(urgentTrailing > neutralClock + 0.1, `urgent-trailing=${urgentTrailing.toFixed(2)} neutral=${neutralClock.toFixed(2)}`);

  const urgentLeading = passRateOver(4000, { down: 1, distance: 10, fieldPosition: 50, scoreDifferential: 10, elapsedSeconds: 3500 }, offenseContext);
  assert.ok(urgentLeading < neutralClock - 0.05, `urgent-leading=${urgentLeading.toFixed(2)} neutral=${neutralClock.toFixed(2)}`);
});

test("choosePlayType stays within sane clamped bounds regardless of extreme inputs", () => {
  const rng = new RNG(999);
  const aggressive = choosePlayType({ down: 3, distance: 20, fieldPosition: 90, scoreDifferential: -20, elapsedSeconds: 3599 }, { passLean: 0.9 }, rng);
  const conservative = choosePlayType({ down: 1, distance: 1, fieldPosition: 5, scoreDifferential: 20, elapsedSeconds: 3599 }, { passLean: 0.1 }, rng);
  assert.ok(["pass", "run"].includes(aggressive));
  assert.ok(["pass", "run"].includes(conservative));
});

test("isClockUrgent flips at the last five minutes of regulation", () => {
  assert.equal(isClockUrgent(3000), false);
  assert.equal(isClockUrgent(3299), false);
  assert.equal(isClockUrgent(3300), true);
  assert.equal(isClockUrgent(3600), true);
});

test("fieldGoalDistanceFromPosition maps field position to a realistic kick distance", () => {
  assert.equal(fieldGoalDistanceFromPosition(83), 34); // opponent 17 + 17
  assert.ok(fieldGoalDistanceFromPosition(20) <= 62, "must clamp to a realistic max distance");
  assert.ok(fieldGoalDistanceFromPosition(99) >= 18, "must clamp to a realistic min distance");
});

test("chooseFourthDownDecision goes for it far more on 4th-and-1 than 4th-and-15", () => {
  const rng = new RNG(42);
  let shortGoes = 0;
  let longGoes = 0;
  const trials = 3000;
  for (let i = 0; i < trials; i += 1) {
    if (chooseFourthDownDecision({ distance: 1, fieldPosition: 55 }, rng) === "go") shortGoes += 1;
    if (chooseFourthDownDecision({ distance: 15, fieldPosition: 55 }, rng) === "go") longGoes += 1;
  }
  assert.ok(shortGoes / trials > (longGoes / trials) * 3, `short-go-rate=${shortGoes / trials} long-go-rate=${longGoes / trials}`);
});

test("chooseFourthDownDecision prefers field goal in range over punting when not desperate", () => {
  const rng = new RNG(7);
  let fgCount = 0;
  let puntCount = 0;
  const trials = 2000;
  for (let i = 0; i < trials; i += 1) {
    const decision = chooseFourthDownDecision({ distance: 8, fieldPosition: 65, scoreDifferential: 0, elapsedSeconds: 1000 }, rng);
    if (decision === "field-goal") fgCount += 1;
    if (decision === "punt") puntCount += 1;
  }
  assert.ok(fgCount > puntCount, `fg=${fgCount} punt=${puntCount} out of ${trials} at makeable range`);
});

test("desperation late-game trailing by 9+ with no field goal range forces a real go-for-it attempt", () => {
  const rng = new RNG(555);
  let goCount = 0;
  const trials = 500;
  for (let i = 0; i < trials; i += 1) {
    if (chooseFourthDownDecision({ distance: 10, fieldPosition: 15, scoreDifferential: -10, elapsedSeconds: 3550 }, rng) === "go") {
      goCount += 1;
    }
  }
  assert.ok(goCount / trials > 0.7, `desperation go-rate too low: ${goCount / trials}`);
});

test("fourth-down-forced kicks/punts actually fire across a full simulated season, end-to-end", () => {
  const session = createSession({ seed: 2029, startYear: 2026, controlledTeamId: "BUF" });
  let sawForcedFourthDown = false;
  for (let year = 0; year < 3 && !sawForcedFourthDown; year += 1) {
    for (const awayTeamId of ["MIA", "NE", "NYJ", "KC", "DEN", "LAC", "LV"]) {
      const game = simulateGame({
        league: session.league,
        statBook: session.statBook,
        homeTeamId: "BUF",
        awayTeamId,
        year: 2026 + year,
        week: 1,
        rng: session.rng,
        mode: "drive",
        seasonType: "regular"
      });
      if (game.boxScore.playByPlay.some((entry) => entry.description?.includes("on fourth down"))) {
        sawForcedFourthDown = true;
        break;
      }
    }
  }
  assert.ok(sawForcedFourthDown, "expected at least one forced fourth-down kick/punt across simulated games");
});

test("game simulation stays deterministic for the same seed with situational play-calling active", () => {
  const a = createSession({ seed: 3030, startYear: 2026, controlledTeamId: "BUF" });
  const b = createSession({ seed: 3030, startYear: 2026, controlledTeamId: "BUF" });
  a.simulateOneSeason({ runOffseasonAfter: false });
  b.simulateOneSeason({ runOffseasonAfter: false });
  assert.deepEqual(a.league.champions, b.league.champions);
  assert.equal(a.league.teamSeasonTable?.length, b.league.teamSeasonTable?.length);
});
