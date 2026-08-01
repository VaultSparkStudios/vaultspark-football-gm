import test from "node:test";
import assert from "node:assert/strict";

import {
  computeMatchupEdge,
  matchupEdgeFromContexts,
  coachingExploitFactor,
  MATCHUP_LEAN_CAP
} from "../src/engine/matchupEdge.js";
import { choosePlayType } from "../src/engine/playCalling.js";
import { buildMatchupEdgeRead } from "../public/lib/tacticalFilmRoom.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

// ── The read itself ───────────────────────────────────────────────────────────

test("the edge is relative: a uniformly elite defense offers nothing to attack", () => {
  const elite = computeMatchupEdge({ runDefense: 92, coverage: 92, coachingOffense: 90 });
  assert.equal(elite.delta, 0);
  assert.equal(elite.direction, "none");

  const awful = computeMatchupEdge({ runDefense: 48, coverage: 48, coachingOffense: 90 });
  assert.equal(awful.delta, 0, "a uniformly bad defense is also not a soft-side read");
});

test("a soft run front is attacked on the ground, a soft secondary through the air", () => {
  const softRun = computeMatchupEdge({ runDefense: 60, coverage: 85, coachingOffense: 90 });
  assert.ok(softRun.delta < 0, "negative delta tilts run");
  assert.equal(softRun.direction, "run");
  assert.equal(softRun.unit, "run defense");
  assert.match(softRun.label, /run defense/);

  const softPass = computeMatchupEdge({ runDefense: 88, coverage: 62, coachingOffense: 90 });
  assert.ok(softPass.delta > 0, "positive delta tilts pass");
  assert.equal(softPass.direction, "pass");
  assert.equal(softPass.unit, "coverage");
  assert.match(softPass.label, /coverage/);
});

test("the edge is hard-bounded no matter how lopsided the defense is", () => {
  const extreme = computeMatchupEdge({ runDefense: 40, coverage: 99, coachingOffense: 99 });
  assert.ok(Math.abs(extreme.delta) <= MATCHUP_LEAN_CAP + 1e-9);

  const inverse = computeMatchupEdge({ runDefense: 99, coverage: 40, coachingOffense: 99 });
  assert.ok(Math.abs(inverse.delta) <= MATCHUP_LEAN_CAP + 1e-9);
});

test("coaching quality gates how much of the edge a staff can exploit", () => {
  const gap = { runDefense: 60, coverage: 85 };
  const weak = computeMatchupEdge({ ...gap, coachingOffense: 55 });
  const average = computeMatchupEdge({ ...gap, coachingOffense: 72 });
  const elite = computeMatchupEdge({ ...gap, coachingOffense: 95 });

  assert.ok(Math.abs(weak.delta) < Math.abs(average.delta));
  assert.ok(Math.abs(average.delta) < Math.abs(elite.delta));
  assert.equal(coachingExploitFactor(60), 0.35);
  assert.equal(coachingExploitFactor(130), 1, "exploit factor is clamped at full");
  assert.equal(coachingExploitFactor(10), 0.35, "and floored, so a bad staff still finds something");
});

test("a missing or malformed defense read yields a zero edge rather than throwing", () => {
  for (const input of [undefined, {}, { runDefense: null, coverage: 70 }, { runDefense: "x", coverage: "y" }]) {
    const edge = computeMatchupEdge(input);
    assert.equal(edge.delta, 0);
    assert.equal(edge.direction, "none");
  }
  assert.equal(matchupEdgeFromContexts(null, null).delta, 0);
  assert.equal(matchupEdgeFromContexts({}, { unitRatings: {} }).delta, 0);
});

test("the edge reads live drive-engine contexts", () => {
  const offense = { team: { coaching: { offense: 90 } } };
  const defense = { unitRatings: { runDefense: 58, coverage: 84 } };
  const edge = matchupEdgeFromContexts(offense, defense);
  assert.equal(edge.direction, "run");
  assert.ok(edge.delta < 0);
  assert.equal(edge.gap, 26);
});

test("the edge is deterministic — identical inputs give identical numbers", () => {
  const input = { runDefense: 63, coverage: 81, coachingOffense: 77 };
  assert.deepEqual(computeMatchupEdge(input), computeMatchupEdge(input));
});

// ── Effect on play calling ────────────────────────────────────────────────────

function callRatio(matchupLean, passLean = 0.54) {
  // A fixed deterministic sequence so the only variable is the matchup lean.
  let passes = 0;
  const total = 2000;
  for (let i = 0; i < total; i += 1) {
    const roll = (i + 0.5) / total;
    const rng = { chance: (p) => roll < p };
    const call = choosePlayType(
      { down: 1, distance: 10, fieldPosition: 50, scoreDifferential: 0, elapsedSeconds: 0, matchupLean },
      { passLean },
      rng
    );
    if (call === "pass") passes += 1;
  }
  return passes / total;
}

test("a soft-secondary read actually makes an offense throw more", () => {
  const neutral = callRatio(0);
  const attackPass = callRatio(0.05);
  const attackRun = callRatio(-0.05);

  assert.ok(attackPass > neutral, "soft coverage must increase pass share");
  assert.ok(attackRun < neutral, "soft run front must decrease pass share");
  assert.ok(
    Math.abs(attackPass - neutral) < 0.08,
    "the shift must stay modest — this is a lean, not a scheme rewrite"
  );
});

test("situational pressure still overrides the gameplan", () => {
  const rng = { chance: () => true };
  // Third-and-long against a soft run front: the gameplan says run, the down says
  // pass. A gameplan that survived third-and-fifteen would be a bug.
  const call = choosePlayType(
    { down: 3, distance: 15, fieldPosition: 40, scoreDifferential: -10, elapsedSeconds: 3400, matchupLean: -0.055 },
    { passLean: 0.54 },
    rng
  );
  assert.equal(call, "pass");
});

test("the lean cannot push play calling outside its existing envelope", () => {
  // The clamp inside choosePlayType is the calibration guard; prove the matchup
  // lean cannot breach it from either direction.
  const probe = (passLean, matchupLean) => {
    let threshold = null;
    const rng = { chance: (p) => { threshold = p; return true; } };
    choosePlayType(
      { down: 1, distance: 10, fieldPosition: 50, scoreDifferential: 0, elapsedSeconds: 0, matchupLean },
      { passLean },
      rng
    );
    return threshold;
  };
  assert.ok(probe(0.78, MATCHUP_LEAN_CAP) <= 0.86);
  assert.ok(probe(0.3, -MATCHUP_LEAN_CAP) >= 0.22);
});

test("omitting the matchup lean leaves play calling exactly as it was", () => {
  const withoutField = (() => {
    let threshold = null;
    const rng = { chance: (p) => { threshold = p; return true; } };
    choosePlayType({ down: 2, distance: 6, fieldPosition: 45 }, { passLean: 0.54 }, rng);
    return threshold;
  })();
  const withZero = (() => {
    let threshold = null;
    const rng = { chance: (p) => { threshold = p; return true; } };
    choosePlayType({ down: 2, distance: 6, fieldPosition: 45, matchupLean: 0 }, { passLean: 0.54 }, rng);
    return threshold;
  })();
  assert.equal(withoutField, withZero);
});

// ── Source-of-truth ratings and the visible receipt ───────────────────────────

test("teams expose split run and pass defense ratings for the brief to read", () => {
  const session = new GameSession({ rng: new RNG(6363), startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  for (const team of session.league.teams) {
    assert.ok(Number.isFinite(team.runDefenseRating), `${team.id} must expose runDefenseRating`);
    assert.ok(Number.isFinite(team.passDefenseRating), `${team.id} must expose passDefenseRating`);
    assert.ok(team.runDefenseRating >= 40 && team.runDefenseRating <= 99);
    assert.ok(team.passDefenseRating >= 40 && team.passDefenseRating <= 99);
  }
});

test("simulated games carry the matchup receipt for both offenses", () => {
  const session = new GameSession({ rng: new RNG(1717), startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const result = session.advanceWeek();
  const game = (result.games || [])[0];
  assert.ok(game, "a week must produce games");
  assert.ok(game.matchupEdges, "games must carry the opponent read that shaped them");
  for (const side of ["home", "away"]) {
    const edge = game.matchupEdges[side];
    assert.ok(edge, `${side} edge missing`);
    assert.ok(["run", "pass", "none"].includes(edge.direction));
    assert.ok(Math.abs(edge.delta) <= MATCHUP_LEAN_CAP + 1e-9);
    assert.equal(typeof edge.label, "string");
    assert.ok(edge.label.length > 0, "every receipt states its read, including the empty one");
  }
});

test("the browser brief states the same read as the engine, and nothing when it cannot", () => {
  const softRun = buildMatchupEdgeRead(
    { runDefenseRating: 60, passDefenseRating: 85 },
    { coaching: { offense: 90 } }
  );
  assert.equal(softRun.direction, "run");
  assert.equal(softRun.gap, 25);
  assert.match(softRun.label, /run defense/);
  assert.match(softRun.label, /lean into it hard/);

  const softPass = buildMatchupEdgeRead({ runDefenseRating: 88, passDefenseRating: 62 }, {});
  assert.equal(softPass.direction, "pass");
  assert.match(softPass.label, /coverage/);

  const even = buildMatchupEdgeRead({ runDefenseRating: 75, passDefenseRating: 75 }, {});
  assert.equal(even.direction, "none");
  assert.match(even.label, /Even front and secondary/);

  // An honest empty state rather than an invented edge.
  const unknown = buildMatchupEdgeRead({}, {});
  assert.equal(unknown.available, false);
  assert.equal(unknown.label, "");
});

test("engine and browser agree on which side is soft", () => {
  const cases = [
    { runDefenseRating: 60, passDefenseRating: 85 },
    { runDefenseRating: 88, passDefenseRating: 62 },
    { runDefenseRating: 75, passDefenseRating: 75 }
  ];
  for (const team of cases) {
    const engine = computeMatchupEdge({
      runDefense: team.runDefenseRating,
      coverage: team.passDefenseRating,
      coachingOffense: 72
    });
    const browser = buildMatchupEdgeRead(team, {});
    assert.equal(
      browser.direction,
      engine.direction,
      "the brief must never point the player at a different soft side than the engine attacks"
    );
  }
});
