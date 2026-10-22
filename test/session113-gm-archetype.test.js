import test from "node:test";
import assert from "node:assert/strict";
import { classifyGmArchetype, deriveSessionGmArchetype } from "../src/engine/gmArchetype.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

test("archetypes follow real strategy, age, rating and cap inputs", () => {
  assert.equal(classifyGmArchetype({ strategyProfile: "win-now" }).label, "Win-Now");
  assert.equal(classifyGmArchetype({ strategyProfile: "rebuild" }).label, "Moneyball");
  assert.equal(classifyGmArchetype({ strategyProfile: "balanced", usedCap: 99, salaryCap: 100 }).label, "Gut-Feel");
  assert.equal(classifyGmArchetype({ strategyProfile: "balanced", avgAge: 27, overall: 78, usedCap: 50, salaryCap: 100 }).label, "Loyalty");
});

test("negative control: a generated league no longer labels every club the same", () => {
  const session = new GameSession({ rng: new RNG(8113), startYear: 2026, controlledTeamId: "BUF" });
  const labels = new Set(session.league.teams.map((team) => deriveSessionGmArchetype(session, team).label));
  assert.ok(labels.size > 1, `expected a spread of archetypes, saw only ${[...labels].join(", ")}`);
});

test("balanced clubs reflect persistent negotiating traits without overriding strategy or cap", () => {
  assert.equal(classifyGmArchetype({ traits: ["guards the cap like a vault"] }).label, "Moneyball");
  assert.equal(classifyGmArchetype({ traits: ["overpays for proven playoff tape"] }).label, "Win-Now");
  assert.equal(classifyGmArchetype({ traits: ["treats the deadline like a holiday"] }).label, "Gut-Feel");
  assert.equal(classifyGmArchetype({ traits: ["collects former teammates"] }).label, "Loyalty");
  assert.equal(classifyGmArchetype({ strategyProfile: "win-now", traits: ["guards the cap like a vault"] }).label, "Win-Now");
  assert.equal(classifyGmArchetype({ usedCap: 98, salaryCap: 100, traits: ["guards the cap like a vault"] }).label, "Gut-Feel");
  assert.equal(classifyGmArchetype({ traits: null }).label, "Loyalty");
});

test("archetype reads preserve simulation randomness and restored persona decisions", () => {
  const session = new GameSession({ rng: new RNG(8113), startYear: 2026, controlledTeamId: "BUF" });
  const before = session.rng.seed;
  const labels = session.league.teams.map(team => deriveSessionGmArchetype(session, team));
  assert.equal(session.rng.seed, before);
  const restored = GameSession.fromSnapshot(session.toSnapshot(), seed => new RNG(seed));
  assert.deepEqual(restored.league.teams.map(team => deriveSessionGmArchetype(restored, team)), labels);
});
