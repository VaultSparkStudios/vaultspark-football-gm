import test from "node:test";
import assert from "node:assert/strict";
import { applyBodyProgram, setPlayerBodyProgram } from "../src/domain/bodyProgram.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { authorizeCommand } from "../src/runtime/franchiseAuthority.js";

const player = (over = {}) => ({ id: "p1", position: "RB", weightLbs: 215, ratings: { strength: 70, trucking: 70, speed: 85, acceleration: 84, agility: 80 }, ...over });

test("a body programme is a trade: bulk adds mass and power and costs a step; lean does the reverse", () => {
  const bulk = player(); setPlayerBodyProgram(bulk, "bulk");
  const change = applyBodyProgram(bulk);
  assert.equal(bulk.weightLbs, 223);
  assert.deepEqual(change.ratingChanges, { strength: 2, trucking: 1, speed: -1, acceleration: -1 });
  assert.equal(bulk.bodyProgram, undefined, "consumed once");
  const lean = player(); setPlayerBodyProgram(lean, "lean"); applyBodyProgram(lean);
  assert.equal(lean.weightLbs, 207);
  assert.equal(lean.ratings.speed, 86);
  assert.equal(lean.ratings.strength, 68);
});

test("a body at its position's limit does not move, and gets none of the trade", () => {
  const heavy = player({ weightLbs: 250 }); setPlayerBodyProgram(heavy, "bulk");
  const change = applyBodyProgram(heavy);
  assert.equal(heavy.weightLbs, 250);
  assert.deepEqual(change.ratingChanges, {});
});

test("unknown programmes and specialists are refused; maintain clears a choice", () => {
  assert.equal(setPlayerBodyProgram(player(), "steroids").ok, false);
  assert.equal(setPlayerBodyProgram(player({ position: "K" }), "bulk").ok, false);
  const p = player(); setPlayerBodyProgram(p, "bulk"); setPlayerBodyProgram(p, "maintain");
  assert.equal(p.bodyProgram, undefined);
  assert.equal(applyBodyProgram(p), null);
});

test("the session sets a programme only on the club's own players", () => {
  const session = createSession({ seed: 33, startYear: 2026, controlledTeamId: "BUF" });
  const own = session.league.players.find((p) => p.teamId === "BUF" && p.position === "WR");
  const other = session.league.players.find((p) => p.teamId === "MIA" && p.position === "WR");
  assert.equal(session.setBodyProgram({ teamId: "BUF", playerId: own.id, program: "lean" }).ok, true);
  assert.equal(own.bodyProgram, "lean");
  assert.equal(session.setBodyProgram({ teamId: "BUF", playerId: other.id, program: "bulk" }).ok, false);
});

test("the command boundary refuses a programme for another club's player", () => {
  const session = createSession({ seed: 34, startYear: 2026, controlledTeamId: "BUF" });
  const verdict = authorizeCommand({ session, route: "/api/players/body-program", body: { teamId: "MIA", playerId: "x", program: "bulk" } });
  assert.equal(verdict?.status, 403);
  assert.equal(verdict.payload.reasonCode, "team-authority");
  assert.equal(authorizeCommand({ session, route: "/api/players/body-program", body: { teamId: "BUF" } }), null, "the own club passes");
});