import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { passerRating } from "../src/sport/football/statSchema.js";
import { passerRateFromStats } from "../public/lib/appCore.js";

// S119: the season table and the client clamped the completion and yards terms
// before scaling them, while the box score scaled first. One quarterback read
// two different ratings. These reference lines are computed from the published
// NFL formula, and every copy must return them.
const REFERENCE = [
  { name: "300/450, 3,500 yds, 25 TD, 10 INT", line: { cmp: 300, att: 450, yards: 3500, td: 25, int: 10 }, rating: 99.3 },
  { name: "perfect game", line: { cmp: 20, att: 20, yards: 400, td: 5, int: 0 }, rating: 158.3 },
  { name: "2013 record season, 450/659, 5,477 yds, 55 TD, 10 INT", line: { cmp: 450, att: 659, yards: 5477, td: 55, int: 10 }, rating: 115.1 },
  { name: "floor: 0/10, 3 INT", line: { cmp: 0, att: 10, yards: 0, td: 0, int: 3 }, rating: 0 },
  { name: "no attempts", line: { cmp: 0, att: 0, yards: 0, td: 0, int: 0 }, rating: 0 }
];

for (const { name, line, rating } of REFERENCE) {
  test(`passer rating reference: ${name}`, () => {
    assert.equal(passerRating(line), rating, "stat schema (season and career tables, box score)");
    assert.equal(passerRateFromStats(line), rating, "client copy (player profile seasons)");
  });
}

test("the yards term is scaled before it is clamped", () => {
  // 7.8 Y/A contributes 1.19 after scaling; clamping first would hold it at
  // 2.375 and then scale it to 0.59, which is the defect this file guards.
  const base = { cmp: 0, att: 100, td: 0, int: 0 };
  const rating = (yards) => passerRating({ ...base, yards });
  assert.ok(rating(778) - rating(300) > 15, `7.8 Y/A must add far more than 3.0 Y/A: ${rating(778)} vs ${rating(300)}`);
});

test("missing counters read as zero, never NaN", () => {
  assert.equal(passerRating({ att: 10 }), passerRateFromStats({ att: 10 }));
  assert.ok(Number.isFinite(passerRating({ att: 10 })));
  assert.equal(passerRating(), 0);
  assert.equal(passerRateFromStats(undefined), 0);
});

test("the box score uses the stat schema's formula, not a private copy", () => {
  const source = fs.readFileSync(new URL("../src/engine/gameSimulator.js", import.meta.url), "utf8");
  assert.match(source, /import \{ passerRating \} from "\.\.\/sport\/football\/statSchema\.js"/);
  assert.doesNotMatch(source, /function gamePasserRating/);
});
