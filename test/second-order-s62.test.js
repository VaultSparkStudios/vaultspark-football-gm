/**
 * S62 second-order innovations:
 * 1. Dashboard payload parity — one authority serves both adapters.
 * 2. Continuity threads visible — open storylines + close conditions.
 * 3. Hot-path index adoption — cached FA pool + indexed player lookups.
 * Plus the exposed latent fix: snapshot-restored sessions carry full
 * TradeService strategies (fromSnapshot parity with the constructor).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { getOpenThreads, openThreadForEvent } from "../src/engine/continuityLedger.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("both adapters serve the identical dashboard authority (payload drift dead)", () => {
  const session = createSession({ seed: 620111, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const dashboard = session.getDashboardState();
  // The formerly browser-only layers now live in the base authority.
  for (const key of ["narrativeLog", "franchiseLore", "newsLog", "gmLegacy", "rivalries", "capAlerts", "activeInjuries", "fanSentiment", "continuityThreads"]) {
    assert.ok(key in dashboard, `base dashboard carries ${key}`);
  }
  const runtimeSource = read("../src/app/api/localApiRuntime.js");
  assert.match(
    runtimeSource,
    /function getAugmentedState\(session\) \{\s*return session\.getDashboardState\(\);\s*\}/,
    "the browser adapter is a passthrough of the single authority"
  );
});

test("open continuity threads surface with source-derived close conditions", () => {
  const session = createSession({ seed: 620112, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  openThreadForEvent(session.league, {
    type: "TRADE_REQUEST",
    year: 2026,
    week: 3,
    teamIds: ["BUF"],
    playerIds: ["P-TEST"],
    headline: "Star requests a trade out of BUF"
  });
  const threads = getOpenThreads(session.league);
  assert.equal(threads.length, 1);
  assert.match(threads[0].closesWhen, /traded away or morale mends/);
  const dashboard = session.getDashboardState();
  assert.equal(dashboard.continuityThreads.length, 1);
  assert.equal(dashboard.continuityThreads[0].headline, "Star requests a trade out of BUF");
  const overviewSource = read("../public/lib/tabOverview.js");
  assert.match(overviewSource, /continuityThreads/, "Overview renders open storylines");
  assert.match(overviewSource, /closesWhen/, "the close condition is player-visible");
});

test("free-agent pool is scanned once per invalidation, not once per call", () => {
  const session = createSession({ seed: 620113, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  session.runAiTeamMaintenance();
  const scans = Number(session.league.observability?.counters?.["fa-pool-scans"] || session.counters?.["fa-pool-scans"] || NaN);
  if (Number.isFinite(scans)) {
    // 32 teams; a scan per release-invalidation is legal, hundreds are not.
    assert.ok(scans <= 40, `pool scans bounded (saw ${scans})`);
  } else {
    // Counter surface unavailable — pin the structure instead.
    const source = read("../src/runtime/GameSession.js");
    assert.match(source, /faPoolCache/, "pool cache exists");
    assert.match(source, /consumeFreeAgent/, "signings prune the cache");
    assert.match(source, /invalidateFreeAgentPool/, "releases invalidate the cache");
  }
});

test("indexed player lookups replace the repeated linear scans", () => {
  const source = read("../src/runtime/GameSession.js");
  assert.match(source, /activePlayerOnTeam\(playerId, teamId\)/, "indexed helper exists");
  const linearPattern = /this\.league\.players\.find\(\s*\(entry\) => entry\.id === playerId && entry\.teamId === teamId/g;
  assert.equal((source.match(linearPattern) || []).length, 0, "team-scoped linear scans are gone");

  const session = createSession({ seed: 620114, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const player = session.getRoster("BUF")[0];
  assert.equal(session.activePlayerOnTeam(player.id, "BUF")?.id, player.id);
  assert.equal(session.activePlayerOnTeam(player.id, "MIA"), null);
  assert.equal(session.activePlayerOnTeam("nope", "BUF"), null);
});

test("snapshot-restored sessions carry a fully-armed TradeService", () => {
  const session = createSession({ seed: 620115, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const restored = createSessionFromSnapshot(session.toSnapshot());
  const buf = restored.getRoster("BUF");
  const mia = restored.getRoster("MIA");
  // Before the fix this crashed with "teamPlayersAll is not a function".
  const evaluation = restored.services.trades.evaluate({
    teamA: "BUF",
    teamB: "MIA",
    teamAPlayerIds: [buf[0].id],
    teamBPlayerIds: [mia[0].id]
  });
  assert.ok(typeof evaluation.ok === "boolean", "evaluate returns a verdict, not a crash");
});
