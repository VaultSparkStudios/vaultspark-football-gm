import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

function advanceToCampCuts(session) {
  session.phase = "offseason";
  session.resetOffseasonPipeline(session.currentYear);
  let guard = 0;
  while (session.getOffseasonPipeline().stage !== "camp-cuts" && guard < 12) {
    session.advanceWeek();
    guard += 1;
  }
  assert.equal(session.getOffseasonPipeline().stage, "camp-cuts");
}

test("world-state next step: scouting reveal quality improves with staff and fit context", () => {
  const strong = createSession({ seed: 1201, startYear: 2026, controlledTeamId: "BUF" });
  const weak = createSession({ seed: 1201, startYear: 2026, controlledTeamId: "BUF" });
  strong.prepareDraft();
  weak.prepareDraft();

  const strongTeam = strong.league.teams.find((team) => team.id === "BUF");
  const weakTeam = weak.league.teams.find((team) => team.id === "BUF");
  assert.ok(strongTeam && weakTeam);

  strongTeam.staff.scoutingDirector.development = 99;
  strongTeam.owner.facilities.analytics = 99;
  strongTeam.owner.staffBudget = 55_000_000;
  strongTeam.owner.patience = 0.74;
  weakTeam.staff.scoutingDirector.development = 58;
  weakTeam.owner.facilities.analytics = 52;
  weakTeam.owner.staffBudget = 18_000_000;
  weakTeam.owner.patience = 0.22;
  strong.refreshChemistryAndSchemeFit();
  weak.refreshChemistryAndSchemeFit();

  const prospect = strong.getDraftState().available[0];
  const strongSpend = strong.allocateScoutingPoints({ teamId: "BUF", playerId: prospect.id, points: 12 });
  const weakSpend = weak.allocateScoutingPoints({ teamId: "BUF", playerId: prospect.id, points: 12 });

  assert.equal(strongSpend.ok, true);
  assert.equal(weakSpend.ok, true);
  assert.ok(Math.abs(strongSpend.scoutedOverall - prospect.overall) <= Math.abs(weakSpend.scoutedOverall - prospect.overall));
  assert.ok(strongSpend.confidence >= weakSpend.confidence);
});

test("world-state next step: development environment improves offseason growth and recovery", () => {
  const strong = createSession({ seed: 1202, startYear: 2026, controlledTeamId: "BUF" });
  const weak = createSession({ seed: 1202, startYear: 2026, controlledTeamId: "BUF" });

  const strongTeam = strong.league.teams.find((team) => team.id === "BUF");
  const weakTeam = weak.league.teams.find((team) => team.id === "BUF");
  assert.ok(strongTeam && weakTeam);

  strongTeam.staff.headCoach.development = 99;
  strongTeam.staff.strengthCoach.development = 99;
  strongTeam.owner.facilities.training = 99;
  strongTeam.owner.facilities.rehab = 99;
  strongTeam.owner.patience = 0.76;
  weakTeam.staff.headCoach.development = 60;
  weakTeam.staff.strengthCoach.development = 58;
  weakTeam.owner.facilities.training = 55;
  weakTeam.owner.facilities.rehab = 52;
  weakTeam.owner.patience = 0.24;
  strong.refreshChemistryAndSchemeFit();
  weak.refreshChemistryAndSchemeFit();

  const strongPlayerRow = strong
    .getRoster("BUF")
    .find((player) => player.age <= 24 && player.position !== "K" && player.position !== "P");
  assert.ok(strongPlayerRow);
  const strongPlayerBefore = strong.league.players.find((player) => player.id === strongPlayerRow.id);
  const weakPlayerBefore = weak.league.players.find((player) => player.id === strongPlayerRow.id);
  assert.ok(strongPlayerBefore);
  assert.ok(weakPlayerBefore);

  strongPlayerBefore.reinjuryRisk = 0.2;
  weakPlayerBefore.reinjuryRisk = 0.2;
  const strongAwarenessBefore = strongPlayerBefore.ratings.awareness;
  const weakAwarenessBefore = weakPlayerBefore.ratings.awareness;

  advanceToCampCuts(strong);
  advanceToCampCuts(weak);

  const strongPlayerAfter = strong.league.players.find((player) => player.id === strongPlayerBefore.id);
  const weakPlayerAfter = weak.league.players.find((player) => player.id === strongPlayerBefore.id);
  assert.ok(strongPlayerAfter && weakPlayerAfter);

  assert.ok((strongPlayerAfter.ratings.awareness - strongAwarenessBefore) >= (weakPlayerAfter.ratings.awareness - weakAwarenessBefore));
  assert.ok((strongPlayerAfter.reinjuryRisk || 0) <= (weakPlayerAfter.reinjuryRisk || 0));
});

test("world-state next step: weekly plans flow into the simulated game output", () => {
  const session = createSession({ seed: 1203, startYear: 2026, controlledTeamId: "BUF" });
  const buf = session.league.teams.find((team) => team.id === "BUF");
  assert.ok(buf);

  buf.owner.hotSeat = true;
  buf.staff.headCoach.discipline = 95;
  buf.staff.offensiveCoordinator.playcalling = 95;
  session.refreshChemistryAndSchemeFit();

  const staffView = session.getStaff("BUF");
  assert.ok(staffView.weeklyPlan?.summary);

  const result = session.advanceWeek();
  assert.equal(result.ok, true);
  const bufGame = result.games.find((game) => game.homeTeamId === "BUF" || game.awayTeamId === "BUF");
  assert.ok(bufGame);
  const bufStrategy = bufGame.homeTeamId === "BUF" ? bufGame.homeStrategy : bufGame.awayStrategy;

  assert.ok(bufStrategy?.summary);
  assert.equal(typeof bufStrategy.offenseBoost, "number");
  assert.equal(typeof bufStrategy.defenseBoost, "number");
});
