import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { computeGoldenMaster, diffGoldenMaster, GOLDEN_MASTER_FIXTURE, HISTORICAL_GOLDEN_MASTER_FIXTURE, S118_GOLDEN_MASTER_FIXTURE, GOLDEN_MASTER_SCENARIOS } from "../scripts/golden-master.mjs";

// S116 Phase 0: every multi-sport extraction step must leave football byte-identical.
// A mismatch names the drifted sections. Regenerate the fixture only for an
// intentional, separately justified behavior change: node scripts/golden-master.mjs --write
test("football is byte-identical to the committed golden master", async () => {
  const expected = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE, "utf8"));
  const actual = await computeGoldenMaster();
  const differences = diffGoldenMaster(expected, actual);
  assert.equal(actual.schemaVersion, expected.schemaVersion);
  for (const id of Object.keys(expected.scenarios)) assert.deepEqual(actual.scenarios[id]?.summary, expected.scenarios[id].summary);
  assert.deepEqual(differences, [], `golden master drifted:\n${differences.join("\n")}`);
});

test("versioned intentional behavior baseline preserves S116 and every original scenario and section", () => {
  const historicalBytes = fs.readFileSync(HISTORICAL_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(historicalBytes).digest('hex'), '4901d3487f119b9fc7485e139135a663738c32062668f7eaa66dc32517de1190');
  const historical = JSON.parse(historicalBytes), current = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE));
  assert.equal(historical.schemaVersion, 1); assert.equal(current.schemaVersion, 1);
  assert.deepEqual(GOLDEN_MASTER_SCENARIOS, [
    {id:'drive-20260306-BUF',seed:20260306,mode:'drive',controlledTeamId:'BUF',seasons:3},
    {id:'play-4113-CHI',seed:4113,mode:'play',controlledTeamId:'CHI',seasons:3}
  ]);
  assert.deepEqual(Object.keys(current.scenarios).sort(), Object.keys(historical.scenarios).sort());
  for (const [id, scenario] of Object.entries(historical.scenarios)) {
    const next = current.scenarios[id];
    assert.equal(next.summary.year, 2029); assert.equal(next.summary.phase, 'regular-season');
    assert.equal(next.summary.champions.length, 3);
    for (const key of Object.keys(scenario.sections)) assert.ok(Object.hasOwn(next.sections, key), `historical section removed: ${id}: ${key}`);
    assert.ok(Object.values(next.sections).every(value=>/^[a-f0-9]{64}$/.test(value)), 'every current section retains a SHA-256 identity');
  }
});

test("S119 passer-rating baseline preserves S118 and moves only the season passing tables", () => {
  const s118Bytes = fs.readFileSync(S118_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(s118Bytes).digest('hex'), 'd9b95a052a21e85b789a42d0d7320d55e7b50427f58f923fb5bc8ef832066b26');
  const s118 = JSON.parse(s118Bytes), current = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE));
  // The passer rating now scales each term before clamping it. Nothing reads
  // the season rate except award tie-breaks, so every other section, including
  // awards, standings and champions, must be byte-identical to S118.
  assert.deepEqual(diffGoldenMaster(s118, current).sort(), [
    'drive-20260306-BUF: seasonTable.passing changed',
    'play-4113-CHI: seasonTable.passing changed'
  ]);
  for (const id of Object.keys(s118.scenarios)) assert.deepEqual(current.scenarios[id].summary, s118.scenarios[id].summary);
});

test("the diff names changed, added and missing sections", () => {
  const base = { scenarios: { a: { sections: { x: "1", y: "2" } } } };
  assert.deepEqual(diffGoldenMaster(base, base), []);
  assert.deepEqual(diffGoldenMaster(base, { scenarios: { a: { sections: { x: "9", y: "2", z: "3" } } } }), ["a: x changed", "a: z added"]);
  assert.deepEqual(diffGoldenMaster(base, { scenarios: {} }), ["a: scenario missing"]);
  assert.deepEqual(diffGoldenMaster({ scenarios: {} }, base), ["a: unexpected scenario"],
    "deleting a fixture scenario must not turn an unverified career into a pass");
  assert.deepEqual(diffGoldenMaster(base, { scenarios: { ...base.scenarios, b: { sections: { x: "1" } } } }), ["b: unexpected scenario"]);
});
