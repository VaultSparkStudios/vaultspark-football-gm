import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureLedger,
  applyEventFeedback,
  openThreadForEvent,
  resolveThreads,
  recordPress,
  getLastPress
} from "../src/engine/continuityLedger.js";
import { generatePressConference } from "../src/engine/pressConference.js";
import { createSession } from "../src/runtime/bootstrap.js";

function miniLeague() {
  return {
    teams: [
      {
        id: "AAA",
        season: { wins: 2, losses: 8, streak: -5 },
        culture: { chemistry: 30 },
        owner: { hotSeat: 85, mandate: { targetWins: 10 } }
      },
      { id: "BBB", season: { wins: 9, losses: 1, streak: 4 }, culture: { chemistry: 70 }, owner: { hotSeat: 10 } }
    ],
    players: [
      { id: "P1", name: "Star Man", position: "WR", teamId: "AAA", morale: 40, overall: 85 },
      { id: "P2", name: "Young Gun", position: "RB", teamId: "BBB", morale: 60, overall: 78 }
    ]
  };
}

test("event feedback applies bounded deltas to the systems the headline describes", () => {
  const league = miniLeague();
  applyEventFeedback(league, { type: "CULTURE_CRISIS", year: 2026, week: 6, teamIds: ["AAA"], playerIds: [] });
  assert.equal(league.teams[0].culture.chemistry, 27);
  assert.equal(league.teams[0].owner.hotSeat, 90);

  applyEventFeedback(league, { type: "BREAKOUT_FLAG", year: 2026, week: 6, teamIds: ["BBB"], playerIds: ["P2"] });
  assert.equal(league.players[1].morale, 64);
  assert.equal(league.teams[1].culture.chemistry, 71);

  // Bounds: hot seat never exceeds 100, chemistry never drops below 0.
  for (let i = 0; i < 30; i += 1) {
    applyEventFeedback(league, { type: "CULTURE_CRISIS", year: 2026, week: 6, teamIds: ["AAA"], playerIds: [] });
  }
  assert.equal(league.teams[0].owner.hotSeat, 100);
  assert.equal(league.teams[0].culture.chemistry, 0);
});

test("crisis events open threads that resolve on real conditions and never twice", () => {
  const league = miniLeague();
  const event = { type: "TRADE_REQUEST", year: 2026, week: 5, teamIds: ["AAA"], playerIds: ["P1"], headline: "Star Man requests a trade out of AAA" };
  const thread = openThreadForEvent(league, event);
  assert.ok(thread, "trade request must open a thread");
  assert.equal(openThreadForEvent(league, event), null, "same event must not open a duplicate thread");
  assert.equal(ensureLedger(league).openThreads.length, 1);

  // Not resolved the week it opened, and not while morale is low.
  assert.equal(resolveThreads(league, { year: 2026, week: 5 }).length, 0);
  assert.equal(resolveThreads(league, { year: 2026, week: 6 }).length, 0);

  // Fences mended: morale recovers past 55.
  league.players[0].morale = 60;
  const resolved = resolveThreads(league, { year: 2026, week: 7 });
  assert.equal(resolved.length, 1);
  assert.match(resolved[0].resolution, /mended fences/);
  assert.equal(ensureLedger(league).openThreads.length, 0);
});

test("threads from a previous season are pruned silently", () => {
  const league = miniLeague();
  openThreadForEvent(league, { type: "CULTURE_CRISIS", year: 2025, week: 10, teamIds: ["AAA"], playerIds: [], headline: "old crisis" });
  const resolved = resolveThreads(league, { year: 2026, week: 2 });
  assert.equal(resolved.length, 0);
  assert.equal(ensureLedger(league).openThreads.length, 0);
});

test("press memory: a fiery loss followed by a win produces a promise-kept follow-up", () => {
  const league = {
    teams: [{ id: "BUF", season: { streak: 1 } }, { id: "MIA", season: { streak: -1 } }],
    players: []
  };
  // Last week: fiery after a blowout loss.
  recordPress(league, { year: 2026, week: 4, tone: "fiery", isWin: false, opponent: "MIA", score: "10–38" });
  assert.ok(getLastPress(league, { year: 2026, week: 5 }), "previous week must be remembered");
  assert.equal(getLastPress(league, { year: 2026, week: 7 }), null, "memory must not cross week gaps");

  const weekResult = {
    week: 5,
    games: [{ homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 27, awayScore: 13 }]
  };
  generatePressConference(league, weekResult, "BUF", 2026);

  const followUp = league.newsLog.find((n) => n.subtype === "follow-up");
  assert.ok(followUp, "follow-up press item missing");
  assert.equal(followUp.continuity, "promise-kept");
  assert.match(followUp.quote, /last week|Monday/i);

  // The podium recorded this week for next week's room.
  const last = getLastPress(league, { year: 2026, week: 6 });
  assert.ok(last);
  assert.equal(last.isWin, true);
});

test("narrative engine is live in a real season and the feed is no longer empty by construction", () => {
  const session = createSession({ seed: 20260701, startYear: 2026, controlledTeamId: "BUF" });
  assert.ok(session.getLeagueSettings().enableNarratives, "narratives must default on for this test");
  session.simulateOneSeason({ runOffseasonAfter: false });

  const ledger = session.league.continuityLedger;
  assert.ok(ledger, "continuity ledger must exist after a season");
  assert.ok(ledger.lastPress, "press memory must be recorded during the season");

  // The engine ran: the narrative log is an array that received real entries
  // OR legitimately stayed empty because no condition fired — prove the wiring
  // instead by checking that press follow-ups/receipts CAN appear and that
  // the news feed carries engine output. A full season of 32 teams reliably
  // produces at least one narrative event with these thresholds.
  assert.ok(Array.isArray(session.league.narrativeLog), "narrativeLog must exist");
  assert.ok(
    session.league.narrativeLog.length > 0,
    "a full season should fire at least one narrative event now that the engine is wired"
  );
});
