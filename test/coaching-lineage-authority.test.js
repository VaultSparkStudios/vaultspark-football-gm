import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

function session(seed = 55102) {
  return new GameSession({ rng: new RNG(seed), controlledTeamId: "BUF", startYear: 2026 });
}

test("coaching authority exposes a versioned, UI-ready controlled-team view", () => {
  const game = session();
  const view = game.services.coaching.getTeamView("BUF");
  assert.equal(view.schemaVersion, "1.0");
  assert.equal(view.source, "league.coachingTree");
  assert.deepEqual(view.currentStaff.map((coach) => coach.role), ["HC", "OC", "DC"]);
  assert.ok(view.lineage.length >= 1);
  assert.match(view.disclaimer, /does not claim/i);
  assert.deepEqual(game.getDashboardState().coachingLineage, view);

  const unrelatedNode = Object.values(game.league.coachingTree.nodes)
    .find((node) => node.currentTeamId !== "BUF");
  unrelatedNode.mentorId = unrelatedNode.id;
  assert.doesNotThrow(() => game.services.coaching.getTeamView("BUF"),
    "legacy self-cycles must not hang team-view family traversal");
});

test("staff lifecycle delegates to coaching authority and records replacements", () => {
  const game = session(55103);
  const team = game.league.teams.find((entry) => entry.id === "BUF");
  const oldName = team.staff.headCoach.name;
  team.staff.headCoach.yearsRemaining = 1;
  const beforeNodes = Object.keys(game.services.coaching.ensureAuthority().nodes).length;
  game.processStaffLifecycle();
  const view = game.services.coaching.getTeamView("BUF");
  assert.notEqual(team.staff.headCoach.name, oldName);
  assert.ok(Object.keys(game.league.coachingTree.nodes).length >= beforeNodes);
  assert.equal(view.currentStaff.filter((coach) => coach.role === "HC").length, 1);
  assert.ok(game.league.newsFeed.some((entry) => entry.details?.coachingTree === true));
});

test("coaching lineage survives snapshot restoration without duplicate staff nodes", () => {
  const game = session(55104);
  const before = game.services.coaching.getTeamView("BUF");
  const restored = GameSession.fromSnapshot(
    JSON.parse(JSON.stringify(game.toSnapshot())),
    (seed) => new RNG(seed)
  );
  const after = restored.services.coaching.getTeamView("BUF");
  assert.deepEqual(after, before);
  assert.equal(new Set(after.currentStaff.map((coach) => coach.id)).size, after.currentStaff.length);
});
