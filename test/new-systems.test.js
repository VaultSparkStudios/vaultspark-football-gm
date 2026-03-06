import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("new systems: picks, settings, designation, and negotiation flows", () => {
  const session = createSession({ seed: 90210, startYear: 2026, controlledTeamId: "BUF" });

  const picks = session.getDraftPickAssets("BUF");
  assert.ok(picks.length >= 7);

  const settings = session.updateLeagueSettings({ injuryRateMultiplier: 1.2, capGrowthRate: 0.05, cpuTradeAggression: 0.65 });
  assert.equal(settings.injuryRateMultiplier, 1.2);
  assert.equal(settings.capGrowthRate, 0.05);

  const roster = session.getRoster("BUF");
  const designation = session.setPlayerDesignation({
    teamId: "BUF",
    playerId: roster[0].id,
    designation: "gameDayInactive",
    active: true
  });
  assert.equal(designation.ok, true);

  const targets = session.listNegotiationTargets("BUF");
  assert.ok(Array.isArray(targets));
  assert.ok(targets.length > 0);
  const negotiation = session.negotiateAndSign({
    teamId: "BUF",
    playerId: targets[0].id,
    years: targets[0].demand?.years,
    salary: targets[0].demand?.salary
  });
  assert.equal(negotiation.ok, true);
});

test("trade evaluation supports pick assets", () => {
  const session = createSession({ seed: 321, startYear: 2026, controlledTeamId: "BUF" });
  const bufPick = session.getDraftPickAssets("BUF")[0];
  const miaPick = session.getDraftPickAssets("MIA")[0];

  const evaluation = session.evaluateTradePackage({
    teamA: "BUF",
    teamB: "MIA",
    teamAPickIds: [bufPick.id],
    teamBPickIds: [miaPick.id],
    teamAPlayerIds: [],
    teamBPlayerIds: []
  });

  assert.equal(evaluation.ok, true);
  const trade = session.tradePlayers({
    teamA: "BUF",
    teamB: "MIA",
    teamAPickIds: [bufPick.id],
    teamBPickIds: [miaPick.id],
    teamAPlayerIds: [],
    teamBPlayerIds: []
  });
  assert.equal(trade.ok, true);
});
