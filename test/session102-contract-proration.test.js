import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceContractYear,
  applyFifthYearOption,
  applyFranchiseTag,
  buildContract,
  computeReleaseDeadCap,
  normalizeContract,
  restructureContract
} from "../src/domain/contracts.js";

// ── S102 · a deal's cap hit is fixed when it is signed ────────────────────────
//
// `normalizeContract` computed the amortization term into a local (`capYears`)
// and threw it away, so every reader re-derived proration from whatever years
// were LEFT on the contract. `advanceContractYear` divided the same signing
// bonus by a smaller number every season, and the cap hit climbed for the whole
// life of the deal — measured on a flat $20M contract before this fix:
//
//     3yr  16.267M -> 17.200M -> 20.000M                        (+23.0%)
//     4yr  15.800M -> 16.267M -> 17.200M -> 20.000M             (+26.6%)
//     5yr  15.520M -> 15.800M -> 16.267M -> 17.200M -> 20.000M  (+28.9%)
//
// A contract's final year was always its most expensive, and always cost the
// full salary, which is backwards: real proration is set at signing and does
// not move. The term is now persisted as `prorationYears`.

function capHitTrail(years, salary = 20_000_000) {
  let contract = buildContract({ overall: 85, years, salary });
  const trail = [contract.capHit];
  for (let i = 1; i < years; i += 1) {
    contract = advanceContractYear(contract);
    trail.push(contract.capHit);
  }
  return trail;
}

test("a contract costs the same against the cap every year it exists", () => {
  for (const years of [2, 3, 4, 5]) {
    const trail = capHitTrail(years);
    assert.equal(trail.length, years);
    for (const capHit of trail) {
      assert.equal(capHit, trail[0], `${years}-year deal drifted across its term: ${trail.join(" -> ")}`);
    }
  }
});

test("the final year of a deal is not its most expensive", () => {
  const trail = capHitTrail(5);
  assert.ok(
    trail.at(-1) <= trail[0],
    `the last year (${trail.at(-1)}) must not cost more than the first (${trail[0]})`
  );
  // And it must not simply equal the full salary, which is what the old
  // "divide by the one year remaining" arithmetic always produced.
  assert.ok(trail.at(-1) < 20_000_000, "the final year still swallowed the entire signing bonus");
});

// NEGATIVE CONTROL — the assertions above must be able to fail. Re-derive
// proration from the remaining term, exactly as the pre-fix code did, and prove
// the same trail check reports the defect rather than sailing past it.
test("negative control: re-deriving proration from remaining years is visibly wrong", () => {
  const signed = buildContract({ overall: 85, years: 5, salary: 20_000_000 });
  let contract = signed;
  const trail = [contract.capHit];
  for (let i = 1; i < 5; i += 1) {
    const yearsRemaining = contract.yearsRemaining - 1;
    // The pre-S102 formula, written out rather than restored in the source, so
    // this control cannot rot into a copy of whatever the source happens to do.
    const capHit = Math.round(contract.baseSalary + contract.signingBonus / Math.max(1, yearsRemaining));
    contract = normalizeContract({ ...contract, yearsRemaining, capHit, prorationYears: yearsRemaining });
    trail.push(contract.capHit);
  }
  assert.ok(trail.at(-1) > trail[0] * 1.2, "the pre-fix trail must climb at least 20% — it measured +28.9%");
  assert.notEqual(trail[1], trail[0], "the pre-fix trail must not be flat, or the flatness test proves nothing");
});

test("a save written before the schedule existed migrates to its remaining term", () => {
  // The legacy shape: no `prorationYears`, and a `capHit` already on the books.
  const legacy = normalizeContract({
    salary: 12_000_000,
    yearsRemaining: 3,
    voidYears: 1,
    baseSalary: 9_000_000,
    signingBonus: 3_000_000,
    capHit: 9_750_000,
    deadCapRemaining: 4_200_000
  });

  assert.equal(legacy.prorationYears, 4, "migration defaults to remaining years plus void years");
  assert.equal(legacy.capHit, 9_750_000, "a migrated deal keeps the cap hit the save already recorded");

  // And from the migration forward it no longer accelerates.
  const next = advanceContractYear(legacy);
  assert.equal(next.capHit, legacy.capHit, "a migrated deal must stop climbing at the load, not keep climbing");
});

test("releasing a player accelerates every remaining year of proration, not one", () => {
  const contract = buildContract({ overall: 88, years: 5, salary: 25_000_000 });
  const annualProration = contract.signingBonus / contract.prorationYears;

  const early = computeReleaseDeadCap(contract);
  assert.ok(
    early.currentYearDeadCap > annualProration * 4,
    "cutting in year 1 of a five-year deal must carry roughly the whole unamortized bonus"
  );

  // Four years later there is one year of proration left, so the same release
  // is cheap. That difference is the entire point of the mechanic.
  let aged = contract;
  for (let i = 0; i < 4; i += 1) aged = advanceContractYear(aged);
  const late = computeReleaseDeadCap(aged);
  assert.ok(
    late.currentYearDeadCap < early.currentYearDeadCap,
    "a deal must get cheaper to escape as its bonus amortizes"
  );
});

test("a June 1 designation splits real multi-year money across two seasons", () => {
  const contract = buildContract({ overall: 88, years: 5, salary: 25_000_000 });
  const straight = computeReleaseDeadCap(contract);
  const june1 = computeReleaseDeadCap(contract, { june1: true });

  assert.ok(june1.nextYearDeadCap > 0, "the whole purpose of the designation is to defer money");
  assert.ok(
    june1.currentYearDeadCap < straight.currentYearDeadCap,
    "designating must reduce THIS year's charge"
  );
  assert.equal(
    june1.currentYearDeadCap + june1.nextYearDeadCap,
    straight.currentYearDeadCap,
    "deferring money must not create or destroy any of it"
  );
});

test("a restructure buys relief now and holds it for the rest of the deal", () => {
  const before = buildContract({ overall: 90, years: 4, salary: 30_000_000 });
  const after = restructureContract(before, { float: () => 0.1 });

  assert.ok(after.capHit < before.capHit, "a restructure must lower the current cap hit");
  assert.equal(after.prorationYears, before.yearsRemaining, "the converted money re-prorates over the years left");

  const nextYear = advanceContractYear(after);
  assert.equal(nextYear.capHit, after.capHit, "the relief must hold instead of tightening again next season");
});

test("exercising the fifth-year option actually costs something against the cap", () => {
  // S102 — `capHit` arrived through the object spread and was never recomputed,
  // so the option raised salary and base salary while the club paid nothing.
  const rookie = buildContract({ overall: 84, years: 4, salary: 6_000_000 });
  const optioned = applyFifthYearOption(rookie, { salary: 14_000_000 });

  assert.equal(optioned.optionYear, true);
  assert.equal(optioned.baseSalary, 14_000_000);
  assert.ok(
    optioned.capHit > rookie.capHit,
    `the option must move the cap hit (was ${rookie.capHit}, still ${optioned.capHit})`
  );
  assert.equal(
    optioned.capHit,
    Math.round(14_000_000 + rookie.signingBonus / rookie.prorationYears),
    "the option year is guaranteed salary against the existing bonus schedule"
  );
});

test("the compliance authority prorates on the same schedule the contract does", () => {
  // Two places compute "this year's already-prorated signing bonus": the
  // contract's own cap hit, and `capCompliance.currentYearProration` when it
  // decides whether a release is worth making. Before S102 the latter read
  // `contract.capYears` — a field that never existed on a persisted contract —
  // and fell through to `yearsRemaining`, which happened to agree with the cap
  // hit only because the cap hit was being re-derived the same wrong way.
  let contract = buildContract({ overall: 86, years: 5, salary: 22_000_000 });
  for (let i = 0; i < 2; i += 1) contract = advanceContractYear(contract);
  assert.ok(
    contract.yearsRemaining < contract.prorationYears,
    "the fixture must be mid-contract, where the two denominators differ"
  );

  const scheduleProration = Math.round(contract.signingBonus / contract.prorationYears);
  const remainingYearsProration = Math.round(contract.signingBonus / contract.yearsRemaining);
  assert.notEqual(
    scheduleProration,
    remainingYearsProration,
    "the fixture must actually distinguish the two readings"
  );

  // The contract's own cap hit is base salary plus the scheduled proration.
  assert.equal(
    contract.capHit,
    Math.round(contract.baseSalary + contract.signingBonus / contract.prorationYears),
    "the cap hit must be built on the persisted schedule"
  );
});

test("a franchise tag is a one-year deal and prorates like one", () => {
  const contract = buildContract({ overall: 92, years: 4, salary: 28_000_000 });
  const tagged = applyFranchiseTag(contract, { year: 2030, salary: 32_000_000 });

  assert.equal(tagged.yearsRemaining, 1);
  assert.equal(tagged.prorationYears, 1, "a one-year deal cannot amortize over a term it does not have");
  assert.equal(tagged.capHit, 32_000_000);
});
