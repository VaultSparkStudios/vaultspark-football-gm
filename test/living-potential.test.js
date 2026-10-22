import test from "node:test";
import assert from "node:assert/strict";
import { recordDevelopmentInjury, revisePlayerPotential, seasonalDevelopmentQuality, measureDevelopmentPerformance } from "../src/domain/livingPotential.js";
import { applyInjury, advanceInjuryRecovery } from "../src/engine/injurySystem.js";
import { progressPlayer } from "../src/engine/offseasonSimulator.js";
import { createSyntheticPlayer, createZeroedSeasonStats } from "../src/domain/playerFactory.js";
import { RNG } from "../src/utils/rng.js";
import { developmentDelta } from "../src/domain/ratings.js";

test("measured development rewards remaining upside rather than already-high overall", () => {
  const context = { potentialHeadroomCentre: 8, potentialCentre: 80 };
  const rng = { float: () => 0 };
  const project = { age: 23, overall: 60, potential: 70 };
  const polished = { age: 23, overall: 85, potential: 95 };
  assert.equal(developmentDelta(project, rng, context), developmentDelta(polished, rng, context),
    "equal remaining room must not grant the polished player an extra growth bonus");
  const highUpside = { ...project, potential: 95 };
  assert.ok(developmentDelta(highUpside, rng, context) > developmentDelta(project, rng, context));
  assert.throws(() => developmentDelta(project, rng, { potentialHeadroomCentre: NaN }), /must be finite/);
});

test("healed major injuries still revise potential and a repeated offseason stage is idempotent", () => {
  const player = { id: "injured", potential: 92, age: 24 };
  applyInjury(player, { type: "Knee", weeksRemaining: 8 });
  for (let week = 0; week < 8; week++) advanceInjuryRecovery({ players: [player] });
  assert.equal(player.injury, null);
  const revision = revisePlayerPotential(player, { year: 2026 });
  assert.equal(player.potential, 89);
  assert.equal(revision.change, -3);
  assert.match(revision.reasons[0], /Injury setbacks/);
  revisePlayerPotential(player, { year: 2026 });
  assert.equal(player.potential, 89);
  assert.equal(player.developmentHealth, undefined);
});

test("small injury does not destroy potential and repeated poor play matters", () => {
  const player = { potential: 84, age: 23 };
  recordDevelopmentInjury(player, { severity: "minor", weeksRemaining: 1 });
  revisePlayerPotential(player, { year: 2026, performance: null });
  assert.equal(player.potential, 84);
  revisePlayerPotential(player, { year: 2027, performance: "poor" });
  assert.equal(player.potential, 83);
  revisePlayerPotential(player, { year: 2028, performance: "poor" });
  assert.equal(player.potential, 81);
  revisePlayerPotential(player, { year: 2029, performance: "breakout" });
  assert.equal(player.potential, 82);
  assert.equal(player.poorDevelopmentSeasons, 0);
});

test("ceiling explanations describe applied changes at the rating bounds", () => {
  const ceiling = revisePlayerPotential({ potential: 99, age: 23 }, { year: 2026, performance: "breakout" });
  assert.equal(ceiling.change, 0);
  assert.match(ceiling.reasons[0], /confirmed.*maximum of 99/);
  const floor = revisePlayerPotential({ potential: 40, age: 23, developmentHealth: { majorInjuries: 2 } }, { year: 2026, performance: "poor" });
  assert.equal(floor.change, 0);
  assert.ok(floor.reasons.every(reason => /minimum of 40/.test(reason)));
  const nearFloor = revisePlayerPotential({ potential: 42, age: 23, developmentHealth: { majorInjuries: 2 } }, { year: 2026, performance: "poor" });
  assert.equal(nearFloor.change, -2);
  assert.match(nearFloor.reasons[0], /reduced.*by 2/);
  assert.match(nearFloor.reasons[1], /minimum of 40/);
  assert.equal(revisePlayerPotential({ potential: null }), null);
});

test("a season-spanning injury keeps tracking missed weeks after the season accumulator resets", () => {
  const player = { id: "long-recovery", potential: 92, age: 24 };
  applyInjury(player, { type: "Knee", weeksRemaining: 16 });
  for (let week = 0; week < 4; week++) advanceInjuryRecovery({ players: [player] });
  revisePlayerPotential(player, { year: 2026 });
  assert.equal(player.potential, 90);
  for (let week = 0; week < 8; week++) advanceInjuryRecovery({ players: [player] });
  assert.equal(player.developmentHealth.missedWeeks, 8);
  assert.equal(player.developmentHealth.majorInjuries, 0, "do not duplicate the original major-injury occurrence");
  revisePlayerPotential(player, { year: 2027 });
  assert.equal(player.potential, 89);
});

test("performance requires workload and position peers, rather than penalizing bench players", () => {
  const players = Array.from({ length: 20 }, (_, i) => {
    const stats = createZeroedSeasonStats();
    stats.passing = { att: 300, yards: 1200 + i * 150, td: 10, int: 10 };
    return { id: `${i}`, position: "QB", seasonStats: { 2026: stats } };
  });
  const bench = { id: "bench", position: "QB", seasonStats: { 2026: createZeroedSeasonStats() } };
  assert.equal(seasonalDevelopmentQuality(bench, 2026), null);
  const grades = measureDevelopmentPerformance({ players: [...players, bench] }, 2026);
  assert.equal(grades.get("0"), "poor");
  assert.equal(grades.get("19"), "breakout");
  assert.equal(grades.get("10"), "steady");
  assert.equal(grades.has("bench"), false);
  assert.equal(measureDevelopmentPerformance({ players: players.slice(0, 3) }, 2026).size, 0);
});

test("potential headroom changes growth and growth respects the ceiling", () => {
  const base = createSyntheticPlayer({ teamId: "BUF", position: "WR", year: 2026, rng: new RNG(789) });
  base.age = 23;
  const capped = structuredClone(base);
  capped.potential = capped.overall;
  const prospect = structuredClone(base);
  prospect.potential = Math.min(99, prospect.overall + 25);
  const before = base.overall;
  // Paired stochastic draws; all football attributes/age/environment identical.
  progressPlayer(capped, new RNG(123), { potentialReversion: 2 });
  progressPlayer(prospect, new RNG(123), { potentialReversion: 2 });
  assert.ok(capped.overall <= before);
  assert.ok(prospect.overall > capped.overall);
  assert.ok(prospect.overall <= prospect.potential);
});
