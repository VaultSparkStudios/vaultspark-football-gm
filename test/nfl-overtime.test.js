import test from "node:test";
import assert from "node:assert/strict";
import { runOvertime } from "../src/engine/overtime.js";
import { simulateMatch } from "../src/engine/gameSimulator.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { RNG } from "../src/utils/rng.js";
import { validateMatchOutput } from "../src/sport/matchEngineContract.js";
import { applyArchiveRetention } from "../src/runtime/weekResultProjection.js";
import { buildQuarterScoreboard } from "../public/lib/boxScorePresentation.js";

function sequence(drives, options = {}) {
  const calls = [];
  const result = runOvertime({ allowTie: true, firstHome: true, ...options,
    simulatePossession: (context) => {
      calls.push(context);
      assert.ok(drives.length, "must not grant an extra possession after the winner");
      return { seconds: 60, points: 0, ...drives.shift() };
    }
  });
  return { result, calls };
}

test("both initial scores can be answered; tied replies enter sudden death with one toss", () => {
  const { result, calls } = sequence([{ points: 7 }, { points: 7 }, {}, {}, { points: 3 }]);
  assert.equal(result.homePoints, 10);
  assert.equal(result.awayPoints, 7);
  assert.deepEqual(calls.map(c => c.homeBall), [true, false, true, false, true]);
  assert.deepEqual(calls.map(c => c.elapsedSeconds), [3600, 3660, 3720, 3780, 3840]);
  assert.equal(calls[0].skipTouchdownTry, false);
  assert.equal(calls[1].skipTouchdownTry, false);
  assert.equal(calls[2].skipTouchdownTry, true);
});

test("initial scoreless possession enables next-score wins; losing reply and defensive safety end play", () => {
  assert.equal(sequence([{}, { points: 6 }]).calls[1].skipTouchdownTry, true);
  assert.equal(sequence([{ points: 3 }, {}]).result.homePoints, 3);
  assert.equal(sequence([{ defensivePoints: 2 }]).result.awayPoints, 2);
  assert.equal(sequence([{ defensivePoints: 6 }]).calls.length, 1);
  assert.equal(sequence([{ points: 6 }, { points: 6 }, { points: 3 }]).calls[1].skipTouchdownTry, false);
  assert.equal(sequence([{ points: 3 }, { points: 6 }]).calls[1].skipTouchdownTry, true);
});

test("regular overtime expires with a tie or a leader even before a required reply ends", () => {
  const tied = sequence([{ seconds: 600, possessionEnded: false }]);
  assert.equal(tied.result.elapsedSeconds, 600);
  assert.equal(tied.calls.length, 1);
  const leader = sequence([{ points: 7, seconds: 590 }, { seconds: 10, possessionEnded: false }]);
  assert.equal(leader.result.homePoints, 7);
  assert.equal(leader.calls[1].secondsRemaining, 10);
  assert.equal(leader.result.elapsedSeconds, 600);
  assert.throws(() => sequence([{ seconds: 601 }]), /available clock/);
  assert.throws(() => sequence([{ seconds: 0 }]), /advance/);
});

test("playoffs continue beyond ten pairs and retain required reply across a fifteen-minute boundary", () => {
  const many = sequence([...Array.from({ length: 24 }, () => ({ seconds: 100 })), { points: 3 }], { allowTie: false });
  assert.equal(many.calls.length, 25);
  assert.equal(many.result.periodSeconds, 900);
  assert.equal(many.result.elapsedSeconds, 2460);
  const reply = sequence([{ points: 7, seconds: 890 }, { points: 7, seconds: 80 }, { points: 3 }], { allowTie: false });
  assert.equal(reply.calls[1].secondsRemaining, Infinity);
  assert.equal(reply.calls[2].elapsedSeconds, 4570);
  assert.equal(reply.result.homePoints, 10);
});

test("actual match engine overtime preserves records, score closure and bounded regular clock", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  const before = JSON.stringify(session.league.players.map(p => p.seasonStats));
  const seen = { regular: 0, playoffs: 0, expiry: 0 };
  for (let seed = 1; seed <= 500; seed += 1) {
    const allowTie = seed % 2 === 0;
    const output = simulateMatch({ league: session.league, statBook: session.statBook,
      homeTeamId: "BUF", awayTeamId: "MIA", year: 2026, week: 1,
      rng: new RNG(seed), allowTie, seasonType: allowTie ? "regular" : "postseason" });
    assert.deepEqual(validateMatchOutput(output), []);
    const result = output.result;
    for (const side of ["home", "away"]) {
      assert.equal(result.boxScore.quarterScores[side].reduce((a, b) => a + b, 0), result[`${side}Score`]);
    }
    if (!result.overtime) continue;
    seen[allowTie ? "regular" : "playoffs"] += 1;
    if (allowTie) {
      assert.ok(result.overtime.elapsedSeconds <= 600);
      if (result.overtime.elapsedSeconds === 600) seen.expiry += 1;
    } else assert.ok(result.winnerId, "playoff overtime must produce a winner");
    assert.equal(result.overtime.periodSeconds, allowTie ? 600 : 900);
    assert.equal(result.homeScore - result.overtime.homePoints, result.awayScore - result.overtime.awayPoints);
    if (seen.regular >= 3 && seen.playoffs >= 3) break;
  }
  assert.ok(seen.regular >= 2 && seen.playoffs >= 2, JSON.stringify(seen));
  assert.equal(JSON.stringify(session.league.players.map(p => p.seasonStats)), before);
});

test("defensive actual-game fixture exercises clock expiry without creating post-expiry scoring stats", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  for (const team of session.league.teams) { team.offenseRating = 35; team.defenseRating = 99; }
  let expired = null;
  for (let seed = 1; seed <= 500; seed += 1) {
    const output = simulateMatch({ league: session.league, statBook: session.statBook,
      homeTeamId: "BUF", awayTeamId: "MIA", year: 2026, week: 1,
      rng: new RNG(seed), allowTie: true });
    if (output.result.overtime?.elapsedSeconds !== 600 || !output.result.isTie) continue;
    expired = output;
    break;
  }
  assert.ok(expired, "exercise a real clock-limited final possession");
  assert.deepEqual(validateMatchOutput(expired), []);
  for (const event of expired.boxScore.playByPlay.filter(p => p.quarter >= 5)) {
    assert.equal(event.quarter, 5);
    assert.ok(Number(event.clock.slice(0, 2)) <= 10);
  }
  for (const side of ["home", "away"]) {
    const groups = expired.boxScore.playerStats[side];
    const tds = groups.passing.reduce((n, p) => n + p.td, 0) + groups.rushing.reduce((n, p) => n + p.td, 0);
    const kicks = groups.kicking.reduce((n, p) => n + 3 * p.fgm + p.xpm, 0);
    assert.equal(6 * tds + kicks, expired.result[`${side}Score`]);
  }
  const scoreboard = buildQuarterScoreboard(expired.boxScore);
  const archive = { gameArchive: [{ boxScore: expired.boxScore }, ...Array.from({ length: 48 }, () => ({ boxScore: { playByPlay: [] } }))] };
  applyArchiveRetention(archive);
  assert.equal(expired.boxScore.playByPlay, undefined);
  assert.equal(expired.boxScore.playByPlayTrimmed, true);
  assert.deepEqual(buildQuarterScoreboard(expired.boxScore), scoreboard);
  assert.equal(scoreboard.labels.at(-1), "OT");
});
