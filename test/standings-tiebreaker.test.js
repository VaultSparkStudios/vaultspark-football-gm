import test from "node:test";
import assert from "node:assert/strict";
import { sortStandings } from "../src/engine/seasonSimulator.js";

function makeTeam({ id, conference = "AFC", division = "East", wins = 10, losses = 7, ties = 0, pointsFor = 400, pointsAgainst = 350, weekResults = [] }) {
  return {
    id,
    conference,
    division,
    overallRating: 80,
    season: {
      wins,
      losses,
      ties,
      pointsFor,
      pointsAgainst,
      weekResults
    }
  };
}

test("standings tiebreaker prioritizes head-to-head", () => {
  const a = makeTeam({
    id: "A",
    weekResults: [{ opponent: "B", result: "W" }, { opponent: "B", result: "L" }, { opponent: "B", result: "W" }],
    pointsFor: 360,
    pointsAgainst: 320
  });
  const b = makeTeam({
    id: "B",
    weekResults: [{ opponent: "A", result: "L" }, { opponent: "A", result: "W" }, { opponent: "A", result: "L" }],
    pointsFor: 420,
    pointsAgainst: 340
  });

  const sorted = sortStandings([a, b]);
  assert.equal(sorted[0].id, "A");
  assert.equal(sorted[1].id, "B");
});
