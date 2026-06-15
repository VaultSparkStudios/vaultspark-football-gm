import test from "node:test";
import assert from "node:assert/strict";
import { buildWeekDigestData, getDigestKey } from "../public/lib/weekDigest.js";

// ── getDigestKey ──────────────────────────────────────────────────────────────

test("getDigestKey returns a stable string for year+week", () => {
  assert.equal(getDigestKey(2026, 5), "vsfgm-wdigest-seen-2026-5");
  assert.equal(getDigestKey(2027, 14), "vsfgm-wdigest-seen-2027-14");
});

// ── buildWeekDigestData — null paths ──────────────────────────────────────────

test("buildWeekDigestData returns null when newState is missing", () => {
  assert.equal(buildWeekDigestData(null, 5), null);
});

test("buildWeekDigestData returns null when completedWeek is missing", () => {
  assert.equal(buildWeekDigestData({ phase: "regular-season", currentYear: 2026 }, 0), null);
  assert.equal(buildWeekDigestData({ phase: "regular-season", currentYear: 2026 }, null), null);
});

test("buildWeekDigestData returns null during offseason", () => {
  const state = {
    phase: "offseason",
    currentYear: 2026,
    controlledTeamId: "BUF",
    recentBoxScores: [],
  };
  assert.equal(buildWeekDigestData(state, 18), null);
});

test("buildWeekDigestData returns null during postseason phase with no data", () => {
  const state = {
    phase: "postseason",
    currentYear: 2026,
    controlledTeamId: "BUF",
    recentBoxScores: [],
    newsLog: [],
    narrativeLog: [],
  };
  assert.equal(buildWeekDigestData(state, 18), null);
});

// ── buildWeekDigestData — game result ────────────────────────────────────────

test("buildWeekDigestData finds the controlled team game for the completed week", () => {
  const state = {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 6,
    controlledTeamId: "BUF",
    recentBoxScores: [
      { gameId: "g5", year: 2026, week: 5, homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 24, awayScore: 17, winnerId: "BUF", isTie: false },
      { gameId: "g4", year: 2026, week: 4, homeTeamId: "NE",  awayTeamId: "BUF", homeScore: 10, awayScore: 14, winnerId: "BUF", isTie: false },
    ],
    newsLog: [],
    narrativeLog: [],
    cap: { capSpace: 5_000_000 },
    injuryReport: [],
    rosterNeeds: [],
  };
  const data = buildWeekDigestData(state, 5);
  assert.ok(data, "should return data for a regular-season week with a game");
  assert.equal(data.completedWeek, 5);
  assert.equal(data.year, 2026);
  assert.equal(data.game?.gameId, "g5");
  assert.equal(data.digestKey, "vsfgm-wdigest-seen-2026-5");
});

test("buildWeekDigestData finds game when team is the away side", () => {
  const state = {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 4,
    controlledTeamId: "BUF",
    recentBoxScores: [
      { gameId: "g3", year: 2026, week: 3, homeTeamId: "KC", awayTeamId: "BUF", homeScore: 28, awayScore: 21, winnerId: "KC", isTie: false },
    ],
    newsLog: [],
    narrativeLog: [],
    cap: { capSpace: 5_000_000 },
    injuryReport: [],
    rosterNeeds: [],
  };
  const data = buildWeekDigestData(state, 3);
  assert.ok(data);
  assert.equal(data.game?.gameId, "g3");
  assert.equal(data.game?.winnerId, "KC");
});

// ── buildWeekDigestData — CRITICAL news ──────────────────────────────────────

test("buildWeekDigestData surfaces a cap-alert CRITICAL item for the controlled team", () => {
  const state = {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 6,
    controlledTeamId: "BUF",
    recentBoxScores: [],
    newsLog: [
      { type: "cap-alert", headline: "BUF is $2M over the cap", teamId: "BUF", week: 5, year: 2026 },
      { type: "injury", headline: "MIA starter day-to-day", teamId: "MIA", week: 5, year: 2026 },
    ],
    narrativeLog: [],
    cap: { capSpace: -2_000_000 },
    injuryReport: [],
    rosterNeeds: [],
  };
  const data = buildWeekDigestData(state, 5);
  assert.ok(data);
  assert.equal(data.criticalNews?.type, "cap-alert");
  assert.match(data.criticalNews?.headline, /over the cap/);
});

test("buildWeekDigestData skips CRITICAL news belonging to other teams", () => {
  const state = {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 6,
    controlledTeamId: "BUF",
    recentBoxScores: [
      { gameId: "g5", year: 2026, week: 5, homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 17, awayScore: 14, winnerId: "BUF", isTie: false },
    ],
    newsLog: [
      { type: "cap-alert", headline: "MIA is $5M over the cap", teamId: "MIA", week: 5, year: 2026 },
    ],
    narrativeLog: [],
    cap: { capSpace: 10_000_000 },
    injuryReport: [],
    rosterNeeds: [],
  };
  const data = buildWeekDigestData(state, 5);
  assert.ok(data);
  assert.equal(data.criticalNews, null);
});

// ── buildWeekDigestData — next move ──────────────────────────────────────────

test("buildWeekDigestData includes a nextMove when cap is negative", () => {
  const state = {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 6,
    controlledTeamId: "BUF",
    recentBoxScores: [
      { gameId: "g5", year: 2026, week: 5, homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 24, awayScore: 17, winnerId: "BUF", isTie: false },
    ],
    newsLog: [],
    narrativeLog: [],
    cap: { capSpace: -3_000_000 },
    injuryReport: [],
    rosterNeeds: [],
  };
  const data = buildWeekDigestData(state, 5);
  assert.ok(data?.nextMove);
  assert.equal(data.nextMove.targetTab, "contractsTab");
  assert.match(data.nextMove.title, /cap pressure/i);
});

test("buildWeekDigestData includes a nextMove for injuries when cap is healthy", () => {
  const state = {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 6,
    controlledTeamId: "BUF",
    recentBoxScores: [
      { gameId: "g5", year: 2026, week: 5, homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 14, awayScore: 21, winnerId: "MIA", isTie: false },
    ],
    newsLog: [],
    narrativeLog: [],
    cap: { capSpace: 10_000_000 },
    injuryReport: [{ teamId: "BUF", playerId: "p1" }, { teamId: "BUF", playerId: "p2" }],
    rosterNeeds: [],
  };
  const data = buildWeekDigestData(state, 5);
  assert.ok(data?.nextMove);
  assert.equal(data.nextMove.targetTab, "rosterTab");
  assert.match(data.nextMove.detail, /2 players/i);
});

// ── buildWeekDigestData — narrative ──────────────────────────────────────────

test("buildWeekDigestData surfaces a narrative event for the completed week", () => {
  const state = {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 6,
    controlledTeamId: "BUF",
    recentBoxScores: [],
    newsLog: [],
    narrativeLog: [
      { year: 2026, week: 5, teamIds: ["BUF"], text: "BUF ended their 3-game skid with a gritty road win." },
      { year: 2026, week: 4, teamIds: ["MIA"], text: "Old narrative from last week." },
    ],
    cap: { capSpace: 5_000_000 },
    injuryReport: [],
    rosterNeeds: [],
  };
  const data = buildWeekDigestData(state, 5);
  assert.ok(data?.topNarrative);
  assert.match(data.topNarrative.text, /ended their 3-game skid/);
});
