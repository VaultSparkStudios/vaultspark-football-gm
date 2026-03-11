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
  const rbIds = depth.payload.depthChart.RB.slice(0, 2);
  const depthUpdate = await runtime.request("/api/depth-chart", {
    method: "POST",
    body: {
      teamId: "BUF",
      position: "RB",
      playerIds: rbIds,
      snapShares: {
        [rbIds[0]]: 0.2,
        [rbIds[1]]: 0.8
      }
    }
  });
  assert.equal(depthUpdate.status, 200);
  assert.equal(depthUpdate.payload.snapShare[0].snapShare, 0.2);

  const updatedDepth = await runtime.request("/api/depth-chart?team=BUF");
  assert.equal(updatedDepth.status, 200);
  assert.equal(updatedDepth.payload.snapShare.RB[0].snapShare, 0.2);
  assert.equal(updatedDepth.payload.snapShare.RB[0].manual, true);
  assert.equal(updatedDepth.payload.snapShare.RB[1].snapShare, 0.8);
  assert.equal(updatedDepth.payload.snapShare.RB[1].manual, true);

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
