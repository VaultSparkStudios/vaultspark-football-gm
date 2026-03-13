import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("release then sign free agent obeys roster constraints", () => {
  const session = createSession({ seed: 100, startYear: 2026, controlledTeamId: "BUF" });
  const rosterBefore = session.getRoster("BUF").length;
  const releaseId = session.getRoster("BUF")[0].id;
  const released = session.releasePlayer({ teamId: "BUF", playerId: releaseId, toWaivers: false });
  assert.equal(released.ok, true);
  assert.equal(session.getRoster("BUF").length, rosterBefore - 1);

  const freeAgent = session.getFreeAgents({ limit: 1 })[0];
  assert.ok(freeAgent);
  const signed = session.signFreeAgent({ teamId: "BUF", playerId: freeAgent.id });
  assert.equal(signed.ok, true);
  assert.equal(session.getRoster("BUF").length, rosterBefore);
});

test("contract restructure keeps contract valid", () => {
  const session = createSession({ seed: 101, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.getRoster("BUF").find((entry) => (entry.contract?.yearsRemaining || 0) > 1);
  assert.ok(player);
  const oldCap = player.contract.capHit;
  const result = session.restructurePlayerContract({ teamId: "BUF", playerId: player.id });
  assert.equal(result.ok, true);
  assert.ok(result.contract.capHit > 0);
  assert.ok(result.contract.restructureCount >= 1);
  assert.notEqual(result.contract.capHit, oldCap);
});

test("manual depth chart snap shares rebalance the room and influence game usage", () => {
  const session = createSession({ seed: 102, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const rbChart = session.getDepthChart("BUF").RB.slice(0, 3);
  assert.equal(rbChart.length >= 2, true);
  const before = session.getDepthChartSnapShare("BUF").RB;
  const defaultTotal = Number(before.reduce((sum, row) => sum + row.defaultSnapShare, 0).toFixed(3));

  const update = session.setDepthChart({
    teamId: "BUF",
    position: "RB",
    playerIds: rbChart,
    snapShares: {
      [rbChart[0]]: 0.18
    }
  });
  assert.equal(update.ok, true);

  const snapShareRows = session.getDepthChartSnapShare("BUF").RB;
  assert.equal(snapShareRows[0].snapShare, 0.18);
  assert.equal(snapShareRows[0].manual, true);
  assert.equal(snapShareRows[1].manual, false);
  assert.equal(snapShareRows[1].snapShare > before[1].defaultSnapShare, true);
  assert.equal(
    Number(snapShareRows.reduce((sum, row) => sum + row.snapShare, 0).toFixed(3)),
    defaultTotal
  );

  session.advanceWeek();
  session.advanceWeek();

  const firstTimeline = session.getPlayerProfile(rbChart[0], { seasonType: "regular" }).timeline;
  const secondTimeline = session.getPlayerProfile(rbChart[1], { seasonType: "regular" }).timeline;
  const firstSnaps = firstTimeline.find((entry) => entry.year === 2026)?.stats?.snaps?.offense || 0;
  const secondSnaps = secondTimeline.find((entry) => entry.year === 2026)?.stats?.snaps?.offense || 0;
  assert.ok(secondSnaps > firstSnaps);
});

test("season awards follow regular-season AV leaders", () => {
  const session = createSession({ seed: 2126, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateSeasons(1, { runOffseasonAfterLast: false });

  const offensiveLeader = [
    ...session.statBook.getPlayerSeasonTable("passing", { year: 2026, seasonType: "regular" }),
    ...session.statBook.getPlayerSeasonTable("rushing", { year: 2026, seasonType: "regular" }),
    ...session.statBook.getPlayerSeasonTable("receiving", { year: 2026, seasonType: "regular" })
  ]
    .filter((row) => ["QB", "RB", "WR", "TE"].includes(row.pos))
    .sort((a, b) => (b.av || 0) - (a.av || 0))[0];
  const defensiveLeader = session.statBook
    .getPlayerSeasonTable("defense", { year: 2026, seasonType: "regular" })
    .filter((row) => ["DL", "LB", "DB"].includes(row.pos))
    .sort((a, b) => (b.av || 0) - (a.av || 0))[0];
  const awards = session.league.awards.at(-1);

  assert.ok(awards);
  assert.equal(awards.MVP?.playerId, offensiveLeader?.playerId);
  assert.equal(awards.DPOY?.playerId, defensiveLeader?.playerId);
});
