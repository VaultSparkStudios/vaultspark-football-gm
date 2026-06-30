import test from "node:test";
import assert from "node:assert/strict";
import { reportTrade } from "../src/engine/beatReporter.js";
import { generatePressConference } from "../src/engine/pressConference.js";
import { createLobby, addPlayerToLobby, queueIntent } from "../src/runtime/multiplayerSession.js";
import { DraftWarRoom } from "../public/lib/draftWarRoom.js";

test("beat reporter news ids are deterministic from event fields", () => {
  const leagueA = { newsLog: [] };
  const leagueB = { newsLog: [] };

  reportTrade(leagueA, "BUF", "MIA", "A. Example", 2026, 4);
  reportTrade(leagueB, "BUF", "MIA", "A. Example", 2026, 4);

  assert.equal(leagueA.newsLog[0].id, leagueB.newsLog[0].id);
  assert.doesNotMatch(leagueA.newsLog[0].id, /undefined|NaN/);
});

test("press conference ids are deterministic for the same game", () => {
  const weekResult = {
    week: 7,
    games: [
      {
        homeTeamId: "BUF",
        awayTeamId: "MIA",
        homeScore: 31,
        awayScore: 24,
        playerStats: { BUF: { qb1: { name: "A. Quarterback", passingYards: 290, touchdowns: 3 } } }
      }
    ]
  };
  const leagueA = { teams: [{ id: "BUF", season: { streak: 2 } }], newsLog: [] };
  const leagueB = { teams: [{ id: "BUF", season: { streak: 2 } }], newsLog: [] };

  generatePressConference(leagueA, weekResult, "BUF", 2026);
  generatePressConference(leagueB, weekResult, "BUF", 2026);

  assert.deepEqual(leagueA.newsLog.map((item) => item.id), leagueB.newsLog.map((item) => item.id));
});

test("multiplayer intent ids are deterministic queue positions", () => {
  const lobby = createLobby({ leagueId: "league-1", commissionerId: "gm-1", leagueName: "Test League" });
  addPlayerToLobby(lobby, { userId: "gm-1", displayName: "GM", controlledTeamId: "BUF" });

  const first = queueIntent(lobby, "gm-1", "restructure", { playerId: "p1" });
  const second = queueIntent(lobby, "gm-1", "release", { playerId: "p2" });

  assert.equal(first.id, "intent-1-0-BUF-restructure-1");
  assert.equal(second.id, "intent-1-0-BUF-release-2");
});

test("draft war room trade caller is deterministic for the same pick context", () => {
  const prospects = [{ id: "wr-1", name: "Case Harper", position: "WR", overall: 82 }];
  const a = new DraftWarRoom({});
  const b = new DraftWarRoom({});

  const callA = a.checkTradeCall(12, 15, prospects, "WR");
  const callB = b.checkTradeCall(12, 15, prospects, "WR");

  assert.equal(callA.callerTeam, callB.callerTeam);
  assert.equal(callA.targetName, "Case Harper");
});
