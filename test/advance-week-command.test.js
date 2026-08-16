import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { buildTacticalIdentityLedger } from "../public/lib/tacticalFilmRoom.js";
import { executeAdvanceWeekCommand, executeAdvanceWeekTransaction } from "../src/runtime/advanceWeekCommand.js";
import { weeklyPlanUnitAggression } from "../src/engine/gameSimulator.js";

function deterministicSnapshot(session) {
  return JSON.parse(JSON.stringify(session.toSnapshot(), (key, value) =>
    ["ts", "lastUpdated", "timings", "durationMs"].includes(key) ? undefined : value
  ));
}

test("unknown weekly tactics are rejected before league mutation", () => {
  const session = createSession({ seed: 49001, startYear: 2026, controlledTeamId: "BUF" });
  const before = JSON.stringify(session.toSnapshot());
  const result = executeAdvanceWeekCommand(session, { weeklyTacticOverride: "teleport-blitz" });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "ADVANCE_WEEK_UNKNOWN_TACTIC");
  assert.equal(JSON.stringify(session.toSnapshot()), before);
});

test("temporary weekly plans restore even when simulation throws", () => {
  const session = createSession({ seed: 49002, startYear: 2026, controlledTeamId: "BUF" });
  const team = session.league.teams.find((entry) => entry.id === "BUF");
  const before = structuredClone(team.weeklyPlan);
  session.advanceWeek = () => { throw new Error("injected simulation failure"); };
  assert.throws(
    () => executeAdvanceWeekCommand(session, { weeklyTacticOverride: "pass-heavy" }),
    /injected simulation failure/
  );
  assert.deepEqual(team.weeklyPlan, before);
});

// S86 [audit #1] — this fixture previously replaced `session.advanceWeek` with a
// stub, which meant it captured the plan BEFORE the weekly rebuild that was
// silently erasing the tactic. It therefore passed for the project's whole
// history while all four tactics were measurable no-ops. The capture now drives
// the REAL advanceWeek and samples the plan at the moment the simulator reads
// it, so this assertion fails if the override ever stops reaching kickoff.
test("player tactics layer over the matchup plan and stay inside their unit authority", () => {
  const capture = (tactic) => {
    const session = createSession({ seed: 49008, startYear: 2026, controlledTeamId: "BUF" });
    const team = session.league.teams.find((entry) => entry.id === "BUF");
    const base = structuredClone(team.weeklyPlan);
    let applied = null;
    // grantWeeklyScoutingPoints runs immediately AFTER the weekly plans are
    // rebuilt and the staged tactic is applied, and before the week is
    // simulated — so it samples exactly the plan the simulator will read.
    const realGrant = session.grantWeeklyScoutingPoints.bind(session);
    session.grantWeeklyScoutingPoints = (...args) => {
      if (!applied) applied = structuredClone(team.weeklyPlan);
      return realGrant(...args);
    };
    const result = executeAdvanceWeekCommand(session, { weeklyTacticOverride: tactic });
    assert.ok(applied, "expected to sample the weekly plan at simulation time");
    return { base, applied, result };
  };

  const run = capture("run-heavy");
  assert.equal(run.applied.passLeanDelta, run.base.passLeanDelta - 0.15);
  assert.equal(weeklyPlanUnitAggression(run.applied, "offense"), run.base.aggressionDelta + 0.05);
  assert.equal(weeklyPlanUnitAggression(run.applied, "defense"), run.base.aggressionDelta);
  assert.equal(run.result.commandReceipt.tacticUnit, "offense");
  assert.equal(run.result.commandReceipt.tacticAuthorityId, "tactical-plan@2.0:run-heavy");
  // S86 — a real week is now simulated (the old stub returned no games), so a
  // real film receipt is produced and must name the tactic that was applied.
  assert.equal(run.result.tacticalReceipt.tactic, "run-heavy");
  assert.equal(run.result.tacticalReceipt.tacticAuthorityId, "tactical-plan@2.0:run-heavy");

  const blitz = capture("blitz-heavy");
  assert.equal(blitz.applied.passLeanDelta, blitz.base.passLeanDelta);
  assert.equal(weeklyPlanUnitAggression(blitz.applied, "offense"), blitz.base.aggressionDelta);
  assert.equal(weeklyPlanUnitAggression(blitz.applied, "defense"), blitz.base.aggressionDelta + 0.2);
  assert.equal(blitz.result.commandReceipt.tacticUnit, "defense");
  assert.equal(blitz.applied.tacticalOverride.authorityId, "tactical-plan@2.0:blitz-heavy");

  const prevent = capture("prevent");
  assert.equal(prevent.applied.passLeanDelta, prevent.base.passLeanDelta);
  assert.equal(weeklyPlanUnitAggression(prevent.applied, "offense"), prevent.base.aggressionDelta);
  assert.equal(weeklyPlanUnitAggression(prevent.applied, "defense"), prevent.base.aggressionDelta - 0.15);
});

test("same-seed weekly commands produce identical state and versioned receipts", () => {
  const left = createSession({ seed: 49003, startYear: 2026, controlledTeamId: "BUF" });
  const right = createSession({ seed: 49003, startYear: 2026, controlledTeamId: "BUF" });
  const payload = { count: 1, weeklyTacticOverride: "run-heavy" };
  const leftResult = executeAdvanceWeekCommand(left, payload);
  const rightResult = executeAdvanceWeekCommand(right, payload);

  assert.equal(leftResult.ok, true);
  assert.equal(leftResult.commandReceipt.schemaVersion, "2.0");
  assert.deepEqual(leftResult.results, rightResult.results);
  assert.deepEqual(leftResult.tacticalReceipt, rightResult.tacticalReceipt);
  assert.deepEqual(leftResult.commandReceipt, rightResult.commandReceipt);
  assert.deepEqual(deterministicSnapshot(left), deterministicSnapshot(right));
});

test("transaction failure after simulation begins preserves the authoritative session", () => {
  const session = createSession({ seed: 49004, startYear: 2026, controlledTeamId: "BUF" });
  const before = JSON.stringify(session.toSnapshot());
  const result = executeAdvanceWeekTransaction(session, { count: 2 }, {
    afterAdvance: ({ index }) => {
      if (index === 0) throw new Error("injected post-week failure");
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "ADVANCE_WEEK_TRANSACTION_FAILED");
  assert.match(result.error, /remains unchanged/i);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
});

test("successful transaction returns a commit candidate without mutating its source", () => {
  const session = createSession({ seed: 49005, startYear: 2026, controlledTeamId: "BUF" });
  const before = JSON.stringify(session.toSnapshot());
  const result = executeAdvanceWeekTransaction(session, { count: 1 });
  assert.equal(result.ok, true);
  assert.notEqual(result.committedSession, session);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  assert.notEqual(result.committedSession.currentWeek, session.currentWeek);
});
test("tactical identity evidence survives snapshot restore through the authoritative league ledger", () => {
  const session = createSession({ seed: 49006, startYear: 2026, controlledTeamId: "BUF" });
  executeAdvanceWeekCommand(session, { count: 1, weeklyTacticOverride: "run-heavy" });
  const restored = createSessionFromSnapshot(session.toSnapshot());
  const dashboard = restored.getDashboardState();
  assert.equal(dashboard.tacticalFilmLedger.length, 1);
  assert.deepEqual(
    buildTacticalIdentityLedger(dashboard.tacticalFilmLedger),
    buildTacticalIdentityLedger(session.getDashboardState().tacticalFilmLedger)
  );
});
