import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { buildOffseasonDevelopmentReport } from "../src/engine/offseasonDevelopmentReport.js";
import { applyAgingProgressionAndRetirements, progressPlayer } from "../src/engine/offseasonSimulator.js";
import { RNG } from "../src/utils/rng.js";

/**
 * S108 — every player's annual overall move is computed in `progressPlayer`
 * and, until this session, discarded. The GM was told "12 retired, 40
 * contracts expired" and nothing about who grew into the potential the
 * profile promised. The ledger is now returned from the engine, summarised
 * for the controlled club, written to the pipeline, the stage message and the
 * news feed, and rendered on the History tab.
 */

test("progressPlayer returns the move it made, and the move is the engine's own", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.league.players.find((candidate) => Number(candidate.age) <= 24 && candidate.status === "active");
  const before = Number(player.overall);
  const move = progressPlayer(player, new RNG(7), {});
  assert.equal(move.before, before);
  assert.equal(move.after, Number(player.overall));
  assert.equal(typeof move.delta, "number");
});

test("the development ledger describes exactly what the offseason did to the league", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const league = session.league;
  const before = new Map(league.players.filter((p) => p.status === "active").map((p) => [p.id, Number(p.overall)]));
  const { progressed } = applyAgingProgressionAndRetirements(league, 2026, new RNG(11), {});

  assert.equal(progressed.length, before.size, "one row per player the offseason progressed, retirees included");
  const byId = new Map(progressed.map((row) => [row.playerId, row]));
  for (const player of league.players) {
    const row = byId.get(player.id);
    assert.ok(row, `${player.id} progressed but has no row`);
    assert.equal(row.before, before.get(player.id));
    assert.equal(row.after, Number(player.overall), `${player.id}: the row's after is the overall he now carries`);
    assert.equal(row.change, row.after - row.before);
    assert.equal(row.retired, false);
  }
  const retiredRows = progressed.filter((row) => row.retired);
  assert.equal(retiredRows.length, league.retiredPlayers.filter((p) => p.retiredYear === 2026).length, "retirees are in the ledger, flagged, not dropped");
});

test("recording the ledger adds no RNG draw: two leagues from one seed develop identically", () => {
  const a = createSession({ seed: 8121, startYear: 2026, controlledTeamId: "BUF" });
  const b = createSession({ seed: 8121, startYear: 2026, controlledTeamId: "BUF" });
  a.runRosterYearRollover();
  b.runRosterYearRollover();
  const fingerprint = (session) => session.league.players.map((p) => `${p.id}:${p.overall}:${p.age}`).join("|");
  assert.equal(fingerprint(a), fingerprint(b));
  assert.equal(a.rng.next(), b.rng.next(), "the stream position after the rollover is identical");
});

test("the club report is a faithful summary of the club's rows, and its lists are ordered", () => {
  const progressed = [
    { playerId: "a", teamId: "BUF", name: "A", position: "QB", age: 24, before: 70, after: 76, change: 6, potential: 84, trait: "Superstar", retired: false },
    { playerId: "b", teamId: "BUF", name: "B", position: "WR", age: 31, before: 80, after: 77, change: -3, potential: 80, trait: "Normal", retired: false },
    { playerId: "c", teamId: "BUF", name: "C", position: "OL", age: 26, before: 75, after: 75, change: 0, potential: 79, trait: null, retired: false },
    { playerId: "d", teamId: "BUF", name: "D", position: "RB", age: 34, before: 72, after: 66, change: -6, potential: 72, trait: null, retired: true },
    { playerId: "e", teamId: "BUF", name: "E", position: "DB", age: 23, before: 68, after: 70, change: 2, potential: 80, trait: "Hidden Development", retired: false },
    { playerId: "z", teamId: "NYJ", name: "Z", position: "QB", age: 22, before: 60, after: 71, change: 11, potential: 90, trait: "Superstar", retired: false }
  ];
  const report = buildOffseasonDevelopmentReport({ progressed, teamId: "BUF", year: 2026 });
  assert.deepEqual(report.club, { progressed: 4, improved: 2, declined: 1, held: 1, netOverall: 5, meanChange: 1.25 }, "retirees are excluded from the club summary; the other club is not counted");
  assert.deepEqual(report.risers.map((r) => r.playerId), ["a", "e"]);
  assert.deepEqual(report.fallers.map((r) => r.playerId), ["b"]);
  assert.match(report.summaryLine, /2 of 4 improved, 1 declined \(net \+5 OVR\)/);
  assert.match(report.summaryLine, /Biggest riser: A \(QB\) \+6 to 76/);
  assert.match(report.summaryLine, /Steepest decline: B \(WR\) -3 to 77/);
  assert.equal(report.league.progressed, 5);
  assert.match(report.headline, /^Offseason development: A \+6 to 76 leads 2 improved$/);
});

test("the rollover writes the report to the pipeline, the stage message and the news feed", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const club = session.league.players.filter((p) => p.teamId === "BUF" && p.status === "active");
  const before = new Map(club.map((p) => [p.id, Number(p.overall)]));

  const result = session.runRosterYearRollover();
  const report = result.development;
  assert.ok(report, "the rollover returns the development report");
  assert.equal(session.getOffseasonPipeline().developmentReport, report, "and keeps it on the pipeline for the dashboard");
  assert.equal(report.teamId, "BUF");
  assert.equal(report.year, 2026);

  // The club's net move in the report is the club's net move in the league.
  // Contracts expire BEFORE progression, so a player whose deal ran out was a
  // free agent when he was progressed and is not a club row; the club is the
  // players still under contract to it after the roll.
  const survivors = session.league.players.filter((p) => before.has(p.id) && p.status === "active" && p.teamId === "BUF");
  const actualNet = survivors.reduce((sum, p) => sum + (Number(p.overall) - before.get(p.id)), 0);
  const retiredFromClub = session.league.retiredPlayers.filter((p) => before.has(p.id) && p.retiredYear === 2026);
  assert.equal(report.club.progressed, survivors.length, "club rows are the club's players still active after the roll");
  assert.equal(report.club.netOverall, actualNet);
  for (const mover of [...report.risers, ...report.fallers]) {
    const live = session.league.players.find((p) => p.id === mover.playerId);
    assert.ok(live, `${mover.name} is still on the league`);
    assert.equal(mover.after, Number(live.overall));
    assert.equal(mover.before, before.get(mover.playerId));
  }
  assert.ok(retiredFromClub.every((p) => !report.risers.concat(report.fallers).some((m) => m.playerId === p.id)), "retirees never appear as movers");

  const news = session.getNewsFeed({ limit: 5 }).find((entry) => entry.details?.type === "development");
  assert.ok(news, "a development news entry is logged to the long-form feed");
  assert.equal(news.headline, report.headline);
  assert.equal(news.details.teamId, "BUF");

  // The Priority Inbox ingests `dashboard.newsLog` and reads a top-level type;
  // the item must be there, in that shape, or the bell never rings for it.
  const dashboard = session.getDashboardState();
  const inboxItem = (dashboard.newsLog || []).find((item) => item.type === "development");
  assert.ok(inboxItem, "the development item is on the newsLog the inbox reads");
  assert.equal(inboxItem.headline, report.headline);
  assert.deepEqual(inboxItem.teamIds, ["BUF"]);
  assert.equal(dashboard.developmentReport, report, "the dashboard carries the report directly");
});

test("the report survives a save and reload, and the season that follows it", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const { development } = session.runRosterYearRollover();
  const restored = GameSession.fromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())), (seed) => new RNG(seed));
  assert.deepEqual(restored.getDashboardState().developmentReport, development, "the league keeps the latest report through a snapshot");

  // Move the year on: the pipeline is reset for the new year on a reload, and
  // the report is still on the dashboard — that is why it lives on the league.
  restored.currentYear += 1;
  const reloaded = GameSession.fromSnapshot(JSON.parse(JSON.stringify(restored.toSnapshot())), (seed) => new RNG(seed));
  assert.notEqual(reloaded.getOffseasonPipeline().developmentReport?.year, development.year, "the pipeline copy is gone with the year");
  assert.deepEqual(reloaded.getDashboardState().developmentReport, development, "the dashboard copy is not");
});

test("the retirements stage message carries the development line", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "offseason";
  const pipeline = session.getOffseasonPipeline();
  pipeline.stage = "retirements";
  const result = session.advanceOffseasonPipeline();
  assert.match(result.message, /retired, \d+ contracts expired/);
  assert.match(result.message, /\d+ of \d+ improved, \d+ declined \(net [+-]?\d+ OVR\)/);
});
