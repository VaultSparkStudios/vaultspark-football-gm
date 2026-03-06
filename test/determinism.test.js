import test from "node:test";
import assert from "node:assert/strict";
import { runLeagueSimulation } from "../src/engine/leagueSimulator.js";
import { RNG } from "../src/utils/rng.js";

test("simulation is deterministic for same seed", () => {
  const a = runLeagueSimulation({ years: 4, startYear: 2026, rng: new RNG(42) });
  const b = runLeagueSimulation({ years: 4, startYear: 2026, rng: new RNG(42) });
  assert.deepEqual(a.champions, b.champions);
  assert.equal(a.teamSeasonTable.length, b.teamSeasonTable.length);
});
