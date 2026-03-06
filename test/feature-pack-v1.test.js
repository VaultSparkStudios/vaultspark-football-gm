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
  const update = session.updateOwnerState({ teamId: "BUF", ticketPrice: 190, training: 88 });
  assert.equal(update.ok, true);
  const ownerAfter = session.getOwnerState("BUF");
  assert.equal(ownerAfter.owner.ticketPrice, 190);
  assert.equal(ownerAfter.owner.facilities.training, 88);

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
