/**
 * Session 87 — franchise-economy and evidence-boundary regressions.
 *
 * These checks invert live defects measured in S86/S87. They exercise the
 * generated league and dashboard boundaries instead of asserting on source
 * literals alone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildContract,
  CONTRACT_MARKET_PROFILE,
  marketSalaryForOverall
} from "../src/domain/contracts.js";
import { mergeGameStatDelta } from "../src/engine/gameSimulator.js";
import { computeFanApproval, updateFanSentiment } from "../src/engine/fanSentiment.js";
import {
  checkCultureCrises,
  checkOwnerUltimatums,
  cultureChemistryFor,
  ownerUltimatumContext
} from "../src/engine/narrativeEvents.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { renderFranchiseLegends } from "../public/lib/tabHistory.js";
import { renderGmReputation } from "../public/lib/tabOverview.js";
import { decoratePlayerColumnFromRows } from "../public/lib/appCore.js";

const alwaysFire = Object.freeze({ next: () => 0 });

test("the versioned market curve makes elite talent scarce while staying monotonic", () => {
  assert.equal(CONTRACT_MARKET_PROFILE.version, "2026-s87-scarcity");
  const ratings = [50, 55, 60, 70, 80, 90, 95, 99, 100];
  const salaries = ratings.map((overall) => marketSalaryForOverall(overall));
  for (let index = 1; index < salaries.length; index += 1) {
    assert.ok(salaries[index] >= salaries[index - 1], `${ratings[index]} OVR must not price below ${ratings[index - 1]} OVR`);
  }
  assert.ok(marketSalaryForOverall(99) >= 38_000_000, "elite contracts must reach the configured top-market band");
  assert.ok(marketSalaryForOverall(80) >= marketSalaryForOverall(55) * 6, "the curve must create real talent scarcity");
});

test("fresh leagues are cap-legal and most teams begin under meaningful pressure", () => {
  let pressured = 0;
  let teams = 0;
  for (const seed of [8701, 8703, 8705]) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
    for (const team of session.league.teams) {
      const capSpace = session.getTeamCapSummary(team.id).capSpace;
      assert.ok(capSpace >= 0, `${seed}/${team.id} opened above the salary cap by ${Math.abs(capSpace)}`);
      if (capSpace <= 55_000_000) pressured += 1;
      teams += 1;
    }
  }
  assert.ok(pressured >= Math.floor(teams * 0.85), `${pressured}/${teams} teams were within $55M of the cap`);
});

test("explicitly negotiated and persisted salary values are never repriced", () => {
  const salary = 12_345_678;
  assert.equal(buildContract({ overall: 99, years: 3, salary }).salary, salary);
});

test("per-game long stats use maximum semantics while counting stats remain additive", () => {
  const target = {};
  mergeGameStatDelta(target, { passing: { cmp: 1, yards: 42, long: 42 } });
  mergeGameStatDelta(target, { passing: { cmp: 1, yards: 18, long: 18 } });
  mergeGameStatDelta(target, { passing: { cmp: 1, yards: 57, long: 57 } });
  assert.deepEqual(target, { passing: { cmp: 3, yards: 117, long: 57 } });
});

test("fan approval reads the live team record without requiring dashboard standings", () => {
  const owner = { fanInterest: 70, personality: "balanced" };
  const winner = { id: "BUF", owner, season: { wins: 8, losses: 2 } };
  const loser = { id: "BUF", owner, season: { wins: 2, losses: 8 } };
  assert.equal(computeFanApproval(winner), 79);
  assert.equal(computeFanApproval(loser), 61);
  assert.ok(computeFanApproval(winner) > computeFanApproval(loser));
});

test("weekly fan sentiment changes from the live season even when league standings are absent", () => {
  const league = {
    teams: [{ id: "BUF", owner: { fanInterest: 70, personality: "balanced" }, season: { wins: 8, losses: 2 } }],
    fanSentiment: { BUF: { approval: 70, trend: "stable", reasons: [] } }
  };
  updateFanSentiment(league, {
    week: 10,
    games: [{ homeTeamId: "BUF", awayTeamId: "MIA", homeScore: 24, awayScore: 17 }]
  }, 2026);
  assert.equal(league.fanSentiment.BUF.approval, 79);
  assert.equal(league.fanSentiment.BUF.trend, "rising");
  assert.ok(league.fanSentiment.BUF.reasons.includes("won this week"));
});

test("live numeric chemistry reaches the culture-crisis event and controlled-GM decision", () => {
  const session = createSession({ seed: 8707, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  for (const team of session.league.teams) {
    team.chemistry = team.id === "BUF" ? 24 : 70;
    team.season.streak = team.id === "BUF" ? -5 : 0;
  }
  const controlled = session.league.teams.find((team) => team.id === "BUF");
  assert.equal(cultureChemistryFor(controlled), 24);
  checkCultureCrises(session.league, 2026, 4, alwaysFire);
  assert.ok(session.league.narrativeLog.some((entry) => entry.type === "CULTURE_CRISIS" && entry.teamIds.includes("BUF")));
  assert.ok(session.getDashboardState().gmDecisionQueue.some((entry) => entry.id === "culture-crisis"));
});

test("live owner patience/expectation reaches one deduplicated owner narrative", () => {
  const session = createSession({ seed: 8708, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const team = session.league.teams.find((entry) => entry.id === "BUF");
  team.owner.patience = 0.12;
  team.owner.expectation = { targetWins: 10, ultimatum: { active: true, targetWins: 10 } };
  team.season.wins = 1;
  const context = ownerUltimatumContext(team);
  assert.equal(context.hotSeat, 100);
  assert.equal(context.targetWins, 10);
  checkOwnerUltimatums(session.league, 2026, 12, alwaysFire);
  checkOwnerUltimatums(session.league, 2026, 12, alwaysFire);
  assert.equal(
    session.league.narrativeLog.filter((entry) => entry.type === "OWNER_ULTIMATUM" && entry.teamIds.includes("BUF")).length,
    1
  );
});

test("dashboard waiver projection carries player identity and degrades orphan rows honestly", () => {
  const session = createSession({ seed: 8709, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const player = session.getRoster("MIA")[0];
  assert.equal(session.releasePlayer({ teamId: "MIA", playerId: player.id, toWaivers: true }).ok, true);
  session.league.waiverWire.push({ playerId: "missing-player", releasedBy: "NYJ", year: 2026, week: 1, expiresWeek: 2 });
  const rows = session.getDashboardState().waiverWire;
  const live = rows.find((entry) => entry.playerId === player.id);
  assert.equal(live.player, player.name);
  assert.equal(live.pos, player.pos);
  assert.equal(live.overall, player.overall);
  assert.equal(rows.find((entry) => entry.playerId === "missing-player").player, "Unavailable player");
});

test("player links decorate the visible player column after internal IDs are hidden", () => {
  const cells = [{ innerHTML: "Tyler Smith" }, { innerHTML: "OL" }, { innerHTML: "83" }];
  const table = { querySelectorAll: () => [{ children: [] }, { children: cells }] };
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => id === "waiverTable" ? table : null };
  try {
    decoratePlayerColumnFromRows("waiverTable", [{
      id: "player-1",
      playerId: "player-1",
      player: "Tyler Smith",
      pos: "OL",
      ovr: 83
    }], { idKeys: ["id", "playerId"] });
    assert.match(cells[0].innerHTML, /data-player-id="player-1"/);
    assert.equal(cells[2].innerHTML, "83");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("the two authored legacy renderers have real, unique DOM mounts", () => {
  const html = fs.readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  for (const id of ["gmReputationLabel", "franchiseLegendsContainer"]) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1, `${id} must exist exactly once`);
  }
});

test("Franchise Legends renders source data and an honest empty state", () => {
  const container = { innerHTML: "" };
  const priorDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => id === "franchiseLegendsContainer" ? container : null };
  try {
    renderFranchiseLegends("franchiseLegendsContainer", []);
    assert.match(container.innerHTML, /No franchise legends yet/);
    renderFranchiseLegends("franchiseLegendsContainer", [{
      playerName: "Avery Stone", position: "QB", year: 2034, teamId: "BUF", blurb: "A defining era."
    }]);
    assert.match(container.innerHTML, /Avery Stone/);
    assert.match(container.innerHTML, /A defining era/);
  } finally {
    globalThis.document = priorDocument;
  }
});

test("General Manager reputation renders source labels and clears stale copy", () => {
  const label = { textContent: "stale", hidden: false };
  const priorDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => id === "gmReputationLabel" ? label : null };
  try {
    renderGmReputation({ labels: ["Cap Architect", "Locker-Room Steward"] });
    assert.equal(label.hidden, false);
    assert.match(label.textContent, /Cap Architect · Locker-Room Steward/);
    renderGmReputation({ labels: ["Unestablished"] });
    assert.equal(label.hidden, true);
    assert.equal(label.textContent, "");
  } finally {
    globalThis.document = priorDocument;
  }
});
