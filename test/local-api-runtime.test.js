import test from "node:test";
import assert from "node:assert/strict";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    }
  };
}

function createQuotaStorage(limitBytes) {
  const data = new Map();
  const usedBytes = () => [...data.values()].reduce((sum, value) => sum + String(value).length, 0);
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      const safeKey = String(key);
      const safeValue = String(value);
      const previous = data.get(safeKey);
      const nextBytes = usedBytes() - (previous ? previous.length : 0) + safeValue.length;
      if (nextBytes > limitBytes) {
        const error = new Error("Quota exceeded");
        error.name = "QuotaExceededError";
        error.code = 22;
        throw error;
      }
      data.set(safeKey, safeValue);
    },
    removeItem(key) {
      data.delete(String(key));
    }
  };
}

test("local api runtime supports core client-only flow", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_700_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  let response = await runtime.request("/api/setup/init");
  assert.equal(response.status, 200);
  assert.equal(response.payload.ok, true);
  assert.ok(Array.isArray(response.payload.teams));
  assert.ok(Array.isArray(response.payload.backups));
  assert.ok(response.payload.teams.every((team) => team.abbrev));

  response = await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 2026, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.state.currentYear, 2026);

  const setup = await runtime.request("/api/setup/init");
  assert.equal(setup.status, 200);
  assert.equal(setup.payload.activeLeague.mode, "play");
  assert.ok(setup.payload.activeLeague.controlledTeamName);
  assert.ok(setup.payload.activeLeague.controlledTeamAbbrev);

  response = await runtime.request("/api/state");
  assert.equal(response.payload.currentWeek, 1);

  response = await runtime.request("/api/advance-week", { method: "POST", body: { count: 3 } });
  assert.equal(response.status, 200);
  assert.ok(response.payload.state.currentWeek >= 2);

  let boxScores = await runtime.request("/api/boxscores?team=BUF&limit=4");
  assert.equal(boxScores.status, 200);
  assert.ok(boxScores.payload.games.length > 0);
  const gameId = boxScores.payload.games[0].gameId;
  let boxScore = await runtime.request(`/api/boxscore?gameId=${encodeURIComponent(gameId)}`);
  assert.equal(boxScore.status, 200);
  assert.ok((boxScore.payload.boxScore.playByPlay || []).length > 0);
  assert.ok((boxScore.payload.boxScore.scoringSummary || []).length > 0);
  assert.ok((boxScore.payload.boxScore.playerStats?.home?.passing || []).length >= 0);

  response = await runtime.request("/api/roster?team=BUF");
  assert.equal(response.status, 200);
  assert.ok(response.payload.roster.length > 0);

  const depth = await runtime.request("/api/depth-chart?team=BUF");
  assert.equal(depth.status, 200);
  const rbRowsBefore = depth.payload.snapShare.RB;
  const rbIds = depth.payload.depthChart.RB.slice(0, 2);
  const defaultTotal = Number(rbRowsBefore.reduce((sum, row) => sum + row.defaultSnapShare, 0).toFixed(3));
  const depthUpdate = await runtime.request("/api/depth-chart", {
    method: "POST",
    body: {
      teamId: "BUF",
      position: "RB",
      playerIds: rbIds,
      snapShares: {
        [rbIds[0]]: 0.2
      }
    }
  });
  assert.equal(depthUpdate.status, 200);
  assert.equal(depthUpdate.payload.snapShare[0].snapShare, 0.2);
  assert.equal(depthUpdate.payload.snapShare[1].manual, false);
  assert.equal(
    Number(depthUpdate.payload.snapShare.reduce((sum, row) => sum + row.snapShare, 0).toFixed(3)),
    defaultTotal
  );

  const updatedDepth = await runtime.request("/api/depth-chart?team=BUF");
  assert.equal(updatedDepth.status, 200);
  assert.equal(updatedDepth.payload.snapShare.RB[0].snapShare, 0.2);
  assert.equal(updatedDepth.payload.snapShare.RB[0].manual, true);
  assert.equal(updatedDepth.payload.snapShare.RB[1].manual, false);

  response = await runtime.request("/api/saves/save", { method: "POST", body: { slot: "alpha" } });
  assert.equal(response.status, 200);
  assert.equal(response.payload.slots.length, 1);
  assert.equal(response.payload.slots[0].meta.controlledTeamName, setup.payload.activeLeague.controlledTeamName);
  assert.equal(response.payload.slots[0].meta.controlledTeamAbbrev, setup.payload.activeLeague.controlledTeamAbbrev);

  response = await runtime.request("/api/snapshot/export");
  assert.equal(response.status, 200);
  assert.equal(response.payload.snapshot.controlledTeamId, "BUF");

  const exported = response.payload.snapshot;
  exported.currentWeek = 9;
  response = await runtime.request("/api/snapshot/import", { method: "POST", body: { snapshot: exported } });
  assert.equal(response.status, 200);
  assert.equal(response.payload.state.currentWeek, 9);

  response = await runtime.request("/api/jobs/simulate", { method: "POST", body: { seasons: 1 } });
  assert.equal(response.status, 202);
  assert.equal(response.payload.job.status, "completed");

  response = await runtime.request("/api/saves/load", { method: "POST", body: { slot: "alpha" } });
  assert.equal(response.status, 200);
  assert.ok(response.payload.state.currentWeek >= 2);
});

test("local api runtime exposes regular-season and playoff stat filters", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_710_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  let response = await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 3030, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });
  assert.equal(response.status, 200);

  response = await runtime.request("/api/advance-week", { method: "POST", body: { count: 19 } });
  assert.equal(response.status, 200);

  const regular = await runtime.request("/api/tables/player-season?category=defense&year=2026&seasonType=regular");
  const playoffs = await runtime.request("/api/tables/player-season?category=defense&year=2026&seasonType=playoffs");
  assert.equal(regular.status, 200);
  assert.equal(playoffs.status, 200);
  assert.ok(regular.payload.rows.length > 0);
  assert.ok(playoffs.payload.rows.length > 0);
  assert.equal(playoffs.payload.rows[0].seasonType, "playoffs");

  const playerId = playoffs.payload.rows[0].playerId;
  const profile = await runtime.request(
    `/api/player?playerId=${encodeURIComponent(playerId)}&seasonType=playoffs`
  );
  assert.equal(profile.status, 200);
  assert.equal(profile.payload.profile.seasonType, "playoffs");
  assert.ok(profile.payload.profile.timeline.length > 0);
});

test("local api runtime setup init defers backups by default", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_720_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  const initial = await runtime.request("/api/setup/init");
  assert.equal(initial.status, 200);
  assert.equal(runtime.getSession(), null);
  assert.equal(initial.payload.savesDeferred, false);
  assert.equal(initial.payload.backupsDeferred, true);
  assert.deepEqual(initial.payload.backups, []);
  assert.equal(initial.payload.diagnostics.setup.runtime, "browser");
  assert.equal(initial.payload.diagnostics.setup.bootstrapMode, "catalog-only");
  assert.ok(initial.payload.diagnostics.setup.totalMs >= 0);
  assert.ok(initial.payload.configCatalog);
  assert.equal(initial.payload.settings.rulesPreset, "standard");
  assert.ok(initial.payload.configCatalog.franchiseArchetypes.some((entry) => entry.id === "cap-hell"));

  await runtime.request("/api/saves/save", { method: "POST", body: { slot: "alpha" } });

  const withoutSaves = await runtime.request("/api/setup/init?includeSaves=0");
  assert.equal(withoutSaves.status, 200);
  assert.equal(withoutSaves.payload.savesDeferred, true);
  assert.deepEqual(withoutSaves.payload.saves, []);
  assert.equal(withoutSaves.payload.diagnostics.setup.savesDeferred, true);

  const withBackups = await runtime.request("/api/setup/init?includeBackups=1");
  assert.equal(withBackups.status, 200);
  assert.equal(withBackups.payload.savesDeferred, false);
  assert.equal(withBackups.payload.backupsDeferred, false);
  assert.ok(Array.isArray(withBackups.payload.backups));
});

test("local api runtime applies setup preset selections to new leagues", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_725_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  const created = await runtime.request("/api/new-league", {
    method: "POST",
    body: {
      seed: 6060,
      startYear: 2026,
      controlledTeamId: "BUF",
      mode: "play",
      eraProfile: "legacy",
      franchiseArchetype: "cap-hell",
      rulesPreset: "simulation",
      difficultyPreset: "hard",
      challengeMode: "small-market"
    }
  });
  assert.equal(created.status, 200);

  const settings = await runtime.request("/api/settings");
  assert.equal(settings.status, 200);
  assert.equal(settings.payload.settings.franchiseArchetype, "cap-hell");
  assert.equal(settings.payload.settings.rulesPreset, "simulation");
  assert.equal(settings.payload.settings.difficultyPreset, "hard");
  assert.equal(settings.payload.settings.challengeMode, "small-market");
  assert.equal(settings.payload.settings.scoutingWeeklyPoints, 10);
  assert.equal(settings.payload.settings.practiceSquadExperienceLimit, 1);
  assert.equal(settings.payload.settings.smallMarketMode, true);

  const roster = await runtime.request("/api/roster?team=BUF");
  assert.equal(roster.status, 200);
  assert.ok(roster.payload.cap.deadCap >= 28_000_000);

  const setup = await runtime.request("/api/setup/init");
  assert.equal(setup.status, 200);
  assert.equal(setup.payload.activeLeague.configSummary.franchiseArchetype.id, "cap-hell");
  assert.equal(setup.payload.activeLeague.configSummary.challengeMode.id, "small-market");
});

test("local api runtime persists legacy commissioner settings and blocks active-player jersey retirements", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_725_500_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 6161, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });

  const saved = await runtime.request("/api/settings", {
    method: "POST",
    body: {
      hallOfFameInductionScoreMin: 285,
      hallOfFameYearsRetiredMin: 2,
      retiredNumberRequireRetiredPlayer: true,
      retiredNumberRequireHallOfFame: true,
      retiredNumberCareerAvMin: 55
    }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.settings.hallOfFameInductionScoreMin, 285);
  assert.equal(saved.payload.settings.hallOfFameYearsRetiredMin, 2);
  assert.equal(saved.payload.settings.retiredNumberRequireRetiredPlayer, true);
  assert.equal(saved.payload.settings.retiredNumberRequireHallOfFame, true);
  assert.equal(saved.payload.settings.retiredNumberCareerAvMin, 55);

  const session = runtime.getSession();
  const activePlayer = session.getRoster("BUF")[0];
  assert.ok(activePlayer?.id);
  const livePlayer = session.league.players.find((player) => player.id === activePlayer.id);
  assert.ok(livePlayer);
  if (!Number.isFinite(livePlayer.jerseyNumber)) livePlayer.jerseyNumber = 12;

  const retireAttempt = await runtime.request("/api/history/retire-jersey", {
    method: "POST",
    body: { teamId: "BUF", playerId: activePlayer.id }
  });
  assert.equal(retireAttempt.status, 400);
  assert.equal(retireAttempt.payload.reasonCode, "history-retired-number-active");
});

test("local api runtime enforces no-free-agency challenge for user signings", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_726_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  const created = await runtime.request("/api/new-league", {
    method: "POST",
    body: {
      seed: 7070,
      startYear: 2026,
      controlledTeamId: "BUF",
      mode: "play",
      challengeMode: "no-free-agency"
    }
  });
  assert.equal(created.status, 200);

  const roster = await runtime.request("/api/roster?team=BUF");
  const released = await runtime.request("/api/release", {
    method: "POST",
    body: { teamId: "BUF", playerId: roster.payload.roster[0].id, toWaivers: false }
  });
  assert.equal(released.status, 200);

  const freeAgents = await runtime.request("/api/free-agents?limit=1");
  const target = freeAgents.payload.freeAgents[0];
  assert.ok(target?.id);

  const signing = await runtime.request("/api/sign", {
    method: "POST",
    body: { teamId: "BUF", playerId: target.id }
  });
  assert.equal(signing.status, 400);
  assert.match(signing.payload.error, /challenge mode/i);
});

test("local api runtime enforces challenge restrictions for waiver claims, retirement overrides, and top-10 picks", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_728_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  const created = await runtime.request("/api/new-league", {
    method: "POST",
    body: {
      seed: 7171,
      startYear: 2026,
      controlledTeamId: "BUF",
      mode: "play",
      challengeMode: "no-free-agency"
    }
  });
  assert.equal(created.status, 200);

  const session = runtime.getSession();
  const waiverTarget = session.getRoster("MIA")[0];
  session.releasePlayer({ teamId: "MIA", playerId: waiverTarget.id, toWaivers: true });

  const waiverClaim = await runtime.request("/api/waiver-claim", {
    method: "POST",
    body: { teamId: "BUF", playerId: waiverTarget.id }
  });
  assert.equal(waiverClaim.status, 400);
  assert.equal(waiverClaim.payload.reasonCode, "challenge-free-agency");

  const comebackRow = session.getRoster("BUF")[1];
  const comebackPlayer = session.league.players.find((player) => player.id === comebackRow.id);
  assert.ok(comebackPlayer);
  const playerIndex = session.league.players.findIndex((player) => player.id === comebackPlayer.id);
  session.league.players.splice(playerIndex, 1);
  comebackPlayer.status = "retired";
  comebackPlayer.teamId = "RET";
  comebackPlayer.retiredYear = session.currentYear - 1;
  session.league.retiredPlayers.push(comebackPlayer);

  const override = await runtime.request("/api/retirement/override", {
    method: "POST",
    body: { playerId: comebackPlayer.id, teamId: "BUF", forceSign: true }
  });
  assert.equal(override.status, 400);
  assert.equal(override.payload.reasonCode, "challenge-free-agency");

  session.updateLeagueSettings({ challengeMode: "no-top-10-picks" });
  const draft = session.prepareDraft();
  draft.order[0] = "BUF";
  draft.currentPick = 1;

  const blockedPick = await runtime.request("/api/draft/user-pick", {
    method: "POST",
    body: { playerId: draft.available[0].id }
  });
  assert.equal(blockedPick.status, 400);
  assert.equal(blockedPick.payload.reasonCode, "challenge-top10-picks");

  const cpuAdvance = await runtime.request("/api/draft/cpu", {
    method: "POST",
    body: { picks: 1, untilUserPick: true }
  });
  assert.equal(cpuAdvance.status, 200);
  assert.ok(cpuAdvance.payload.draft.currentPick >= 2);
});

test("local api runtime exposes player search for name-based admin tools", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => {
      let tick = 0;
      return () => 1_730_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 4040, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });

  const roster = await runtime.request("/api/roster?team=BUF");
  const player = roster.payload.roster[0];
  assert.ok(player?.name);

  const search = await runtime.request(`/api/players/search?q=${encodeURIComponent(player.name)}&limit=5&includeRetired=1`);
  assert.equal(search.status, 200);
  assert.ok(search.payload.players.some((entry) => entry.id === player.id));
});

test("local api runtime keeps week advancement non-fatal when auto-backups exceed browser quota", async () => {
  const runtime = createLocalApiRuntime({
    storage: createQuotaStorage(900),
    now: (() => {
      let tick = 0;
      return () => 1_740_000_000_000 + tick++;
    })(),
    scheduler: (fn) => fn()
  });

  const response = await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 5050, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });
  assert.equal(response.status, 200);

  const advanced = await runtime.request("/api/advance-week", { method: "POST", body: { count: 1 } });
  assert.equal(advanced.status, 200);
  assert.equal(advanced.payload.state.currentWeek, 2);
});
