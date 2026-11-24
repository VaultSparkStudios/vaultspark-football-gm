import test from "node:test";
import assert from "node:assert/strict";
import {
  ballSecurityFactor,
  buildFrameNorms,
  buildWorkoutNorms,
  catchRadiusInches,
  frameArchetype,
  frameEdge,
  frameInjuryFactor,
  frameScores,
  physicalCard,
  relativeAthleticScore,
  rotationFrameEdge,
  speedScore
} from "../src/domain/physicalProfile.js";

function body(position, heightInches, weightLbs, { wingspan = heightInches + 2.5, hand = 9.5, speed = 75, workout = null } = {}) {
  return {
    position, heightInches, weightLbs, status: "active",
    measurements: { wingspanInches: wingspan, armLengthInches: (wingspan - heightInches * 0.218) / 2, handSizeInches: hand },
    ratings: { speed },
    ...(workout ? { workout } : {})
  };
}

// A small league per position, centred on known values.
function league() {
  const players = [];
  for (let i = 0; i < 20; i += 1) {
    const offset = (i % 5) - 2; // -2..2
    players.push(body("OL", 78 + offset * 0.5, 320 + offset * 10, { wingspan: 80.5 + offset * 0.8, hand: 10 + offset * 0.2 }));
    players.push(body("WR", 73 + offset, 200 + offset * 6, { wingspan: 75.5 + offset * 1.1, hand: 9.4 + offset * 0.2 }));
    players.push(body("RB", 71 + offset * 0.4, 215 + offset * 7, { hand: 9.4 + offset * 0.2 }));
  }
  return players;
}

test("centres come from the league as it is: an average body scores zero and moves when the league moves", () => {
  const players = league();
  const norms = buildFrameNorms(players);
  const average = body("OL", 78, 320, { wingspan: 80.5, hand: 10 });
  assert.ok(Math.abs(frameScores(average, norms).weight) < 0.01);
  assert.equal(frameEdge(average, "passBlock", norms), frameEdge(average, "passBlock", norms));
  // The same body in a league that bulked up 20 lb is now light for the position.
  const heavier = buildFrameNorms(players.map((p) => (p.position === "OL" ? { ...p, weightLbs: p.weightLbs + 20 } : p)));
  assert.ok(frameScores(average, heavier).weight < -1, "the centre is measured, never a constant");
});

test("long arms win at the line, a big catch radius wins the ball, mass breaks tackles; every edge is bounded", () => {
  const norms = buildFrameNorms(league());
  const longTackle = body("OL", 78, 320, { wingspan: 84 });
  const shortTackle = body("OL", 78, 320, { wingspan: 77 });
  assert.ok(frameEdge(longTackle, "passBlock", norms) > 1.5);
  assert.ok(frameEdge(shortTackle, "passBlock", norms) < -1.5);
  const bigWr = body("WR", 77, 215, { wingspan: 81 });
  const smallWr = body("WR", 69, 182, { wingspan: 71 });
  assert.ok(frameEdge(bigWr, "catchRadius", norms) > frameEdge(smallWr, "catchRadius", norms) + 3);
  const powerBack = body("RB", 71, 235);
  assert.ok(frameEdge(powerBack, "breakTackle", norms) > 2);
  const freak = body("WR", 90, 400, { wingspan: 100, hand: 14 });
  for (const role of ["catchRadius", "coverage", "breakTackle", "passBlock"]) {
    assert.ok(Math.abs(frameEdge(freak, role, norms)) <= 4, `${role} stays within 4 rating points`);
  }
});

test("a rotation's edge is usage-weighted, and an unknown role or missing body is exactly neutral", () => {
  const norms = buildFrameNorms(league());
  const rotation = [
    { player: body("OL", 78, 320, { wingspan: 84 }), usageWeight: 3 },
    { player: body("OL", 78, 320, { wingspan: 77 }), usageWeight: 1 }
  ];
  const edge = rotationFrameEdge(rotation, "passBlock", norms);
  assert.ok(edge > 0 && edge < frameEdge(rotation[0].player, "passBlock", norms));
  assert.equal(frameEdge(rotation[0].player, "noSuchRole", norms), 0);
  assert.equal(rotationFrameEdge([], "passBlock", norms), 0);
  assert.deepEqual(frameScores({ position: "OL" }, norms), { height: 0, weight: 0, reach: 0, hand: 0 });
});

test("hands protect the ball and bodies carry injury risk, both within their bounds", () => {
  const norms = buildFrameNorms(league());
  assert.ok(ballSecurityFactor(body("RB", 71, 215, { hand: 10.4 }), norms) < 1);
  assert.ok(ballSecurityFactor(body("RB", 71, 215, { hand: 8.4 }), norms) > 1);
  const heavyFast = body("RB", 71, 240, { speed: 92 });
  const light = body("RB", 71, 190, { speed: 80 });
  const average = body("RB", 71, 215, { speed: 75 });
  assert.ok(frameInjuryFactor(heavyFast, norms) > 1.05);
  assert.ok(frameInjuryFactor(light, norms) > 1.05);
  assert.equal(frameInjuryFactor(average, norms), 1);
  for (const p of [heavyFast, light, average]) {
    const f = frameInjuryFactor(p, norms);
    assert.ok(f >= 0.9 && f <= 1.2);
  }
});

test("scouting measurables: Speed Score, catch radius, archetype and a 0-10 RAS", () => {
  const players = league().map((p, i) => ({ ...p, workout: { forty: 4.4 + (i % 5) * 0.05, vertical: 33 + (i % 5), broad: 120 + (i % 5) * 2, shuttle: 4.2, cone: 7.0, bench: 15 } }));
  const norms = buildFrameNorms(players);
  const workoutNorms = buildWorkoutNorms(players);
  const back = { ...body("RB", 71, 224), workout: { forty: 4.45, vertical: 38, broad: 128, shuttle: 4.1, cone: 6.9, bench: 20 } };
  assert.equal(speedScore(back), Math.round((224 * 200) / 4.45 ** 4));
  assert.ok(catchRadiusInches(back) > 100);
  const ras = relativeAthleticScore(back, norms, workoutNorms);
  assert.ok(ras > 5 && ras <= 10, `an above-average back scores above 5 (got ${ras})`);
  const card = physicalCard(back, norms, workoutNorms);
  assert.equal(typeof card.archetype, "string");
  assert.equal(frameArchetype(body("OL", 78, 345, { wingspan: 80.5 }), norms).key, "power");
  assert.equal(frameArchetype(body("WR", 73, 200, { wingspan: 75.5 }), norms).key, "prototype");
});

test("a null or empty measurement is missing, not zero", () => {
  const norms = buildFrameNorms(league());
  const withNull = { ...body("WR", 73, 200), measurements: { wingspanInches: null, armLengthInches: "", handSizeInches: null } };
  const plain = { position: "WR", heightInches: 73, weightLbs: 200, status: "active" };
  assert.equal(frameEdge(withNull, "catchRadius", norms), frameEdge(plain, "catchRadius", norms));
  assert.equal(ballSecurityFactor(withNull, norms), ballSecurityFactor(plain, norms));
});
