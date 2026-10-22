import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER_TEMPLATE } from '../src/config.js';
import { replenishCpuPracticeSquads, runFreeAgencyBackstop, normalizeRosterSlots } from '../src/engine/offseasonSimulator.js';
import { RNG } from '../src/utils/rng.js';
import { buildPracticeContract, recordPracticeWeekPay } from '../src/domain/practiceContracts.js';
import { validatePracticeSquadAddition } from '../src/domain/practiceSquadEligibility.js';
import { capSpaceForTeam } from '../src/engine/capCompliance.js';
import { createSession } from '../src/runtime/bootstrap.js';
import { revisePlayerPotential } from '../src/domain/livingPotential.js';
import { recordPermanentElevationActivation,recordElevationActiveRelease } from '../src/domain/standardElevations.js';

const freeAgent=(id,experience=0)=>({id,teamId:'FA',status:'active',position:'WR',rosterSlot:'active',
  overall:60,experience,contract:{capHit:0}});

test('practice recruiting values usable upside, age and revised ceilings without changing talent',()=>{
 const recruit=(projectOverrides={})=>{
  const league=fixture();
  const project={...freeAgent('project'),age:21,overall:65,potential:89,...projectOverrides};
  const ready={...freeAgent('ready',5),age:29,overall:70,potential:70};
  const cost=buildPracticeContract(project,{year:2027}).capHit;
  // One affordable inexperienced place; either candidate is affordable.
  league.teamCapOverride.CPU=53_000_000+Math.max(cost,buildPracticeContract(ready,{year:2027}).capHit);
  league.players.push(project,ready);
  const before=[project,ready].map(p=>({overall:p.overall,potential:p.potential,age:p.age}));
  const result=replenishCpuPracticeSquads(league);
  assert.equal(result.signings.length,1);
  assert.deepEqual([project,ready].map(p=>({overall:p.overall,potential:p.potential,age:p.age})),before);
  return result.signings[0].player.id;
 };
 assert.equal(recruit(),'project','nearby current grades can favor a young development prospect');
 assert.equal(recruit({age:26}),'ready','a ceiling beyond the growth window is not immediate value');
 assert.equal(recruit({potential:65}),'ready','no usable headroom means no upside bonus');
 const setback={age:21,overall:65,potential:89,developmentHealth:{majorInjuries:2},poorDevelopmentSeasons:1};
 revisePlayerPotential(setback,{year:2026,performance:'poor'});
 assert.equal(setback.potential,83);
 assert.equal(recruit(setback),'ready','actual injury/poor-production ceiling revision changes the decision');
 assert.equal(recruit({overall:50,potential:99}),'ready','distant projects cannot override useful current depth');
});

test('discretionary active depth preserves affordable funding for remaining weekly practice places',()=>{
 const league=fixture();
 league.players.find(p=>p.position==='OL').teamId='FA';
 const expensive={...freeAgent('expensive-OL'),position:'OL',overall:65};
 const cheap={...freeAgent('cheap-OL'),position:'OL',overall:45};
 const candidates=Object.keys(ROSTER_TEMPLATE).filter(p=>!['K','P'].includes(p))
  .flatMap(position=>Array.from({length:8},(_,i)=>({...freeAgent(`funded-${position}-${i}`),position,overall:45})));
 league.players.push(expensive,cheap,...candidates);
 // The removed incumbent is not in this market: held elsewhere, leaving one
 // optional OL place while every mandatory room is already fieldable.
 league.players.find(p=>p.id==='OL-0').teamId='OTHER';
 league.teamCapOverride.CPU=52_000_000+7_000_000;
 const identities=candidates.map(p=>structuredClone(p));
 runFreeAgencyBackstop(league,2026,new RNG(20260306));normalizeRosterSlots(league);
 const practice=replenishCpuPracticeSquads(league);
 assert.equal(league.players.filter(p=>p.teamId==='CPU'&&p.rosterSlot==='active').length,53);
 assert.equal(practice.signings.length,16,'an expensive optional quote must not starve a fundable practice squad');
 assert.deepEqual(practice.shortfalls,[]);assert.ok(capSpaceForTeam(league,'CPU')>=0);
 for(const before of identities){const after=league.players.find(p=>p.id===before.id);assert.equal(after.overall,before.overall);}
});
test('unfundable full structure still prioritizes active depth without inventing cheap terms',()=>{
 const league=fixture();league.players.find(p=>p.id==='OL-0').teamId='OTHER';
 const candidate={...freeAgent('tight-OL'),position:'OL',overall:45};league.players.push(candidate);
 league.teamCapOverride.CPU=52_000_000+2_000_000;
 runFreeAgencyBackstop(league,2026,new RNG(20260306));normalizeRosterSlots(league);
 assert.equal(candidate.teamId,'CPU');assert.equal(candidate.rosterSlot,'active');
 assert.equal(league.players.filter(p=>p.teamId==='CPU'&&p.rosterSlot==='active').length,53);
 assert.ok(candidate.contract.capHit>0);assert.ok(capSpaceForTeam(league,'CPU')>=0);
});
test('when available terms exceed planning floors the cheapest real affordable active quote wins',()=>{
 const league=fixture();league.players.find(p=>p.id==='OL-0').teamId='OTHER';
 const expensive={...freeAgent('veteran-expensive',8),position:'OL',overall:65};
 const cheap={...freeAgent('veteran-cheap',8),position:'OL',overall:45};
 league.players.push(expensive,cheap);league.teamCapOverride.CPU=52_000_000+5_251_000;
 runFreeAgencyBackstop(league,2026,new RNG(20260306));normalizeRosterSlots(league);
 assert.equal(cheap.teamId,'CPU');assert.equal(expensive.teamId,'FA');
 assert.equal(cheap.rosterSlot,'active');assert.equal(cheap.overall,45);
 assert.ok(cheap.contract.baseSalary>=1_390_000,'veteran minimum is not replaced by a rookie planning floor');
 assert.ok(capSpaceForTeam(league,'CPU')>=0);
});

test('partial payroll funding buys remaining active places before one optional premium quote',()=>{
 const league=fixture();
 // Both vacancies are optional: OL8 and WR5 retain their fieldable minima.
 for(const id of ['OL-0','WR-0'])league.players.find(p=>p.id===id).teamId='OTHER';
 const expensive={...freeAgent('partial-expensive'),position:'WR',overall:65};
 const cheap=['OL','WR'].map((position,i)=>({...freeAgent(`partial-cheap-${i}`),position,overall:45}));
 league.players.push(expensive,...cheap);league.teamCapOverride.CPU=51_000_000+4_000_000;
 runFreeAgencyBackstop(league,2026,new RNG(20260306));normalizeRosterSlots(league);
 assert.equal(league.players.filter(p=>p.teamId==='CPU'&&p.rosterSlot==='active').length,53,
  'fundable active depth takes priority even when a complete practice squad cannot be funded');
 assert.ok(cheap.every(p=>p.teamId==='CPU'));assert.equal(expensive.teamId,'FA');
 assert.ok(capSpaceForTeam(league,'CPU')>=0);
});

test('active backstop leaves complete active depth funded for separate weekly practice recruitment',()=>{
  const league=fixture();
  league.capModel={version:'nfl-modern-cap-v1'};
  // Existing rookie-depth candidates are affordable as practice players, but
  // sixteen annual contracts would consume far more than this club's room.
  const candidates=Object.keys(ROSTER_TEMPLATE).filter(p=>!['K','P'].includes(p))
    .flatMap(position=>Array.from({length:8},(_,i)=>({...freeAgent(`depth-${position}-${i}`),position,overall:50})));
  league.players.push(...candidates);
  league.teamCapOverride.CPU=53_000_000+6_000_000;
  const activeBefore=structuredClone(league.players.slice(0,53));
  const active=runFreeAgencyBackstop(league,2026,new RNG(20260306));
  normalizeRosterSlots(league);
  const practice=replenishCpuPracticeSquads(league);
  assert.deepEqual(league.players.slice(0,53),activeBefore,'complete active roster and retained terms are preserved');
  assert.equal(practice.signings.length,16,'funded practice depth must reach the weekly market');
  assert.ok(candidates.filter(p=>p.teamId==='CPU').every(p=>p.rosterSlot==='practice'&&p.contract.kind==='weekly-practice-contract-v1'));
  assert.deepEqual(practice.shortfalls,[]);
  assert.ok(active.remainingFreeAgents>=16);
  assert.ok(capSpaceForTeam(league,'CPU')>=0);
});
function fixture() {
  const active=Object.entries(ROSTER_TEMPLATE).flatMap(([position,n])=>Array.from({length:n},(_,i)=>({
    id:`${position}-${i}`,position,teamId:'CPU',status:'active',rosterSlot:'active',overall:80,experience:4,
    contract:{capHit:1_000_000}})));
  return {sportId:'football',year:2026,financialYear:2027,capModel:{version:'nfl-modern-cap-v1'},
    settings:{},teams:[{id:'CPU',season:{}}],players:active,capLedger:{},teamCapOverride:{CPU:80_000_000}};
}

test('CPU weekly practice re-sign completes the same saved release route as user commands',()=>{
  const league=fixture(),p={...freeAgent('released-elevation'),teamId:'CPU',
    standardElevations:{version:'standard-elevation-games-v1',games:[],cycles:{}}};
  p.contract={salary:885000,capHit:885000,yearsRemaining:1};
  recordPermanentElevationActivation(p,{teamId:'CPU',year:2027});
  recordElevationActiveRelease(p,{teamId:'CPU'});p.teamId='FA';p.contract={capHit:0};
  league.players.push(p);
  const result=replenishCpuPracticeSquads(league);
  assert.equal(result.signings.length,1);assert.equal(p.rosterSlot,'practice');
  assert.equal(p.standardElevations.cycles.CPU,1);
  assert.equal(p.standardElevations.resetPaths[0].status,'rejoined');
  replenishCpuPracticeSquads(league);assert.equal(p.standardElevations.cycles.CPU,1);
});
test('CPU fills funded eligible practice places with weekly contracts and distinct receipts',()=>{
  const league=fixture();
  const held=structuredClone(league.players);
  const veterans=Array.from({length:15},(_,i)=>freeAgent(`vet-${i}`,5));
  veterans.forEach(p=>p.overall=65);
  const young=Array.from({length:20},(_,i)=>freeAgent(`young-${i}`));
  const premium=freeAgent('premium');premium.overall=90;
  league.players.push(...veterans,...young,premium);
  const rows=[];
  const result=replenishCpuPracticeSquads(league,{onSigning:row=>rows.push(row)});
  assert.equal(result.signings.length,16);
  assert.deepEqual(result.shortfalls,[]);
  assert.deepEqual(league.players.filter(p=>p.rosterSlot==='active'&&p.teamId==='CPU'),held);
  const practice=league.players.filter(p=>p.rosterSlot==='practice');
  assert.equal(practice.filter(p=>p.experience===5).length,6);
  for(const player of practice){
    assert.equal(player.contract.kind,'weekly-practice-contract-v1');
    assert.equal(player.contract.year,2027);
    assert.equal(player.contract.capHit,player.contract.weeklySalary*18);
    assert.ok(validatePracticeSquadAddition({players:practice,player,settings:{}}).ok);
  }
  assert.ok(rows.every(row=>row.practice&&!row.emergency));
  assert.equal(premium.teamId,'FA');
  assert.ok(capSpaceForTeam(league,'CPU')>=0);
  const after=structuredClone(league.players);
  assert.equal(replenishCpuPracticeSquads(league).signings.length,0);
  assert.deepEqual(league.players,after);
  assert.equal(recordPracticeWeekPay(league,{year:2027,week:1}).length,16);
  assert.equal(recordPracticeWeekPay(league,{year:2027,week:1}).length,0);
});
test('practice refill reports insufficient money and eligibility without cutting or inventing players',()=>{
  const league=fixture();
  league.players.push(...Array.from({length:12},(_,i)=>freeAgent(`v-${i}`,5)));
  const cost=buildPracticeContract(league.players.at(-1),{year:2027}).capHit;
  league.teamCapOverride.CPU=53_000_000+cost;
  const ids=league.players.map(p=>p.id),active=structuredClone(league.players.slice(0,53));
  const result=replenishCpuPracticeSquads(league);
  assert.equal(result.signings.length,1);
  assert.deepEqual(result.shortfalls,[{teamId:'CPU',missing:15}]);
  assert.equal(capSpaceForTeam(league,'CPU'),0);
  assert.deepEqual(league.players.map(p=>p.id),ids);
  assert.deepEqual(league.players.slice(0,53),active);
  const veteranOnly=fixture();veteranOnly.players.push(...Array.from({length:12},(_,i)=>freeAgent(`v-${i}`,5)));
  assert.equal(replenishCpuPracticeSquads(veteranOnly).signings.length,6);
});
test('controlled roster, retained terms and unfinished active depth are preserved',()=>{
  const league=fixture();league.players.push(...Array.from({length:20},(_,i)=>freeAgent(`y-${i}`)));
  const before=structuredClone(league);
  assert.deepEqual(replenishCpuPracticeSquads(league,{excludeTeamIds:['CPU']}),{signings:[],shortfalls:[]});
  assert.deepEqual(league,before);
  league.players[0].teamId='FA';
  assert.equal(replenishCpuPracticeSquads(league).signings.length,0);
  league.players[0].teamId='CPU';
  const retained=freeAgent('retained');retained.teamId='CPU';retained.rosterSlot='practice';
  retained.contract={capHit:900_000,yearsRemaining:2,signingBonus:100_000};
  league.players.push(retained);const old=structuredClone(retained);
  replenishCpuPracticeSquads(league);
  assert.deepEqual(retained,old);
});

test('actual session depth boundary funds practice salary and preserves GM authority and identity',()=>{
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  const own=session.league.players.filter(p=>p.teamId==='BUF');
  const cpu=session.league.players.filter(p=>p.teamId==='HOU'&&p.rosterSlot==='active');
  assert.equal(cpu.length,53);
  // Hold the current active depth stable. A small funded practice budget is
  // insufficient for an ordinary active minimum and must use weekly terms.
  cpu.forEach(p=>p.overall=90);
  const candidates=session.league.players.filter(p=>p.teamId==='HOU'&&p.rosterSlot==='practice');
  candidates.forEach(p=>{p.teamId='FA';p.rosterSlot='active';p.overall=45;p.experience=0;
    p.accruedSeasons=0;p.serviceHistory={version:'football-service-v1',accruedSeasons:0,creditedSeasons:0,seasons:{}};});
  session.league.teams=session.league.teams.filter(t=>['BUF','HOU'].includes(t.id));
  session.league.players=[...own,...cpu,...candidates];
  session.league.capLedger.HOU.rollover=0;
  session.league.teamCapOverride.HOU=cpu.reduce((sum,p)=>sum+p.contract.capHit,0)
    +session.league.capLedger.HOU.deadCapCurrentYear+500_000;
  session.rebuildLookupIndexes();
  for(const player of candidates) {
    assert.ok(player.profile.identity);
    assert.ok(player.profile.appearanceRecipe);
    assert.ok(player.profile.skeletonRecipe);
    assert.ok(player.profile.appearanceDetailRecipe);
  }
  const ownBefore=structuredClone(own),identities=candidates.map(p=>structuredClone(p.profile));
  const result=session.runRosterLegalityBackstop();
  assert.ok(result.practiceSignings>0);
  assert.equal(result.remainingFreeAgents,session.league.players.filter(p=>p.status==='active'&&p.teamId==='FA').length);
  assert.ok(result.practiceShortfalls.some(row=>row.teamId==='HOU'&&row.missing>0));
  const practice=candidates.filter(p=>p.teamId==='HOU');
  assert.equal(practice.length,result.practiceSignings);
  assert.ok(practice.every(p=>p.contract.kind==='weekly-practice-contract-v1'&&p.rosterSlot==='practice'));
  assert.ok(session.getTeamCapSummary('HOU').capSpace>=0);
  assert.deepEqual(own,ownBefore);
  assert.deepEqual(candidates.map(p=>p.profile),identities);
  const receipt=session.league.transactionLog.find(row=>row.teamId==='HOU'&&row.type==='roster-legality-signings');
  assert.ok(receipt.details.players.every(row=>row.rosterSlot==='practice'&&row.weeklySalary>0));
});

test('actual session keeps the practice budget on weekly terms after active depth is complete',()=>{
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  const own=session.league.players.filter(p=>p.teamId==='BUF');
  const cpu=session.league.players.filter(p=>p.teamId==='HOU'&&p.rosterSlot==='active');
  const candidates=session.league.players.filter(p=>p.teamId==='HOU'&&p.rosterSlot==='practice');
  assert.equal(cpu.length,53);assert.equal(candidates.length,16);
  cpu.forEach(p=>p.overall=90);
  candidates.forEach(p=>{p.teamId='FA';p.rosterSlot='active';p.overall=45;p.experience=0;
    p.accruedSeasons=0;delete p.serviceLedger;});
  session.league.teams=session.league.teams.filter(t=>['BUF','HOU'].includes(t.id));
  session.league.players=[...own,...cpu,...candidates];
  session.league.capLedger.HOU.rollover=0;
  session.league.teamCapOverride.HOU=cpu.reduce((sum,p)=>sum+p.contract.capHit,0)
    +session.league.capLedger.HOU.deadCapCurrentYear+6_000_000;
  session.rebuildLookupIndexes();
  const ownBefore=structuredClone(own),cpuBefore=structuredClone(cpu);
  const identities=candidates.map(p=>structuredClone(p.profile));
  const result=session.runRosterLegalityBackstop();
  assert.equal(result.practiceSignings,16);
  assert.deepEqual(result.practiceShortfalls,[]);
  assert.deepEqual(own,ownBefore);assert.deepEqual(cpu,cpuBefore);
  assert.deepEqual(candidates.map(p=>p.profile),identities);
  assert.ok(candidates.every(p=>p.teamId==='HOU'&&p.rosterSlot==='practice'&&p.contract.kind==='weekly-practice-contract-v1'));
  assert.ok(session.getTeamCapSummary('HOU').capSpace>=0);
  const receipt=session.league.transactionLog.find(row=>row.teamId==='HOU'&&row.type==='roster-legality-signings');
  assert.equal(receipt.details.players.length,16);
  assert.ok(receipt.details.players.every(row=>row.rosterSlot==='practice'&&row.weeklySalary>0));
});

test('practice room preferences diversify development depth without becoming hard quotas',()=>{
  const league=fixture();
  const young=Object.keys(ROSTER_TEMPLATE).flatMap(position=>Array.from({length:20},(_,i)=>({
    ...freeAgent(`${position}-young-${i}`),position,overall:['K','P'].includes(position)?73:55})));
  league.players.push(...young);
  const practice=replenishCpuPracticeSquads(league).signings.map(row=>row.player);
  assert.equal(practice.length,16);
  assert.equal(practice.filter(p=>['K','P'].includes(p.position)).length,0,'preferred development rooms precede specialist overflow');
  assert.ok(new Set(practice.map(p=>p.position)).size>=6);
  const missing=fixture();missing.players.find(p=>p.position==='K').position='WR';
  missing.players.push(...young.map(p=>({...p,id:`other-${p.id}`,teamId:'FA'})));
  assert.equal(replenishCpuPracticeSquads(missing).signings.length,0,'practice funding waits for mandatory active rooms');
});
