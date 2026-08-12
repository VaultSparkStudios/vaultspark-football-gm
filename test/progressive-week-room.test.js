import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProgressiveWeekRoom, buildThreeHorizonBlueprint } from "../public/lib/franchiseArchitecture.js";

test("Week Room makes Now primary and preserves compact Season and Legacy horizons", () => {
  const horizons = [
    { id: "now", title: "Choose the call" },
    { id: "season", title: "Keep the promise" },
    { id: "legacy", title: "Build the career" }
  ];
  const room = buildProgressiveWeekRoom({ horizons, signal: { sampleSize: 2 }, ledger: [{ id: "a" }] });
  assert.equal(room.primary.id, "now");
  assert.deepEqual(room.horizonChips.map((lane) => lane.id), ["season", "legacy"]);
  assert.equal(room.review.ledger.length, 1);
});

test("player-authored mastery becomes one subordinate Architect Objective with honest trophy support", () => {
  const lanes = buildThreeHorizonBlueprint({
    dashboard: { phase: "regular-season", currentWeek: 8 },
    mastery: { focus: { pathId: "stewardship", label: "Franchise Stewardship", source: "player-authored", reason: "You selected this path.", nextMilestone: "Raise cap discipline at season close." } },
    trophyRoad: { objectives: [{ kind: "measurable", name: "Playoff Bound", progressText: "5/9 wins" }] }
  });
  const objective = lanes.find((lane) => lane.id === "legacy");
  assert.equal(objective.label, "Architect Objective");
  assert.equal(objective.title, "Franchise Stewardship");
  assert.match(objective.authority, /player-authored/);
  assert.match(objective.milestone, /Raise cap discipline.*Playoff Bound.*5\/9 wins/);
  assert.match(objective.evidenceBoundary, /no hidden bonus/i);
  assert.equal(objective.targetId, "franchiseArchitecture");
});

test("Architect Objective falls back to existing legacy authority when mastery is unavailable", () => {
  const objective = buildThreeHorizonBlueprint({ gmLegacy: { score: 20, grade: "D", persona: { current: { name: "Builder", description: "A start" }, next: { name: "Planner", gapToNext: 5 } } } })[2];
  assert.equal(objective.label, "Legacy");
  assert.match(objective.milestone, /5 points remain/);
});

test("Week Room has an honest empty review and one native accessible disclosure", () => {
  const room = buildProgressiveWeekRoom();
  assert.equal(room.primary, null);
  assert.equal(room.review.signal.ready, false);
  assert.match(room.review.signal.disclaimer, /No result is inferred/);

  const overview = readFileSync(new URL("../public/lib/tabOverview.js", import.meta.url), "utf8");
  const game = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  assert.match(overview, /<details class="architecture-review">/);
  assert.match(overview, /This week's controlled call/);
  assert.match(overview, /Architecture Review/);
  assert.match(game, /The Week Room/);
});
