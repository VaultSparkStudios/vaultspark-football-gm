import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";

test("session e2e: core flows are operational", () => {
  const session = createSession({ seed: 20260305, startYear: 2026, controlledTeamId: "BUF" });
  assert.equal(session.getDashboardState().currentWeek, 1);

  const advanced = session.advanceWeek();
  assert.equal(advanced.ok, true);
  assert.ok(session.getDashboardState().currentWeek >= 2);

  const roster = session.getRoster("BUF");
  // Premium free agents (74+) sign through the competing-offer market (S62);
  // the instant sign path in this flow uses a depth player.
  //
  // S104 — and an **active** one. `getRoster` returns all 69, and a generated
  // club now carries a real 16-man practice squad, so the lowest-rated player
  // here is typically on it: releasing him opens a roster slot but not an
  // active one, and the re-signing below is then correctly refused with
  // "Active roster full (53)".
  const activeRoster = roster.filter((entry) => (entry.rosterSlot || "active") === "active");
  const releasable = activeRoster.find((entry) => (entry.overall || 0) < 74) || activeRoster.at(-1);
  const released = session.releasePlayer({ teamId: "BUF", playerId: releasable.id, toWaivers: false });
  assert.equal(released.ok, true);

  const signed = session.signFreeAgent({ teamId: "BUF", playerId: releasable.id });
  assert.equal(signed.ok, true, JSON.stringify(signed));

  const snapshot = session.toSnapshot();
  const loaded = createSessionFromSnapshot(snapshot);
  assert.ok(loaded.getDashboardState().currentWeek >= 2);

  const passing = session.getTables({
    table: "playerSeason",
    category: "passing",
    filters: { year: 2026, position: "QB", team: "BUF" }
  });
  assert.ok(Array.isArray(passing));

  const playerProfile = session.getPlayerProfile(session.getRoster("BUF")[0].id);
  assert.equal(Boolean(playerProfile?.player?.name), true);
});
