import assert from "node:assert/strict";
import test from "node:test";

import { computeCapProjection } from "../public/lib/engagementFeatures.js";

// computeCapProjection is the pure logic behind the Cap War Room panel's
// multi-year cap timeline. Prior to S78, the expiring-contract counter only
// fired on `yearsRemaining === 1`, so a contract already at 0 years
// remaining — a real, legally reachable mid-season state since the S67
// offseason fix — was invisible to the panel even though it is at least as
// urgent as a 1-year contract.

function roster(contracts) {
  return contracts.map((contract, i) => ({ id: `p${i}`, contract }));
}

test("a contract at yearsRemaining === 0 counts as expiring in the current year", () => {
  const [current] = computeCapProjection(
    roster([{ salary: 1_000_000, deadCap: 200_000, yearsRemaining: 0 }]),
    2026,
    { yearSpan: 1 }
  );
  assert.equal(current.expiring, 1);
});

test("a contract at yearsRemaining === 1 still counts as expiring (no regression)", () => {
  const [current] = computeCapProjection(
    roster([{ salary: 1_000_000, deadCap: 0, yearsRemaining: 1 }]),
    2026,
    { yearSpan: 1 }
  );
  assert.equal(current.expiring, 1);
});

test("a contract at yearsRemaining === 2 does not count as expiring", () => {
  const [current] = computeCapProjection(
    roster([{ salary: 1_000_000, deadCap: 0, yearsRemaining: 2 }]),
    2026,
    { yearSpan: 1 }
  );
  assert.equal(current.expiring, 0);
});

test("mixed roster: 0-year and 1-year contracts both count, 2-year+ does not", () => {
  const [current] = computeCapProjection(
    roster([
      { salary: 1_000_000, deadCap: 0, yearsRemaining: 0 },
      { salary: 1_000_000, deadCap: 0, yearsRemaining: 1 },
      { salary: 1_000_000, deadCap: 0, yearsRemaining: 3 }
    ]),
    2026,
    { yearSpan: 1 }
  );
  assert.equal(current.expiring, 2);
});

test("expiring is only counted in the current projection year, not future years", () => {
  const [current, nextYear] = computeCapProjection(
    roster([{ salary: 1_000_000, deadCap: 0, yearsRemaining: 1 }]),
    2026,
    { yearSpan: 2 }
  );
  assert.equal(current.expiring, 1);
  assert.equal(nextYear.expiring, 0);
});

test("committed vs dead money still splits correctly around the contract's real end year", () => {
  const [year0, year1] = computeCapProjection(
    roster([{ salary: 5_000_000, deadCap: 1_000_000, yearsRemaining: 1 }]),
    2026,
    { yearSpan: 2 }
  );
  assert.equal(year0.committed, 5_000_000);
  assert.equal(year0.dead, 0);
  assert.equal(year1.committed, 0);
  assert.equal(year1.dead, 1_000_000);
});
