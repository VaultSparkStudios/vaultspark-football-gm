/**
 * Session 86 — core-loop truth regressions.
 *
 * Each test here is the inverse of a defect that was proved by RUNNING the
 * engine, not by reading it. Several of these defects survived many sessions
 * precisely because the existing coverage asserted on a fabricated shape or on
 * a stubbed seam, so every assertion below is written to fail against the old
 * behaviour and to exercise the real path.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../src/runtime/bootstrap.js";
import { executeAdvanceWeekCommand } from "../src/runtime/advanceWeekCommand.js";
import { applyTacticOverride } from "../src/runtime/weeklyTactic.js";
import { tacticDefinition } from "../public/lib/tacticalFilmRoom.js";
import { weeklyPlanUnitAggression } from "../src/engine/gameSimulator.js";
import { pickAnalystLine } from "../public/lib/draftPickReveal.js";
import { getCapAlerts } from "../src/engine/capAlerts.js";
import { teamMadePlayoffs } from "../src/engine/gmLegacyScore.js";
import { progressPlayer } from "../src/engine/offseasonSimulator.js";
import { PLAYER_DEVELOPMENT_PROFILE, LEAGUE_AVERAGE_POTENTIAL, calculatePositionOverall, positionRatingKeys } from "../src/domain/ratings.js";
import { RNG } from "../src/utils/rng.js";

// ── [audit #1] the weekly tactic must reach the simulator ────────────────────

function leagueDigest(session) {
  return session.league.teams
    .map((t) => `${t.id}:${t.season.wins}-${t.season.losses}:${t.season.pointsFor}/${t.season.pointsAgainst}`)
    .join("|");
}

function runLeague(tactic, weeks = 8) {
  const session = createSession({ seed: 77123, startYear: 2026, controlledTeamId: "BUF" });
  for (let week = 0; week < weeks; week += 1) {
    executeAdvanceWeekCommand(session, tactic ? { weeklyTacticOverride: tactic } : {});
  }
  return leagueDigest(session);
}

test("a chosen weekly tactic actually changes the simulated league result", () => {
  // This is the exact probe that proved the defect, inverted. Before the fix,
  // advanceWeek rebuilt every weeklyPlan before kickoff, so all four tactics
  // produced byte-identical 8-week league results.
  const base = runLeague(null);
  assert.equal(runLeague(null), base, "no-tactic runs must stay deterministic");

  for (const tactic of ["run-heavy", "pass-heavy", "blitz-heavy", "prevent"]) {
    assert.notEqual(
      runLeague(tactic),
      base,
      `${tactic} produced a league result identical to choosing no tactic — the override never reached the simulator`
    );
  }
});

test("the weekly tactic is consumed exactly once and never leaks into a later week", () => {
  const session = createSession({ seed: 49008, startYear: 2026, controlledTeamId: "BUF" });
  executeAdvanceWeekCommand(session, { weeklyTacticOverride: "blitz-heavy" });
  assert.equal(session.pendingWeeklyTactic ?? null, null, "tactic must not remain staged after the advance");

  const team = session.league.teams.find((entry) => entry.id === "BUF");
  session.advanceWeek();
  assert.equal(
    team.weeklyPlan.tacticalOverride ?? null,
    null,
    "a later week must not inherit the previous week's tactic"
  );
});

test("tactic modifiers stay inside their declared unit authority", () => {
  // Exercises the shared applier directly as a pure function. The previous
  // version of this assertion stubbed out session.advanceWeek entirely, which
  // is why it kept passing while the feature was dead in the real path.
  const basePlan = () => ({ passLeanDelta: 0, aggressionDelta: 0 });

  const run = basePlan();
  applyTacticOverride(run, tacticDefinition("run-heavy"));
  assert.equal(run.passLeanDelta, -0.15);
  assert.equal(weeklyPlanUnitAggression(run, "offense"), 0.05);
  assert.equal(weeklyPlanUnitAggression(run, "defense"), 0);

  const blitz = basePlan();
  applyTacticOverride(blitz, tacticDefinition("blitz-heavy"));
  assert.equal(blitz.passLeanDelta, 0);
  assert.equal(weeklyPlanUnitAggression(blitz, "defense"), 0.2);
  assert.equal(blitz.tacticalOverride.authorityId, "tactical-plan@2.0:blitz-heavy");

  const prevent = basePlan();
  applyTacticOverride(prevent, tacticDefinition("prevent"));
  assert.equal(weeklyPlanUnitAggression(prevent, "defense"), -0.15);
});

// ── [audit #2] the on-the-clock Draft button must not throw ──────────────────

test("pickAnalystLine returns a usable line instead of throwing", () => {
  // DRAFT_ANALYST_LINES was read but never declared, so this threw a
  // ReferenceError inside the awaited reveal and the draft pick request was
  // never issued — silently, with no modal and no error surface.
  for (const seed of [0, 1, 42, 9999, -7]) {
    const line = pickAnalystLine(seed);
    assert.equal(typeof line, "string");
    assert.ok(line.length > 0, `seed ${seed} produced an empty analyst line`);
  }
});

test("pickAnalystLine is deterministic for a given seed", () => {
  assert.equal(pickAnalystLine(1234), pickAnalystLine(1234));
});

// ── [audit #5] the cap alert must read the real contract shape ───────────────

function rosterPlayer(name, overall, yearsRemaining) {
  return { name, pos: "QB", overall, contract: { yearsRemaining, salary: 12_000_000, capHit: 12_000_000 } };
}

test("expiring-contract alerts flag only players actually in their final year", () => {
  const roster = [
    rosterPlayer("Long Deal Star", 90, 4),
    rosterPlayer("Final Year Star", 88, 1),
    rosterPlayer("Expired Star", 86, 0)
  ];
  const alerts = getCapAlerts({ capSpace: 10_000_000, salaryCap: 255_000_000, usedCap: 245_000_000, deadCap: 0 }, roster, 2026);
  const expiring = alerts.filter((a) => a.type === "expiring-key");

  const flagged = expiring.map((a) => a.headline);
  assert.equal(expiring.length, 2, `expected 2 expiring alerts, got ${expiring.length}: ${flagged.join(" / ")}`);
  assert.ok(!flagged.some((h) => h.includes("Long Deal Star")), "a player with 4 years left must not be flagged");
});

test("cap alert headlines never render a literal undefined", () => {
  const roster = [rosterPlayer("Final Year Star", 88, 0)];
  const alerts = getCapAlerts({ capSpace: 10_000_000, salaryCap: 255_000_000, usedCap: 245_000_000, deadCap: 0 }, roster, 2026);
  for (const alert of alerts) {
    assert.ok(!String(alert.headline).includes("undefined"), `headline leaked undefined: ${alert.headline}`);
    assert.ok(!String(alert.detail).includes("undefined"), `detail leaked undefined: ${alert.detail}`);
  }
});

test("the positive cap-room signal is reachable for a healthy roster", () => {
  // Previously unreachable for any team holding an 84+ OVR player, because
  // every such player produced a false "contract expired" alert.
  const roster = [rosterPlayer("Long Deal Star", 92, 4)];
  const alerts = getCapAlerts({ capSpace: 40_000_000, salaryCap: 255_000_000, usedCap: 215_000_000, deadCap: 0 }, roster, 2026);
  assert.ok(alerts.some((a) => a.type === "cap-room"), "strong cap position signal should be reachable");
});

// ── [audit #4] playoff appearances must be derivable ─────────────────────────

test("playoff participation is read from the field the engine writes", () => {
  // seasonSimulator writes team.playoffSeed; createTeamSeasonState emits no
  // playoffSeed at all, so reading team.season.playoffSeed was always false.
  assert.equal(teamMadePlayoffs({ playoffSeed: 3, season: {} }), true);
  assert.equal(teamMadePlayoffs({ playoffSeed: null, season: {} }), false);
  // legacy/archived rows that do carry the season field still resolve
  assert.equal(teamMadePlayoffs({ season: { playoffSeed: 1 } }), true);
  assert.equal(teamMadePlayoffs(null), false);
});

test("a simulated season credits the controlled GM with a real playoff appearance", () => {
  const session = createSession({ seed: 31337, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });

  const legacy = session.league.gmLegacy;
  assert.ok(legacy, "gm legacy should exist after a season");
  assert.equal(legacy.seasonsServed, 1);

  const team = session.league.teams.find((t) => t.id === "BUF");
  // Whatever actually happened, the recorded appearance must agree with the
  // engine's own playoff field rather than being permanently zero.
  assert.equal(
    legacy.playoffAppearances,
    teamMadePlayoffs(team) ? 1 : 0,
    "recorded playoff appearances must match the engine's playoff state"
  );
});

test("archived team season rows carry playoff participation", () => {
  const session = createSession({ seed: 31337, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });
  const rows = session.statBook.teamSeasonArchive;
  assert.ok(rows.length > 0, "expected archived rows");
  assert.ok(rows.every((r) => "playoffSeed" in r), "archived rows must carry playoffSeed");
  assert.ok(rows.some((r) => r.playoffSeed), "at least one archived team should have a playoff seed");
});

// ── [audit #3] the declared aging curve must reach `overall` ─────────────────

function meanOverallChangeForAge(age, samples = 400) {
  // traitFactor is neutralised (potential == league average) and the symmetric
  // variance averages out across samples, so the measured mean isolates the
  // declared ageFactor for this bucket.
  const rng = new RNG(4242);
  // Build the fixture from the position's own graded keys, so no formula key is
  // missing and silently defaulted — a missing key would dilute the weighted
  // average and make this measure the fixture rather than the engine.
  const gradedKeys = positionRatingKeys("RB");
  let total = 0;
  for (let i = 0; i < samples; i += 1) {
    const ratings = Object.fromEntries(gradedKeys.map((key) => [key, 80]));
    ratings.awareness ??= 80;
    const player = { position: "RB", age, potential: LEAGUE_AVERAGE_POTENTIAL, ratings, morale: 72 };
    player.overall = calculatePositionOverall(player.position, player.ratings);
    const before = player.overall;
    progressPlayer(player, rng);
    total += player.overall - before;
  }
  return total / samples;
}

test("the declared age curve is delivered to overall, not diluted fivefold", () => {
  const declared = PLAYER_DEVELOPMENT_PROFILE.ageFactors;
  const measured = {
    developing25AndUnder: meanOverallChangeForAge(23),
    prime26To29: meanOverallChangeForAge(27),
    veteran30Plus: meanOverallChangeForAge(32)
  };

  for (const [bucket, declaredFactor] of Object.entries(declared)) {
    const delta = Math.abs(measured[bucket] - declaredFactor);
    assert.ok(
      delta <= 0.75,
      `${bucket}: measured ${measured[bucket].toFixed(2)} vs declared ${declaredFactor} (drift ${delta.toFixed(2)} exceeds tolerance). ` +
      "The development delta is not reaching the position's graded attributes."
    );
  }

  // Ordering must hold regardless of tolerance: young players improve, primes
  // hold, veterans decline. This is the shape of the franchise decision.
  assert.ok(measured.developing25AndUnder > measured.prime26To29);
  assert.ok(measured.prime26To29 > measured.veteran30Plus);
  assert.ok(measured.veteran30Plus < -1, "veterans must measurably decline");
});
