import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { FIELDABLE_DEPTH } from "../src/config.js";
import { runCpuTradeMarket } from "../src/engine/cpuTradeMarket.js";

const create = (seed = 20260306) => createSession({ seed, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
const trades = (session) => session.league.transactionLog.filter((row) => row.type === "trade");

function activeCount(session, teamId, position) {
  return session.league.players.filter((player) =>
    player.teamId === teamId && player.position === position && player.status === "active" &&
    (player.rosterSlot || "active") === "active"
  ).length;
}

test("matched-seed negative control: only the enabled market creates a CPU trade, through the shared authority", () => {
  const active = create();
  const control = create();
  active.phase = control.phase = "regular-season";
  active.currentWeek = control.currentWeek = 2;
  const streamBefore = active.rng.seed;
  const capsBefore = new Map(active.league.teams.map((team) => [team.id, active.getTeamCapSummary(team.id).capSpace]));

  const result = runCpuTradeMarket(active);
  assert.ok(result?.ok, "a qualified two-club package reaches TradeService on the canonical seed");
  assert.equal(trades(active).length, 1);
  assert.equal(trades(control).length, 0, "the same league without the market has no transaction");
  assert.equal(active.rng.seed, streamBefore, "the market consumes no main RNG draw");
  assert.equal(active.rng.seed, control.rng.seed);
  assert.notEqual(result.teamA, "BUF");
  assert.notEqual(result.teamB, "BUF");
  assert.equal(result.movedA.length, 1);
  assert.equal(result.movedB.length, 1);
  assert.equal(runCpuTradeMarket(active), null, "a week cannot trade twice");
  assert.equal(trades(active).length, 1);

  for (const teamId of [result.teamA, result.teamB]) {
    assert.ok(active.getTeamCapSummary(teamId).capSpace >= 0, `${teamId} remains cap legal`);
    for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
      const count = activeCount(active, teamId, position);
      assert.ok(count >= band.min && count <= band.max, `${teamId} ${position} count ${count} stays fieldable`);
    }
  }
  assert.equal(active.getTeamCapSummary("BUF").capSpace, capsBefore.get("BUF"));
  assert.deepEqual(
    active.league.players.filter((player) => player.teamId === "BUF").map((player) => player.id),
    control.league.players.filter((player) => player.teamId === "BUF").map((player) => player.id),
    "the controlled roster remains under the player"
  );
  assert.ok(active.league.newsFeed.some((entry) => String(entry.headline || entry.text || "").includes("completed a trade")));
  assert.ok(active.league.newsFeed.some((entry) => entry.details?.kind === "cpu-trade-market" && String(entry.headline).includes(result.rationale)));
});

test("market refuses closed weeks and follows the same sorted proposal on matched seeds", () => {
  const a = create(8121);
  const b = create(8121);
  a.phase = b.phase = "regular-season";
  a.currentWeek = b.currentWeek = 2;
  assert.deepEqual(runCpuTradeMarket(a), runCpuTradeMarket(b));
  assert.deepEqual(trades(a), trades(b));
  const count = trades(a).length;
  a.currentWeek = 12;
  assert.equal(runCpuTradeMarket(a), null);
  a.currentWeek = 2;
  a.phase = "postseason";
  assert.equal(runCpuTradeMarket(a), null);
  assert.equal(trades(a).length, count);
});

test("three-year market volume stays bounded and every CPU trade excludes the controlled club", () => {
  const session = create();
  const seasons = [];
  for (let season = 0; season < 3; season += 1) {
    const year = session.currentYear;
    session.simulateOneSeason({ runOffseasonAfter: true });
    const rows = trades(session).filter((row) => row.year === year && row.teamA !== "BUF" && row.teamB !== "BUF");
    seasons.push(rows.length);
    assert.ok(rows.length <= 4, `${year} has at most four CPU trades`);
    assert.ok(rows.every((row) => row.teamA !== row.teamB));
    const clubIds = rows.flatMap((row) => [row.teamA, row.teamB]);
    assert.equal(new Set(clubIds).size, clubIds.length, "each CPU front office makes at most one market trade per year");
  }
  assert.ok(seasons.some((count) => count > 0), `the market must produce activity: ${seasons}`);
});
