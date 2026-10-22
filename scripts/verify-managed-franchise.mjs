// Actual GM-command longitudinal verification. No ratings, cap money, injury,
// outcomes or contract fields are rewritten to make the driver pass.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { FIELDABLE_DEPTH } from '../src/config.js';
import { computeReleaseDeadCap, normalizeContract } from '../src/domain/contracts.js';
import { playerAppearance } from '../src/domain/playerIdentity.js';
import { validatePlayerService } from '../src/domain/playerService.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';
import { executeAdvanceWeekCommand } from '../src/runtime/advanceWeekCommand.js';

const arg = (name, fallback) => { const i=process.argv.indexOf(name); return i<0 ? fallback : process.argv[i+1]; };
const seasons=Number(arg('--seasons',30)), seed=Number(arg('--seed',20260306));
assert.ok(Number.isInteger(seasons)&&seasons>=1&&seasons<=30);
assert.ok(Number.isInteger(seed));
const output=path.resolve(arg('--output','.cache/managed-franchise'));
assert.ok(output.startsWith(path.resolve('.')+path.sep),'evidence must stay in this repository');
fs.mkdirSync(output,{recursive:true});
let session=createSession({seed,startYear:2026,controlledTeamId:'BUF'});
const report={version:3,kind:'actual-managed-franchise-verification',status:'running',seed,requestedSeasons:seasons,completedSeasons:0,startedAt:new Date().toISOString(),actions:[],seasons:[],violations:[],structuralDiagnostics:[],commandReceipts:[],identityChecks:0,limits:['One seeded controlled franchise is not all-feature or full-rulebook coverage.','Appearance checks cover persisted identity, not visual realism.','CPU roster/cap violations are collected across the run and make its final verdict fail.'],sourceHashes:{}};
const sources=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
for(const file of [...sources('src'),'public/lib/portraitAppearanceContract.js','public/lib/physiqueGeometryContract.js','scripts/verify-managed-franchise.mjs'])report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const identityHistory=new Map();
const fixedIdentity=p=>JSON.stringify({identity:p.profile?.identity,appearance:p.profile?.appearanceRecipe,detail:p.profile?.appearanceDetailRecipe,skeleton:p.profile?.skeletonRecipe});
const saveReport=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
// Compact per-action telemetry identifies the executing step between annual
// checkpoints. It neither skips commands nor establishes acceptance evidence.
const progress=(operation,state,input=null)=>fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({operation,state,input,year:session.currentYear,week:session.currentWeek,phase:session.phase,completedSeasons:report.completedSeasons,actions:report.actions.length,observedAt:new Date().toISOString()}));
const roster=()=>session.league.players.filter(p=>p.teamId==='BUF'&&p.status==='active');
const active=()=>roster().filter(p=>p.rosterSlot==='active');
const invoke=(command,input)=>{progress(command,'executing',input);const result=session[command](input);report.actions.push({year:session.currentYear,week:session.currentWeek,phase:session.phase,command,input,ok:result?.ok!==false,reasonCode:result?.reasonCode||null,error:result?.error||null});progress(command,'completed',input);return result;};
const counts=()=>Object.fromEntries(Object.keys(FIELDABLE_DEPTH).map(pos=>[pos,active().filter(p=>p.position===pos).length]));
function trimRoster(){
  for(let guard=0;guard<80;guard++){
    const cap=session.getTeamCapSummary('BUF').capSpace, list=active(), room=counts();
    if(list.length<=53&&cap>=0&&Object.entries(room).every(([p,n])=>n<=FIELDABLE_DEPTH[p].max))return;
    const candidates=list.filter(p=>room[p.position]>FIELDABLE_DEPTH[p.position].min
      || (cap<0 && room[p.position]>1 && p.contract.capHit-computeReleaseDeadCap(p.contract).currentYearDeadCap>0
        && session.league.players.some(q=>q.teamId==='FA'&&q.status==='active'&&q.position===p.position&&q.overall<70)))
      .sort((a,b)=>{const surplus=p=>room[p.position]>FIELDABLE_DEPTH[p.position].max?1000:0;return surplus(b)-surplus(a)||(cap<0?(b.contract.capHit-computeReleaseDeadCap(b.contract).currentYearDeadCap)-(a.contract.capHit-computeReleaseDeadCap(a.contract).currentYearDeadCap):a.overall-b.overall);});
    assert.ok(candidates.length,'no roster-safe cuts remain');
    const p=candidates[0];
    assert.ok(invoke('releasePlayer',{teamId:'BUF',playerId:p.id}).ok);
    // Active contracts cannot be demoted. Only a genuinely available FA may
    // receive new weekly terms after release/required waiver clearance.
    if(cap>=0&&p.teamId==='FA'&&roster().filter(q=>q.rosterSlot==='practice').length<16)
      invoke('signFreeAgent',{teamId:'BUF',playerId:p.id,rosterSlot:'practice'});
  }
  throw Error('roster/cap repair did not converge through GM commands');
}
function fillPractice(){
  if(session.phase!=='regular-season'&&!(session.phase==='offseason'&&session.getOffseasonPipeline().stage==='camp-cuts'))return;
  const pool=session.league.players.filter(p=>p.status==='active'&&p.teamId==='FA'&&p.overall<70)
    .sort((a,b)=>b.overall-a.overall);
  for(const p of pool){
    if(roster().filter(q=>q.rosterSlot==='practice').length>=16)return;
    invoke('signFreeAgent',{teamId:'BUF',playerId:p.id,rosterSlot:'practice'});
  }
}
function fillNeeds(){
  trimRoster();
  for(const [position,band] of Object.entries(FIELDABLE_DEPTH)){
    while(counts()[position]<band.min){
      const heldBefore=counts()[position];
      const practice=roster().filter(p=>p.position===position&&p.rosterSlot==='practice').sort((a,b)=>b.overall-a.overall);
      if(practice.length){const r=invoke('setPracticeSquad',{teamId:'BUF',playerId:practice[0].id,moveToPractice:false});if(r.ok){assert.ok(counts()[position]>heldBefore,`accepted activation did not increase active ${position} depth`);continue;}}
      let signed=false;
      const pool=session.league.players.filter(p=>p.status==='active'&&p.teamId==='FA'&&p.position===position&&p.overall<80).sort((a,b)=>b.overall-a.overall);
      for(const p of pool.slice(0,30)){if(invoke('signFreeAgent',{teamId:'BUF',playerId:p.id}).ok){signed=true;break;}}
      assert.ok(signed,`cannot afford/find fieldable ${position} depth in ${session.currentYear}`);
      assert.ok(counts()[position]>heldBefore,`accepted signing did not increase active ${position} depth`);
    }
  }
  trimRoster();
}
function depth(){for(const position of Object.keys(FIELDABLE_DEPTH)){const room=roster().filter(p=>p.position===position).sort((a,b)=>(a.rosterSlot==='active'?0:1)-(b.rosterSlot==='active'?0:1)||b.overall-a.overall);if(room.length)assert.ok(invoke('setDepthChart',{teamId:'BUF',position,playerIds:room.map(p=>p.id)}).ok);}}
function trade(){
  progress('trade-search','executing');
  const own=active().filter(p=>!['K','P'].includes(p.position)).sort((a,b)=>a.overall-b.overall);
  for(const outgoing of own.slice(0,10)){
    const others=session.league.players.filter(p=>p.status==='active'&&p.rosterSlot==='active'&&p.teamId!=='BUF'&&!['FA','WAIVER'].includes(p.teamId)&&p.position===outgoing.position&&Math.abs(p.overall-outgoing.overall)<=3&&p.contract.capHit<=outgoing.contract.capHit+session.getTeamCapSummary('BUF').capSpace).slice(0,35);
    for(const incoming of others){const input={teamA:'BUF',teamB:incoming.teamId,teamAPlayerIds:[outgoing.id],teamBPlayerIds:[incoming.id]};const evaluation=session.evaluateTradePackage(input);if(evaluation.ok){const result=invoke('tradePlayers',input);if(result.ok){assert.equal(outgoing.teamId,incoming.teamId==='BUF'?input.teamB:incoming.teamId);assert.equal(incoming.teamId,'BUF');return;}}}
  }
  // Pick swaps are real ownership changes, preserving future asset budgets.
  for(const ownPick of session.getDraftPickAssets('BUF').filter(p=>p.year===session.currentYear+1&&p.round>=4)){
    for(const other of session.league.draftPicks.filter(p=>p.ownerTeamId!=='BUF'&&p.year===ownPick.year&&p.round===ownPick.round&&!p.consumed)){
      const input={teamA:'BUF',teamB:other.ownerTeamId,teamAPickIds:[ownPick.id],teamBPickIds:[other.id]};if(session.evaluateTradePackage(input).ok){assert.ok(invoke('tradePlayers',input).ok);return;}
    }
  }
  report.actions.push({year:session.currentYear,command:'trade-search',ok:false,error:'No acceptable affordable package found'});
  progress('trade-search','completed');
}
function scouting(){const board=session.getScoutingBoard({limit:12});const rows=Array.isArray(board)?board:board.players||board.prospects||[];for(const p of rows.slice(0,2))invoke('allocateScoutingPoints',{playerId:p.playerId||p.id,points:10});}
function draft(){
  for(let guard=0;guard<300&&!session.league.pendingDraft.completed;guard++){
    progress('runCpuDraft','executing');
    session.runCpuDraft({untilUserPick:true});
    progress('runCpuDraft','completed');
    if(session.league.pendingDraft.completed)break;
    assert.ok(session.getDraftAuthority()?.userActionRequired);
    const need=session.getRosterNeedSummary('BUF'), deltas=new Map(need.map(p=>[p.position,p.delta]));
    // Funded minimums outrank optional upgrades, including a missing K/P.
    // Use actual roster counts and the visible scouting estimate; a prospect's
    // hidden ratings and future outcomes never choose the user's selection.
    const held=counts();
    const priority=p=>Math.max(0,FIELDABLE_DEPTH[p.position].min-held[p.position])*1000
      +(p.scouting?.scoutedOverall||50)-Math.min(0,deltas.get(p.position)||0)*10;
    const prospects=[...session.league.pendingDraft.available].sort((a,b)=>priority(b)-priority(a));
    assert.ok(invoke('draftUserPick',{playerId:prospects[0].id}).ok);
  }
  assert.ok(session.league.pendingDraft.completed,'draft clock stalled');
}
function check(label){
  const all=[...session.league.players,...session.league.retiredPlayers];
  assert.equal(new Set(all.map(p=>p.id)).size,all.length,'duplicate player IDs');
  for(const p of all){
    const identity=fixedIdentity(p);
    if(identityHistory.has(p.id))assert.equal(identity,identityHistory.get(p.id),`${label}: identity/skeleton drift ${p.id}`);
    else identityHistory.set(p.id,identity);
    report.identityChecks++;
  }
  for(const p of all){validatePlayerService(p);for(const [key,value] of Object.entries(p.ratings||{}))assert.ok(Number.isFinite(value),`${label} ${p.id} ${key}`);assert.ok(Number.isFinite(p.overall)&&Number.isFinite(p.potential),`${label} nonfinite talent`);assert.ok(p.potential>=40&&p.potential<=99,`${label} potential out of range ${p.id}`);
    for(const key of ['salary','baseSalary','capHit','signingBonus','guaranteed','deadCapRemaining'])if(p.contract&&Object.hasOwn(p.contract,key))assert.ok(Number.isFinite(p.contract[key]),`${label} nonfinite contract ${p.id} ${key}`);
  }
  const teams=session.league.teams.map(t=>{const list=session.league.players.filter(p=>p.status==='active'&&p.teamId===t.id&&p.rosterSlot==='active'), values=list.map(p=>p.overall);return {teamId:t.id,count:list.length,capSpace:session.getTeamCapSummary(t.id).capSpace,min:Math.min(...values),max:Math.max(...values),spread:Math.max(...values)-Math.min(...values)};});
  for(const t of teams){
    assert.ok(Number.isFinite(t.capSpace),`${label} nonfinite cap summary ${t.teamId}`);
    const violations=[];
    if(t.count>53||t.count<41)violations.push(`roster count ${t.count}`);
    const practice=session.league.players.filter(p=>p.status==='active'&&p.teamId===t.teamId&&p.rosterSlot==='practice');
    if(practice.length>16)violations.push(`practice count ${practice.length}`);
    if(t.capSpace<0)violations.push(`cap space ${t.capSpace}`);
    for(const [position,band] of Object.entries(FIELDABLE_DEPTH)){
      const held=session.league.players.filter(p=>p.status==='active'&&p.teamId===t.teamId&&p.rosterSlot==='active'&&p.position===position).length;
      if(held<band.min)violations.push(`${position} depth ${held}`);
      if(held>band.max)report.structuralDiagnostics.push({label,year:session.currentYear,teamId:t.teamId,position,held,preferredMaximum:band.max,reason:'Allocator permits structural fallback to fill active slots or repair practice eligibility; inspect individually.'});
    }
    for(const message of violations)report.violations.push({label,year:session.currentYear,teamId:t.teamId,message});
    if(t.teamId==='BUF')assert.equal(violations.length,0,`${label}: controlled GM ${violations.join(', ')}`);
  }
  const distribution=list=>{
    const tally=key=>list.reduce((a,p)=>{const value=p.profile?.identity?.[key]??'unknown';a[value]=(a[value]||0)+1;return a;},{});
    return {count:list.length,birthCountries:tally('birthCountry'),surveyCategories:tally('surveyCategory')};
  };
  const employed=session.league.players.filter(p=>p.status==='active'&&!['FA','WAIVER'].includes(p.teamId));
  return {teams,aboveRevisedCeiling:all.filter(p=>p.potential<p.overall).length,potentialRevisions:all.filter(p=>p.lastPotentialRevision?.year===session.currentYear-1).map(p=>({id:p.id,...p.lastPotentialRevision})),activePlayers:teams.reduce((n,t)=>n+t.count,0),elite90:employed.filter(p=>p.rosterSlot==='active'&&p.overall>=90).length,retired:session.league.retiredPlayers.length,demographics:{active:distribution(employed.filter(p=>p.rosterSlot==='active')),practice:distribution(employed.filter(p=>p.rosterSlot==='practice')),available:distribution(session.league.players.filter(p=>['FA','WAIVER'].includes(p.teamId))),retired:distribution(session.league.retiredPlayers)},birthCountries:distribution(session.league.players).birthCountries};
}
function advance(){
  const pending=session.getDashboardState().gmDecisionQueue?.[0];
  const preferred=['start-backup','hold','address-room','rest','quiet-exit','deny','defer'];
  const choice=pending&&(preferred.map(id=>pending.options.find(o=>o.id===id)).find(Boolean)||pending.options[0]);
  const payload={count:1,...(choice?{gmDecisionChoice:{decisionId:pending.id,occurrenceKey:pending.occurrenceKey,choiceId:choice.id}}:{})};
  if(session.phase==='regular-season')payload.weeklyTacticOverride=['run-heavy','pass-heavy','blitz-heavy','prevent'][(session.currentWeek-1)%4];
  const before={year:session.currentYear,week:session.currentWeek,phase:session.phase};
  progress('advance-week-command','executing',payload);
  const result=executeAdvanceWeekCommand(session,payload);
  report.actions.push({...before,command:'advance-week-command',input:payload,ok:result.ok,reasonCode:result.reasonCode||null});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(result.commandReceipt&&result.architectEntry,'player command receipts missing');
  progress('advance-week-command','completed',payload);
  report.commandReceipts.push({command:result.commandReceipt,architectId:result.architectEntry.id||null,gmDecision:result.gmDecision,tacticalReceipt:result.tacticalReceipt});
  return result;
}
async function restore(){
  progress('compressed-save-restore','executing');
  const snapshot=session.toSnapshot(), encoded=await encodeSnapshot(snapshot), decoded=await decodeSnapshot(encoded);
  assert.equal(JSON.stringify(decoded),JSON.stringify(snapshot),'codec roundtrip');
  const next=createSessionFromSnapshot(decoded);
  assert.equal(next.rng.seed,session.rng.seed);
  for(const p of session.league.players){const q=next.getPlayerById(p.id);assert.ok(q);assert.deepEqual(playerAppearance(q),playerAppearance(p));assert.deepEqual(q.serviceLedger,p.serviceLedger);assert.deepEqual(q.contract,normalizeContract(p.contract));assert.deepEqual(q.ratings,p.ratings);}
  session=next;
  fs.writeFileSync(path.join(output,'latest-save.txt'),encoded);
  progress('compressed-save-restore','completed');
  return {characters:encoded.length,players:session.league.players.length};
}
saveReport();
try{
  for(let season=0;season<seasons;season++){
    const year=session.currentYear,startAction=report.actions.length;
    fillNeeds();fillPractice();depth();trade();
    const start=check(`start ${year}`);
    for(let guard=0;session.phase!=='offseason'&&guard<35;guard++){
      if(session.phase==='regular-season'){scouting();if(session.currentWeek%4===1){fillPractice();depth();}}
      advance();
    }
    assert.equal(session.phase,'offseason','season stage stalled');
    const seasonResult={year,start,championTeamId:session.latestPostseason?.superBowl?.championTeamId||null,stages:[]};
    for(let guard=0;session.currentYear===year&&guard<32;guard++){
      const stage=session.getOffseasonPipeline().stage;seasonResult.stages.push(stage);
      if(stage==='free-agency'){
        const missing=Math.max(0,53-active().length);
        const budget=session.getTeamCapSummary('BUF').capSpace-missing*2_000_000-20_000_000;
        const candidates=session.league.players.filter(p=>p.status==='active'&&p.teamId==='FA'&&p.overall>=75&&p.overall<=82).sort((a,b)=>b.overall-a.overall);
        if(budget>3_000_000&&candidates.length)invoke('submitFreeAgencyOffer',{teamId:'BUF',playerId:candidates[0].id,years:2,salary:Math.min(8_000_000,budget*.35)});
      }
      if(stage==='draft')draft();
      if(stage==='camp-cuts'){fillNeeds();fillPractice();}
      advance();
    }
    assert.equal(session.currentYear,year+1,'offseason stage stalled');
    fillNeeds();fillPractice();depth();seasonResult.end=check(`end ${year}`);seasonResult.restore=await restore();
    seasonResult.actions=report.actions.slice(startAction).reduce((tot,a)=>{const key=`${a.command}:${a.ok?'accepted':'refused'}`;tot[key]=(tot[key]||0)+1;return tot;},{});
    report.seasons.push(seasonResult);report.completedSeasons++;saveReport();
    console.log(JSON.stringify({completed:report.completedSeasons,year,active:seasonResult.end.activePlayers,elite90:seasonResult.end.elite90,saveCharacters:seasonResult.restore.characters,actions:seasonResult.actions}));
  }
  assert.ok(report.actions.some(a=>a.command==='tradePlayers'&&a.ok),'no actual trade');
  assert.ok(report.actions.some(a=>a.command==='signFreeAgent'&&a.ok),'no actual signing');
  assert.ok(report.actions.some(a=>a.command==='draftUserPick'&&a.ok),'no user selection');
  report.status=report.violations.length?'failed':'passed';report.finishedAt=new Date().toISOString();saveReport();
  if(report.violations.length)process.exitCode=1;
}catch(error){report.status='failed';report.failure={year:session.currentYear,week:session.currentWeek,phase:session.phase,message:error.message,stack:error.stack};saveReport();fs.writeFileSync(path.join(output,'failure-snapshot.json'),JSON.stringify(session.toSnapshot()));console.error(error);process.exitCode=1;}
