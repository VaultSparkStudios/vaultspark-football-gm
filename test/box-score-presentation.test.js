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

test("all reported overtime periods and scoreless logged overtime remain visible", () => {
  const second = buildQuarterScoreboard({ ...boxScore, quarterScores: { away: [7, 0, 7, 0, 7, 0], home: [7, 0, 7, 0, 7, 3] } });
  assert.deepEqual(second.labels, ["Q1", "Q2", "Q3", "Q4", "OT", "OT2"]);
  assert.equal(second.rows[1].quarters[5], 3);
  const tied = buildQuarterScoreboard({ ...boxScore, playByPlay: [{ quarter: 5 }] });
  assert.equal(tied.labels.at(-1), "OT");
  const archived = buildQuarterScoreboard({ ...boxScore, quarterScores: { away: [7, 0, 7, 0, 0, 0, 0], home: [7, 0, 7, 0, 0, 0, 3] }, scoringSummary: [{ quarter: 7 }], playByPlayTrimmed: true });
  assert.equal(archived.labels.at(-1), "OT3");
});

test("trimmed scoreless overtime keeps its receipt and malformed period metadata stays bounded", () => {
  const archived = { ...boxScore, overtime: { elapsedSeconds: 600, periodSeconds: 600 }, playByPlayTrimmed: true };
  assert.equal(buildQuarterScoreboard(archived).labels.at(-1), "OT");
  for (const quarter of [Number.MAX_SAFE_INTEGER, 1000000, Infinity, -1, 5.5, "5"]) {
    assert.equal(buildQuarterScoreboard({ ...boxScore, playByPlay: [{ quarter }] }).labels.length, 4);
  }
  assert.equal(buildQuarterScoreboard({ ...boxScore, overtime: { elapsedSeconds: Number.MAX_SAFE_INTEGER, periodSeconds: 900 } }).labels.length, 4);
  const malformed = buildQuarterScoreboard({ ...boxScore, quarterScores: { home: { length: Number.MAX_SAFE_INTEGER }, away: null }, playByPlay: [null], scoringSummary: { quarter: 6 } });
  assert.equal(malformed.labels.length, 4);
  assert.deepEqual(malformed.rows[0].quarters, [0, 0, 0, 0]);
});
