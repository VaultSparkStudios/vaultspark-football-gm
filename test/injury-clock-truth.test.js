// S131 [injury-clock-truth] + [questionable-status-visible].
// The recovery tick used to run before kickoff, so an "Out 1W" injury healed
// before the very next game (probe, seed 131: 257 of 300 dressed next game).
// These tests drive the real advanceWeek and read the authoritative box-score
// game-day roster, not a stub of the seam they guard.
import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { injuryStatus } from "../public/lib/injuryStatus.js";
import { playerAvailabilitySummary } from "../public/lib/playerProfileNarrative.js";

function toRegularSeason(session) {
  for (let guard = 0; session.phase !== "regular-season" && guard < 40; guard += 1) session.advanceWeek();
  assert.equal(session.phase, "regular-season");
}

function captureDressed(session) {
  const byWeek = new Map();
  const original = session.gameDressedPlayers.bind(session);
  session.gameDressedPlayers = (game, teamId) => {
    const roster = original(game, teamId);
    const week = session.currentWeek;
    if (!byWeek.has(week)) byWeek.set(week, { teams: new Set(), players: new Set() });
    byWeek.get(week).teams.add(teamId);
    for (const player of roster) byWeek.get(week).players.add(player.id);
    return roster;
  };
  return byWeek;
}

test("a labelled multi-week injury keeps the player out of that many team games", () => {
  const session = createSession({ seed: 131, startYear: 2026, controlledTeamId: "BUF" });
  toRegularSeason(session);
  const dressed = captureDressed(session);
  session.advanceWeek(); // week 1 games
  const playedWeek1 = dressed.get(1).teams;
  const player = session.league.players.find((p) => p.status === "active" && p.teamId
    && playedWeek1.has(p.teamId) && !p.injury && (p.rosterSlot || "active") === "active" && dressed.get(1).players.has(p.id));
  assert.ok(player, "a dressed week-1 player exists");
  // Simulate an injury sustained in week 1's game, exactly as rollGameInjuries records it.
  player.injury = { type: "Out 2-3W", weeksRemaining: 2 };
  player.rehabPlan = "standard";
  let missed = 0;
  for (let i = 0; i < 6 && missed < 3; i += 1) {
    const week = session.currentWeek;
    session.advanceWeek();
    const row = dressed.get(week);
    if (!row?.teams.has(player.teamId)) continue; // bye weeks heal without a game
    if (row.players.has(player.id)) break;
    missed += 1;
  }
  assert.equal(missed, 2, "Out 2-3W with two recovery weeks misses two team games");
  assert.equal(player.injury, null, "the injury clears once its weeks are served");
});

test("between weeks, weeksRemaining is the games still to miss under the standard plan", () => {
  const session = createSession({ seed: 1312, startYear: 2026, controlledTeamId: "BUF" });
  toRegularSeason(session);
  const dressed = captureDressed(session);
  session.advanceWeek();
  // Pick a player whose team plays in week 2, so no bye can absorb the week.
  const week2Teams = new Set(session.seasonSchedule[1].games.flatMap((game) => [game.homeTeamId, game.awayTeamId]));
  const player = session.league.players.find((p) => p.status === "active" && p.teamId
    && week2Teams.has(p.teamId) && dressed.get(1).players.has(p.id) && !p.injury);
  assert.ok(player, "a dressed week-1 player whose team plays week 2 exists");
  player.injury = { type: "Out 1W", weeksRemaining: 1 };
  player.rehabPlan = "standard";
  assert.equal(session.currentWeek, 2);
  session.advanceWeek();
  assert.equal(dressed.get(2).teams.has(player.teamId), true);
  assert.equal(dressed.get(2).players.has(player.id), false, "Out 1W does not dress for the next team game");
  assert.equal(player.injury, null, "one game served, the injury is cleared");
});

test("injuryStatus distinguishes out, questionable, cleared and unknown", () => {
  assert.equal(injuryStatus(null), null);
  assert.equal(injuryStatus(undefined), null);
  assert.deepEqual(injuryStatus({ type: "Out 1W", weeksRemaining: 1 }),
    { state: "out", type: "Out 1W", weeks: 1, short: "Out · 1 wk", label: "Out 1W · out 1 week" });
  assert.equal(injuryStatus({ type: "knee", weeksRemaining: 4 }).label, "knee · out 4 weeks");
  const q = injuryStatus({ type: "Questionable", weeksRemaining: 0 });
  assert.equal(q.state, "questionable");
  assert.equal(q.label, "Questionable · injury does not rule him out");
  assert.equal(injuryStatus({ type: "Ankle", weeksRemaining: 0 }).state, "recovered");
  assert.equal(injuryStatus({ type: "Knee", weeksRemaining: null }).state, "unknown");
  assert.equal(injuryStatus({ weeksRemaining: Number.NaN }).state, "unknown");
  assert.equal(injuryStatus({ type: "  ", weeksRemaining: 2 }).type, "injury");
});

test("the dossier calls a live Questionable tag a game-time status, not a recovery", () => {
  const summary = playerAvailabilitySummary({ status: "active", rosterSlot: "active", teamId: "BUF",
    suspensionWeeks: 0, designations: {}, injury: { type: "Questionable", weeksRemaining: 0 } });
  assert.match(summary, /Questionable: a game-time injury tag that does not by itself keep him out\./);
  assert.doesNotMatch(summary, /Recovered Questionable/);
  // A suspension stays visible next to the tag; nothing promises he plays.
  const suspended = playerAvailabilitySummary({ status: "active", rosterSlot: "active", teamId: "BUF",
    suspensionWeeks: 1, designations: {}, injury: { type: "Questionable", weeksRemaining: 0 } });
  assert.match(suspended, /Suspended: 1/);
  assert.doesNotMatch(suspended, /expected to play/);
});
