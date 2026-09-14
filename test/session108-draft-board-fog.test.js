import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { SCOUTED_POTENTIAL_FOG, scoutedDraftResult, scoutedPotential, scoutedProspectView } from "../src/runtime/GameSession.js";

/**
 * S108 — the Available Prospects table printed every prospect's true overall
 * and true potential beside a scouting board that charges points for a
 * 72%-accurate read. The draft surface now ships the scout's numbers; the
 * engine keeps the truth.
 */

function sessionWithDraft() {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  session.prepareDraft();
  assert.ok(session.league.pendingDraft?.available?.length, "a pending draft exists for the fixture");
  return session;
}

test("the draft surface carries no true overall or potential for an available prospect", () => {
  const session = sessionWithDraft();
  const surface = session.getDraftState();
  assert.ok(surface.available.length > 0);
  for (const prospect of surface.available) {
    assert.equal(prospect.overall, undefined, `${prospect.id} ships its true overall`);
    assert.equal(prospect.potential, undefined, `${prospect.id} ships its true potential`);
    assert.equal(typeof prospect.scouting?.scoutedOverall, "number");
    assert.equal(typeof prospect.scouting?.scoutedPotential, "number");
  }
  // The engine still knows the truth: CPU picks and the reveal read the league, not the surface.
  for (const prospect of session.league.pendingDraft.available.slice(0, 20)) {
    assert.equal(typeof prospect.overall, "number");
    assert.equal(typeof prospect.potential, "number");
  }
});

test("the fogged potential sits inside the declared band, is stable across reads, and leaves the main stream untouched", () => {
  const session = sessionWithDraft();
  const truth = session.league.pendingDraft.available.slice(0, 40);
  const year = session.league.pendingDraft.year;
  const first = session.getDraftState().available.slice(0, 40);
  const before = session.rng.next();
  const second = session.getDraftState().available.slice(0, 40);
  const after = session.rng.next();
  assert.notEqual(before, after, "the control draw advances the stream (so equality below is not vacuous)");
  let moved = 0;
  first.forEach((prospect, index) => {
    const fogged = prospect.scouting.scoutedPotential;
    const real = Number(truth[index].potential);
    assert.ok(Math.abs(fogged - real) <= SCOUTED_POTENTIAL_FOG.max || fogged === SCOUTED_POTENTIAL_FOG.floor || fogged === SCOUTED_POTENTIAL_FOG.ceiling, `${prospect.id}: ${fogged} vs ${real}`);
    assert.equal(fogged, second[index].scouting.scoutedPotential, "a second read does not re-roll the fog");
    assert.equal(fogged, scoutedPotential(truth[index], year));
    if (fogged !== real) moved += 1;
  });
  assert.ok(moved > 10, `fog that never moves a number is not fog (moved ${moved} of 40)`);
});

test("the view keeps everything else the surface used, and removes overall, potential and the ratings that reproduce them", () => {
  const prospect = { id: "P1", name: "A", position: "QB", age: 21, overall: 77, potential: 88, ratings: { arm: 80 }, scouting: { rank: 3, projectedRound: 1, scoutedOverall: 74 } };
  const view = scoutedProspectView(prospect, 2027);
  assert.deepEqual(Object.keys(view).sort(), ["age", "id", "name", "position", "scouting"], "overall is a pure function of ratings, so ratings go too");
  assert.equal(view.scouting.rank, 3);
  assert.equal(view.scouting.scoutedOverall, 74);
  assert.equal(typeof view.scouting.scoutedPotential, "number");
  assert.equal(scoutedPotential({ id: "P2" }, 2027), null, "no truth, no fog");
});

test("every draft mutation's response carries the scout's view, never the truth", () => {
  const session = sessionWithDraft();
  const prepared = scoutedDraftResult(session.prepareDraft());
  assert.ok(prepared.available.length > 0);
  assert.ok(prepared.available.every((p) => p.overall === undefined && p.potential === undefined && p.ratings === undefined));
  const cpu = scoutedDraftResult(session.runCpuDraft({ picks: 1, untilUserPick: false }));
  assert.equal(cpu.ok, true);
  assert.ok(cpu.draft.available.every((p) => p.overall === undefined && p.potential === undefined));
  assert.ok(session.league.pendingDraft.available.every((p) => typeof p.overall === "number"), "the engine's own copy is untouched");
  // The combine sits on the same tab and reads the scout's number too.
  const combine = session.getDashboardState().combineResults || [];
  for (const row of combine) {
    const truth = session.league.pendingDraft.available.find((p) => p.id === row.prospectId) || null;
    if (truth) assert.equal(row.overall, truth.scouting?.scoutedOverall ?? truth.overall);
  }
});
