/**
 * Owner pressure live loop (S62) — patience drifts with receipts, the
 * ultimatum is reachable from every opening plan, and its consequence enters
 * the commitment board as a real decision-pressure record.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { computeOwnerConfidenceDrift, getOwnerConfidenceSummary } from "../src/engine/ownerConfidence.js";
import { resolveGmDecisionCommitments } from "../src/engine/gmDecisionConsequences.js";
import { createSession } from "../src/runtime/bootstrap.js";

test("drift is deterministic, bounded, and names its reasons", () => {
  const win = computeOwnerConfidenceDrift({ won: true, paceGap: 1.5 });
  assert.ok(win.delta > 0);
  assert.ok(win.reasons.some((reason) => reason.includes("won this week")));

  const collapse = computeOwnerConfidenceDrift({
    won: false,
    paceGap: -9,
    commitmentsMissed: 3
  });
  assert.equal(collapse.delta, -0.03, "weekly delta is capped at -0.03");
  assert.ok(collapse.reasons.some((reason) => reason.includes("behind the owner's win target")));
  assert.ok(collapse.reasons.some((reason) => reason.includes("missed 3 GM commitments")));

  const surge = computeOwnerConfidenceDrift({ won: true, paceGap: 8, commitmentsKept: 4 });
  assert.equal(surge.delta, 0.03, "weekly delta is capped at +0.03");

  // Same inputs, same output — no hidden randomness.
  assert.deepEqual(collapse, computeOwnerConfidenceDrift({ won: false, paceGap: -9, commitmentsMissed: 3 }));
});

test("a full losing season can walk even the most patient opening plan into ultimatum range", () => {
  // rebuild plan starts at 0.78; the cap is -0.03/week over an 18-week season.
  const weeks = 18;
  let patience = 0.78;
  for (let i = 0; i < weeks; i += 1) {
    patience = Math.max(0.05, patience + computeOwnerConfidenceDrift({ won: false, paceGap: -6 }).delta);
  }
  assert.ok(
    patience <= 0.35,
    `sustained failure must reach the ultimatum gate from 0.78 (ended at ${patience.toFixed(3)})`
  );
});

test("weekly advance moves patience and writes receipts; dashboard exposes the meter", () => {
  const session = createSession({ seed: 620051, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const team = session.league.teams.find((entry) => entry.id === "BUF");
  const before = Number(team.owner.patience ?? 0.55);

  for (let i = 0; i < 4; i += 1) assert.equal(session.advanceWeek().ok, true);

  assert.ok(Array.isArray(team.owner.confidenceLog), "confidence log exists");
  assert.ok(team.owner.confidenceLog.length >= 3, "one receipt per played week");
  const receipt = team.owner.confidenceLog[0];
  assert.ok(Number.isFinite(receipt.delta));
  assert.ok(Array.isArray(receipt.reasons) && receipt.reasons.length > 0, "receipt names why it moved");
  assert.notEqual(Number(team.owner.patience), before, "patience is no longer immutable");

  const dashboard = session.getDashboardState();
  assert.ok(dashboard.ownerConfidence, "dashboard exposes owner confidence");
  assert.equal(dashboard.ownerConfidence.percent, Math.round(team.owner.patience * 100));
  assert.ok(["critical", "strained", "steady", "secure"].includes(dashboard.ownerConfidence.band));
  assert.deepEqual(dashboard.ownerConfidence.latest, team.owner.confidenceLog[0]);
});

test("an active ultimatum enters the commitment board and fails with its consequence at season end", () => {
  const session = createSession({ seed: 620052, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const team = session.league.teams.find((entry) => entry.id === "BUF");
  // Deterministic collapse: patience at the floor of the gate, season deep underwater.
  team.owner.patience = 0.2;
  team.season.wins = 0;
  team.season.losses = 8;

  const commitment = session.registerOwnerUltimatumPressure();
  assert.ok(commitment, "critically low patience mid-season issues an ultimatum commitment");
  assert.equal(commitment.choiceId, "owner-ultimatum");
  assert.ok(commitment.targetWins > 0);
  assert.ok(commitment.consequence, "the consequence field is carried, not dropped");
  assert.ok(
    session.league.gmCommitments.some((entry) => entry.id === commitment.id && entry.status === "active"),
    "the ultimatum sits on the commitment board"
  );
  assert.ok(
    (session.league.newsLog || []).some((item) => item.type === "owner-ultimatum"),
    "the ultimatum announces itself through the news/inbox pipeline"
  );

  // Re-registering the same season is idempotent.
  assert.equal(session.registerOwnerUltimatumPressure()?.id, commitment.id);

  // Season ends short of the demand: the commitment fails naming the consequence.
  session.currentWeek = 19;
  const receipts = resolveGmDecisionCommitments(session);
  const resolution = receipts.find((entry) => entry.commitmentId === commitment.id);
  assert.ok(resolution, "the ultimatum resolves at the deadline");
  assert.equal(resolution.status, "failed");
  assert.match(resolution.evidence, /consequence/i);
});

test("confidence summary bands are source-derived", () => {
  const summary = getOwnerConfidenceSummary({ owner: { patience: 0.18, confidenceLog: [] } });
  assert.equal(summary.band, "critical");
  assert.equal(getOwnerConfidenceSummary({ owner: { patience: 0.5 } }).band, "steady");
  assert.equal(getOwnerConfidenceSummary(null), null);
});
