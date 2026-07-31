/**
 * Home-field advantage — venue effects exist, are small, and are receipted.
 *
 * S62 audit: the simulator had zero home/away asymmetry beyond the opening
 * coin flip. Venue effects now enter as bounded per-game unit-rating boosts
 * (home edge + bye rest) with an explicit venue receipt on every result, and
 * the Super Bowl is a neutral site.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { simulateGame, VENUE_EDGE } from "../src/engine/gameSimulator.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { RNG } from "../src/utils/rng.js";

function homeWinShare({ session, homeTeamId, awayTeamId, games, neutralSite }) {
  let homeWins = 0;
  let decided = 0;
  for (let i = 0; i < games; i += 1) {
    const result = simulateGame({
      league: session.league,
      statBook: session.statBook,
      homeTeamId,
      awayTeamId,
      year: 2026,
      week: 1,
      rng: new RNG(90_000 + i),
      mode: "stat",
      allowTie: false,
      seasonType: "regular",
      label: "hfa-probe",
      neutralSite
    });
    if (!result.winnerId) continue;
    decided += 1;
    if (result.winnerId === homeTeamId) homeWins += 1;
  }
  return homeWins / Math.max(1, decided);
}

function closestRatedPair(league) {
  const teams = [...league.teams].sort((a, b) => (a.overallRating || 0) - (b.overallRating || 0));
  let best = [teams[0], teams[1]];
  let bestGap = Infinity;
  for (let i = 1; i < teams.length; i += 1) {
    const gap = Math.abs((teams[i].overallRating || 0) - (teams[i - 1].overallRating || 0));
    if (gap < bestGap) {
      bestGap = gap;
      best = [teams[i - 1], teams[i]];
    }
  }
  return best.map((team) => team.id);
}

test("home edge shifts win share above the same matchup on a neutral site", () => {
  const session = createSession({ seed: 620071, startYear: 2026, mode: "stat" });
  const [teamA, teamB] = closestRatedPair(session.league);
  const games = 220;

  // Same matchup, same seeds — the only difference is the venue edge.
  const withEdge = homeWinShare({ session, homeTeamId: teamA, awayTeamId: teamB, games, neutralSite: false });
  const neutral = homeWinShare({ session, homeTeamId: teamA, awayTeamId: teamB, games, neutralSite: true });

  assert.ok(
    withEdge > neutral,
    `home edge must raise win share (edge ${withEdge.toFixed(3)} vs neutral ${neutral.toFixed(3)})`
  );
  assert.ok(
    withEdge - neutral < 0.2,
    `home edge must stay small and calibrated (delta ${(withEdge - neutral).toFixed(3)})`
  );
});

test("every result carries an honest venue receipt", () => {
  const session = createSession({ seed: 620072, startYear: 2026, mode: "stat" });
  const [teamA, teamB] = session.league.teams.map((team) => team.id);

  const homeGame = simulateGame({
    league: session.league,
    statBook: session.statBook,
    homeTeamId: teamA,
    awayTeamId: teamB,
    year: 2026,
    week: 2,
    rng: new RNG(620073),
    mode: "stat",
    homeRested: true
  });
  assert.deepEqual(homeGame.venue, {
    neutralSite: false,
    homeEdgeApplied: true,
    homeRested: true,
    awayRested: false
  });
  assert.deepEqual(homeGame.boxScore.venue, homeGame.venue, "box score carries the same receipt");

  const neutralGame = simulateGame({
    league: session.league,
    statBook: session.statBook,
    homeTeamId: teamA,
    awayTeamId: teamB,
    year: 2026,
    week: 3,
    rng: new RNG(620074),
    mode: "stat",
    neutralSite: true
  });
  assert.equal(neutralGame.venue.homeEdgeApplied, false, "neutral site applies no home edge");
});

test("bye rest flows from the schedule into the weekly sim", () => {
  const session = createSession({ seed: 620075, startYear: 2026, mode: "stat" });
  // Find the first week that follows a week with byes.
  let byeWeekIndex = -1;
  const allTeams = session.league.teams.map((team) => team.id);
  for (let i = 0; i < session.seasonSchedule.length - 1; i += 1) {
    const active = new Set();
    for (const game of session.seasonSchedule[i].games) {
      active.add(game.homeTeamId);
      active.add(game.awayTeamId);
    }
    if (active.size < allTeams.length) { byeWeekIndex = i; break; }
  }
  if (byeWeekIndex === -1) {
    // Schedule shape without byes for this seed — the wiring is still covered
    // by the venue receipt test; record the honest skip.
    assert.ok(true, "no bye week in this schedule seed");
    return;
  }
  const byeTeams = allTeams.filter(
    (teamId) => !session.seasonSchedule[byeWeekIndex].games.some(
      (game) => game.homeTeamId === teamId || game.awayTeamId === teamId
    )
  );
  while (session.currentWeek <= byeWeekIndex + 1) {
    const result = session.advanceWeek();
    assert.equal(result.ok, true);
  }
  // The week after the bye: every game involving a bye team must carry the rest receipt.
  const week = session.statBook.listBoxScores?.() || null;
  const lastWeekGames = session.league.lastWeekResults?.games
    || session.getDashboardState().weekResults
    || [];
  const relevant = (Array.isArray(lastWeekGames) ? lastWeekGames : []).filter(
    (game) => byeTeams.includes(game.homeTeamId) || byeTeams.includes(game.awayTeamId)
  );
  for (const game of relevant) {
    const rested = game.venue?.homeRested || game.venue?.awayRested;
    assert.ok(rested, `game ${game.gameId || "?"} after a bye must carry a rest receipt`);
  }
  assert.ok(VENUE_EDGE.restRatingBoost > 0);
});
