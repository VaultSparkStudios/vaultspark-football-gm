import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import {
  buildStartScenarioRequest,
  START_SCENARIO_CHOICES
} from "../public/lib/startScenarioContract.js";

const root = path.resolve(import.meta.dirname, "..");

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); }
  };
}

function requestFor(overrides = {}) {
  return buildStartScenarioRequest({
    identity: overrides.identity || "balanced",
    pressure: overrides.pressure || "balanced-mandate",
    "first-call": overrides.firstCall || "ignore"
  });
}

test("all nine opening choices mutate only their declared live authorities", () => {
  const identityExpected = {
    "air-raid": [0.66, 0.62],
    "ground-control": [0.42, 0.58],
    balanced: [0.54, 0.5]
  };
  for (const identity of START_SCENARIO_CHOICES.identity) {
    const session = createSession({ seed: 5100 + identity.length, startYear: 2026, controlledTeamId: "BUF" });
    const result = session.applyStartScenario(requestFor({ identity }));
    const team = session.league.teams.find((entry) => entry.id === "BUF");
    assert.equal(result.ok, true);
    assert.deepEqual([team.scheme.passRate, team.scheme.aggression], identityExpected[identity]);
    assert.equal(result.receipt.effects.identity.id, identity);
  }

  const pressureExpected = {
    "win-now": [0.28, "win-now", "win-now"],
    rebuild: [0.78, "legacy-builder", "rebuild"],
    "balanced-mandate": [0.55, "legacy-builder", "balanced"]
  };
  for (const pressure of START_SCENARIO_CHOICES.pressure) {
    const session = createSession({ seed: 5200 + pressure.length, startYear: 2026, controlledTeamId: "BUF" });
    const result = session.applyStartScenario(requestFor({ pressure }));
    const team = session.league.teams.find((entry) => entry.id === "BUF");
    assert.equal(result.ok, true);
    assert.deepEqual(
      [team.owner.patience, team.owner.personality, team.strategyProfile],
      pressureExpected[pressure]
    );
    assert.equal(result.receipt.effects.pressure.id, pressure);
  }

  const scoutingExpected = {
    "trust-scout": ["pending-draft-class", 0],
    "wait-more-info": ["pending-draft-class", 6],
    ignore: ["declined", 0]
  };
  for (const firstCall of START_SCENARIO_CHOICES.firstCall) {
    const session = createSession({ seed: 5300 + firstCall.length, startYear: 2026, controlledTeamId: "BUF" });
    const result = session.applyStartScenario(requestFor({ firstCall }));
    assert.equal(result.ok, true);
    assert.deepEqual(
      [result.receipt.effects.scouting.status, result.receipt.effects.scouting.pointsReserved],
      scoutingExpected[firstCall]
    );
  }
});

test("invalid and conflicting submissions do not mutate the authoritative league", () => {
  const session = createSession({ seed: 5401, startYear: 2026, controlledTeamId: "BUF" });
  const before = JSON.stringify(session.toSnapshot());
  const invalid = session.applyStartScenario(requestFor({ identity: "teleport-offense" }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reasonCode, "START_SCENARIO_UNKNOWN_CHOICE");
  assert.equal(JSON.stringify(session.toSnapshot()), before);

  const first = session.applyStartScenario(requestFor({ identity: "air-raid" }));
  assert.equal(first.ok, true);
  const after = JSON.stringify(session.toSnapshot());
  const conflict = session.applyStartScenario(requestFor({ identity: "ground-control" }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reasonCode, "START_SCENARIO_ALREADY_APPLIED");
  assert.equal(JSON.stringify(session.toSnapshot()), after);
});

test("receipt survives snapshot reload and duplicate submission is idempotent", () => {
  const session = createSession({ seed: 5402, startYear: 2026, controlledTeamId: "BUF" });
  const request = requestFor({ identity: "ground-control", pressure: "rebuild", firstCall: "wait-more-info" });
  const first = session.applyStartScenario(request);
  const restored = createSessionFromSnapshot(session.toSnapshot());
  const duplicate = restored.applyStartScenario(request);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.idempotent, true);
  assert.deepEqual(duplicate.receipt, first.receipt);
  assert.deepEqual(restored.getDashboardState().startScenarioReceipt, first.receipt);
});

test("scouting directive waits for a real draft class, then uses real prospect state", () => {
  const trusted = createSession({ seed: 5403, startYear: 2026, controlledTeamId: "BUF" });
  trusted.applyStartScenario(requestFor({ firstCall: "trust-scout" }));
  assert.equal(trusted.league.startScenarioReceipt.effects.scouting.prospectId, null);
  trusted.prepareDraft();
  const trustEffect = trusted.league.startScenarioReceipt.effects.scouting;
  const trustState = trusted.ensureScoutingTeamState("BUF");
  assert.equal(trustEffect.status, "applied");
  assert.equal(trustState.locked, true);
  assert.equal(trustState.board[0], trustEffect.prospectId);
  assert.equal(trusted.league.pendingDraft.available.some((prospect) => prospect.id === trustEffect.prospectId), true);

  const patient = createSession({ seed: 5404, startYear: 2026, controlledTeamId: "BUF" });
  patient.applyStartScenario(requestFor({ firstCall: "wait-more-info" }));
  patient.prepareDraft();
  const patientEffect = patient.league.startScenarioReceipt.effects.scouting;
  const patientState = patient.ensureScoutingTeamState("BUF");
  assert.equal(patientEffect.status, "applied");
  assert.equal(patientState.effort[patientEffect.prospectId], 6);
  assert.equal(patientState.points, 40, "reserved points fund the deeper read without fabricating extra spend");
});

test("local runtime returns the same authoritative receipt and dashboard shape", async () => {
  const runtime = createLocalApiRuntime({
    storage: memoryStorage(),
    now: () => 1_900_000_000_000,
    scheduler: (fn) => fn()
  });
  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 5405, startYear: 2026, controlledTeamId: "BUF", mode: "play" }
  });
  const response = await runtime.request("/api/onboarding/start-scenario", {
    method: "POST",
    body: requestFor({ identity: "air-raid", pressure: "win-now", firstCall: "trust-scout" })
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.ok, true);
  assert.deepEqual(response.payload.state.startScenarioReceipt, response.payload.receipt);
  assert.equal(response.payload.state.controlledTeam.scheme.passRate, 0.66);
  assert.equal(response.payload.state.controlledTeam.owner.patience, 0.28);
});

test("browser completion and both adapters share the versioned route contract", () => {
  const tutorial = fs.readFileSync(path.join(root, "public", "lib", "tutorialCampaign.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const local = fs.readFileSync(path.join(root, "src", "app", "api", "localApiRuntime.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "src", "server.js"), "utf8");
  const overview = fs.readFileSync(path.join(root, "public", "lib", "tabOverview.js"), "utf8");
  assert.match(tutorial, /await onComplete\?\.\(buildStartScenarioRequest\(selections\)\)/);
  assert.match(tutorial, /await onComplete\?\.[\s\S]*markTutorialSeen\(\);[\s\S]*renderReceipt\(receipt\)/);
  assert.match(app, /\/api\/onboarding\/start-scenario/);
  assert.match(local, /\/api\/onboarding\/start-scenario/);
  assert.match(server, /\/api\/onboarding\/start-scenario/);
  assert.match(overview, /Pending a real draft class — no prospect has been fabricated/);
});
