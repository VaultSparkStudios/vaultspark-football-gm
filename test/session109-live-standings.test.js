import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { teamSeasonRow } from "../src/stats/statBook.js";

/**
 * S109 — the dashboard's `latestStandings` read the stat book's team-season
 * archive, which is written at season end. So the Standings panel said
 * "No rows" for the whole of a franchise's first season, and during later
 * seasons showed the previous year's table as if it were the current one.
 * Found by the League-tab Playwright spec asserting rows after a played week.
 */

test("NEGATIVE CONTROL: the archive is empty for a season in progress", () => {
  const session = createSession({ seed: 20260306, controlledTeamId: "BUF" });
  session.advanceWeek();
  assert.equal(session.statBook.getTeamSeasonTable({ year: session.currentYear }).length, 0, "the old source of standings held nothing until season end");
});

test("the dashboard shows live standings from week one, and they move with the games", () => {
  const session = createSession({ seed: 20260306, controlledTeamId: "BUF" });
  const opening = session.getDashboardState();
  assert.equal(opening.latestStandings.length, 32, "every club has a row before a snap");
  assert.ok(opening.latestStandings.every((row) => row.wins === 0 && row.losses === 0), "a fresh league is 0-0 everywhere");

  session.advanceWeek();
  const d = session.getDashboardState();
  const games = d.latestWeekResults?.games?.length || 0;
  assert.ok(games > 0, "week one played games");
  const wins = d.latestStandings.reduce((sum, row) => sum + row.wins, 0);
  const losses = d.latestStandings.reduce((sum, row) => sum + row.losses, 0);
  const ties = d.latestStandings.reduce((sum, row) => sum + row.ties, 0);
  assert.equal(wins + ties / 2, games, "one win (or half a tie) per game played");
  assert.equal(losses + ties / 2, games);
  assert.equal(d.latestStandings[0].winPct >= d.latestStandings[31].winPct, true, "sorted best first");
  assert.ok(d.latestStandings.some((row) => row.isControlledTeam), "the controlled club is marked");
});

test("live rows and archived rows are one shape, from one helper", () => {
  const session = createSession({ seed: 20260306, controlledTeamId: "BUF" });
  session.advanceWeek();
  const live = session.statBook.getLiveTeamSeasonTable(session.currentYear);
  session.statBook.archiveTeamSeason(session.currentYear);
  const archived = session.statBook.getTeamSeasonTable({ year: session.currentYear });
  assert.deepEqual(Object.keys(live[0]).sort(), Object.keys(archived[0]).sort());
  const team = session.league.teams[0];
  assert.deepEqual(teamSeasonRow(team, session.currentYear), archived.find((row) => row.team === team.id));
  const d = session.getDashboardState();
  assert.equal(d.latestStandings.length, 32, "once archived, the archive is preferred and reads the same");
});
