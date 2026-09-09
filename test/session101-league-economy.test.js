import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { NFL_STRUCTURE } from "../src/config.js";
import { applyCapRollover } from "../src/engine/offseasonSimulator.js";
import { getAllTeamPlayers } from "../src/domain/teamFactory.js";

// ── S101 · three multi-season economy defects, each measured over a decade ────
//
// None of these threw. They were distributional: a number that quietly went to
// zero, a contract clock that ran at double speed, and four staff roles that
// never aged at all. The suite could not see any of them because it asserts
// single-season behaviour.

const TEAM_ID = "BUF";

function freshSession(seed = 20260101) {
  return createSession({ seed, startYear: 2025, mode: "drive", controlledTeamId: TEAM_ID });
}

test("cap rollover is computed against the grown cap, not the flat base", () => {
  const session = freshSession();
  const league = session.league;

  // A decade of the 4.5%/yr growth `startSeason` writes into teamCapOverride.
  const grownCap = Math.round(NFL_STRUCTURE.salaryCap * 1.045 ** 10);
  league.teamCapOverride = Object.fromEntries(league.teams.map((team) => [team.id, grownCap]));

  // Pin every club's payroll just under the FLAT base cap. Under the flat base
  // that is almost no space; under the real grown cap it is a large amount. The
  // two readings must therefore produce very different rollovers — which is what
  // makes this test able to fail.
  const targetPayroll = NFL_STRUCTURE.salaryCap - 5_000_000;
  for (const team of league.teams) {
    const roster = getAllTeamPlayers(league, team.id).filter((player) => player.contract);
    assert.ok(roster.length > 0, "the probe needs a roster to price");
    const perPlayer = Math.round(targetPayroll / roster.length);
    for (const player of roster) player.contract = { ...player.contract, capHit: perPlayer };
    league.capLedger[team.id] = { rollover: 0, deadCapCurrentYear: 0, deadCapNextYear: 0 };
  }

  const payroll = getAllTeamPlayers(league, TEAM_ID)
    .reduce((sum, player) => sum + (player.contract?.capHit || 0), 0);

  applyCapRollover(league);
  const rollover = league.capLedger[TEAM_ID].rollover;

  const flatSpace = Math.max(0, NFL_STRUCTURE.salaryCap - payroll);
  const grownSpace = Math.max(0, grownCap - payroll);
  const flatRollover = Math.round(flatSpace * 0.48);

  assert.ok(grownSpace > flatSpace * 4, "the probe must actually distinguish the two caps");
  assert.ok(
    rollover > flatRollover * 2,
    "rollover read against the flat base collapses toward zero as the real cap grows — "
      + `saw ${rollover} where the flat-base reading gives ${flatRollover} and real space is ${grownSpace}`
  );
});

test("the staff lifecycle burns exactly one contract year per offseason", () => {
  const session = freshSession();
  const yearsFor = (key) => session.league.teams.map((team) => team.staff?.[key]?.yearsRemaining);

  const before = yearsFor("headCoach");
  session.processStaffLifecycle();
  const afterFirst = yearsFor("headCoach");

  // The offseason pipeline calls this twice (retirements + coaching-carousel).
  const second = session.processStaffLifecycle();
  const afterSecond = yearsFor("headCoach");

  assert.equal(second.alreadyRun, true, "the repeated pipeline call must be a no-op, like its three neighbours");
  assert.deepEqual(afterSecond, afterFirst, "a second call in the same year must not burn another year");

  const decremented = before.filter((years, i) => Number.isFinite(years) && afterFirst[i] === years - 1).length;
  assert.ok(decremented > 0, "the first call must still age contracts");
});

test("every staff role ages, not just head coach and coordinators", () => {
  const session = freshSession();
  const roles = ["headCoach", "offensiveCoordinator", "defensiveCoordinator", "scoutingDirector", "capAnalyst", "strengthCoach", "medicalDirector"];

  const before = Object.fromEntries(roles.map((role) => [role, session.league.teams[0].staff?.[role]?.yearsRemaining]));
  session.processStaffLifecycle();
  const after = Object.fromEntries(roles.map((role) => [role, session.league.teams[0].staff?.[role]?.yearsRemaining]));

  for (const role of roles) {
    if (!Number.isFinite(before[role])) continue;
    assert.notEqual(
      after[role],
      before[role],
      `${role} never expired, freezing part of every CPU club's development environment for the life of the franchise`
    );
  }
});

test("a coaching contract survives its declared term across real offseasons", () => {
  const session = freshSession();
  const team = session.league.teams.find((entry) => (entry.staff?.headCoach?.yearsRemaining ?? 0) >= 3);
  if (!team) return; // seed produced no long deal; nothing to assert

  const coachName = team.staff.headCoach.name;
  const declaredYears = team.staff.headCoach.yearsRemaining;

  // one lifecycle pass per league year, the way the pipeline should apply it
  session.processStaffLifecycle();
  session.currentYear += 1;
  session.processStaffLifecycle();

  const stillThere = session.league.teams.find((entry) => entry.id === team.id).staff.headCoach;
  assert.ok(
    declaredYears - 2 <= 0 || stillThere.name === coachName,
    `a ${declaredYears}-year deal must not clear after 2 league years`
  );
});
