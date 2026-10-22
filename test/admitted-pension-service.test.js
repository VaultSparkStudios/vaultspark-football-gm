import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/regularMedicalFixture.js';
import {recordAdmittedPensionGameService,validatePensionService,finalizePensionPlanYear,pensionServiceCount,recordPensionGameService} from '../src/domain/pensionService.js';
import {previewAdmittedRegularAccrual,commitAdmittedRegularAccrual} from '../src/domain/admittedInjuryPayroll.js';
import {applyRegularMedicalRecovery} from '../src/domain/regularMedicalRecovery.js';
import {createPostseasonState,simulateNextPostseasonGame} from '../src/engine/seasonSimulator.js';
import {createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {expandSnapshotPensionService} from '../src/runtime/pensionServiceSnapshot.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {standardElevationGame} from '../src/domain/standardElevations.js';
import {buildPracticeContract,recordPracticeWeekPay} from '../src/domain/practiceContracts.js';

for(const retired of [false,true])test(`actual regular clearance joins original payer game for ${retired?'retired':'free-agent'} player and restores`,async()=>{
 const {s,l,p}=fixture({retired}),salary=structuredClone(p.serviceLedger);
 assert.equal(s.advanceWeek().ok,true);assert.equal(p.injury,null);
 const [proof]=p.pensionService.planYears[2027].games;
 assert.equal(proof.reason,'admitted-injury-continuation');assert.equal(proof.teamId,'BUF');
 assert.equal(proof.sourceRef,l.admittedInjuryPayroll[0].payId);
 const game=l.gameArchive.find(game=>game.gameId===proof.gameId);assert.ok(game);
 const before=JSON.stringify(l);assert.deepEqual(recordAdmittedPensionGameService({league:l,result:game}),[]);assert.equal(JSON.stringify(l),before);
 assert.deepEqual(p.serviceLedger,salary);assert.equal(pensionServiceCount(p).observedSeasons,0);
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(s.toSnapshot())));
 const person=[...restored.league.players,...restored.league.retiredPlayers].find(row=>row.id===p.id);
 assert.deepEqual(person.pensionService,p.pensionService);
 assert.equal(restored.advanceWeek().ok,true);assert.equal(person.pensionService.planYears[2027].games.length,1,'healthy next game unearned');
});

test('three actual paid club games earn one Plan Year while salary/free-agency credit remains separate',()=>{
 const {s,l,p}=fixture();p.injury.weeksRemaining=3;const salary=structuredClone(p.serviceLedger);
 for(let i=0;i<3;i++)assert.equal(s.advanceWeek().ok,true);
 assert.equal(p.pensionService.planYears[2027].games.length,3);assert.equal(pensionServiceCount(p).observedSeasons,0);
 finalizePensionPlanYear(l,2027);assert.equal(pensionServiceCount(p).observedSeasons,1);assert.deepEqual(p.serviceLedger,salary);
 const before=JSON.stringify(p.pensionService);finalizePensionPlanYear(l,2027);
 assert.deepEqual(recordAdmittedPensionGameService({league:l,result:l.gameArchive.find(game=>game.gameId===p.pensionService.planYears[2027].games[0].gameId)}),[]);
 assert.equal(JSON.stringify(p.pensionService),before);
});

test('valid long imported person IDs preserve earning references through actual command and compressed restore',async()=>{
 const {s,l,p}=fixture();p.id='imported-player-'+'X'.repeat(120);
 const right=l.admittedInjuryContinuations[0];right.playerId=p.id;right.rightId=JSON.stringify([p.id,right.gameId]);s.rebuildLookupIndexes();
 assert.equal(inspectSnapshotCompatibility(s.toSnapshot()).ok,true);
 assert.equal(s.advanceWeek().ok,true);const [proof]=p.pensionService.planYears[2027].games;
 assert.ok(proof.sourceRef.length>180);assert.equal(proof.sourceRef,l.admittedInjuryPayroll[0].payId);
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(s.toSnapshot())));
 assert.deepEqual(restored.getPlayerById(p.id).pensionService,p.pensionService);
});

test('paid bye and medical-only recovery create no pension games',()=>{
 const {s,l,p}=fixture();const bye=s.seasonSchedule.find(block=>!block.games.some(game=>[game.homeTeamId,game.awayTeamId].includes('BUF'))).week;
 s.currentWeek=bye;const prior=structuredClone(p.pensionService);assert.equal(s.advanceWeek().ok,true);
 assert.equal(l.admittedInjuryPayroll[0].week,bye);assert.deepEqual(p.pensionService,prior);
 const f=fixture();applyRegularMedicalRecovery(f.l,{year:2027,week:1});assert.equal(f.l.admittedInjuryPayroll.length,1);
 assert.equal(f.p.pensionService.planYears[2027],undefined);
});

test('same physical game already credited through membership cannot double count continuation',()=>{
 const {l,p}=fixture();p.teamId='BUF';p.rosterSlot='active';
 const game=standardElevationGame({year:2027,week:1,homeTeamId:'BUF',awayTeamId:'MIA'});
 const receipts=previewAdmittedRegularAccrual(l,{year:2027,week:1});commitAdmittedRegularAccrual(l,{year:2027,week:1,receipts});
 recordPensionGameService({league:l,result:game});const before=JSON.stringify(p.pensionService);
 assert.deepEqual(recordAdmittedPensionGameService({league:l,result:game}),[]);assert.equal(JSON.stringify(p.pensionService),before);
});

test('zero additional cash still joins positive gross entitlement; payer remains original club',()=>{
 const {l,p}=fixture();const year=2045;l.year=l.financialYear=year;
 const receipts=previewAdmittedRegularAccrual(l,{year,week:1});p.teamId='BUF';p.rosterSlot='practice';
 p.contract=buildPracticeContract(p,{year});recordPracticeWeekPay(l,{year,week:1});
 const [wage]=commitAdmittedRegularAccrual(l,{year,week:1,receipts});assert.equal(wage.amountCents,0);
 const game=standardElevationGame({year,week:1,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.deepEqual(recordAdmittedPensionGameService({league:l,result:game}),[p.id]);
 assert.equal(p.pensionService.planYears[year].games[0].sourceRef,wage.payId);validatePensionService(p,l);
});

test('admitted references missing wages or relabeled to another period fail restoration without mutation',()=>{
 const {s,p}=fixture();assert.equal(s.advanceWeek().ok,true);
 for(const variation of ['missing-wage','wrong-player','wrong-period','wrong-payer','wrong-source']){
  const snapshot=expandSnapshotPensionService(s.toSnapshot()),person=snapshot.league.players.find(row=>row.id===p.id);
  const proof=person.pensionService.planYears[2027].games[0];
  if(variation==='missing-wage'){snapshot.league.admittedInjuryPayroll=[];snapshot.league.capLedger.BUF.admittedInjuryCharges=[];}
  if(variation==='wrong-player'){const period=JSON.parse(proof.sourceRef);const right=JSON.parse(period[0]);right[0]='other';period[0]=JSON.stringify(right);proof.sourceRef=JSON.stringify(period);}
  if(variation==='wrong-period'){const period=JSON.parse(proof.sourceRef);period[3]=2;proof.sourceRef=JSON.stringify(period);}
  if(variation==='wrong-payer')proof.teamId=proof.gameId.split('-').at(-2)==='BUF'?proof.gameId.split('-').at(-1):proof.gameId.split('-').at(-2);
  if(variation==='wrong-source'){const period=JSON.parse(proof.sourceRef);period[0]=JSON.stringify([p.id,'invented']);proof.sourceRef=JSON.stringify(period);}
  const before=JSON.stringify(snapshot);assert.equal(inspectSnapshotCompatibility(snapshot).ok,false,variation);
  assert.throws(()=>createSessionFromSnapshot(snapshot),undefined,variation);assert.equal(JSON.stringify(snapshot),before);
 }
});

test('one actual earning receipt cannot become multiple pension games through altered opponents or imported copies',()=>{
 const {s,l,p}=fixture();assert.equal(s.advanceWeek().ok,true);
 const genuine=p.pensionService.planYears[2027].games[0];
 const opponents=l.teams.filter(team=>team.id!=='BUF'&&!genuine.gameId.split('-').includes(team.id)).slice(0,2);
 for(const opponent of opponents){
  const game=standardElevationGame({year:2027,week:1,homeTeamId:'BUF',awayTeamId:opponent.id});
  const before=JSON.stringify(l);assert.throws(()=>recordAdmittedPensionGameService({league:l,result:game}),error=>error.reasonCode==='PENSION_SERVICE_INVALID');
  assert.equal(JSON.stringify(l),before);
 }
 const snapshot=expandSnapshotPensionService(s.toSnapshot()),person=snapshot.league.players.find(row=>row.id===p.id),row=person.pensionService.planYears[2027];
 for(const opponent of opponents)row.games.push({...genuine,gameId:standardElevationGame({year:2027,week:1,homeTeamId:'BUF',awayTeamId:opponent.id}).gameId});
 row.finalized=row.awarded=true;const before=JSON.stringify(snapshot);
 assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode,'PENSION_SERVICE_INVALID');
 assert.throws(()=>createSessionFromSnapshot(snapshot),error=>error.reasonCode==='PENSION_SERVICE_INVALID');assert.equal(JSON.stringify(snapshot),before);
});

test('existing membership credit binds the original club period even when admitted same-game join deduplicates',()=>{
 const {s,l,p}=fixture();p.teamId='BUF';p.rosterSlot='active';s.rebuildLookupIndexes();
 assert.equal(s.advanceWeek().ok,true);const [genuine]=p.pensionService.planYears[2027].games;
 assert.equal(genuine.reason,'active-inactive');assert.equal(p.pensionService.planYears[2027].games.length,1);
 const opponent=l.teams.find(team=>team.id!=='BUF'&&!genuine.gameId.split('-').includes(team.id));
 const game=standardElevationGame({year:2027,week:1,homeTeamId:'BUF',awayTeamId:opponent.id});
 const before=JSON.stringify(l);assert.throws(()=>recordAdmittedPensionGameService({league:l,result:game}),error=>error.reasonCode==='PENSION_SERVICE_INVALID');
 assert.equal(JSON.stringify(l),before);
 const snapshot=expandSnapshotPensionService(s.toSnapshot()),person=snapshot.league.players.find(row=>row.id===p.id);
 person.pensionService.planYears[2027].games.push({gameId:game.gameId,teamId:'BUF',reason:'admitted-injury-continuation',sourceRef:l.admittedInjuryPayroll[0].payId});
 const imported=JSON.stringify(snapshot);assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode,'PENSION_SERVICE_INVALID');
 assert.throws(()=>createSessionFromSnapshot(snapshot),error=>error.reasonCode==='PENSION_SERVICE_INVALID');assert.equal(JSON.stringify(snapshot),imported);
});

test('actual participating postseason game credits original payer after earned recovery; bye round does not',()=>{
 const {s,l,p}=fixture({retired:true});p.injury.weeksRemaining=2;
 l.teams.find(team=>team.id==='BUF').season={...l.teams.find(team=>team.id==='BUF').season,wins:17,losses:0,ties:0};
 s.phase='postseason';s.currentWeek=19;s.postseasonState=createPostseasonState({league:l,year:2027});
 let played;
 for(let i=0;i<13;i++){
  played=simulateNextPostseasonGame({state:s.postseasonState,league:l,statBook:s.statBook,year:2027,rng:s.rng,mode:'stat',getTeamModifiers:()=>({extraRecoveryWeeks:0})});
  if([played.game.homeTeamId,played.game.awayTeamId].includes('BUF'))break;
  assert.equal(p.pensionService.planYears[2027],undefined,'other clubs cannot count payer games');
 }
 assert.ok([played.game.homeTeamId,played.game.awayTeamId].includes('BUF'));
 const proof=p.pensionService.planYears[2027].games[0];assert.equal(proof.gameId,played.game.gameId);
 assert.equal(p.injury,null,'earned divisional clearance survives closure');
 assert.equal(proof.reason,'admitted-injury-continuation');assert.equal(proof.teamId,'BUF');
 validatePensionService(p,l);assert.equal(inspectSnapshotCompatibility(s.toSnapshot()).ok,true);
});
