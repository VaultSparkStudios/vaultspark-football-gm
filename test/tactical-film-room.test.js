import test from "node:test";
import assert from "node:assert/strict";
import { buildRematchMemory, buildTacticalFilmReceipt, buildTacticalIdentityLedger, buildTacticalMatchupBrief, tacticDefinition, TACTIC_MODEL_VERSION } from "../public/lib/tacticalFilmRoom.js";

test("matchup brief derives opponent identity, tendencies, injury context, and tradeoffs", () => {
  const brief = buildTacticalMatchupBrief({
    currentWeek: 6,
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", abbrev: "BUF" },
    currentWeekSchedule: { games: [{ homeTeamId: "BUF", awayTeamId: "MIA" }] },
    teams: [{ id: "MIA", abbrev: "MG", name: "Miami", overallRating: 86, scheme: { passRate: 0.64, aggression: 0.68 } }],
    injuryReport: [{ teamId: "MIA" }, { teamId: "BUF" }]
  });
  assert.equal(brief.available, true);
  assert.match(brief.read, /MG profiles as pass-forward, aggressive, 86 OVR, with 1 listed injury/);
  assert.match(brief.options.find((option) => option.id === "run-heavy").matchup, /MG's pass-forward offense/);
  assert.match(brief.options.find((option) => option.id === "prevent").matchup, /64% pass tendency/);
  assert.match(brief.options.find((option) => option.id === "pass-heavy").tradeoff, /protection/);
});

test("rematch memory turns only receipted rivalry history into non-causal matchup context", () => {
  const dashboard = {
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", abbrev: "OS" },
    teams: [{ id: "MIA", abbrev: "DMW" }],
    rivalries: {
      "BUF:MIA": {
        teams: ["BUF", "MIA"],
        history: [
          { week: 12, homeTeamId: "MIA", awayTeamId: "BUF", homeScore: 20, awayScore: 27, winner: "BUF" },
          { week: 3, homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 17, awayScore: 21, winner: "MIA" }
        ]
      }
    }
  };
  const memory = buildRematchMemory(dashboard, "MIA");
  assert.equal(memory.available, true);
  assert.equal(memory.result, "won");
  assert.match(memory.headline, /OS 27, DMW 20/);
  assert.match(memory.detail, /Week 12.*1-1/);
  assert.match(memory.disclaimer, /not a prediction or a causal claim/);
  assert.deepEqual(buildRematchMemory({ controlledTeamId: "BUF", rivalries: {} }, "MIA"), { available: false });
});

test("matchup brief carries rematch memory from the dashboard's single rivalry authority", () => {
  const brief = buildTacticalMatchupBrief({
    currentWeek: 14,
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", abbrev: "BUF" },
    currentWeekSchedule: { games: [{ homeTeamId: "BUF", awayTeamId: "MIA" }] },
    teams: [{ id: "MIA", overallRating: 80, scheme: {} }],
    rivalries: { pair: { teams: ["BUF", "MIA"], history: [{ week: 2, homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 24, awayScore: 10, winner: "BUF" }] } }
  });
  assert.equal(brief.rematchMemory.available, true);
  assert.match(brief.rematchMemory.headline, /24, MIA 10/);
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
  assert.equal(receipt.definitionVersion, TACTIC_MODEL_VERSION);
  assert.equal(receipt.tacticAuthorityId, "tactical-plan@2.0:run-heavy");
  assert.match(receipt.observed, /57% rush share · 171 rushing yards/);
  assert.match(receipt.disclaimer, /does not claim/);
});

test("film receipt rejects unknown tactics and missing controlled games", () => {
  assert.equal(buildTacticalFilmReceipt({ tactic: "fake", results: [], controlledTeamId: "BUF" }), null);
  assert.equal(tacticDefinition("fake"), null);
});

test("tactic definitions expose one unit-scoped modifier authority", () => {
  const run = tacticDefinition("run-heavy");
  const blitz = tacticDefinition("blitz-heavy");
  assert.equal(run.unit, "offense");
  assert.equal(blitz.unit, "defense");
  assert.equal(run.authorityId, "tactical-plan@2.0:run-heavy");
  assert.equal(blitz.definitionVersion, TACTIC_MODEL_VERSION);
  assert.equal("defenseAggressionDelta" in run.modifiers, false);
  assert.equal("passLeanDelta" in blitz.modifiers, false);
  assert.equal("offenseAggressionDelta" in blitz.modifiers, false);
});
test("tactical identity is deterministic, bounded, and separates repetition from alignment", () => {
  const receipts = [
    { tactic: "run-heavy", aligned: true },
    { tactic: "pass-heavy", aligned: true },
    { tactic: "run-heavy", aligned: false },
    { tactic: "run-heavy", aligned: true },
    { tactic: "blitz-heavy", aligned: true }
  ];
  const identity = buildTacticalIdentityLedger(receipts);
  assert.equal(identity.tactic, "run-heavy");
  assert.equal(identity.tier, "Established");
  assert.equal(identity.repetitions, 3);
  assert.equal(identity.alignedRepetitions, 2);
  assert.equal(identity.sampleSize, 5);
  assert.match(identity.disclaimer, /does not claim.*caused/i);
  assert.deepEqual(identity, buildTacticalIdentityLedger(receipts));
});

test("tactical identity uses recent-choice order as a stable tie break and caps its evidence window", () => {
  const receipts = [
    { tactic: "prevent", aligned: false },
    { tactic: "blitz-heavy", aligned: true },
    ...Array.from({ length: 14 }, (_, index) => ({ tactic: index % 2 ? "blitz-heavy" : "prevent", aligned: true }))
  ];
  const identity = buildTacticalIdentityLedger(receipts);
  assert.equal(identity.sampleSize, 12);
  assert.equal(identity.tactic, "prevent");
  assert.equal(buildTacticalIdentityLedger([]), null);
});
