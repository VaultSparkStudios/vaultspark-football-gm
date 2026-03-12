import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

function avg(rows, key) {
  return rows.reduce((sum, row) => sum + (row[key] || 0), 0) / Math.max(1, rows.length);
}

test("career stat rows keep actual games for per-game calculations", () => {
  const session = createSession({ seed: 20260312, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateSeasons(2, { runOffseasonAfterLast: false });
  const qb = session.statBook.getPlayerCareerTable("passing", { position: "QB" })[0];
  assert.ok(qb);
  assert.ok(qb.g > qb.seasons);
  assert.ok(qb.gs > 0);
});

test("starter-qualified season averages stay near weighted baselines", () => {
  const session = createSession({ seed: 20260312, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateSeasons(1, { runOffseasonAfterLast: false });
  const year = 2026;

  const qbs = session.statBook.getPlayerSeasonTable("passing", { year, position: "QB" }).slice(0, 32);
  const rbs = session.statBook.getPlayerSeasonTable("rushing", { year, position: "RB" }).slice(0, 64);
  const wrs = session.statBook.getPlayerSeasonTable("receiving", { year, position: "WR" }).slice(0, 96);
  const tes = session.statBook.getPlayerSeasonTable("receiving", { year, position: "TE" }).slice(0, 32);
  const dbs = session.statBook.getPlayerSeasonTable("defense", { year, position: "DB" }).slice(0, 128);

  assert.ok(Math.abs(avg(qbs, "att") - 534) <= 45);
  assert.ok(Math.abs(avg(qbs, "yds") - 3850) <= 325);
  assert.ok(Math.abs(avg(rbs, "att") - 162) <= 18);
  assert.ok(Math.abs(avg(rbs, "yds") - 708) <= 60);
  assert.ok(Math.abs(avg(wrs, "tgt") - 88) <= 8);
  assert.ok(Math.abs(avg(wrs, "yds") - 761) <= 65);
  assert.ok(Math.abs(avg(tes, "tgt") - 77) <= 8);
  assert.ok(Math.abs(avg(tes, "yds") - 578) <= 55);
  assert.ok(Math.abs(avg(dbs, "int") - 2.1) <= 0.6);
  assert.ok(Math.abs(avg(dbs, "pd") - 10.2) <= 1.5);
});
