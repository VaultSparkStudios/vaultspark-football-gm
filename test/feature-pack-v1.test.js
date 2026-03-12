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

test("feature pack v1: player profile exposes development outlook context", () => {
  const session = createSession({ seed: 1001, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.getRoster("BUF")[0];
  const profile = session.getPlayerProfile(player.id);
  assert.ok(profile?.developmentOutlook);
  assert.equal(typeof profile.developmentOutlook.trajectory, "string");
  assert.equal(typeof profile.developmentOutlook.fit, "number");
  assert.ok(Array.isArray(profile.developmentOutlook.focusRatings));
  assert.equal(typeof profile.developmentOutlook.legacyScore, "number");
});

test("feature pack v1: free agency AI can favor stronger team context over a small salary gap", () => {
  const session = createSession({ seed: 1002, startYear: 2026, controlledTeamId: "BUF" });
  const buf = session.league.teams.find((team) => team.id === "BUF");
  const mia = session.league.teams.find((team) => team.id === "MIA");
  assert.ok(buf && mia);

  const candidate = session.getRoster("BUF").find((player) => player.age <= 25 && player.position !== "K" && player.position !== "P");
  assert.ok(candidate);
  session.releasePlayer({ teamId: "BUF", playerId: candidate.id, toWaivers: false });

  buf.owner.personality = "player-friendly";
  buf.owner.patience = 0.76;
  buf.owner.staffBudget = 48_000_000;
  buf.cultureProfile = { ...(buf.cultureProfile || {}), identity: "developmental", pressure: 24 };
  mia.owner.personality = "profit-first";
  mia.owner.patience = 0.22;
  mia.owner.staffBudget = 18_000_000;
  mia.cultureProfile = { ...(mia.cultureProfile || {}), identity: "urgent", pressure: 78 };
  session.refreshChemistryAndSchemeFit();

  session.submitFreeAgencyOffer({ teamId: "BUF", playerId: candidate.id, years: 4, salary: 8_000_000 });
  session.submitFreeAgencyOffer({ teamId: "MIA", playerId: candidate.id, years: 4, salary: 8_600_000 });
  const result = session.processFreeAgencyMarket();

  assert.ok(result.signed >= 1);
  const signed = session.league.players.find((player) => player.id === candidate.id);
  assert.equal(signed.teamId, "BUF");
});

test("feature pack v1: owner expectation and hot-seat pressure use mandate context", () => {
  const session = createSession({ seed: 1003, startYear: 2026, controlledTeamId: "BUF" });
  const buf = session.league.teams.find((team) => team.id === "BUF");
  assert.ok(buf);

  buf.owner.personality = "win-now";
  buf.owner.patience = 0.22;
  buf.owner.fanInterest = 48;
  buf.owner.cash = 28_000_000;
  buf.strategyProfile = "win-now";
  buf.season.wins = 1;
  buf.season.losses = 6;
  session.refreshChemistryAndSchemeFit();

  const ownerState = session.getOwnerState("BUF");
  assert.equal(ownerState.owner.expectation.mandate, "playoffs-or-bust");
  assert.ok(ownerState.owner.expectation.heat >= 58);

  session.processOwnerFinances({
    games: [{ homeTeamId: "BUF", awayTeamId: "MIA", winnerId: "MIA", isTie: false }]
  });
  assert.equal(buf.owner.hotSeat, true);
});
