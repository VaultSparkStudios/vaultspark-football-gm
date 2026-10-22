import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { createDraftClass, createSyntheticPlayer } from "../src/domain/playerFactory.js";
import { calculatePositionOverall } from "../src/domain/ratings.js";
import { RNG } from "../src/utils/rng.js";
import { generateTalentAttributes } from "../src/domain/talentDistribution.js";

test("archetype strengths alter skill shape without subsidizing overall", () => {
  const player = createSyntheticPlayer({ teamId: "BUF", position: "QB", year: 2026, rng: new RNG(76) });
  const options = { position: "QB", keys: Object.keys(player.ratings), bias: {}, talent: 75,
    rng: { int: () => 0 } };
  const plain = generateTalentAttributes({ ...options, archetype: "NoStrengths" });
  const pocket = generateTalentAttributes({ ...options, archetype: "Pocket" });
  assert.ok(pocket.throwAccuracyShort > plain.throwAccuracyShort);
  assert.ok(pocket.speed < plain.speed);
  assert.ok(Math.abs(calculatePositionOverall("QB", pocket) - calculatePositionOverall("QB", plain)) <= 1,
    "archetype must not receive a general overall bonus");
});

test("every team contains distinct starter, reserve and project talent across seeds", () => {
  for (const seed of [2026, 4040, 20260306]) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
    for (const team of session.league.teams) {
      const active = session.league.players.filter(p => p.teamId === team.id && p.rosterSlot === "active");
      const scores = active.map(p => p.overall);
      assert.equal(active.length, 53);
      assert.ok(Math.max(...scores) - Math.min(...scores) >= 20, `${seed}/${team.id} rating span`);
      assert.ok(scores.some(score => score < 70), `${seed}/${team.id} developmental depth`);
      assert.ok(scores.some(score => score >= 85), `${seed}/${team.id} leading talent`);
      for (const player of active) {
        assert.equal(player.overall, calculatePositionOverall(player.position, player.ratings));
        assert.ok(Object.values(player.ratings).every(v => Number.isFinite(v) && v >= 40 && v <= 99));
      }
    }
    const young = session.league.players.filter(p => p.age <= 25);
    assert.ok(young.some(p => p.overall < 75 && p.potential - p.overall >= 20));
    const elitePositions = new Set(session.league.players.filter(p => p.overall >= 90).map(p => p.position));
    assert.ok(elitePositions.size >= 7, `stars must exist beyond quarterback and line: ${[...elitePositions]}`);
  }
});

test("draft talent and individual attributes are diverse and reproducible", () => {
  const first = createDraftClass({ year: 2027, rng: new RNG(741) });
  const second = createDraftClass({ year: 2027, rng: new RNG(741) });
  assert.deepEqual(first, second);
  assert.ok(first.some(p => p.overall < 60));
  assert.ok(first.some(p => p.overall >= 88));
  assert.ok(first.some(p => p.potential - p.overall >= 25));
  assert.ok(new Set(first.map(p => p.overall)).size >= 35);
});
