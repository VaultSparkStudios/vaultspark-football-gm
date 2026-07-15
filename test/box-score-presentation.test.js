import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBoxScoreImpactLeaders,
  buildQuarterScoreboard
} from "../public/lib/boxScorePresentation.js";

const boxScore = {
  awayTeamName: "Away Architects",
  homeTeamName: "Home Builders",
  awayTeam: { teamId: "AWY", score: 20 },
  homeTeam: { teamId: "HME", score: 27 },
  quarterScores: {
    away: [3, 7, 3, 7, 0],
    home: [7, 3, 7, 10, 0]
  },
  playerStats: {
    away: {
      passing: [{ playerId: "A-QB", player: "Away QB", pos: "QB", yds: 220, td: 1, int: 1, cmpPct: 62, rate: 83 }],
      rushing: [],
      receiving: [],
      defense: [],
      kicking: [],
      punting: []
    },
    home: {
      passing: [{ playerId: "H-QB", player: "Home QB", pos: "QB", yds: 315, td: 3, int: 0, cmpPct: 71, rate: 121 }],
      rushing: [{ playerId: "H-RB", player: "Home RB", pos: "RB", yds: 104, td: 1, firstDowns: 5 }],
      receiving: [{ playerId: "H-WR", player: "Home WR", pos: "WR", rec: 8, yds: 132, td: 2, drops: 0 }],
      defense: [{ playerId: "H-DB", player: "Home DB", pos: "DB", tkl: 7, sacks: 0, int: 1, ff: 1, fr: 0 }],
      kicking: [],
      punting: []
    }
  }
};

test("quarter scoreboard omits empty overtime and preserves final source scores", () => {
  const result = buildQuarterScoreboard(boxScore);
  assert.deepEqual(result.labels, ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(result.rows[0].quarters, [3, 7, 3, 7]);
  assert.equal(result.rows[1].total, 27);
});

test("source-derived Impact Index ranks the game's strongest contributions", () => {
  const leaders = buildBoxScoreImpactLeaders(boxScore);
  assert.equal(leaders.length, 3);
  assert.equal(leaders[0].player, "Home WR");
  assert.equal(leaders[0].category, "Receiving");
  assert.match(leaders[0].summary, /132 yds/);
  assert.ok(leaders.every((leader) => leader.score > 0));
});
