import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { TALENT_DISTRIBUTION } from "../src/domain/talentDistribution.js";
import { calculatePositionOverall } from "../src/domain/ratings.js";

// S117 deliberately supersedes the compressed-generator acceptance contract:
// the previous ceiling was 12/1568 (0.765%), with zero 95+ players and zero
// elite RB/WR/DL/LB. The requested overhaul needs rare exceptional players at
// every position, while keeping the upper tail bounded. These versioned
// fictional population-mean bounds are design choices, not NFL estimates.
// Independent draws cannot guarantee a hard percentage in every finite league.
// Use a fixed five-sigma diagnostic allowance, not a formal confidence claim,
// and pool a predeclared ensemble to catch systematic inflation.
// Archetype strengths are normalized against the grading formula, so role
// shape cannot subsidize overall. Never overwrite attribute-derived OVR.
const eliteShare = (players, minimum) => players.filter(player => player.overall >= minimum).length / players.length;
const diagnosticLimit = (meanBound, n) => meanBound
  + TALENT_DISTRIBUTION.creationDiagnosticSigma * Math.sqrt(meanBound * (1 - meanBound) / n);
const bounds = [[90, TALENT_DISTRIBUTION.elite90MeanUpperBound], [95, TALENT_DISTRIBUTION.elite95MeanUpperBound]];

test("generated league keeps exceptional players rare without excluding whole positions", () => {
  // Fixed consecutive seeds include the independent review's failures 2/3.
  // Preserve the original regression seeds, rather than screening/replacing.
  const seeds = [...Array.from({ length: 32 }, (_, i) => i + 1), 20260311, 20260312, 20260313, 20260314];
  const positionsAcrossSeeds = new Set();
  const ensemble = [];
  for (const seed of seeds) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
    const players = session.league.players.filter(player => player.status === "active" && player.teamId !== "FA");
    ensemble.push(...players);
    for (const [minimum, meanBound] of bounds) {
      const limit = diagnosticLimit(meanBound, players.length);
      assert.ok(eliteShare(players, minimum) <= limit,
        `seed ${seed}: ${minimum}+ share ${eliteShare(players, minimum)} exceeds diagnostic ${limit}`);
    }
    const positions = new Set(players.filter(player => player.overall >= 90).map(player => player.position));
    // Rare independent draws do not guarantee seven populated tail positions
    // in one league. The fixed ensemble below must support all ten; forcing a
    // per-seed quota would turn random exceptional talent into reserved slots.
    positions.forEach(position => positionsAcrossSeeds.add(position));
    assert.ok(players.filter(player => player.overall < 70).length > players.length * .25,
      "a broad lower tail must coexist with rare exceptional players");
    for (const player of players) assert.equal(player.overall, calculatePositionOverall(player.position, player.ratings));
    // Negative control: inflated attributes recalculated through the grading
    // authority must violate both bounds, rather than merely changing OVR.
    const inflated = players.map(player => ({ overall: calculatePositionOverall(player.position,
      Object.fromEntries(Object.keys(player.ratings).map(key => [key, 95]))) }));
    for (const [minimum, meanBound] of bounds) assert.ok(eliteShare(inflated, minimum) > diagnosticLimit(meanBound, inflated.length));
  }
  for (const [minimum, meanBound] of bounds) assert.ok(eliteShare(ensemble, minimum) <= diagnosticLimit(meanBound, ensemble.length),
    `pooled ${minimum}+ share ${eliteShare(ensemble, minimum)} exceeds mean diagnostic`);
  assert.ok(ensemble.some(player => player.overall >= 95), "exceptional players must remain possible");
  assert.equal(positionsAcrossSeeds.size, 10, "all position groups support exceptional talent");
});
