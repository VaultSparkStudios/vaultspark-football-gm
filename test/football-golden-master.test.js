import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { computeGoldenMaster, diffGoldenMaster, GOLDEN_MASTER_FIXTURE } from "../scripts/golden-master.mjs";

// S116 Phase 0: every multi-sport extraction step must leave football byte-identical.
// A mismatch names the drifted sections. Regenerate the fixture only for an
// intentional, separately justified behavior change: node scripts/golden-master.mjs --write
test("football is byte-identical to the committed golden master", async () => {
  const expected = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE, "utf8"));
  const actual = await computeGoldenMaster();
  const differences = diffGoldenMaster(expected, actual);
  assert.deepEqual(differences, [], `golden master drifted:\n${differences.join("\n")}`);
});

test("the diff names changed, added and missing sections", () => {
  const base = { scenarios: { a: { sections: { x: "1", y: "2" } } } };
  assert.deepEqual(diffGoldenMaster(base, base), []);
  assert.deepEqual(diffGoldenMaster(base, { scenarios: { a: { sections: { x: "9", y: "2", z: "3" } } } }), ["a: x changed", "a: z added"]);
  assert.deepEqual(diffGoldenMaster(base, { scenarios: {} }), ["a: scenario missing"]);
});
