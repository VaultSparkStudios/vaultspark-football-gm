import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAwardList,
  hallOfFameCareerLine,
  awardCountLine,
  hallOfFamePolicyLine,
  retiredNumberPolicyLine
} from "../public/lib/historyFormatting.js";

// S84: this module had zero direct test references anywhere in test/ or
// tests-ui/ despite formatting player-facing History/Hall of Fame copy.

test("formatAwardList joins player (team) pairs and handles an empty/undefined list", () => {
  assert.equal(formatAwardList([{ player: "J. Allen", team: "BUF" }, { player: "P. Mahomes", team: "KC" }]), "J. Allen (BUF), P. Mahomes (KC)");
  assert.equal(formatAwardList([]), "");
  assert.equal(formatAwardList(undefined), "");
});

test("hallOfFameCareerLine renders position-specific stat lines with zero-fallbacks", () => {
  assert.equal(hallOfFameCareerLine({ pos: "QB", careerStats: { passing: { yards: 4200, td: 32 } } }), "4200 pass yds, 32 pass TD");
  assert.equal(hallOfFameCareerLine({ pos: "RB", careerStats: { rushing: { yards: 1500, td: 14 } } }), "1500 rush yds, 14 rush TD");
  assert.equal(hallOfFameCareerLine({ pos: "WR", careerStats: { receiving: { yards: 1200, td: 9 } } }), "1200 rec yds, 9 rec TD");
  assert.equal(hallOfFameCareerLine({ pos: "TE", careerStats: { receiving: { yards: 800, td: 6 } } }), "800 rec yds, 6 rec TD");
  assert.equal(hallOfFameCareerLine({ pos: "K", careerStats: { kicking: { fgm: 28, xpm: 40 } } }), "28 FGM, 40 XPM");
  assert.equal(hallOfFameCareerLine({ pos: "P", careerStats: { punting: { punts: 60, in20: 22 } } }), "60 punts, 22 in20");
  assert.equal(hallOfFameCareerLine({ pos: "LB", careerStats: { defense: { tackles: 110, sacks: 8, int: 2 } } }), "110 tackles, 8 sacks, 2 INT");
  assert.equal(hallOfFameCareerLine({ pos: "QB", careerStats: {} }), "0 pass yds, 0 pass TD");
  assert.equal(hallOfFameCareerLine({ pos: "QB" }), "0 pass yds, 0 pass TD");
});

test("awardCountLine only lists nonzero awards, merges rookie-of-year variants, and has an honest empty state", () => {
  assert.equal(
    awardCountLine({ MVP: 2, AllPro1: 3, OROY: 1, DROY: 1, ROY: 0, CPOY: 0 }),
    "MVP 2 | All-Pro 1 3 | ROY 2"
  );
  assert.equal(awardCountLine({}), "No major awards logged");
  assert.equal(awardCountLine(undefined), "No major awards logged");
  assert.equal(awardCountLine({ MostImproved: 1 }), "Most Improved 1");
});

test("hallOfFamePolicyLine reads settings with defaults and never invents a source", () => {
  assert.equal(
    hallOfFamePolicyLine({ hallOfFameInductionScoreMin: 500, hallOfFameYearsRetiredMin: 3, hallOfFameMaxClassSize: 4 }),
    "Score 500 | Wait 3y | Class 4/yr"
  );
  assert.equal(hallOfFamePolicyLine({}), "Score 450 | Wait 0y | Class 6/yr");
});

test("retiredNumberPolicyLine composes only the active policy clauses", () => {
  assert.equal(retiredNumberPolicyLine({}), "Retired only");
  assert.equal(retiredNumberPolicyLine({ retiredNumberRequireRetiredPlayer: false }), "Active allowed");
  assert.equal(
    retiredNumberPolicyLine({ retiredNumberRequireHallOfFame: true, retiredNumberCareerAvMin: 40 }),
    "Retired only | Hall required | AV 40+"
  );
});
