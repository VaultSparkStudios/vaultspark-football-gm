import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("feature pack v1: owner, events, and calibration endpoints have runtime support", () => {
  const session = createSession({ seed: 777, startYear: 2026, controlledTeamId: "BUF" });

  const settings = session.getLeagueSettings();
  assert.ok(settings.eraProfile);
  assert.equal(settings.enableOwnerMode, true);

  const ownerBefore = session.getOwnerState("BUF");
  assert.ok(ownerBefore?.owner);
  assert.ok(ownerBefore.owner.personality);
  assert.ok(ownerBefore.owner.priorities);
  assert.ok(ownerBefore.cultureProfile?.identity);
  const update = session.updateOwnerState({ teamId: "BUF", ticketPrice: 190, training: 88 });
  assert.equal(update.ok, true);
  const ownerAfter = session.getOwnerState("BUF");
  assert.equal(ownerAfter.owner.ticketPrice, 190);
  assert.equal(ownerAfter.owner.facilities.training, 88);

  const staff = session.getStaff("BUF");
  assert.ok(staff.staff.scoutingDirector);
  assert.ok(staff.staff.capAnalyst);
  assert.ok(staff.staff.strengthCoach);
  assert.ok(staff.staff.medicalDirector);
  assert.ok(staff.schemeIdentity?.offense);

  const roster = session.getRoster("BUF");
  const releaseResult = session.releasePlayer({ teamId: "BUF", playerId: roster[0].id, toWaivers: false });
  assert.equal(releaseResult.ok, true);

  const events = session.getEventLog({ limit: 30 });
  assert.ok(events.length > 0);
  assert.equal(events[0].type === "transaction" || events[0].type === "news", true);

  const calJob = session.runAutoCalibrationJob({ year: session.currentYear, samples: 25, label: "test" });
  assert.ok(calJob.id);
  assert.ok(session.listCalibrationJobs(5).length >= 1);
});

test("feature pack v1: offseason pipeline progresses and comp picks generate", () => {
  const session = createSession({ seed: 888, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "offseason";
  session.resetOffseasonPipeline(session.currentYear);
  session.seedCompLedgerForUpcomingOffseason();
  const comp = session.generateCompensatoryPicks();
  assert.ok(Array.isArray(comp));

  let guard = 0;
  while (session.phase === "offseason" && guard < 20) {
    session.advanceWeek();
    guard += 1;
  }
  assert.equal(session.phase, "regular-season");

  session.simulateSeasons(1, { runOffseasonAfterLast: false });
  const warehouse = session.getWarehouseSnapshot({ year: session.currentYear - 1 });
  assert.ok(warehouse == null || typeof warehouse === "object");
});

test("feature pack v1: world-state modifiers affect scouting, recovery, and owner pressure", () => {
  const session = createSession({ seed: 999, startYear: 2026, controlledTeamId: "BUF" });
  session.updateLeagueSettings({ enableOwnerMode: true });

  const buf = session.league.teams.find((team) => team.id === "BUF");
  const mia = session.league.teams.find((team) => team.id === "MIA");
  assert.ok(buf && mia);

  buf.staff.scoutingDirector.development = 99;
  buf.owner.facilities.analytics = 99;
  buf.owner.facilities.rehab = 99;
  buf.staff.medicalDirector.discipline = 99;
  buf.owner.personality = "win-now";
  buf.owner.patience = 0.25;
  mia.staff.scoutingDirector.development = 60;
  mia.owner.facilities.analytics = 60;

  const bufGrant = session.getWeeklyScoutingPointGrant("BUF");
  const miaGrant = session.getWeeklyScoutingPointGrant("MIA");
  assert.ok(bufGrant > miaGrant);

  const injuredId = session.getRoster("BUF")[0].id;
  const injured = session.league.players.find((player) => player.id === injuredId);
  assert.ok(injured);
  injured.injury = { type: "hamstring", severity: "moderate", weeksRemaining: 3, reinjuryRisk: 0.2 };
  injured.reinjuryRisk = 0.2;
  session.decrementAvailability();
  assert.ok(!injured.injury || injured.injury.weeksRemaining <= 1);

  buf.season.wins = 1;
  buf.season.losses = 4;
  session.processOwnerFinances({
    games: [{ homeTeamId: "BUF", awayTeamId: "MIA", winnerId: "MIA", isTie: false }]
  });
  assert.equal(buf.owner.hotSeat, true);
});
