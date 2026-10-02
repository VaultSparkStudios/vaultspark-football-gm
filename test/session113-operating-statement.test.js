import test from "node:test";
import assert from "node:assert/strict";
import { buildOperatingStatement } from "../src/domain/operatingStatement.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

const owner = (overrides = {}) => ({
  cash: 90_000_000, staffBudget: 25_000_000, ticketPrice: 120, marketSize: 1,
  personality: "legacy-builder", priorities: { championships: 70, profit: 60 },
  finances: { revenueYtd: 40_000_000, expensesYtd: 10_000_000 }, ...overrides
});

test("the statement reports only money the engine moves", () => {
  const team = { id: "AAA", owner: owner() };
  const statement = buildOperatingStatement(team, [team, { id: "BBB", owner: owner({ finances: { revenueYtd: 50_000_000, expensesYtd: 1 } }) }]);
  assert.equal(statement.netOperatingYtd, 30_000_000);
  assert.equal(statement.marginPct, 75);
  assert.equal(statement.revenueRank, 2);
  assert.equal(statement.leagueTeams, 2);
  assert.match(statement.note, /salary cap/);
});

test("thin cash becomes visible owner pressure, never a silent number", () => {
  const broke = buildOperatingStatement({ id: "AAA", owner: owner({ cash: 1 }) }, []);
  assert.equal(broke.status, "pressure");
  assert.ok(broke.ownerHeatFromFinances > 0);
  assert.equal(buildOperatingStatement({ id: "X" }), null, "no owner, no statement");
});

test("the dashboard statement is deterministic and does not move the league", () => {
  const build = () => {
    const session = new GameSession({ rng: new RNG(5113), startYear: 2026, controlledTeamId: "BUF" });
    session.advanceWeek();
    return session.getDashboardState();
  };
  const a = build();
  const b = build();
  assert.ok(a.operatingStatement.revenueYtd > 0, "a played week earns gate revenue");
  assert.deepEqual(a.operatingStatement, b.operatingStatement);
});
