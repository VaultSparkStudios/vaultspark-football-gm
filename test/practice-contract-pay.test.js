import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceSalaryForSeason } from '../src/data/nflPracticeSalary.js';
import { buildPracticeContract,recordPracticeWeekPay,activatePracticePlayer } from '../src/domain/practiceContracts.js';
import { normalizeContract,computeReleaseDeadCap,advanceContractYear,restructureContract,applyFranchiseTag,applyFifthYearOption } from '../src/domain/contracts.js';
import { capSpaceForTeam } from '../src/engine/capCompliance.js';
import { applyCapRollover } from '../src/engine/offseasonSimulator.js';
import { releaseToFreeAgency,normalizeRosterSlots } from '../src/engine/capCompliance.js';
import { createSession,createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { practiceEligibilityGroup } from '../src/domain/practiceSquadEligibility.js';
import { inspectSnapshotCompatibility } from '../src/runtime/snapshotMigration.js';

test('weekly practice schedule separates lower fixed and unrestricted negotiated rates',()=>{
  assert.equal(practiceSalaryForSeason(2026,'inexperienced').minimum,13750);
  assert.equal(practiceSalaryForSeason(2026,'restricted').maximum,13750);
  assert.deepEqual([practiceSalaryForSeason(2026,'unrestricted').minimum,practiceSalaryForSeason(2026,'unrestricted').maximum],[18350,22850]);
  assert.equal(practiceSalaryForSeason(2031).kind,'simulation-projection');
  const veteran={id:'v',experience:7};
  const contract=buildPracticeContract(veteran,{year:2026,startWeek:10,weeklySalary:22850});
  assert.equal(contract.capHit,9*22850);
  assert.equal(contract.guaranteed,0);assert.equal(contract.signingBonus,0);
  assert.throws(()=>buildPracticeContract(veteran,{year:2026,weeklySalary:23000}));
  assert.throws(()=>normalizeContract({...contract,guaranteed:1}));
});

test('practice week pay survives restore, pays bye weeks once and retains earned charges at release',()=>{
  const player={id:'p',teamId:'CPU',status:'active',rosterSlot:'practice',experience:0};
  player.contract=buildPracticeContract(player,{year:2026});
  const league={year:2026,sportId:'football',teams:[{id:'CPU'}],players:[player],capLedger:{CPU:{rollover:0,deadCapCurrentYear:0,deadCapNextYear:0}}};
  assert.equal(recordPracticeWeekPay(league,{year:2026,week:1})[0].amount,13750);
  assert.deepEqual(recordPracticeWeekPay(league,{year:2026,week:1}),[]);
  const restored=JSON.parse(JSON.stringify(league));
  assert.deepEqual(recordPracticeWeekPay(restored,{year:2026,week:1}),[]);
  assert.equal(recordPracticeWeekPay(restored,{year:2026,week:2})[0].amount,13750);
  assert.equal(computeReleaseDeadCap(restored.players[0].contract).currentYearDeadCap,27500);
  releaseToFreeAgency(restored,restored.players[0]);
  assert.equal(restored.capLedger.CPU.deadCapCurrentYear,27500);
  assert.equal(restored.players[0].contract.capHit,0);
  assert.equal(restored.players[0].practiceContractHistory.length,1);
});

test('permanent practice activation signs an affordable active minimum and preserves prior cash',()=>{
  const player={id:'p',teamId:'CPU',status:'active',rosterSlot:'practice',experience:0};
  player.contract=buildPracticeContract(player,{year:2026});
  const league={year:2026,sportId:'football',teams:[{id:'CPU'}],players:[player],teamCapOverride:{CPU:247500},capLedger:{CPU:{}}};
  recordPracticeWeekPay(league,{year:2026,week:1});
  const before=JSON.stringify(league);
  assert.equal(activatePracticePlayer(league,player).ok,false);
  assert.equal(JSON.stringify(league),before,'refused activation cannot alter terms or slot');
  league.teamCapOverride.CPU=1000000;
  assert.equal(activatePracticePlayer(league,player).ok,true);
  assert.equal(player.contract.baseSalary,885000);
  assert.equal(player.contract.capHit,898750);
  assert.equal(player.rosterSlot,'active');
  assert.equal(computeReleaseDeadCap(player.contract).currentYearDeadCap,13750);
  assert.equal(player.practiceContractHistory[0].weeklySalary,13750);
});

test('generated league weekly contracts survive actual saves and actual regular-week payroll',()=>{
  const session=createSession({seed:11701,startYear:2026,controlledTeamId:'BUF'});
  const practice=session.league.players.filter(p=>p.rosterSlot==='practice');
  assert.equal(practice.length,512);
  assert.ok(practice.every(p=>p.contract.kind==='weekly-practice-contract-v1'&&p.contract.weeklySalary===practiceSalaryForSeason(2026,practiceEligibilityGroup(p).group).minimum));
  const restored=createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  assert.deepEqual(restored.getPlayerById(practice[0].id).contract,practice[0].contract);
  restored.advanceRegularSeasonPhase();
  const stillPractice=restored.league.players.filter(p=>p.rosterSlot==='practice'&&p.contract.kind==='weekly-practice-contract-v1');
  assert.ok(stillPractice.length>0);
  assert.ok(stillPractice.every(p=>p.contract.payLedger['2026:1']?.amount===p.contract.weeklySalary));
  const again=createSessionFromSnapshot(JSON.parse(JSON.stringify(restored.toSnapshot())));
  assert.deepEqual(recordPracticeWeekPay(again.league,{year:2026,week:1}),[]);
});

test('unaffordable normalization preserves the valid incumbent active/practice arrangement',()=>{
  const session=createSession({seed:11701,startYear:2026,controlledTeamId:'BUF'});
  const roster=session.league.players.filter(p=>p.teamId==='BUF');
  const candidate=roster.find(p=>p.rosterSlot==='practice'&&p.position==='WR'&&p.contract.kind==='weekly-practice-contract-v1');
  assert.ok(candidate);candidate.overall=99;
  const cap=session.getTeamCapSummary('BUF');
  session.league.teamCapOverride.BUF=cap.usedCap+cap.deadCap-session.league.capLedger.BUF.rollover;
  const before=JSON.stringify(roster);
  normalizeRosterSlots(session.league);
  assert.equal(JSON.stringify(roster),before);
  assert.equal(roster.filter(p=>p.rosterSlot==='active').length,53);
  assert.equal(roster.filter(p=>p.rosterSlot==='practice').length,16);
});

test('future and malformed practice terms fail closed in live, retired, prospect and archived saves',()=>{
  const session=createSession({seed:11701,startYear:2026,controlledTeamId:'BUF'});
  const source=session.toSnapshot();
  const player=source.league.players.find(p=>p.contract.kind==='weekly-practice-contract-v1');
  for(const location of ['live','retired','prospect','history']) {
    const snapshot=JSON.parse(JSON.stringify(source));
    const invalid=structuredClone(player);invalid.contract.kind='weekly-practice-contract-v2';
    if(location==='live') snapshot.league.players[0]=invalid;
    if(location==='retired') snapshot.league.retiredPlayers=[invalid];
    if(location==='prospect') snapshot.league.pendingDraft={available:[invalid]};
    if(location==='history') snapshot.league.players[0].practiceContractHistory=[invalid.contract];
    const before=JSON.stringify(snapshot);
    assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode,'PRACTICE_CONTRACT_INVALID');
    assert.throws(()=>createSessionFromSnapshot(snapshot),/practice contract/i);
    assert.equal(JSON.stringify(snapshot),before);
  }
  const snapshot=JSON.parse(JSON.stringify(source));
  snapshot.league.players[0].practiceContractHistory=[{...player.contract,payLedger:{'2026:1':{year:2026,week:1,teamId:'BUF',amount:-1}}}];
  assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode,'PRACTICE_CONTRACT_INVALID');
});

test('earned practice compensation survives contract amendments but ends at the annual boundary',()=>{
  const base=normalizeContract({salary:1000000,baseSalary:1000000,capHit:1027500,
    yearsRemaining:3,signingBonus:0,guaranteed:0,deadCapRemaining:0,practiceEarnedCharge:27500});
  for(const amended of [restructureContract(base,null),applyFranchiseTag(base,{year:2026,salary:1000000}),applyFifthYearOption(base,{salary:1000000})]) {
    assert.equal(amended.practiceEarnedCharge,27500);
    assert.equal(amended.capHit,Math.round(amended.baseSalary+amended.signingBonus/amended.prorationYears)+27500);
  }
  const next=advanceContractYear(base);
  assert.equal(next.capHit,1000000);assert.equal(next.practiceEarnedCharge,0);
  assert.equal(computeReleaseDeadCap(next).currentYearDeadCap,0);
});

test('actual extension retains earned pay and funds the replacement delta rather than a second full contract',()=>{
  const session=createSession({seed:11701,startYear:2026,controlledTeamId:'BUF'});
  const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice');
  recordPracticeWeekPay(session.league,{year:2026,week:1});
  session.league.teamCapOverride.BUF=1000000000;
  assert.equal(activatePracticePlayer(session.league,player).ok,true);
  const earned=player.contract.practiceEarnedCharge;
  const summary=session.getTeamCapSummary('BUF');
  session.league.teamCapOverride.BUF=summary.usedCap+summary.deadCap-session.league.capLedger.BUF.rollover;
  const oldHit=player.contract.capHit;
  const result=session.resignPlayer({teamId:'BUF',playerId:player.id,years:1,salary:player.contract.salary});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(player.contract.practiceEarnedCharge,earned);
  assert.equal(player.contract.capHit,oldHit);
  assert.equal(session.getTeamCapSummary('BUF').capSpace,0);
  const before=JSON.stringify(session.toSnapshot());
  assert.equal(session.resignPlayer({teamId:'BUF',playerId:player.id,years:3,salary:99000000}).ok,false);
  assert.equal(JSON.stringify(session.toSnapshot()),before,'cap refusal preserves RNG and every saved field');
  for (const location of ['live','retired','prospect']) {
    const invalid=JSON.parse(before);
    const malformed=structuredClone(invalid.league.players.find(p=>p.id===player.id));malformed.contract.practiceEarnedCharge=-1;
    if(location==='live') invalid.league.players[0]=malformed;
    if(location==='retired') invalid.league.retiredPlayers=[malformed];
    if(location==='prospect') invalid.league.pendingDraft={available:[malformed]};
    assert.equal(inspectSnapshotCompatibility(invalid).reasonCode,'PRACTICE_CONTRACT_INVALID');
    assert.throws(()=>createSessionFromSnapshot(invalid),/practice charge/i);
  }
});

test('actual trade retains paid practice salary with the original club through saves and rollover',()=>{
  const session=createSession({seed:11701,startYear:2026,controlledTeamId:'BUF'});
  const a=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='active');
  const b=session.league.players.find(p=>p.teamId==='MIA'&&p.rosterSlot==='active'&&p.position===a.position);
  for(const p of [a,b]) {p.overall=75;p.potential=85;p.age=25;p.contract=normalizeContract({salary:1000000,baseSalary:1000000,capHit:1000000,yearsRemaining:2,signingBonus:0,guaranteed:0,deadCapRemaining:0});}
  a.contract.practiceEarnedCharge=27500;a.contract.capHit+=27500;
  for(const id of ['BUF','MIA']) {
    const s=session.getTeamCapSummary(id);
    session.league.teamCapOverride[id]=s.usedCap+s.deadCap-session.league.capLedger[id].rollover;
  }
  const input={teamA:'BUF',teamB:'MIA',teamAPlayerIds:[a.id],teamBPlayerIds:[b.id]};
  session.league.teamCapOverride.BUF-=10000;
  const before=JSON.stringify(session.toSnapshot());
  assert.equal(session.tradePlayers(input).reasonCode,'cap-failed');
  assert.equal(JSON.stringify(session.toSnapshot()),before);
  session.league.teamCapOverride.BUF+=10000;
  const quote=session.evaluateTradePackage(input);
  assert.equal(quote.ok,true);
  a.contract.practiceEarnedCharge+=1;
  const changed=JSON.stringify(session.toSnapshot());
  assert.equal(session.tradePlayers({...input,expectedPlanFingerprint:quote.plan.fingerprint}).reasonCode,'stale-trade-plan');
  assert.equal(JSON.stringify(session.toSnapshot()),changed);
  a.contract.practiceEarnedCharge-=1;
  assert.equal(session.tradePlayers(input).ok,true);
  assert.equal(a.teamId,'MIA');assert.equal(a.contract.capHit,1000000);
  assert.equal(a.contract.practiceEarnedCharge,undefined);
  assert.equal(session.league.capLedger.BUF.earnedPracticeCurrentYear,27500);
  assert.equal(session.getTeamCapSummary('BUF').capSpace,0);
  assert.equal(session.getTeamCapSummary('MIA').capSpace,0);
  assert.equal(capSpaceForTeam(session.league,'BUF'),0);
  const restored=createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  assert.equal(restored.getTeamCapSummary('BUF').capSpace,0);
  restored.league.teamCapOverride.BUF+=100000;
  applyCapRollover(restored.league,{completedYear:2026});
  assert.equal(restored.league.capLedger.BUF.rollover,100000);
  assert.equal(restored.league.capLedger.BUF.earnedPracticeCurrentYear,0);
  const settled=JSON.stringify(restored.league.capLedger);
  applyCapRollover(restored.league,{completedYear:2026});
  assert.equal(JSON.stringify(restored.league.capLedger),settled);
  const invalid=session.toSnapshot();invalid.league.capLedger.BUF.earnedPracticeCurrentYear=-1;
  assert.equal(inspectSnapshotCompatibility(invalid).reasonCode,'PRACTICE_CONTRACT_INVALID');
});

test('actual free-agent practice signing quotes only remaining weeks, preserves identity and pays once',()=>{
  const session=createSession({seed:11701,startYear:2026,controlledTeamId:'BUF'});
  const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice');
  player.overall=60;
  const identity=structuredClone(player.visualIdentity);
  session.releasePlayer({teamId:'BUF',playerId:player.id});
  assert.equal(player.teamId,'FA','weekly practice termination does not create active-contract waivers');
  session.currentWeek=10;
  assert.equal(session.getFreeAgents({limit:500}).find(p=>p.id===player.id).practiceWeeklySalary,practiceSalaryForSeason(2026,practiceEligibilityGroup(player).group).minimum);
  const capBefore=session.getTeamCapSummary('BUF').capSpace;
  const seed=session.rng.seed;
  const result=session.signFreeAgent({teamId:'BUF',playerId:player.id,rosterSlot:'practice'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(player.contract.startWeek,10);assert.equal(player.contract.regularWeeks,9);
  assert.equal(player.contract.capHit,9*player.contract.weeklySalary);
  assert.equal(session.getTeamCapSummary('BUF').capSpace,capBefore-player.contract.capHit);
  assert.equal(session.rng.seed,seed);assert.deepEqual(player.visualIdentity,identity);
  assert.equal(recordPracticeWeekPay(session.league,{year:2026,week:9}).some(r=>r.playerId===player.id),false);
  assert.equal(recordPracticeWeekPay(session.league,{year:2026,week:10}).find(r=>r.playerId===player.id).amount,player.contract.weeklySalary);
  const restored=createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  assert.deepEqual(recordPracticeWeekPay(restored.league,{year:2026,week:10}),[]);
});

test('practice signing refusals preserve state for cap, service, capacity, pay and unresolved waivers',()=>{
  const session=createSession({seed:11701,startYear:2026,controlledTeamId:'BUF'});
  const roster=session.league.players.filter(p=>p.teamId==='BUF'&&p.rosterSlot==='practice');
  const player=roster[0];player.overall=60;
  session.releasePlayer({teamId:'BUF',playerId:player.id});
  const refuse=(reason,options={})=>{
    const before=JSON.stringify(session.toSnapshot());
    assert.equal(session.signFreeAgent({teamId:'BUF',playerId:player.id,rosterSlot:'practice',...options}).reasonCode,reason);
    assert.equal(JSON.stringify(session.toSnapshot()),before);
  };
  refuse('PRACTICE_PAY_INVALID',{weeklySalary:1});
  const summary=session.getTeamCapSummary('BUF');
  session.league.teamCapOverride.BUF=summary.usedCap+summary.deadCap-session.league.capLedger.BUF.rollover;
  refuse('PRACTICE_SIGNING_CAP');
  session.league.teamCapOverride.BUF=1000000000;
  player.teamId='WAIVER';refuse('PRACTICE_FREE_AGENT_REQUIRED');player.teamId='FA';
  session.phase='offseason';session.league.offseasonPipeline.stage='free-agency';refuse('PRACTICE_SIGNING_WINDOW');
  session.phase='regular-season';
  const filler=roster[1];
  const copy=structuredClone(filler);copy.id='PS-CAPACITY';session.league.players.push(copy);
  refuse('PRACTICE_SQUAD_FULL');session.league.players.pop();
  for(const p of roster.slice(1,7)) {delete p.serviceLedger;p.accruedSeasons=7;}
  delete player.serviceLedger;player.accruedSeasons=7;
  refuse('PRACTICE_VETERAN_LIMIT');
});
