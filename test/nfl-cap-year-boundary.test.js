import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCapRollover } from '../src/engine/offseasonSimulator.js';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { ContractService } from '../src/runtime/services/ContractService.js';
import { financialYearForLeague, salaryCapForSeason } from '../src/data/nflSalaryCap.js';
import { contractMarketOptions } from '../src/domain/contracts.js';
import { buildPracticeContract } from '../src/domain/practiceContracts.js';

test('offseason market opens next financial year after banking only completed-year room',()=>{
  const session=createSession({seed:120,startYear:2026,controlledTeamId:'BUF'});
  const prior=session.getTeamCapSummary('BUF'),year=session.currentYear;
  session.phase='offseason';
  session.runRosterYearRollover();
  assert.equal(session.currentYear,year,'season history retains its completed season');
  assert.equal(financialYearForLeague(session.league),2027);
  assert.equal(session.league.capLedger.BUF.rollover,prior.capSpace,'new cap cannot inflate completed-year carryover');
  assert.equal(session.league.teamCapOverride.BUF,salaryCapForSeason(session.league.capModel,2027,session.league.settings.capGrowthRate));
  const player=session.league.players.find(p=>p.teamId==='BUF');
  assert.equal(contractMarketOptions(session.league,player).year,2027);
  assert.equal(buildPracticeContract(player,{year:financialYearForLeague(session.league)}).year,2027);
  const funding=structuredClone(session.league.capLedger);
  const restored=createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  assert.equal(restored.getTeamCapSummary('BUF').salaryCap,session.getTeamCapSummary('BUF').salaryCap);
  assert.equal(restored.getTeamCapSummary('BUF').capProvenance.year,2027);
  restored.runRosterYearRollover();
  assert.deepEqual(restored.league.capLedger,funding,'restoring/retrying the financial boundary does not re-elect funding');
  restored.startSeason(2027);
  assert.equal(financialYearForLeague(restored.league),2027);
  assert.deepEqual(restored.league.capLedger,funding,'season kickoff cannot roll balances again');
});

test('unknown or malformed financial-year fields reject restoration',()=>{
  const session=createSession({seed:121,startYear:2026,controlledTeamId:'BUF'});
  for(const year of [2025,2028,2027.5,'2027']) {
    const snapshot=JSON.parse(JSON.stringify(session.toSnapshot()));
    snapshot.league.financialYear=year;
    assert.throws(()=>createSessionFromSnapshot(snapshot),/financial year/);
  }
});

test('cap forecast follows unused room and matches the next annual election without changing balances',()=>{
  for(const modern of [true,false]) {
    const league={year:2026,sportId:'football',...(modern?{capModel:{version:'nfl-modern-cap-v1'}}:{}),
      teams:[{id:'CPU'}],players:[],teamCapOverride:{CPU:100_000_000},
      capLedger:{CPU:{rollover:10_000_000,deadCapCurrentYear:2_000_000,deadCapNextYear:5_000_000}}};
    const before=structuredClone(league);
    const service=new ContractService(league);
    const summary=service.getCapSummary('CPU');
    assert.equal(summary.rolloverNextYearEstimate,modern?108_000_000:35_000_000);
    assert.equal(summary.rolloverCurrentYear,10_000_000);
    assert.equal(summary.deadCapNextYear,5_000_000,'future dead money is not deducted twice from this year');
    assert.deepEqual(league,before,'a forecast cannot elect funding or advance charges');
    assert.deepEqual(new ContractService(JSON.parse(JSON.stringify(league))).getCapSummary('CPU'),summary);
    applyCapRollover(league);
    assert.equal(league.capLedger.CPU.rollover,summary.rolloverNextYearEstimate);
    assert.equal(league.capLedger.CPU.rolloverPolicy,summary.rolloverPolicy);
    league.capLedger.CPU.deadCapCurrentYear=300_000_000;
    assert.equal(service.getCapSummary('CPU').rolloverNextYearEstimate,0,'negative room never forecasts negative carryover');
  }
});

test('annual cap carryover and future dead money advance once, including after restoration',()=>{
  const league={year:2026,sportId:'football',capModel:{version:'nfl-modern-cap-v1'},teams:[{id:'CPU'}],
    teamCapOverride:{CPU:100_000_000},players:[{id:'p',teamId:'CPU',status:'active',contract:{capHit:80_000_000}}],
    capLedger:{CPU:{rollover:10_000_000,deadCapCurrentYear:2_000_000,deadCapNextYear:5_000_000}}};
  applyCapRollover(league);
  assert.equal(league.capLedger.CPU.rollover,28_000_000,'modern leagues elect full unused-room carryover');
  assert.equal(league.capLedger.CPU.deadCapCurrentYear,5_000_000);
  assert.equal(league.capLedger.CPU.deadCapNextYear,0);
  const once=structuredClone(league.capLedger);
  applyCapRollover(league);
  assert.deepEqual(league.capLedger,once,'a repeated yearly boundary cannot recalculate or clear charges');
  const restored=JSON.parse(JSON.stringify(league));
  applyCapRollover(restored);
  assert.deepEqual(restored.capLedger,once);
  restored.year=2027;
  applyCapRollover(restored);
  assert.equal(restored.capLedger.CPU.rollover,43_000_000);
  assert.equal(restored.capLedger.CPU.rolloverAppliedThroughYear,2027);
});

test('modern full carryover exceeds old ceilings while legacy policy remains explicit',()=>{
  const make=modern=>({year:2026,sportId:'football',...(modern?{capModel:{version:'nfl-modern-cap-v1'}}:{}),
    teams:[{id:'CPU'}],players:[],teamCapOverride:{CPU:100_000_000},capLedger:{CPU:{rollover:0,deadCapCurrentYear:0,deadCapNextYear:0}}});
  const modern=make(true),legacy=make(false);
  applyCapRollover(modern);applyCapRollover(legacy);
  assert.equal(modern.capLedger.CPU.rollover,100_000_000);
  assert.equal(modern.capLedger.CPU.rolloverPolicy,'full-unused-room-election-v1');
  assert.equal(legacy.capLedger.CPU.rollover,35_000_000);
  assert.equal(legacy.capLedger.CPU.rolloverPolicy,'legacy-fractional-carryover-v1');
});

test('roster repair preserves the controlled club current-year funding and future charges',()=>{
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  Object.assign(session.league.capLedger.BUF,{rollover:10_000_000,deadCapCurrentYear:2_000_000,deadCapNextYear:5_000_000});
  const before=structuredClone(session.league.capLedger.BUF);
  session.runRosterLegalityBackstop();
  assert.deepEqual(session.league.capLedger.BUF,before,'roster maintenance must not roll a league-year ledger');
  const restored=createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  restored.runRosterLegalityBackstop();
  assert.deepEqual(restored.league.capLedger.BUF,before);
});

test('legacy mid-offseason restores reconcile pending versus completed boundaries without inventing old room',()=>{
  const session=createSession({seed:118,startYear:2026,controlledTeamId:'BUF'});
  for(const [stage,history,transition] of [['free-agency',[],true],['camp-cuts',[{stage:'udfa',year:2026}],false],['unknown-stage',[],false]]){
    const snapshot=JSON.parse(JSON.stringify(session.toSnapshot()));
    const restored=createSessionFromSnapshot(snapshot);
    const pipeline=restored.getOffseasonPipeline();
    Object.assign(pipeline,{rosterRolloverYear:2026,stage,history});
    Object.assign(restored.league.capLedger.BUF,{rollover:10_000_000,deadCapCurrentYear:2_000_000,deadCapNextYear:5_000_000});
    delete restored.league.capLedger.BUF.rolloverAppliedThroughYear;
    const result=restored.runRosterYearRollover();
    assert.equal(result.alreadyRun,true);
    const ledger=restored.league.capLedger.BUF;
    assert.equal(ledger.rollover,10_000_000,'historical unused room must not be invented after payroll changed');
    assert.equal(ledger.deadCapCurrentYear,transition?5_000_000:2_000_000);
    assert.equal(ledger.deadCapNextYear,transition?0:5_000_000);
    const again=createSessionFromSnapshot(JSON.parse(JSON.stringify(restored.toSnapshot())));
    again.runRosterYearRollover();
    assert.deepEqual(again.league.capLedger.BUF,ledger);
  }
});
