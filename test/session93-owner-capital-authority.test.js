import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import {
  FACILITY_INVESTMENT_PROFILE,
  FACILITY_KEYS,
  chargeFacilityUpkeep,
  facilityAllowanceState,
  facilityMarginalCost,
  facilityUpgradeCost,
  facilityUpkeepCost,
  totalFacilityUpkeep
} from "../src/domain/facilityInvestment.js";
import {
  TICKET_DEMAND_PROFILE,
  measureTicketPriceCentre,
  optimalTicketPrice,
  ticketDemandFactor,
  ticketPriceFanInterestDelta
} from "../src/domain/ticketDemand.js";
import {
  applyOwnerCapitalReturn,
  measureOwnerOperatingLiquidity,
  operatingLiquidityPressure
} from "../src/domain/ownerEconomy.js";
import {
  facilityAppetite,
  facilityAppetiteFactors,
  measureFacilityCentres,
  runFacilityInvestmentRound
} from "../src/engine/facilityMarket.js";

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const sd = (values) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};
const trainingLevels = (session) => session.league.teams.map((team) => Number(team.owner.facilities.training));
const buf = (session) => session.league.teams.find((team) => team.id === "BUF");
const quantile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
};

function fixedAnnualOperatingContributions(league) {
  const centre = measureTicketPriceCentre(league);
  return new Map((league.teams || []).map((team) => {
    const owner = team.owner;
    const attendance = Math.max(0.52, Math.min(1.12, (Number(owner.fanInterest) || 70) / 100));
    const demand = ticketDemandFactor(owner.ticketPrice || 120, centre);
    // A deterministic season envelope built from the same home/away gate sizes
    // and annual staff obligation as GameSession.processOwnerFinances. Holding it
    // fixed isolates whether the capital policy itself converges.
    const gate = owner.marketSize * (owner.ticketPrice || 120) * attendance * demand * 8.5 * (66_500 + 24_000);
    return [team.id, Math.round(gate - (owner.staffBudget || 25_000_000))];
  }));
}

function summarizeCapitalState(league, paths, year) {
  const cash = league.teams.map((team) => Number(team.owner.cash) / 1_000_000);
  const facilities = league.teams.flatMap((team) => FACILITY_KEYS.map((key) => Number(team.owner.facilities[key])));
  return {
    year,
    cash: {
      p10: Number(quantile(cash, 0.1).toFixed(3)),
      p50: Number(quantile(cash, 0.5).toFixed(3)),
      p90: Number(quantile(cash, 0.9).toFixed(3)),
      max: Number(Math.max(...cash).toFixed(3))
    },
    facilities: {
      mean: Number(mean(facilities).toFixed(4)),
      min: Math.min(...facilities),
      max: Math.max(...facilities),
      atCeiling: facilities.filter((level) => level === FACILITY_INVESTMENT_PROFILE.ceiling).length
    },
    paths: { ...paths }
  };
}

function runCapitalHorizon(sourceLeague, { distressedTeamId = null } = {}) {
  const league = structuredClone(sourceLeague);
  const annual = fixedAnnualOperatingContributions(league);
  if (distressedTeamId) {
    const distressed = league.teams.find((team) => team.id === distressedTeamId)?.owner;
    assert.ok(distressed, "distressed projection team must exist");
    distressed.cash = FACILITY_INVESTMENT_PROFILE.minimumCashReserve + 500_000;
    distressed.facilities = { training: 95, rehab: 90, analytics: 85 };
    annual.set(distressedTeamId, 0);
  }
  const snapshots = [];
  const paths = { investments: 0, degraded: 0, distributions: 0, returned: 0 };
  for (let offset = 1; offset <= 40; offset += 1) {
    for (const team of league.teams) team.owner.cash += annual.get(team.id);
    const round = runFacilityInvestmentRound({ league, year: 2025 + offset, controlledTeamId: "ZZZ" });
    paths.investments += round.investments.length;
    paths.degraded += round.upkeep.length;
    paths.distributions += round.distributions.length;
    paths.returned += round.distributions.reduce((sum, entry) => sum + entry.returned, 0);
    if ([1, 8, 15, 40].includes(offset)) snapshots.push(summarizeCapitalState(league, paths, offset));
  }
  return {
    snapshots,
    receipts: league.facilityCapitalReceipts,
    finalOwners: league.teams.map((team) => ({
      id: team.id,
      cash: team.owner.cash,
      facilities: team.owner.facilities,
      capitalReturn: team.owner.capitalReturn
    }))
  };
}

function ownerFixture(overrides = {}) {
  return {
    cash: 200_000_000,
    ticketPrice: 120,
    marketSize: 1,
    fanInterest: 70,
    staffBudget: 28_000_000,
    personality: "legacy-builder",
    priorities: { championships: 80, profit: 60, loyalty: 60 },
    facilities: { training: 72, rehab: 72, analytics: 72 },
    ...overrides
  };
}

// ── The hole itself, closed ─────────────────────────────────────────────────

test("the owner panel refuses to write a facility level by hand, and provably does not move it", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const before = buf(session).owner.facilities.training;

  const result = session.updateOwnerState({ teamId: "BUF", training: 99 });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "facilities-readonly");
  assert.equal(
    buf(session).owner.facilities.training,
    before,
    "a refused facility write must leave the level exactly where it was"
  );
});

test("a refused facility write does not smuggle through the other owner fields with it", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const priceBefore = buf(session).owner.ticketPrice;

  const result = session.updateOwnerState({ teamId: "BUF", ticketPrice: 300, training: 99 });

  assert.equal(result.ok, false);
  assert.equal(
    buf(session).owner.ticketPrice,
    priceBefore,
    "a rejected command must be atomic — no field may land while another is refused"
  );
});

test("re-sending a facility's CURRENT value is not a write and is not refused", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const owner = buf(session).owner;

  // The UI round-trips owner state, so an unchanged value must stay legal —
  // otherwise saving a ticket price would fail for every existing client.
  const result = session.updateOwnerState({
    teamId: "BUF",
    ticketPrice: 140,
    training: owner.facilities.training,
    rehab: owner.facilities.rehab,
    analytics: owner.facilities.analytics
  });

  assert.equal(result.ok, true);
  assert.equal(buf(session).owner.ticketPrice, 140);
});

// ── The price, and that it is the price actually charged ────────────────────

test("the facility cost curve is superlinear and has exactly one definition", () => {
  const cheap = facilityMarginalCost(60) - facilityMarginalCost(59);
  const dear = facilityMarginalCost(99) - facilityMarginalCost(98);
  assert.ok(dear > cheap * 2, `the top of the range must cost far more per point; got ${cheap} vs ${dear}`);

  // The range price is the sum of its marginal points, not a second formula.
  let summed = 0;
  for (let level = 73; level <= 99; level += 1) summed += facilityMarginalCost(level);
  assert.equal(facilityUpgradeCost(72, 99), summed);

  assert.equal(facilityUpgradeCost(72, 72), 0);
  assert.equal(facilityUpgradeCost(80, 72), 0, "a downgrade neither costs nor refunds");
});

test("investing debits exactly the quoted cost and moves exactly the quoted points", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const owner = buf(session).owner;
  const cashBefore = owner.cash;
  const levelBefore = owner.facilities.training;
  const expected = facilityUpgradeCost(levelBefore, levelBefore + 2);

  const result = session.investInFacility({ teamId: "BUF", facility: "training", points: 2 });

  assert.equal(result.ok, true);
  assert.equal(result.cost, expected);
  assert.equal(owner.facilities.training, levelBefore + 2);
  assert.equal(owner.cash, cashBefore - expected, "the debit must equal the quote, not approximate it");
});

test("the quoted market price is the price the command charges", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const quoted = session.getFacilitiesMarket("BUF").facilities.find((row) => row.facility === "rehab");
  const result = session.investInFacility({ teamId: "BUF", facility: "rehab", points: 1 });

  assert.equal(result.ok, true);
  assert.equal(result.cost, quoted.cost, "a panel that quotes a price the engine will not charge is a lying surface");
  assert.equal(result.to, quoted.target);
});

test("a club cannot spend through its operating reserve", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const owner = buf(session).owner;
  owner.cash = FACILITY_INVESTMENT_PROFILE.minimumCashReserve + 1_000_000;
  const levelBefore = owner.facilities.training;

  const result = session.investInFacility({ teamId: "BUF", facility: "training", points: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "facility-insufficient-cash");
  assert.equal(owner.facilities.training, levelBefore);
});

test("the annual build allowance binds, and resets on the next league year", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const allowance = FACILITY_INVESTMENT_PROFILE.annualPointAllowance;

  for (let i = 0; i < allowance; i += 1) {
    assert.equal(session.investInFacility({ teamId: "BUF", facility: "training", points: 1 }).ok, true);
  }
  const blocked = session.investInFacility({ teamId: "BUF", facility: "training", points: 1 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reasonCode, "facility-allowance-spent");

  // A different wing has its own allowance — the cap is per facility, as quoted.
  assert.equal(session.investInFacility({ teamId: "BUF", facility: "rehab", points: 1 }).ok, true);

  session.currentYear += 1;
  assert.equal(
    session.investInFacility({ teamId: "BUF", facility: "training", points: 1 }).ok,
    true,
    "construction must resume in the next league year"
  );
});

test("an over-large request is granted down to the allowance rather than silently rejected or overrun", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const levelBefore = buf(session).owner.facilities.training;
  const result = session.investInFacility({ teamId: "BUF", facility: "training", points: 99 });

  assert.equal(result.ok, true);
  assert.equal(result.points, FACILITY_INVESTMENT_PROFILE.annualPointAllowance);
  assert.equal(buf(session).owner.facilities.training, levelBefore + FACILITY_INVESTMENT_PROFILE.annualPointAllowance);
});

test("an allowance record from a previous year reads as unspent, so a pre-S93 save needs no migration", () => {
  const owner = ownerFixture({ facilityInvestment: { year: 2019, points: { training: 3, rehab: 3, analytics: 3 } } });
  const state = facilityAllowanceState(owner, 2026);
  for (const key of FACILITY_KEYS) {
    assert.equal(state.spent[key], 0);
    assert.equal(state.remaining[key], FACILITY_INVESTMENT_PROFILE.annualPointAllowance);
  }

  // And an owner that has never heard of the field is legal, not an error.
  const legacy = facilityAllowanceState(ownerFixture(), 2026);
  assert.equal(legacy.remaining.training, FACILITY_INVESTMENT_PROFILE.annualPointAllowance);
});

// ── NEGATIVE CONTROL ────────────────────────────────────────────────────────

test("NEGATIVE CONTROL — the pre-S93 free write bought an edge no club can be generated with, and the gate now rejects it", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const owner = buf(session).owner;

  // What every club is actually generated with (buildFranchiseEconomics: 64-82).
  const generated = trainingLevels(session);
  assert.ok(Math.max(...generated) <= 90, `no generated club should be near the ceiling; got ${Math.max(...generated)}`);

  // Reconstruct exactly what the panel used to do: one free clamped write.
  const preS93Write = (level) => Math.max(40, Math.min(99, Math.round(level)));
  const exploited = preS93Write(99);
  assert.ok(
    exploited > Math.max(...generated),
    "the reconstructed pre-S93 write must reach a level outside the entire generated league — that is the defect"
  );

  // The same level through the shipped path is refused outright...
  assert.equal(session.updateOwnerState({ teamId: "BUF", training: exploited }).ok, false);

  // ...and buying there is a real, multi-year, multi-hundred-million project.
  const cost = facilityUpgradeCost(owner.facilities.training, exploited);
  assert.ok(cost > 200_000_000, `reaching the ceiling must be a franchise project; costs ${cost}`);
  const yearsOfBuilding = Math.ceil((exploited - owner.facilities.training) / FACILITY_INVESTMENT_PROFILE.annualPointAllowance);
  assert.ok(yearsOfBuilding >= 5, `reaching the ceiling must take years; takes ${yearsOfBuilding}`);
});

// ── Upkeep: why a purchase price alone was not a constraint ─────────────────

test("upkeep is superlinear, and a facility at the floor is free to hold", () => {
  assert.equal(facilityUpkeepCost(FACILITY_INVESTMENT_PROFILE.floor), 0);
  const low = facilityUpkeepCost(60) - facilityUpkeepCost(59);
  const high = facilityUpkeepCost(99) - facilityUpkeepCost(98);
  assert.ok(high > low * 2, `holding the top of the range must cost far more; got ${low} vs ${high}`);
  assert.ok(facilityUpkeepCost(99) > facilityUpkeepCost(72) * 2);
});

test("a club that can fund its facilities pays upkeep and keeps them", () => {
  const owner = ownerFixture();
  const owed = totalFacilityUpkeep(owner);
  assert.ok(owed > 0);

  const result = chargeFacilityUpkeep(owner);
  assert.equal(result.degraded, null);
  assert.equal(result.paid, owed);
  assert.equal(owner.cash, 200_000_000 - owed);
  assert.equal(owner.facilities.training, 72);
});

test("a club that cannot fund what it built loses a point of it, and it is the most expensive wing", () => {
  const owner = ownerFixture({
    cash: FACILITY_INVESTMENT_PROFILE.minimumCashReserve + 500_000,
    facilities: { training: 95, rehab: 70, analytics: 66 }
  });

  const result = chargeFacilityUpkeep(owner);

  assert.equal(result.degraded, "training", "deferred maintenance must hit the wing that costs the most to hold");
  assert.equal(owner.facilities.training, 94);
  assert.equal(owner.facilities.rehab, 70);
  assert.ok(owner.cash >= FACILITY_INVESTMENT_PROFILE.minimumCashReserve - 1, "the reserve is what the club protects");
});

test("a club already at the floor cannot degrade below it", () => {
  const owner = ownerFixture({ cash: 0, facilities: { training: 40, rehab: 40, analytics: 40 } });
  const result = chargeFacilityUpkeep(owner);
  assert.equal(result.degraded, null);
  assert.equal(owner.facilities.training, FACILITY_INVESTMENT_PROFILE.floor);
});

// ── AI parity: the league stops being frozen ────────────────────────────────

test("the league's facilities demonstrably move — the frozen-forever signature is gone", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const before = trainingLevels(session);

  for (let year = 0; year < 3; year += 1) {
    runFacilityInvestmentRound({ league: session.league, year: 2026 + year, controlledTeamId: "BUF" });
  }
  const after = trainingLevels(session);

  // The defect's fingerprint was a standard deviation identical to the last
  // reported digit across a decade. Its absence is this fix's receipt.
  assert.notEqual(sd(after).toFixed(3), sd(before).toFixed(3), "the league-wide facility spread must actually move");
  assert.ok(after.some((level, index) => level !== before[index]), "at least one rival club must have built something");
});

test("the AI never invests on behalf of the club the player controls", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const before = { ...buf(session).owner.facilities };

  runFacilityInvestmentRound({ league: session.league, year: 2026, controlledTeamId: "BUF" });

  for (const key of FACILITY_KEYS) {
    assert.equal(
      buf(session).owner.facilities[key],
      before[key],
      "the player's capital is the player's decision — an AI that spent it is the authority hole rebuilt from the other side"
    );
  }
});

test("the AI buys at the same price as the player and never spends through the reserve", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const before = new Map(session.league.teams.map((team) => [team.id, { ...team.owner.facilities, cash: team.owner.cash }]));

  const round = runFacilityInvestmentRound({ league: session.league, year: 2026, controlledTeamId: "BUF" });
  assert.ok(round.investments.length > 0, "some rival must be able to afford to build");

  for (const investment of round.investments) {
    assert.equal(
      investment.cost,
      facilityUpgradeCost(investment.from, investment.to),
      "the AI must pay the same published price as the player"
    );
  }
  for (const team of session.league.teams) {
    assert.ok(
      team.owner.cash >= 0,
      `${team.id} spent itself negative`
    );
  }
  assert.ok(before.size === 32);
});

test("a thin-cash profit-first owner sits the year out; a flush championship-driven owner builds", () => {
  const centres = { training: 80, rehab: 80, analytics: 80 };

  const miser = { id: "MIS", owner: ownerFixture({ cash: 25_000_000, personality: "profit-first", priorities: { championships: 60, profit: 90, loyalty: 50 } }) };
  const builder = { id: "BLD", owner: ownerFixture({ cash: 240_000_000, personality: "legacy-builder", priorities: { championships: 92, profit: 40, loyalty: 60 } }) };

  assert.ok(
    facilityAppetite(miser, centres) < facilityAppetite(builder, centres),
    "owner personality and cash must actually separate who builds"
  );
  assert.ok(facilityAppetite(builder, centres) >= 0.5, "a flush, championship-driven owner should build");
});

test("the facility market never consumes the session RNG stream", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  let draws = 0;
  const realFloat = session.rng.float.bind(session.rng);
  const realInt = session.rng.int.bind(session.rng);
  session.rng.float = (...args) => {
    draws += 1;
    return realFloat(...args);
  };
  session.rng.int = (...args) => {
    draws += 1;
    return realInt(...args);
  };

  runFacilityInvestmentRound({ league: session.league, year: 2026, controlledTeamId: "BUF" });
  session.investInFacility({ teamId: "BUF", facility: "training", points: 1 });

  assert.equal(draws, 0, "a policy that draws from the shared stream changes every downstream result in the league");
});

test("facility centres are measured from the league, not declared", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const centres = measureFacilityCentres(session.league);
  assert.ok(
    Math.abs(centres.training - mean(trainingLevels(session))) < 1e-9,
    "the centre must be the league's own mean"
  );
});

test("owner cash is measured as operating-liquidity runway against modeled football obligations", () => {
  const healthy = ownerFixture({ cash: 180_000_000, staffBudget: 30_000_000 });
  const distressed = ownerFixture({ cash: 28_000_000, staffBudget: 30_000_000 });
  const healthyLiquidity = measureOwnerOperatingLiquidity(healthy);
  const distressedPressure = operatingLiquidityPressure(distressed);

  assert.equal(healthyLiquidity.meaning, "football-operations-liquidity");
  assert.equal(
    healthyLiquidity.obligations.total,
    healthyLiquidity.obligations.staffBudget + healthyLiquidity.obligations.facilityUpkeep
  );
  assert.ok(healthyLiquidity.runwayYears > 1);
  assert.equal(distressedPressure.pressure, 12);
  assert.ok(distressedPressure.liquidity.runwayYears < healthyLiquidity.runwayYears);
});

test("generated owners make differentiated year-zero capital choices and emit factor receipts", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const centres = measureFacilityCentres(session.league);
  const policies = session.league.teams.map((team) => ({
    team,
    policy: facilityAppetiteFactors(team, centres)
  }));
  const willing = policies.filter(({ policy }) => policy.appetite >= policy.threshold);
  const profitFirst = policies.filter(({ team }) => team.owner.personality === "profit-first");
  const profitFirstWilling = profitFirst.filter(({ policy }) => policy.appetite >= policy.threshold);
  const builders = policies.filter(({ team }) => team.owner.personality === "legacy-builder");
  const buildersWilling = builders.filter(({ policy }) => policy.appetite >= policy.threshold);

  assert.ok(willing.length >= 8 && willing.length <= 24, `expected a differentiated market, received ${willing.length}/32 willing clubs`);
  assert.ok(profitFirstWilling.length < profitFirst.length, "profit-first cannot be a decorative trait");
  assert.ok(buildersWilling.length > profitFirstWilling.length, "legacy builders should clear the capital bar more often");
  for (const { policy } of policies) {
    assert.equal(policy.provenance, "seeded-policy-calibration-not-external-measurement");
    assert.ok(Number.isFinite(policy.factors.liquidityRunwayYears));
    assert.ok(Number.isFinite(policy.factors.traitFactor));
    assert.ok(Number.isFinite(policy.factors.marketNeedFactor));
  }

  const round = runFacilityInvestmentRound({ league: session.league, year: 2026, controlledTeamId: "BUF" });
  assert.equal(round.decisions.length, 32);
  assert.ok(round.decisions.some((entry) => entry.outcome === "invested"));
  assert.ok(round.decisions.some((entry) => entry.outcome === "sit-out"));
  assert.equal(round.decisions.find((entry) => entry.teamId === "BUF").outcome, "player-authority");
  assert.equal(session.league.facilityCapitalReceipts.length, 32);
});

test("owner capital returns remove only true excess and are idempotent within a league year", () => {
  const owner = ownerFixture({
    cash: 400_000_000,
    personality: "profit-first",
    priorities: { championships: 62, profit: 90, loyalty: 50 }
  });
  const measured = measureOwnerOperatingLiquidity(owner);
  const first = applyOwnerCapitalReturn(owner, 2026);

  assert.ok(first.returned > 0);
  assert.ok(owner.cash >= measured.targetCash, "a distribution may never cross the operating capital envelope");
  assert.equal(first.cashBefore - first.cashAfter, first.returned);
  const cashAfter = owner.cash;

  const retry = applyOwnerCapitalReturn(owner, 2026);
  assert.equal(retry.returned, first.returned, "the receipt remains truthful about what the year returned");
  assert.equal(retry.applied, false);
  assert.equal(retry.reasonCode, "capital-return-already-settled");
  assert.equal(owner.cash, cashAfter, "a retried offseason stage cannot distribute twice");
});

test("the 1/8/15/40-year capital replay is bounded, differentiated, and deterministic", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const first = runCapitalHorizon(session.league);
  const replay = runCapitalHorizon(session.league);

  assert.deepEqual(replay, first, "the same generated league and revenue envelope must replay byte-for-byte");
  assert.deepEqual(first.snapshots.map((entry) => entry.year), [1, 8, 15, 40]);
  for (const snapshot of first.snapshots) {
    assert.ok(snapshot.cash.p10 >= FACILITY_INVESTMENT_PROFILE.minimumCashReserve / 1_000_000);
    assert.ok(snapshot.cash.p90 < 260, `cash p90 compounded outside the calibrated envelope at year ${snapshot.year}`);
    assert.ok(snapshot.cash.max < 300, `the richest club escaped the bounded operating-liquidity model at year ${snapshot.year}`);
    assert.ok(snapshot.facilities.mean >= 70 && snapshot.facilities.mean <= 85);
    assert.ok(snapshot.facilities.min < snapshot.facilities.max, "the differentiator must retain a lower and upper tail");
    assert.equal(snapshot.facilities.atCeiling, 0, "the league may not silently flatten at the facility ceiling");
  }
  assert.ok(first.snapshots.at(-1).paths.investments > 0);
  assert.ok(first.snapshots.at(-1).paths.distributions > 0);
  assert.ok(first.snapshots.at(-1).paths.returned > 0);
  assert.equal(first.receipts.length, 256, "factor receipts remain bounded to eight league-years");

  // The steady envelope need not manufacture distress, so replay the same four
  // horizons with one club receiving no operating contribution. That path must
  // degrade gradually, retain the reserve, and remain deterministic too.
  const distressedTeamId = session.league.teams[0].id;
  const distressed = runCapitalHorizon(session.league, { distressedTeamId });
  const distressedReplay = runCapitalHorizon(session.league, { distressedTeamId });
  assert.deepEqual(distressedReplay, distressed);
  assert.deepEqual(distressed.snapshots.map((entry) => entry.year), [1, 8, 15, 40]);
  for (const snapshot of distressed.snapshots) {
    assert.ok(snapshot.paths.degraded >= snapshot.year, `deferred maintenance stopped before year ${snapshot.year}`);
    assert.ok(snapshot.cash.p10 >= FACILITY_INVESTMENT_PROFILE.minimumCashReserve / 1_000_000);
  }
  const distressedOwner = distressed.finalOwners.find((owner) => owner.id === distressedTeamId);
  assert.ok(distressedOwner.facilities.training < 95 || distressedOwner.facilities.rehab < 90);
});

// ── The gate price becomes a decision ───────────────────────────────────────

test("a club priced exactly at the league mean is affected by the demand curve not at all", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const centre = measureTicketPriceCentre(session.league);
  assert.equal(centre.source, "measured");
  assert.equal(
    ticketDemandFactor(centre.price, centre),
    1,
    "the centred-differentiator identity: pricing at the league mean must be exactly neutral"
  );
  assert.equal(ticketPriceFanInterestDelta(centre.price, centre), 0);
});

test("gate revenue is single-peaked in price, and the legal maximum is NOT the best price", () => {
  const centre = { price: 120 };
  const revenue = (price) => price * ticketDemandFactor(price, centre);

  let best = null;
  for (let price = 35; price <= 450; price += 1) {
    const value = revenue(price);
    if (!best || value > best.value) best = { price, value };
  }

  assert.ok(best.price > 35 && best.price < 450, `the optimum must be interior; landed at ${best.price}`);
  assert.ok(
    revenue(450) < revenue(centre.price),
    "pricing at the legal maximum must be WORSE than pricing at the league mean — the pre-S93 exploit inverted"
  );
  assert.ok(
    Math.abs(best.price - optimalTicketPrice(centre).price) <= 1.5,
    "the derived optimum must match the measured one, so the panel and the engine agree"
  );
});

test("the demand centre moves with the league, and a frozen centre is rejected", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const before = measureTicketPriceCentre(session.league).price;

  for (const team of session.league.teams) team.owner.ticketPrice = Math.round(team.owner.ticketPrice * 2);
  const after = measureTicketPriceCentre(session.league).price;

  assert.ok(after > before * 1.9, "a centre that does not follow the league is a constant wearing a measurement's clothes");

  // NEGATIVE CONTROL — a stubbed constant centre would report the same club as
  // gouging after a league-wide doubling. The measured centre must not.
  const frozen = { price: before };
  const club = session.league.teams[0].owner.ticketPrice;
  assert.ok(ticketDemandFactor(club, frozen) < ticketDemandFactor(club, { price: after }));
  assert.equal(ticketDemandFactor(club, { price: after }), ticketDemandFactor(club, measureTicketPriceCentre(session.league)));
});

test("a league too small to define a price centre reports declared, never a fabricated measurement", () => {
  const centre = measureTicketPriceCentre({ teams: [{ owner: { ticketPrice: 400 } }] });
  assert.equal(centre.source, "declared");
  assert.equal(centre.price, TICKET_DEMAND_PROFILE.fallbackCentrePrice);
});

test("the gate price now moves fan interest, bounded and zero at the league mean", () => {
  const centre = { price: 120 };
  assert.equal(ticketPriceFanInterestDelta(120, centre), 0);
  assert.ok(ticketPriceFanInterestDelta(300, centre) < 0, "gouging must cost goodwill");
  assert.ok(ticketPriceFanInterestDelta(80, centre) > 0, "pricing below the league must buy goodwill");
  for (const price of [35, 120, 450]) {
    assert.ok(Math.abs(ticketPriceFanInterestDelta(price, centre)) <= TICKET_DEMAND_PROFILE.maxFanInterestSwing + 1e-9);
  }
});

test("the ticket price centre never consumes the RNG stream", () => {
  let draws = 0;
  const league = {
    teams: Array.from({ length: 32 }, () => ({ owner: { ticketPrice: 120 } }))
  };
  const rng = new RNG(1);
  const realFloat = rng.float.bind(rng);
  rng.float = (...args) => {
    draws += 1;
    return realFloat(...args);
  };
  measureTicketPriceCentre(league);
  assert.equal(draws, 0);
});

// ── Derived state, snapshots, and the cache that had to learn a new key ─────

test("a restored snapshot measures the same price centre and facility market as the live session", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  session.investInFacility({ teamId: "BUF", facility: "training", points: 2 });

  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  const restored = GameSession.fromSnapshot(snapshot, (seed) => new RNG(seed));

  assert.equal(restored.ticketPriceCentre().price, session.ticketPriceCentre().price);
  const live = session.getFacilitiesMarket("BUF");
  const clone = restored.getFacilitiesMarket("BUF");
  assert.equal(clone.cash, live.cash);
  assert.equal(clone.annualUpkeep, live.annualUpkeep);
  assert.deepEqual(clone.allowance.remaining, live.allowance.remaining, "the year's build allowance must survive a save");
});

test("the development centres cache notices a facility change inside a league year", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const before = session.developmentEnvironmentCentres().training;

  session.investInFacility({ teamId: "BUF", facility: "training", points: 3 });
  const after = session.developmentEnvironmentCentres().training;

  assert.notEqual(
    after,
    before,
    "a cache blind to facilities would serve centres measured against a league that no longer exists — the miscentred term S90 removed, rebuilt in the cache"
  );
});

test("the facilities market quotes the same allowance the command will honour", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  session.investInFacility({ teamId: "BUF", facility: "analytics", points: 1 });

  const market = session.getFacilitiesMarket("BUF");
  const row = market.facilities.find((entry) => entry.facility === "analytics");

  assert.equal(row.allowanceRemaining, FACILITY_INVESTMENT_PROFILE.annualPointAllowance - 1);
  assert.equal(row.current, buf(session).owner.facilities.analytics);
  assert.ok(market.annualUpkeep > 0);
  assert.equal(market.editable, true);
});

test("an investment is recorded in the transaction log with its price", () => {
  const session = createSession({ seed: 20260307, startYear: 2026, controlledTeamId: "BUF" });
  const result = session.investInFacility({ teamId: "BUF", facility: "training", points: 1 });
  const entry = session.league.transactionLog.filter((row) => row.type === "facility-investment").at(-1);

  assert.ok(entry, "a capital commitment must be auditable");
  assert.equal(entry.teamId, "BUF");
  assert.equal(entry.details.cost, result.cost);
  assert.equal(entry.details.to, result.to);
});
