/**
 * Celebration & milestone authority (S62) — dramatic wins beyond close games,
 * playoff outcomes, championships, Hall of Fame inductions, and jersey
 * retirements all announce themselves. One shared authority owns Franchise
 * Moment drama scoring for both adapters (the inline drift twin is dead).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreDrama, buildFranchiseMoment, handleFranchiseMomentRequest } from "../src/runtime/handlers/franchiseMomentHandler.js";
import { createSession } from "../src/runtime/bootstrap.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("drama scoring pays off statement wins, playoffs, titles, and eliminations", () => {
  // The old formula: a 45-3 blowout win scored 0 — below the display gate.
  assert.ok(scoreDrama({ won: true, margin: 42, scoringPlays: 7, seasonType: "regular" }) >= 2,
    "a statement blowout is a moment");
  assert.ok(scoreDrama({ won: false, margin: 42, scoringPlays: 7, seasonType: "regular" }) < 2,
    "being blown out in the regular season is not a celebration");
  assert.ok(scoreDrama({ won: true, margin: 10, scoringPlays: 6, seasonType: "playoffs" }) >= 2,
    "every playoff game registers");
  assert.ok(scoreDrama({ won: true, margin: 10, scoringPlays: 6, seasonType: "playoffs", label: "super-bowl" }) >= 5,
    "a championship dwarfs a regular win");
  assert.ok(scoreDrama({ won: false, margin: 10, scoringPlays: 6, seasonType: "playoffs" }) >= 2,
    "elimination has emotional weight");
  // Close-game behavior unchanged from the original formula.
  assert.equal(scoreDrama({ won: true, margin: 3, scoringPlays: 9, seasonType: "regular" }), 6);
});

test("a full season produces playoff/championship receipts for the controlled team when it makes the bracket", () => {
  // Deterministic sweep: find a seed where BUF makes the playoffs.
  let celebrated = false;
  for (const seed of [620101, 620102, 620103, 620104, 620105]) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
    session.simulateSeasons(1, { runOffseasonAfterLast: false });
    const news = session.league.newsLog || [];
    const madePlayoffs = (session.league.gameArchive || []).some(
      (game) => game.seasonType === "playoffs" && (game.homeTeamId === "BUF" || game.awayTeamId === "BUF")
    );
    if (!madePlayoffs) continue;
    const hasOutcome = news.some((item) =>
      ["championship", "playoff-elimination"].includes(item.type)
    );
    assert.ok(hasOutcome, `seed ${seed}: a playoff run must end in a celebration or elimination receipt`);
    celebrated = true;
    break;
  }
  assert.ok(celebrated, "at least one sampled seed put BUF in the playoffs");
});

test("the shared moment handler serves both adapters and honors playoff drama", () => {
  const session = createSession({ seed: 620106, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  session.advanceWeek();
  const response = handleFranchiseMomentRequest({ session, teamId: "buf" });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  // Moment may be null on a quiet week — that is honest; the shape is the contract.
  if (response.body.moment) {
    assert.equal(typeof response.body.moment.dramaScore, "number");
    assert.ok(response.body.moment.headline.length > 0);
  }
  const none = handleFranchiseMomentRequest({ session: null });
  assert.equal(none.status, 404);
  assert.equal(buildFranchiseMoment(session, "BUF")?.gameId, response.body.moment?.gameId);
});

test("both adapters delegate to the shared moment authority (drift twin is dead)", () => {
  const serverSource = read("../src/server.js");
  const runtimeSource = read("../src/app/api/localApiRuntime.js");
  assert.match(serverSource, /handleFranchiseMomentRequest/);
  assert.match(runtimeSource, /handleFranchiseMomentRequest/);
  assert.doesNotMatch(serverSource, /dramaScore = \(isUpset \? 3 : 0\)/, "inline scoring removed from server");
  assert.doesNotMatch(runtimeSource, /dramaScore = \(isUpset \? 3 : 0\)/, "inline scoring removed from browser runtime");
});

test("jersey retirement announces itself through the inbox pipeline", () => {
  const session = createSession({ seed: 620107, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const player = session.league.players.find((p) => p.teamId === "BUF" && Number.isFinite(p.jerseyNumber));
  // Retire the player manually to satisfy the retired-player requirement.
  player.status = "retired";
  player.retiredYear = session.currentYear;
  session.league.retiredPlayers.push(player);
  session.league.players = session.league.players.filter((p) => p.id !== player.id);
  session.rebuildLookupIndexes();
  session.statBook.reindexPlayers();
  const settings = session.league.settings || {};
  settings.retiredNumberCareerAvMin = 0;
  settings.retiredNumberRequireHallOfFame = false;
  session.league.settings = settings;
  const result = session.retireJerseyNumber({ teamId: "BUF", playerId: player.id });
  assert.equal(result.ok, true, JSON.stringify(result));
  const news = (session.league.newsLog || []).find((item) => item.type === "jersey-retirement");
  assert.ok(news, "jersey retirement pushes an inbox-visible receipt");
  assert.match(news.headline, new RegExp(String(player.jerseyNumber)));
});

test("inbox tiers and deeplinks cover the new celebration types", () => {
  const source = read("../public/lib/engagementFeatures.js");
  for (const type of ["championship", "playoff-win", "playoff-elimination", "hof-induction", "jersey-retirement"]) {
    assert.match(source, new RegExp(type), `classifier/deeplink knows ${type}`);
  }
});
