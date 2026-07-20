import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { executeAdvanceWeekCommand } from "../src/runtime/advanceWeekCommand.js";

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

test("same-seed weekly commands produce identical state and versioned receipts", () => {
  const left = createSession({ seed: 49003, startYear: 2026, controlledTeamId: "BUF" });
  const right = createSession({ seed: 49003, startYear: 2026, controlledTeamId: "BUF" });
  const payload = { count: 1, weeklyTacticOverride: "run-heavy" };
  const leftResult = executeAdvanceWeekCommand(left, payload);
  const rightResult = executeAdvanceWeekCommand(right, payload);

  assert.equal(leftResult.ok, true);
  assert.equal(leftResult.commandReceipt.schemaVersion, "1.0");
  assert.deepEqual(leftResult.results, rightResult.results);
  assert.deepEqual(leftResult.tacticalReceipt, rightResult.tacticalReceipt);
  assert.deepEqual(leftResult.commandReceipt, rightResult.commandReceipt);
  assert.deepEqual(deterministicSnapshot(left), deterministicSnapshot(right));
});
