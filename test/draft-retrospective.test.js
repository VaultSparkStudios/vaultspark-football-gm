import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("three seasons on, the news names a draft's steal and bust with their combine numbers", () => {
  const session = createSession({ seed: 77, startYear: 2026, controlledTeamId: "BUF" });
  const [late, early] = session.league.players.filter((p) => p.position === "WR").slice(0, 2);
  late.overall = 86; late.scouting = { combine: { forty: 4.41 } };
  early.overall = 61;
  session.league.draftHistory = [{ schemaVersion: "1.0", year: session.currentYear - 3, completed: true, selections: [
    { pick: 140, round: 5, teamId: "BUF", playerId: late.id, player: late.name, pos: "WR" },
    { pick: 7, round: 1, teamId: "MIA", playerId: early.id, player: early.name, pos: "WR" }
  ] }];
  const before = JSON.stringify(session.league).length;
  assert.deepEqual(session.reportDraftRetrospective(), ["steal", "bust"]);
  const text = JSON.stringify(session.league);
  assert.ok(text.length > before);
  assert.match(text, new RegExp(`Steal of the ${session.currentYear - 3} draft: ${late.name}`));
  assert.match(text, /4\.41 forty/);
  assert.match(text, new RegExp(`Bust of the ${session.currentYear - 3} draft: ${early.name}`));
});

test("no history three seasons back means no story, and nothing else moves", () => {
  const session = createSession({ seed: 78, startYear: 2026, controlledTeamId: "BUF" });
  session.league.draftHistory = [];
  const before = JSON.stringify(session.league);
  assert.deepEqual(session.reportDraftRetrospective(), []);
  assert.equal(JSON.stringify(session.league), before);
});
