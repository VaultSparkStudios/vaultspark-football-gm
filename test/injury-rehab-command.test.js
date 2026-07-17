import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceInjuryRecovery,
  getInjuryReport,
  injuryProbability,
  projectRehab,
  setPlayerRehabPlan
} from "../src/engine/injurySystem.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { createSession } from "../src/runtime/bootstrap.js";

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); }
  };
}

test("injury probability has one age/reinjury-aware authority", () => {
  const young = { position: "RB", age: 24, reinjuryRisk: 0 };
  const veteran = { position: "RB", age: 31, reinjuryRisk: 0.4 };
  assert.ok(injuryProbability(veteran) > injuryProbability(young));
  assert.equal(injuryProbability(young, { multiplier: 0 }), 0);
});

test("standard recovery decrements exactly once per advance", () => {
  const player = {
    id: "P1", name: "Exact Clock", teamId: "BUF", position: "WR", status: "active",
    injury: { type: "IR (4W)", weeksRemaining: 4 }, reinjuryRisk: 0.12
  };
  const league = { players: [player] };
  const first = advanceInjuryRecovery(league);
  assert.equal(first.recovered, 0);
  assert.equal(player.injury.weeksRemaining, 3);
  advanceInjuryRecovery(league);
  assert.equal(player.injury.weeksRemaining, 2);
});

test("rehab plans expose honest pace/risk tradeoffs and a clearance receipt", () => {
  const player = {
    id: "P2", name: "Return Window", teamId: "BUF", position: "QB", status: "active",
    injury: { type: "Out 2-3W", weeksRemaining: 2 }, reinjuryRisk: 0.1
  };
  assert.equal(setPlayerRehabPlan(player, "accelerate").ok, true);
  assert.deepEqual(projectRehab(player), {
    plan: "accelerate",
    label: "Accelerate Return",
    summary: "Gain one modeled recovery week now and accept higher re-injury risk.",
    weeksRemaining: 2,
    weeklyRecovery: 2,
    estimatedAdvances: 1,
    reinjuryRisk: 0.1
  });
  const result = advanceInjuryRecovery({ players: [player] });
  assert.equal(result.recovered, 1);
  assert.equal(result.receipts[0].plan, "accelerate");
  assert.equal(player.injury, null);
  assert.equal(player.reinjuryRisk, 0.14);
});

test("GameSession owns one recovery call and publishes source-derived rehab state", () => {
  const session = createSession({ seed: 48101, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.league.players.find((entry) => entry.teamId === "BUF" && entry.status === "active");
  player.injury = { type: "IR (4W)", weeksRemaining: 4 };
  player.reinjuryRisk = 0.1;
  const plan = session.setRehabPlan({ teamId: "BUF", playerId: player.id, plan: "protect" });
  assert.equal(plan.ok, true);
  const before = getInjuryReport(session.league, "BUF")[0].weeksRemaining;
  session.decrementAvailability();
  const report = session.getDashboardState().injuryReport.find((entry) => entry.playerId === player.id);
  assert.ok(report);
  assert.ok(report.weeksRemaining < before);
  assert.equal(report.rehabPlan, "protect");
  assert.ok(report.estimatedAdvances >= 1);
});

test("rehab clearance reaches the source-derived Priority Inbox news stream", () => {
  const session = createSession({ seed: 48103, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.league.players.find((entry) => entry.teamId === "BUF" && entry.status === "active");
  player.injury = { type: "Out 1W", weeksRemaining: 1 };
  player.reinjuryRisk = 0.1;
  session.setRehabPlan({ teamId: "BUF", playerId: player.id, plan: "standard" });
  session.decrementAvailability();

  const clearance = session.league.newsLog.find((entry) => entry.type === "rehab-clearance");
  assert.ok(clearance);
  assert.equal(clearance.playerIds[0], player.id);
  assert.equal(clearance.teamIds[0], "BUF");
  assert.match(clearance.detail, /Modeled re-injury risk/);
});

test("client-only rehab endpoint mutates the saved league and returns refreshed state", async () => {
  const runtime = createLocalApiRuntime({ storage: memoryStorage(), scheduler: (fn) => fn() });
  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 48102, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });
  const exported = await runtime.request("/api/snapshot/export");
  const snapshot = exported.payload.snapshot;
  const player = snapshot.league.players.find((entry) => entry.teamId === "BUF" && entry.status === "active");
  player.injury = { type: "Out 2-3W", weeksRemaining: 2 };
  player.reinjuryRisk = 0.1;
  await runtime.request("/api/snapshot/import", { method: "POST", body: { snapshot } });
  const response = await runtime.request("/api/injuries/rehab-plan", {
    method: "POST",
    body: { teamId: "BUF", playerId: player.id, plan: "accelerate" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.receipt.plan, "accelerate");
  const report = response.payload.state.injuryReport.find((entry) => entry.playerId === player.id);
  assert.equal(report.rehabPlan, "accelerate");
  assert.equal(report.weeklyRecovery >= 2, true);
});
