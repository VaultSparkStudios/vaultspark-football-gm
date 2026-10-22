import test from "node:test";
import assert from "node:assert/strict";
import { generatePlayerWorkout } from "../src/domain/playerWorkouts.js";
import { createDraftClass } from "../src/domain/playerFactory.js";
import { RNG } from "../src/utils/rng.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { computeCombineGrade } from "../src/runtime/GameSession.js";

const pearson = (rows, a, b) => {
  const xs = rows.map(a), ys = rows.map(b);
  const mx = xs.reduce((s,n) => s+n, 0)/xs.length, my = ys.reduce((s,n) => s+n, 0)/ys.length;
  const cov = xs.reduce((s,n,i) => s+(n-mx)*(ys[i]-my),0);
  return cov / Math.sqrt(xs.reduce((s,n) => s+(n-mx)**2,0)*ys.reduce((s,n) => s+(n-my)**2,0));
};
const base = { id: "matched-athlete", heightInches: 75.625, weightLbs: 225,
  armLengthInches: 33.375, ratings: { speed: 70, acceleration: 70, agility: 70, jumping: 70, strength: 70 } };

test("physical testing uses distinct capacities with stable variation and no demographic inputs", () => {
  const before = structuredClone(base), options = { year: 2027 };
  const ordinary = generatePlayerWorkout(base, options);
  assert.deepEqual(base, before);
  assert.deepEqual(generatePlayerWorkout({ ...base, name: "Different", profile: { faceSeed: "different", identity: { birthCountry: "Japan", surveyCategory: "Asian" } } }, options), ordinary);
  const fast = generatePlayerWorkout({ ...base, ratings: { ...base.ratings, speed: 95 } }, options);
  assert.ok(fast.forty < ordinary.forty);
  assert.equal(fast.bench, ordinary.bench);
  assert.equal(fast.shuttle, ordinary.shuttle);
  const explosive = generatePlayerWorkout({ ...base, ratings: { ...base.ratings, jumping: 95 } }, options);
  assert.ok(explosive.vertical > ordinary.vertical && explosive.broad > ordinary.broad);
  assert.equal(explosive.forty, ordinary.forty);
  const strong = generatePlayerWorkout({ ...base, ratings: { ...base.ratings, strength: 95 } }, options);
  assert.ok(strong.bench > ordinary.bench);
  assert.equal(strong.forty, ordinary.forty);
  assert.equal(ordinary.measurements.values.heightInches, 75.625);
  assert.equal(ordinary.measurements.values.armLengthInches, 33.375);
  assert.deepEqual(generatePlayerWorkout(base, options), ordinary);
  assert.notEqual(generatePlayerWorkout(base, { year: 2027, kind: "pro-day" }).forty, ordinary.forty);
});

test("workout population has within-position athletic signal and individual residual spread", () => {
  const rows = Array.from({ length: 6 }, (_, i) => createDraftClass({ year: 2027, rng: new RNG(812 + i) }))
    .flat().map(p => ({ p, w: generatePlayerWorkout(p, { year: 2027 }) }));
  for (const position of ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB"]) {
    const group = rows.filter(r => r.p.position === position);
    for (const [key, drill, sign] of [["speed","forty",-1], ["agility","shuttle",-1], ["jumping","vertical",1], ["strength","bench",1]]) {
      const correlation = sign * pearson(group, r => r.p.ratings[key], r => r.w[drill]);
      assert.ok(correlation > .65 && correlation < .999, `${position}/${drill}: ${correlation}`);
    }
  }
  const matched = Array.from({ length: 100 }, (_, i) => generatePlayerWorkout({ ...base, id: `matched-${i}` }, { year: 2027 }));
  assert.ok(new Set(matched.map(w => w.forty)).size > 10);
  assert.ok(new Set(matched.map(w => w.bench)).size > 8);
  for (const { w } of rows) {
    assert.ok(w.tenYardSplit < w.forty && w.tenYardSplit >= 1.4);
    assert.ok(Number.isInteger(w.bench) && Number.isInteger(w.broad));
    assert.equal(w.units.forty, "seconds");
    assert.equal(w.event.provenance, "fictional-generated");
  }
});

test("missing athletic observations remain absent and do not become zero scores", () => {
  const workout = generatePlayerWorkout(base, { year: 2027, missing: ["forty", "bench"] });
  assert.equal(workout.forty, null);
  assert.equal(workout.tenYardSplit, null);
  assert.equal(workout.bench, null);
  assert.equal(workout.participation.bench, "not-recorded");
  assert.equal(computeCombineGrade({ position: "OL", scouting: { combine: workout } }), null);
  assert.equal(computeCombineGrade({ position: "OL", scouting: {} }), null);
  assert.equal(computeCombineGrade({ position: "OL", scouting: { combineGrade: 73 } }), 73);
  assert.equal(computeCombineGrade({ position: "OL", scouting: { combineGrade: NaN } }), null);
  const unknown = generatePlayerWorkout({ ...base, ratings: {} });
  for (const key of Object.keys(unknown.units)) assert.equal(unknown[key], null);
  assert.equal(unknown.measurements.values.wingspanInches, null);
});

test("real draft preparation persists workouts, event metadata and canonical measurements", () => {
  const session = createSession({ seed: 781, startYear: 2026, controlledTeamId: "BUF" });
  session.prepareDraft();
  const original = session.league.pendingDraft.available[0];
  const restored = createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  const saved = restored.league.pendingDraft.available.find(p => p.id === original.id);
  assert.deepEqual(saved.scouting.combine, original.scouting.combine);
  assert.equal(saved.scouting.combine.measurements.values.heightInches, saved.heightInches);
  assert.equal(saved.scouting.combine.measurements.values.armLengthInches, saved.measurements.armLengthInches);
  assert.equal(saved.scouting.combine.event.year, 2027);
  restored.runCpuDraft({ untilUserPick: true });
  const selected = restored.league.pendingDraft.available[0];
  const workoutBeforePick = structuredClone(selected.scouting.combine);
  assert.equal(restored.draftUserPick({ playerId: selected.id }).ok, true);
  const rostered = restored.league.players.find(p => p.id === selected.id);
  assert.equal(rostered.teamId, "BUF");
  assert.deepEqual(rostered.scouting.combine, workoutBeforePick);
  const afterPick = createSessionFromSnapshot(JSON.parse(JSON.stringify(restored.toSnapshot())));
  assert.deepEqual(afterPick.league.players.find(p => p.id === selected.id).scouting.combine, workoutBeforePick);
});
