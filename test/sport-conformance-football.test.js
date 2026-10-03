import test from "node:test";
import assert from "node:assert/strict";
import { runConformance, CONFORMANCE_CHECKS } from "../scripts/lib/sport-conformance.mjs";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

const sum = (rows = [], key) => rows.reduce((s, row) => s + Number(row?.[key] || 0), 0);

// Football is the conformance kit's first subject; every later sport pack ships this adapter shape.
export const footballAdapter = {
  createSession: (seed) => new GameSession({ rng: new RNG(seed), startYear: 2026, controlledTeamId: "BUF" }),
  advance: (session, weeks) => { for (let i = 0; i < weeks; i += 1) session.advanceWeek(); },
  games: (session) => (session.league.gameArchive || []).filter((game) => game.boxScore),
  periodScores: (box) => box.quarterScores ? { home: box.quarterScores.home || [], away: box.quarterScores.away || [] } : null,
  scoringEvents: (box) => box.scoringSummary || [],
  statClosure: (game) => {
    const box = game.boxScore;
    return ["home", "away"].flatMap((side) => {
      const team = box[`${side}Team`] || {};
      const stats = box.playerStats?.[side] || {};
      return [{ label: `${side} rushing yards`, team: team.rushingYards, players: sum(stats.rushing, "yds") }];
    });
  },
  publicText: (session) => [...(session.league.newsLog || []), ...(session.league.newsFeed || [])].map((item) => `${item.headline || ""} ${item.body || item.text || ""}`),
  forbiddenTerms: ["Super Bowl", "Pro Bowl", "NFL"]
};

test("football clears every conformance law", () => {
  const report = runConformance(footballAdapter, { seed: 20260306, weeks: 3 });
  assert.deepEqual(report.results.map((r) => r.id), [...CONFORMANCE_CHECKS]);
  for (const result of report.results) assert.ok(result.ok, `${result.id}: ${result.detail}`);
});

test("negative control: a broken box score fails closure by name", () => {
  const broken = {
    ...footballAdapter,
    games: (session) => footballAdapter.games(session).map((game, index) => index === 0 ? { ...game, homeScore: game.homeScore + 7 } : game)
  };
  const report = runConformance(broken, { seed: 20260306, weeks: 1 });
  assert.equal(report.results.find((r) => r.id === "score-closure").ok, false);
  const leaky = { ...footballAdapter, publicText: () => ["Super Bowl bound"] };
  assert.equal(runConformance(leaky, { weeks: 1 }).results.find((r) => r.id === "public-vocabulary").ok, false);
  const silent = { ...footballAdapter, periodScores: () => null, statClosure: () => [] };
  const vacuous = runConformance(silent, { weeks: 1 }).results;
  assert.equal(vacuous.find((r) => r.id === "period-closure").ok, false, "a law that checked nothing must fail");
  assert.equal(vacuous.find((r) => r.id === "stat-closure").ok, false);
});
