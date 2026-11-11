import test from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../src/runtime/bootstrap.js";
import { positionRatingWeights } from "../src/domain/ratings.js";
import {
  ATTRIBUTE_CATEGORIES,
  abilityLabel,
  attributeCategoryOf,
  groupRatingsByCategory,
  playerAttributeSummary,
  playerCategoryScores,
  playerTopAbilities
} from "../src/domain/attributeCategories.js";

const POSITIONS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"];

test("every rating a position is graded on belongs to exactly one category with a football name", () => {
  const ids = new Set(ATTRIBUTE_CATEGORIES.map((category) => category.id));
  for (const position of POSITIONS) {
    for (const key of Object.keys(positionRatingWeights(position))) {
      assert.ok(ids.has(attributeCategoryOf(key)), `${position}.${key} has a category`);
      assert.notEqual(abilityLabel(key, position), key, `${position}.${key} has a readable label`);
    }
  }
});

test("category scores follow the ratings they are built from", () => {
  const base = Object.fromEntries(Object.keys(positionRatingWeights("QB")).map((key) => [key, 70]));
  const flat = playerCategoryScores("QB", base);
  assert.deepEqual(flat, { athleticism: 70, technique: 70, footballIq: 70, instincts: 70 });

  const strongArm = playerCategoryScores("QB", { ...base, throwPower: 99, throwAccuracyDeep: 95 });
  assert.ok(strongArm.technique > flat.technique, "better throwing raises Technique");
  assert.equal(strongArm.athleticism, flat.athleticism, "throwing does not move Athleticism");
  assert.equal(strongArm.footballIq, flat.footballIq);

  const sharp = playerCategoryScores("QB", { ...base, awareness: 95, discipline: 95 });
  assert.ok(sharp.footballIq > flat.footballIq, "awareness and discipline raise Football IQ");
  assert.equal(sharp.technique, flat.technique);
});

test("a position with no formula key in a category still gets a score from the fallback keys", () => {
  // The kicker formula has no instinct key beyond play recognition and no
  // strength key; neither may come back as a hole in the row.
  const ratings = { throwPower: 88, agility: 80, awareness: 75, discipline: 78, playRecognition: 72, speed: 60, strength: 55, acceleration: 58, jumping: 50 };
  const scores = playerCategoryScores("K", ratings);
  for (const { id } of ATTRIBUTE_CATEGORIES) assert.ok(Number.isFinite(scores[id]), `K has ${id}`);
});

test("top abilities are the position's own strengths, highest first, with specialist names for kickers", () => {
  const ratings = { throwPower: 97, throwAccuracyShort: 80, throwAccuracyMedium: 82, throwAccuracyDeep: 93, throwOnRun: 70, awareness: 75, playRecognition: 74, discipline: 71, speed: 99, agility: 60, tackle: 99 };
  const top = playerTopAbilities("QB", ratings);
  assert.equal(top.length, 3);
  assert.deepEqual(top.map((row) => row.key), ["speed", "throwPower", "throwAccuracyDeep"]);
  assert.equal(top[1].label, "Arm Strength");
  assert.ok(!top.some((row) => row.key === "tackle"), "a rating the position is not graded on is never a top ability");
  assert.equal(playerTopAbilities("K", { throwPower: 90, agility: 70, awareness: 70, discipline: 70, playRecognition: 70 })[0].label, "Leg Strength");
});

test("derived accuracy and coverage ratings are read without changing the player's stored ratings", () => {
  const ratings = { throwAccuracy: 85, throwPower: 80, awareness: 78, throwOnRun: 70, playRecognition: 75, discipline: 70, speed: 60, agility: 60 };
  const before = JSON.stringify(ratings);
  const summary = playerAttributeSummary("QB", ratings);
  assert.equal(JSON.stringify(ratings), before);
  assert.ok(Number.isFinite(summary.categories.technique));
});

test("grouped ratings list position-relevant keys first in every category", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  const quarterback = session.league.players.find((player) => player.position === "QB");
  const groups = groupRatingsByCategory("QB", quarterback.ratings);
  assert.deepEqual(Object.keys(groups), ATTRIBUTE_CATEGORIES.map((category) => category.id));
  assert.equal(groups.technique[0].key, "throwPower", "the heaviest QB technique rating leads");
  const weights = groups.technique.map((row) => row.weight);
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a));
});

test("the roster a club loads carries the summary for every player, built from his real ratings", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  const roster = session.getRoster("BUF");
  assert.ok(roster.length > 50);
  for (const row of roster) {
    const player = session.league.players.find((candidate) => candidate.id === row.id);
    assert.deepEqual(row.attributes, playerAttributeSummary(player.position, player.ratings));
    assert.equal(row.attributes.topAbilities.length, 3);
    for (const { id } of ATTRIBUTE_CATEGORIES) {
      const score = row.attributes.categories[id];
      assert.ok(score >= 0 && score <= 99, `${row.pos} ${id} is a rating-scale number`);
    }
  }
});

test("a rival club's depth-chart merit never carries true potential", () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: "BUF" });
  const rival = session.league.teams.find((team) => team.id !== "BUF").id;
  const rows = Object.values(session.getDepthChartSnapShare(rival)).flat();
  let fogged = 0;
  for (const row of rows) {
    const player = session.league.players.find((candidate) => candidate.id === row.playerId);
    const shown = session.visiblePotential(player);
    const withTruth = Number((player.overall * 0.72 + player.potential * 0.18 + (player.schemeFit || 70) * 0.07 + (player.morale || 70) * 0.03).toFixed(2));
    if (shown !== player.potential) {
      fogged += 1;
      assert.notEqual(row.meritScore, withTruth, `${player.name}: merit must use the scouted potential`);
    }
  }
  assert.ok(fogged > 0, "the fixture includes rival players whose potential is fogged");
});
