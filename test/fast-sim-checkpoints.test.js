import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import {
  appendSimulationDigest,
  classifySimulationCheckpoint,
  formatSimulationDigest,
  hasPendingSimulationDecision
} from "../public/lib/simulationCheckpoints.js";

test("fast simulation pauses on newly material GM decisions", () => {
  const previous = { currentYear: 2026, currentWeek: 8, phase: "regular-season", gmDecisionQueue: [] };
  const next = {
    currentYear: 2026,
    currentWeek: 9,
    phase: "regular-season",
    gmDecisionQueue: [{ id: "trade-deadline", prompt: "Choose a deadline posture." }]
  };
  const checkpoint = classifySimulationCheckpoint({ previous, next });
  assert.equal(checkpoint.shouldPause, true);
  assert.equal(checkpoint.primary.id, "gm-decision");
  assert.match(checkpoint.primary.label, /deadline posture/);
  assert.equal(hasPendingSimulationDecision(next), true);
});

test("phase changes and commitment receipts are explicit checkpoints", () => {
  const checkpoint = classifySimulationCheckpoint({
    previous: { currentYear: 2026, currentWeek: 18, phase: "regular-season", gmCommitments: {} },
    next: {
      currentYear: 2026,
      currentWeek: 19,
      phase: "postseason",
      gmCommitments: { latestReceipt: { id: "receipt-1", label: "Hold", status: "succeeded" } }
    }
  });
  assert.equal(checkpoint.shouldPause, true);
  assert.deepEqual(checkpoint.reasons.map((reason) => reason.id), ["playoff-gate", "commitment-resolution"]);
});

test("ordinary weeks continue and digest only source-derived game results", () => {
  const previous = { currentYear: 2026, currentWeek: 4, phase: "regular-season", controlledTeamId: "BUF" };
  const next = {
    currentYear: 2026,
    currentWeek: 5,
    phase: "regular-season",
    controlledTeamId: "BUF",
    gmDecisionQueue: [],
    latestWeekResults: {
      games: [{ homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 27, awayScore: 20 }]
    }
  };
  const checkpoint = classifySimulationCheckpoint({ previous, next });
  assert.equal(checkpoint.shouldPause, false);
  const digest = appendSimulationDigest([], { previous, next, checkpoint });
  assert.equal(digest[0].result, "W BUF 27–20 MIA");
  assert.match(formatSimulationDigest(digest)[0], /Y2026 W5 · W BUF 27–20 MIA/);
});

test("local runtime exposes the same pending-decision contract used by fast simulation", async () => {
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
  const runtime = createLocalApiRuntime({ storage, scheduler: (fn) => fn() });
  await runtime.request("/api/setup/init");
  await runtime.request("/api/new-league", {
    method: "POST", body: { seed: 47107, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });
  runtime.getSession().phase = "regular-season";
  runtime.getSession().currentWeek = 9;
  const response = await runtime.request("/api/state");
  assert.ok(response.payload.gmDecisionQueue.some((decision) => decision.id === "trade-deadline"));
});

test("browser accelerated loops expose checkpoint pause and one-action resume wiring", () => {
  const flow = readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  assert.match(flow, /classifySimulationCheckpoint/);
  assert.match(flow, /resumeSimulationFromCheckpoint/);
  assert.match(app, /resumeSimBtn/);
  assert.match(html, /id="simCheckpointPanel"/);
});
