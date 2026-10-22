import test from 'node:test';
import assert from 'node:assert/strict';
import { minimumSalaryForSeason } from '../src/data/nflSalaryMinimum.js';
import { buildContract, marketSalaryForOverall, normalizeContract, restructureContract, advanceContractYear, contractMarketOptions, contractBaseMinimum } from '../src/domain/contracts.js';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { RNG } from '../src/utils/rng.js';
import { practiceEligibilityGroup } from '../src/domain/practiceSquadEligibility.js';

function assertContractFloor(player,league) {
  if(player.contract.kind==='weekly-practice-contract-v1') {
    const weekly=practiceEligibilityGroup(player).group==='unrestricted'?18350:13750;
    assert.equal(player.contract.weeklySalary,weekly);
    assert.equal(player.contract.baseSalary,weekly*18);
    assert.equal(player.contract.guaranteed,0);
  } else assert.ok(player.contract.baseSalary>=contractBaseMinimum(contractMarketOptions(league,player),player.contract.yearsRemaining),`${player.id} is below its active contract floor`);
}

test('initial generated contracts retain a usable budget even when earlier adjustments already reached legality', () => {
  for (const seed of [49002, 90210]) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: 'BUF' });
    for (const team of session.league.teams) {
      const summary = session.getTeamCapSummary(team.id);
      assert.ok(summary.capSpace >= summary.salaryCap * .03 - 100,
        `${seed}/${team.id} has ${summary.capSpace} room, below its declared initial reserve`);
      for (const player of session.league.players.filter(p => p.teamId === team.id)) {
        assertContractFloor(player,session.league);
      }
    }
  }
});

test('CBA scheduled base minimums retain credited bands, dates and projected status', () => {
  const expected = [885000, 1005000, 1075000, 1145000, 1215000, 1215000, 1215000, 1300000];
  expected.forEach((salary, credit) => assert.equal(minimumSalaryForSeason(2026, credit).salary, salary));
  assert.equal(minimumSalaryForSeason(2020, 0).salary, 610000);
  assert.equal(minimumSalaryForSeason(2024, 0).salary, 795000);
  assert.equal(minimumSalaryForSeason(2030, 7).salary, 1480000);
  assert.equal(minimumSalaryForSeason(2031, 7).kind, 'simulation-projection');
  assert.equal(minimumSalaryForSeason(2019, 7).kind, 'fictional-unmodeled-minimum');
  for (const value of [-1, .5, NaN]) assert.throws(() => minimumSalaryForSeason(2026, value));
});

test('modern position markets are monotonic, date-scaled and separate from legacy contracts', () => {
  const options = { year: 2026, creditedSeasons: 7 };
  for (const position of ['QB', 'WR', 'OL', 'DL', 'DB', 'LB', 'RB', 'TE', 'K', 'P']) {
    let previous = 0;
    for (let overall = 0; overall <= 100; overall++) {
      const salary = marketSalaryForOverall(overall, { ...options, position });
      assert.ok(salary >= previous); previous = salary;
    }
  }
  assert.ok(marketSalaryForOverall(90, { ...options, position: 'QB' }) > marketSalaryForOverall(90, { ...options, position: 'K' }));
  assert.ok(marketSalaryForOverall(90, { ...options, position: 'WR', year: 2036 }) > marketSalaryForOverall(90, { ...options, position: 'WR' }));
  assert.ok(marketSalaryForOverall(90, { ...options, position: 'WR', year: 2024 }) < marketSalaryForOverall(90, { ...options, position: 'WR' }));
  const old = buildContract({ overall: 99, years: 3, salary: 12345678 });
  assert.equal(old.salary, 12345678);
  assert.deepEqual(normalizeContract(structuredClone(old)), old);
  assert.deepEqual(contractMarketOptions({ year: 2026, capModel: { version: 'legacy-fixed-cap-v1' } }, { position: 'QB' }), {});
});

test('modern flat bases cover scheduled term minimums and cannot be restructured below them', () => {
  const options = { year: 2026, creditedSeasons: 0, position: 'WR' };
  const minimum = contractBaseMinimum(options, 4);
  const contract = buildContract({ overall: 40, salary: 885000, years: 4, ...options, rng: new RNG(117) });
  assert.equal(contract.baseSalary, minimum);
  assert.equal(contract.signingBonus, 0);
  let current = contract;
  for (let offset = 0; offset < 4; offset++) {
    assert.ok(current.baseSalary >= minimumSalaryForSeason(2026 + offset, offset).salary);
    current = advanceContractYear(current);
  }
  const expensive = buildContract({ overall: 95, years: 4, ...options });
  const restructured = restructureContract(expensive, new RNG(2), { minBaseSalary: minimum });
  assert.ok(restructured.baseSalary >= minimum);
  assert.equal(restructured.baseSalary + restructured.signingBonus, expensive.baseSalary + expensive.signingBonus);
});

test('new league contracts obey modeled credited floors and save restoration retains amounts', () => {
  const session = createSession({ seed: 8701, startYear: 2026, controlledTeamId: 'BUF' });
  for (const player of session.league.players.filter(p => p.teamId !== 'FA' && p.status === 'active')) {
    assertContractFloor(player,session.league);
  }
  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  const restored = createSessionFromSnapshot(snapshot);
  for (const player of session.league.players) assert.deepEqual(restored.league.players.find(p => p.id === player.id).contract, player.contract);
  const freeAgent = session.league.players.filter(p => p.teamId === 'MIA' && p.status === 'active').sort((a, b) => a.overall - b.overall)[0];
  assert.equal(session.releasePlayer({ teamId: 'MIA', playerId: freeAgent.id, toWaivers: false }).ok, true);
  session.league.capLedger.BUF.rollover = 10000000; // offer-floor fixture, independent of initial cap room
  const offer = session.submitFreeAgencyOffer({ teamId: 'BUF', playerId: freeAgent.id, years: 2, salary: 1 });
  assert.equal(offer.ok, true, JSON.stringify(offer));
  assert.ok(session.league.freeAgencyMarket.offers.find(o => o.playerId === freeAgent.id).salary >= contractBaseMinimum(contractMarketOptions(session.league, freeAgent), 2));
});

test('invalid monetary inputs and fractional terms fail without RNG or contract/offer mutation', () => {
  const session = createSession({ seed: 11799, startYear: 2026, controlledTeamId: 'BUF' });
  const player = session.league.players.find(p => p.teamId === 'BUF');
  const freeAgent = session.league.players.find(p => p.teamId === 'MIA');
  session.releasePlayer({ teamId: 'MIA', playerId: freeAgent.id, toWaivers: false });
  const beforeContract = structuredClone(player.contract);
  const beforeMarket = JSON.stringify(session.league.freeAgencyMarket);
  const beforeRng = session.rng.seed;
  for (const inputs of [{ salary: 'invalid' }, { salary: Infinity }, { salary: -1 }, { salary: '' }, { years: 2.5 }, { years: 'invalid' }]) {
    assert.equal(session.resignPlayer({ teamId: 'BUF', playerId: player.id, ...inputs }).ok, false);
    assert.equal(session.submitFreeAgencyOffer({ teamId: 'BUF', playerId: freeAgent.id, ...inputs }).ok, false);
    assert.deepEqual(player.contract, beforeContract);
    assert.equal(JSON.stringify(session.league.freeAgencyMarket), beforeMarket);
    assert.equal(session.rng.seed, beforeRng);
  }
  const rng = new RNG(71), seed = rng.seed;
  assert.throws(() => buildContract({ overall: 80, salary: NaN, rng }));
  assert.throws(() => buildContract({ overall: 80, years: 2.5, rng }));
  assert.equal(rng.seed, seed);
});
