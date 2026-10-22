import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { createSalaryCapModel, salaryCapForSeason } from "../src/data/nflSalaryCap.js";
import { createLeagueBase } from "../src/domain/teamFactory.js";
import { tradeWindow } from "../public/lib/tradeWindow.js";

test("new leagues initialize affordability and season accounting from the verified starting cap", () => {
  for (const [year, expected] of [[2024,255_400_000], [2025,279_200_000], [2026,301_200_000]]) {
    const base = createLeagueBase(year);
    assert.ok(base.teams.every(t => base.teamCapOverride[t.id] === expected));
    const session = createSession({ seed: 601, startYear: year });
    assert.equal(session.league.capModel.kind, "official-season-base");
    for (const team of session.league.teams) {
      const cap = session.getTeamCapSummary(team.id);
      assert.equal(cap.salaryCap, expected);
      assert.ok(cap.capSpace >= 0, `${year}/${team.id} starts over cap`);
    }
  }
});

test("persisted cap basis honors future growth and rollover without claiming an official future cap", () => {
  const session = createSession({ seed: 602, startYear: 2026 });
  session.updateLeagueSettings({ capGrowthRate: .06 });
  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  delete snapshot.league.teamCapOverride.BUF;
  const restored = createSessionFromSnapshot(snapshot);
  assert.equal(restored.getTeamCapSummary("BUF").salaryCap, 301_200_000, "a missing override must recover from the persisted model");
  restored.startSeason(2027);
  restored.league.capLedger.BUF.rollover = 2_000_000;
  const cap = restored.getTeamCapSummary("BUF");
  assert.equal(cap.salaryCap, Math.round(301_200_000 * 1.06) + 2_000_000);
  assert.equal(cap.capProvenance.kind, "simulation-projection");
  assert.equal(cap.capProvenance.baseYear, 2026);
  assert.equal(createSalaryCapModel(2028).kind, "simulation-projection");
  assert.equal(createSalaryCapModel(2020).kind, "fictional-unmodeled-season-base");
  assert.throws(() => salaryCapForSeason({ baseYear: 2026, baseCap: NaN }, 2027, .045), /Invalid persisted/);
});

test("legacy saves preserve their old cap trajectory and missing default deadline", () => {
  const snapshot = JSON.parse(JSON.stringify(createSession({ seed: 603, startYear: 2026 }).toSnapshot()));
  delete snapshot.league.capModel;
  // A pre-model save also predates the independent financial-year field.
  // Retaining the new 2026 field after relabeling this fixture 2028 would
  // manufacture malformed modern metadata rather than an old save.
  delete snapshot.league.financialYear;
  delete snapshot.league.rulesModelVersion;
  delete snapshot.league.settings.tradeDeadlineWeek;
  snapshot.currentYear = snapshot.league.year = 2028;
  for (const team of snapshot.league.teams) snapshot.league.teamCapOverride[team.id] = Math.round(255_000_000 * 1.045 ** 2);
  const restored = createSessionFromSnapshot(snapshot);
  assert.equal(restored.getTeamCapSummary("BUF").salaryCap, Math.round(255_000_000 * 1.045 ** 2));
  assert.equal(restored.getLeagueSettings().tradeDeadlineWeek, 11);
  restored.startSeason(2029);
  assert.equal(restored.getTeamCapSummary("BUF").salaryCap, Math.round(255_000_000 * 1.045 ** 3));
});

test("new default and customized trade windows agree at the engine and browser boundary", () => {
  const session = createSession({ seed: 604, startYear: 2026 });
  assert.equal(session.getLeagueSettings().tradeDeadlineWeek, 10);
  session.phase = "regular-season";
  const input = { teamA: "BUF", teamB: "NE", teamAPlayerIds: [], teamBPlayerIds: [], teamAPickIds: [], teamBPickIds: [] };
  for (const week of [10,11]) {
    session.currentWeek = week;
    const closed = session.services.trades.commit(input).reasonCode === "trade-deadline-closed";
    assert.equal(closed, week === 11);
    assert.equal(tradeWindow(session.getDashboardState()).open, !closed);
  }
  session.updateLeagueSettings({ tradeDeadlineWeek: 12 });
  assert.equal(session.getLeagueSettings().tradeDeadlineWeek, 12);
  const restored = createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  assert.equal(restored.getLeagueSettings().tradeDeadlineWeek, 12);
});
