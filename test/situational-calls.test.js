/**
 * Situational calls — the player's standing fourth-down and two-minute posture.
 *
 * Pins four things:
 *   1. The default posture is exactly neutral: an unset posture and the default
 *      posture produce byte-identical box scores and leave the RNG in the same
 *      state, in both drive and play modes.
 *   2. No posture adds an RNG draw. The two seams the posture touches —
 *      chooseFourthDownDecision, choosePlayType and the drive's play budget —
 *      consume exactly one draw whatever the posture.
 *   3. The posture moves results in the stated direction, measured over a
 *      paired, seeded sample (aggressive goes for it more than conservative;
 *      hurry-up runs more two-minute plays and throws more in that window than
 *      protect).
 *   4. The setting persists on the controlled team only, through both API
 *      transports' shared session method and a snapshot round trip, and an old
 *      save without the field reads as neutral.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { simulateGame } from "../src/engine/gameSimulator.js";
import { chooseFourthDownDecision, choosePlayType } from "../src/engine/playCalling.js";
import {
  DEFAULT_SITUATIONAL_CALLS,
  fourthDownAggressionAdjustment,
  isTwoMinuteDrill,
  normalizeSituationalCalls,
  twoMinuteAdjustment
} from "../src/engine/situationalCalls.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { RNG } from "../src/utils/rng.js";

const LEAGUE_SEED = 515151;

let sharedSession = null;
function leagueSession() {
  if (!sharedSession) sharedSession = createSession({ seed: LEAGUE_SEED, startYear: 2026, mode: "play" });
  return sharedSession;
}

function pairOf(session) {
  const [home, away] = session.league.teams;
  return { home, away };
}

function playGame(session, { seed, mode, calls }) {
  const { home, away } = pairOf(session);
  const prior = home.situationalCalls;
  if (calls === undefined) delete home.situationalCalls;
  else home.situationalCalls = calls;
  try {
    const rng = new RNG(seed);
    const result = simulateGame({
      league: session.league,
      statBook: session.statBook,
      homeTeamId: home.id,
      awayTeamId: away.id,
      year: 2026,
      week: 1,
      rng,
      mode,
      allowTie: false,
      seasonType: "regular",
      label: "situational-calls"
    });
    return { result, rngSeed: rng.seed, homeId: home.id };
  } finally {
    if (prior === undefined) delete home.situationalCalls;
    else home.situationalCalls = prior;
  }
}

function boxScoreFingerprint(result) {
  return JSON.stringify(result);
}

class CountingRng extends RNG {
  constructor(seed) {
    super(seed);
    this.draws = 0;
  }
  next() {
    this.draws += 1;
    return super.next();
  }
}

// ── 1. Neutral default ──────────────────────────────────────────────────────

test("normalizer defaults missing or malformed values without touching an RNG", () => {
  assert.deepEqual(normalizeSituationalCalls(undefined), DEFAULT_SITUATIONAL_CALLS);
  assert.deepEqual(normalizeSituationalCalls(null), DEFAULT_SITUATIONAL_CALLS);
  assert.deepEqual(normalizeSituationalCalls({ fourthDown: "yolo", twoMinute: 7 }), DEFAULT_SITUATIONAL_CALLS);
  assert.deepEqual(
    normalizeSituationalCalls({ fourthDown: "aggressive", twoMinute: "hurry-up" }),
    { fourthDown: "aggressive", twoMinute: "hurry-up" }
  );
  assert.equal(fourthDownAggressionAdjustment(undefined), 0);
  assert.equal(fourthDownAggressionAdjustment(DEFAULT_SITUATIONAL_CALLS), 0);
  assert.deepEqual({ ...twoMinuteAdjustment(undefined) }, { passLean: 0, playBudget: 0 });
  assert.deepEqual({ ...twoMinuteAdjustment(DEFAULT_SITUATIONAL_CALLS) }, { passLean: 0, playBudget: 0 });
});

test("two-minute window is the last 2:00 of each half, trailing or tied, never overtime", () => {
  assert.equal(isTwoMinuteDrill(1679, -3), false);
  assert.equal(isTwoMinuteDrill(1680, -3), true);
  assert.equal(isTwoMinuteDrill(1799, 0), true);
  assert.equal(isTwoMinuteDrill(1800, -3), false);
  assert.equal(isTwoMinuteDrill(3480, 0), true);
  assert.equal(isTwoMinuteDrill(3599, -7), true);
  assert.equal(isTwoMinuteDrill(3500, 3), false, "a leading offense is not in a two-minute drill");
  assert.equal(isTwoMinuteDrill(3700, -3), false, "overtime is not a two-minute drill");
});

test("unset and default postures produce identical box scores and RNG state", () => {
  const session = leagueSession();
  for (const mode of ["drive", "play"]) {
    for (let index = 0; index < 6; index += 1) {
      const seed = 71_000 + index;
      const unset = playGame(session, { seed, mode, calls: undefined });
      const neutral = playGame(session, { seed, mode, calls: { ...DEFAULT_SITUATIONAL_CALLS } });
      assert.equal(boxScoreFingerprint(neutral.result), boxScoreFingerprint(unset.result), `${mode} seed ${seed}`);
      assert.equal(neutral.rngSeed, unset.rngSeed, `${mode} seed ${seed} RNG state`);
    }
  }
});

test("negative control: the same fingerprint does see a non-default posture", () => {
  // Without this, the identity above could pass because the posture never
  // reaches the engine at all. The same comparison must go red for a real one.
  const session = leagueSession();
  let diverged = 0;
  for (let index = 0; index < 6; index += 1) {
    const seed = 71_000 + index;
    const unset = playGame(session, { seed, mode: "drive", calls: undefined });
    const aggressive = playGame(session, { seed, mode: "drive", calls: { fourthDown: "aggressive", twoMinute: "hurry-up" } });
    if (boxScoreFingerprint(aggressive.result) !== boxScoreFingerprint(unset.result)) diverged += 1;
  }
  assert.ok(diverged > 0, "a non-default posture must change at least one seeded game");
});

// ── 2. Stream invariance ────────────────────────────────────────────────────

test("every posture consumes exactly one draw per fourth-down decision", () => {
  const situations = [];
  for (const distance of [1, 2, 4, 7, 12]) {
    for (const fieldPosition of [15, 40, 62, 85]) {
      for (const scoreDifferential of [-10, -3, 0, 7]) {
        for (const elapsedSeconds of [600, 1750, 3400, 3550]) {
          situations.push({ distance, fieldPosition, scoreDifferential, elapsedSeconds });
        }
      }
    }
  }
  for (const fourthDown of ["conservative", "by-the-book", "aggressive"]) {
    const rng = new CountingRng(4242);
    const reference = new CountingRng(4242);
    for (const situation of situations) {
      chooseFourthDownDecision(
        { ...situation, aggressionDelta: 0.05 + fourthDownAggressionAdjustment({ fourthDown }) },
        rng
      );
      chooseFourthDownDecision({ ...situation, aggressionDelta: 0.05 }, reference);
    }
    assert.equal(rng.draws, situations.length, `${fourthDown} draws`);
    assert.equal(rng.seed, reference.seed, `${fourthDown} leaves the stream where the default leaves it`);
  }
});

test("every two-minute posture consumes exactly one draw per play call", () => {
  const offenseContext = { passLean: 0.56 };
  for (const twoMinute of ["protect", "standard", "hurry-up"]) {
    const rng = new CountingRng(9191);
    const reference = new CountingRng(9191);
    let calls = 0;
    for (const down of [1, 2, 3, 4]) {
      for (const distance of [1, 5, 10, 15]) {
        const situationalLean = twoMinuteAdjustment({ twoMinute }).passLean;
        choosePlayType({ down, distance, fieldPosition: 50, elapsedSeconds: 3500, scoreDifferential: -4, situationalLean }, offenseContext, rng);
        choosePlayType({ down, distance, fieldPosition: 50, elapsedSeconds: 3500, scoreDifferential: -4 }, offenseContext, reference);
        calls += 1;
      }
    }
    assert.equal(rng.draws, calls, `${twoMinute} draws`);
    assert.equal(rng.seed, reference.seed, `${twoMinute} leaves the stream where the default leaves it`);
  }
});

test("a non-default posture leaves the pre-kickoff stream and untouched drives identical", () => {
  // A non-default posture legitimately changes outcomes (a go-for-it runs a
  // play a punt would not), so total game draws may differ downstream of the
  // first decision it changes. What must hold is that the posture adds no draw
  // of its own: the pre-kickoff stream (team contexts, possessions, coin toss)
  // and every drive before the posture first matters are byte-identical —
  // measured on the opening drive whenever it is not a two-minute drill and
  // reaches no fourth down.
  const session = leagueSession();
  let compared = 0;
  for (let index = 0; index < 8; index += 1) {
    const seed = 72_000 + index;
    const neutral = playGame(session, { seed, mode: "drive", calls: undefined });
    const aggressive = playGame(session, {
      seed,
      mode: "drive",
      calls: { fourthDown: "aggressive", twoMinute: "hurry-up" }
    });
    const firstNeutral = neutral.result.boxScore.playByPlay.filter((play) => play.driveNumber === 1 && play.offenseTeamId === neutral.result.boxScore.playByPlay[0].offenseTeamId);
    const firstAggressive = aggressive.result.boxScore.playByPlay.filter((play) => play.driveNumber === 1 && play.offenseTeamId === aggressive.result.boxScore.playByPlay[0].offenseTeamId);
    const reachedFourth = firstNeutral.some((play) => play.down === 4) || firstNeutral.some((play) => play.twoMinute);
    if (!reachedFourth) {
      compared += 1;
      assert.deepEqual(firstAggressive, firstNeutral, `seed ${seed}: opening drive must be untouched`);
    }
  }
  assert.ok(compared > 0, "the sample must include at least one opening drive the posture cannot touch");
});

// ── 3. Measured divergence ──────────────────────────────────────────────────

const MEASURE_GAMES = 160;
const KICK_TYPES = new Set(["punt", "field-goal", "missed-field-goal"]);
const PASS_TYPES = new Set(["pass", "incomplete", "interception", "sack", "scramble"]);

function measurePosture(calls, mode = "drive") {
  const session = leagueSession();
  const totals = { fourthDownGo: 0, fourthDownPuntOrKick: 0, twoMinutePlays: 0, twoMinutePasses: 0, twoMinuteDrives: 0 };
  for (let index = 0; index < MEASURE_GAMES; index += 1) {
    const { result, homeId } = playGame(session, { seed: 80_000 + index, mode, calls });
    const plays = result.boxScore.playByPlay.filter((play) => play.offenseTeamId === homeId);
    for (const play of plays) {
      const kick = KICK_TYPES.has(play.type);
      if (play.down === 4 && play.type !== "score") {
        if (kick) totals.fourthDownPuntOrKick += 1;
        else totals.fourthDownGo += 1;
      }
      if (play.twoMinute) {
        if (!kick && play.type !== "score") totals.twoMinutePlays += 1;
        if (PASS_TYPES.has(play.type)) totals.twoMinutePasses += 1;
      }
    }
    totals.twoMinuteDrives += new Set(plays.filter((play) => play.twoMinute).map((play) => play.driveNumber)).size;
  }
  return totals;
}

test("aggressive goes for it on fourth down more often than conservative", () => {
  const conservative = measurePosture({ fourthDown: "conservative", twoMinute: "standard" });
  const neutral = measurePosture(undefined);
  const aggressive = measurePosture({ fourthDown: "aggressive", twoMinute: "standard" });
  const rate = (row) => row.fourthDownGo / Math.max(1, row.fourthDownGo + row.fourthDownPuntOrKick);
  console.log(
    `[situational-calls] fourth-down go rate over ${MEASURE_GAMES} games: ` +
      `conservative ${rate(conservative).toFixed(3)} (${conservative.fourthDownGo}), ` +
      `by-the-book ${rate(neutral).toFixed(3)} (${neutral.fourthDownGo}), ` +
      `aggressive ${rate(aggressive).toFixed(3)} (${aggressive.fourthDownGo})`
  );
  assert.ok(aggressive.fourthDownGo > conservative.fourthDownGo, "aggressive must attempt more fourth downs");
  assert.ok(rate(aggressive) > rate(neutral) && rate(neutral) > rate(conservative), "go rate must order conservative < default < aggressive");
});

test("hurry-up runs more two-minute plays and throws more in that window than protect", () => {
  const protect = measurePosture({ fourthDown: "by-the-book", twoMinute: "protect" });
  const hurry = measurePosture({ fourthDown: "by-the-book", twoMinute: "hurry-up" });
  console.log(
    `[situational-calls] two-minute window over ${MEASURE_GAMES} games: ` +
      `protect ${protect.twoMinutePlays} plays / ${protect.twoMinutePasses} passes in ${protect.twoMinuteDrives} drives, ` +
      `hurry-up ${hurry.twoMinutePlays} plays / ${hurry.twoMinutePasses} passes in ${hurry.twoMinuteDrives} drives`
  );
  assert.ok(protect.twoMinuteDrives > 20, "the sample must contain real two-minute drives");
  assert.ok(hurry.twoMinutePlays > protect.twoMinutePlays, "hurry-up must run more two-minute plays");
  assert.ok(hurry.twoMinutePasses > protect.twoMinutePasses, "hurry-up must throw more in the two-minute window");
});

// ── 4. Persistence and scope ────────────────────────────────────────────────

test("the setting lives on the controlled team, validates, survives a snapshot and follows the GM", async () => {
  const session = createSession({ seed: 515152, startYear: 2026, mode: "play" });
  const controlled = session.controlledTeamId;
  assert.deepEqual(session.getSituationalCalls(), DEFAULT_SITUATIONAL_CALLS, "an old save reads as neutral");
  assert.deepEqual(session.getDashboardState().controlledTeam.situationalCalls, DEFAULT_SITUATIONAL_CALLS);

  const bad = session.setSituationalCalls({ teamId: controlled, fourthDown: "reckless" });
  assert.equal(bad.ok, false);

  const set = session.setSituationalCalls({ teamId: controlled, fourthDown: "aggressive" });
  assert.equal(set.ok, true);
  assert.deepEqual(set.situationalCalls, { fourthDown: "aggressive", twoMinute: "standard" });
  const both = session.setSituationalCalls({ teamId: controlled, twoMinute: "hurry-up" });
  assert.deepEqual(both.situationalCalls, { fourthDown: "aggressive", twoMinute: "hurry-up" });

  const cpuTeams = session.league.teams.filter((team) => team.id !== controlled);
  assert.ok(cpuTeams.every((team) => team.situationalCalls === undefined), "CPU teams carry no posture");

  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  const restored = session.constructor.fromSnapshot(snapshot, (seed) => new RNG(seed));
  assert.deepEqual(restored.getSituationalCalls(), { fourthDown: "aggressive", twoMinute: "hurry-up" });

  const other = cpuTeams[0].id;
  restored.setControlledTeam(other);
  assert.deepEqual(restored.getSituationalCalls(other), { fourthDown: "aggressive", twoMinute: "hurry-up" });
  assert.equal(restored.league.teams.find((team) => team.id === controlled).situationalCalls, undefined,
    "the club the GM left goes back to CPU defaults");
});
