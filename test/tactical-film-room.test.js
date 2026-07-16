import test from "node:test";
import assert from "node:assert/strict";
import { buildTacticalFilmReceipt, buildTacticalMatchupBrief, tacticDefinition } from "../public/lib/tacticalFilmRoom.js";

test("matchup brief derives opponent identity, tendencies, injury context, and tradeoffs", () => {
  const brief = buildTacticalMatchupBrief({
    currentWeek: 6,
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", abbrev: "BUF" },
    currentWeekSchedule: { games: [{ homeTeamId: "BUF", awayTeamId: "MIA" }] },
    teams: [{ id: "MIA", name: "Miami", overallRating: 86, scheme: { passRate: 0.64, aggression: 0.68 } }],
    injuryReport: [{ teamId: "MIA" }, { teamId: "BUF" }]
  });
  assert.equal(brief.available, true);
  assert.match(brief.read, /pass-forward, aggressive, 86 OVR, with 1 listed injury/);
  assert.match(brief.options.find((option) => option.id === "prevent").matchup, /64% pass tendency/);
  assert.match(brief.options.find((option) => option.id === "pass-heavy").tradeoff, /protection/);
});

test("film receipt evaluates chosen intent against observed box-score telemetry without causal claims", () => {
  const receipt = buildTacticalFilmReceipt({
    tactic: "run-heavy",
    controlledTeamId: "BUF",
    year: 2026,
    results: [{
      week: 4,
      games: [{
        homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 27, awayScore: 20,
        boxScore: {
          homeTeam: { teamId: "BUF", rushPlays: 34, passPlays: 26, rushingYards: 171 },
          awayTeam: { teamId: "MIA", sacks: 2, turnovers: 1, passingYards: 244 },
          playByPlay: []
        }
      }]
    }]
  });
  assert.equal(receipt.aligned, true);
  assert.equal(receipt.result, "win");
  assert.match(receipt.observed, /57% rush share · 171 rushing yards/);
  assert.match(receipt.disclaimer, /does not claim/);
});

test("film receipt rejects unknown tactics and missing controlled games", () => {
  assert.equal(buildTacticalFilmReceipt({ tactic: "fake", results: [], controlledTeamId: "BUF" }), null);
  assert.equal(tacticDefinition("fake"), null);
});
