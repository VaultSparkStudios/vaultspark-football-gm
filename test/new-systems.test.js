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

test("challenge mode can block user free agency and top-10 pick trades", () => {
  const session = createSession({ seed: 4321, startYear: 2026, controlledTeamId: "BUF" });
  session.updateLeagueSettings({ challengeMode: "no-free-agency" });

  const released = session.releasePlayer({ teamId: "BUF", playerId: session.getRoster("BUF")[0].id, toWaivers: false });
  assert.equal(released.ok, true);
  const freeAgent = session.getFreeAgents({ limit: 1 })[0];
  assert.ok(freeAgent);

  const signing = session.signFreeAgent({ teamId: "BUF", playerId: freeAgent.id });
  assert.equal(signing.ok, false);
  assert.equal(signing.reasonCode, "challenge-free-agency");

  session.updateLeagueSettings({ challengeMode: "no-top-10-picks" });
  const bufPick = session.getDraftPickAssets("BUF")[0];
  const miaPick = session.getDraftPickAssets("MIA")[0];
  session.league.draftPicks.find((pick) => pick.id === miaPick.id).originalPickIndex = 4;

  const trade = session.evaluateTradePackage({
    teamA: "BUF",
    teamB: "MIA",
    teamAPickIds: [bufPick.id],
    teamBPickIds: [miaPick.id],
    teamAPlayerIds: [],
    teamBPlayerIds: []
  });
  assert.equal(trade.ok, false);
  assert.equal(trade.reasonCode, "challenge-top10-picks");
});

test("challenge mode also blocks waiver claims, retirement overrides, and top-10 user picks", () => {
  const session = createSession({ seed: 8765, startYear: 2026, controlledTeamId: "BUF" });
  session.updateLeagueSettings({ challengeMode: "no-free-agency" });

  const waiverTarget = session.getRoster("MIA")[0];
  const released = session.releasePlayer({ teamId: "MIA", playerId: waiverTarget.id, toWaivers: true });
  assert.equal(released.ok, true);

  const waiverClaim = session.claimWaiver({ teamId: "BUF", playerId: waiverTarget.id });
  assert.equal(waiverClaim.ok, false);
  assert.equal(waiverClaim.reasonCode, "challenge-free-agency");

  const comebackPlayer = session.league.players.find((player) => player.teamId === "FA" && player.status === "active") || session.getRoster("BUF")[1];
  const retireIndex = session.league.players.findIndex((player) => player.id === comebackPlayer.id);
  session.league.players.splice(retireIndex, 1);
  comebackPlayer.status = "retired";
  comebackPlayer.teamId = "RET";
  comebackPlayer.retiredYear = session.currentYear - 1;
  session.league.retiredPlayers.push(comebackPlayer);

  const override = session.overrideRetirement({ playerId: comebackPlayer.id, teamId: "BUF", forceSign: true });
  assert.equal(override.ok, false);
  assert.equal(override.reasonCode, "challenge-free-agency");

  session.updateLeagueSettings({ challengeMode: "no-top-10-picks" });
  const draft = session.prepareDraft();
  draft.order[0] = "BUF";
  draft.currentPick = 1;

  const blockedPick = session.draftUserPick({ playerId: draft.available[0].id });
  assert.equal(blockedPick.ok, false);
  assert.equal(blockedPick.reasonCode, "challenge-top10-picks");

  const cpuAdvance = session.runCpuDraft({ picks: 1, untilUserPick: true });
  assert.equal(cpuAdvance.ok, true);
  assert.ok(cpuAdvance.draft.currentPick >= 2);
});

test("hall of fame policy and retired-number guardrails are configurable", () => {
  const session = createSession({ seed: 2468, startYear: 2026, controlledTeamId: "BUF" });
  const activePlayer = session.league.players.find((player) => player.teamId === "BUF" && Number.isFinite(player.jerseyNumber));
  assert.ok(activePlayer);
  activePlayer.seasonStats = {
    ...(activePlayer.seasonStats || {}),
    [session.currentYear - 1]: {
      ...(activePlayer.seasonStats?.[session.currentYear - 1] || {}),
      meta: {
        ...(activePlayer.seasonStats?.[session.currentYear - 1]?.meta || {}),
        teamId: "BUF",
        teamGames: { BUF: 17 }
      }
    }
  };

  const activeBlock = session.retireJerseyNumber({ teamId: "BUF", playerId: activePlayer.id });
  assert.equal(activeBlock.ok, false);
  assert.equal(activeBlock.reasonCode, "history-retired-number-active");

  const playerIndex = session.league.players.findIndex((player) => player.id === activePlayer.id);
  session.league.players.splice(playerIndex, 1);
  activePlayer.status = "retired";
  activePlayer.teamId = "RET";
  activePlayer.retiredYear = session.currentYear - 1;
  session.league.retiredPlayers.push(activePlayer);

  session.updateLeagueSettings({
    retiredNumberRequireHallOfFame: true,
    hallOfFameInductionScoreMin: 0,
    hallOfFameYearsRetiredMin: 3
  });
  const hofWaitBlock = session.retireJerseyNumber({ teamId: "BUF", playerId: activePlayer.id });
  assert.equal(hofWaitBlock.ok, false);
  assert.equal(hofWaitBlock.reasonCode, "history-retired-number-hof");

  session.updateLeagueSettings({
    hallOfFameYearsRetiredMin: 0,
    retiredNumberCareerAvMin: Math.max(1, session.getPlayerCareerApproximateValue(activePlayer.id) + 5)
  });
  const avBlock = session.retireJerseyNumber({ teamId: "BUF", playerId: activePlayer.id });
  assert.equal(avBlock.ok, false);
  assert.equal(avBlock.reasonCode, "history-retired-number-av");

  session.updateLeagueSettings({ retiredNumberCareerAvMin: 0 });
  const retired = session.retireJerseyNumber({ teamId: "BUF", playerId: activePlayer.id });
  assert.equal(retired.ok, true);
  assert.ok((session.league.hallOfFame || []).some((entry) => entry.playerId === activePlayer.id));
});
