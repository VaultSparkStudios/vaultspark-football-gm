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
