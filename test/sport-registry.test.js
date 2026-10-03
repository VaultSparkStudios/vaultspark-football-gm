import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPORT_ID, getSportRules, listSports } from "../src/sport/registry.js";
import { NFL_STRUCTURE, TEAM_METADATA } from "../src/config.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

test("a league without a sport id is football, exactly as before", () => {
  assert.equal(DEFAULT_SPORT_ID, "football");
  const rules = getSportRules();
  assert.equal(rules, getSportRules(undefined));
  assert.equal(rules, getSportRules(null));
  assert.equal(rules.structure, NFL_STRUCTURE, "football rules are the existing constants, not a copy that could drift");
  assert.equal(rules.teams, TEAM_METADATA);
  assert.equal(rules.draft.rounds, 7);
  assert.deepEqual(listSports(), [{ id: "football", displayName: "Football" }]);
});

test("an unknown sport fails loudly instead of silently playing football", () => {
  assert.throws(() => getSportRules("curling"), /Unknown sport "curling"/);
});

test("constructed and restored sessions resolve the same sport rules", () => {
  const session = new GameSession({ rng: new RNG(116), startYear: 2026, controlledTeamId: "BUF" });
  const restored = GameSession.fromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())), (seed) => new RNG(seed));
  assert.equal(session.sportRules, getSportRules("football"));
  assert.equal(restored.sportRules, session.sportRules);
});
