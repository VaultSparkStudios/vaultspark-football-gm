import test from 'node:test';
import assert from 'node:assert/strict';
import {startPlaytestJourney,recordPlaytestJourneyCheckpoint,loadPlaytestJourney,buildPlaytestJourneySummary} from '../public/lib/playtestJourney.js';
import {markObjective,readContractState,dismissContract,finalizeFirstSeasonContract,renderFirstSeasonContract} from '../public/lib/firstSeasonContract.js';
import {ingestNewsIntoInbox,getInboxSnapshot,getUnreadCount,resolveInboxItem,resetInboxForTests} from '../public/lib/engagementFeatures.js';

function store(){const values=new Map();return {denyRead:false,denyWrite:false,getItem(k){if(this.denyRead)throw Error('Denied');return values.get(k)||null;},setItem(k,v){if(this.denyWrite)throw Error('Full');values.set(k,v);}};}
const dashboard=id=>({franchiseId:id,controlledTeamId:'BUF',controlledTeam:{id:'BUF',owner:{expectation:{targetWins:1}}},currentYear:2026,currentWeek:1,seasonsSimulated:0});

test('journey keeps bounded relative checkpoints through mid-session read/write failure and isolates stores',()=>{
 const a=store(),b=store();startPlaytestJourney(a,1000);recordPlaytestJourneyCheckpoint('weekly-plan-opened',{storage:a,now:1200});a.denyRead=a.denyWrite=true;
 recordPlaytestJourneyCheckpoint('weekly-plan-committed',{storage:a,now:1800});recordPlaytestJourneyCheckpoint('weekly-debrief-ready',{storage:a,now:2300});recordPlaytestJourneyCheckpoint('weekly-plan-opened',{storage:a,now:2400});
 assert.deepEqual(loadPlaytestJourney(a).events.map(x=>x.name),['session-start','weekly-plan-opened','weekly-plan-committed','weekly-debrief-ready']);
 const summary=buildPlaytestJourneySummary(loadPlaytestJourney(a));assert.equal(summary.planningFriction.elapsedToCommitMs,600);assert.equal('startedAt' in summary,false);assert.equal(loadPlaytestJourney(b).events.length,0);
 const copy=loadPlaytestJourney(a);copy.events.length=0;assert.equal(loadPlaytestJourney(a).events.length,4);
});

test('denied session getter cannot interrupt default startup/checkpoint and preserves earlier tab evidence',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),storage=store();
 try{Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});startPlaytestJourney(undefined,5000);recordPlaytestJourneyCheckpoint('weekly-plan-opened',{now:5100});
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('Denied getter');}});
 assert.doesNotThrow(()=>recordPlaytestJourneyCheckpoint('weekly-plan-committed',{now:5500}));assert.equal(loadPlaytestJourney().events.at(-1).atMs,500);assert.equal(loadPlaytestJourney().startedAt,5000);
 }finally{if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);else delete globalThis.sessionStorage;}
});

test('quota and absent journey writers retain actual checkpoints without persistence claims',()=>{
 for(const storage of [null,{getItem:()=>null,setItem(){throw Error('Quota');}}]){startPlaytestJourney(storage,1000);recordPlaytestJourneyCheckpoint('weekly-plan-reviewed',{storage,now:1600});assert.equal(loadPlaytestJourney(storage).events.at(-1).name,'weekly-plan-reviewed');}
});

test('Inbox denied getter and quota retain ingest/read/resolve with franchise isolation',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');resetInboxForTests();
 try{Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Denied getter');}});const d=dashboard('inbox-a');
 assert.equal(ingestNewsIntoInbox([{id:1,type:'injury',headline:'Out for season'}],{dashboard:d,now:()=>100}),1);assert.equal(getUnreadCount({dashboard:d}),1);assert.equal(resolveInboxItem('id:1',{now:()=>200}),true);assert.equal(getUnreadCount({dashboard:d}),0);
 assert.equal(ingestNewsIntoInbox([{id:1,type:'injury'}],{dashboard:d}),0);assert.equal(getInboxSnapshot().items.length,1);
 assert.equal(getUnreadCount({dashboard:dashboard('inbox-b')}),0);const s=store();s.denyRead=s.denyWrite=true;assert.doesNotThrow(()=>ingestNewsIntoInbox([{id:2,type:'trade'}],{dashboard:dashboard('inbox-c'),storage:s}));
 }finally{resetInboxForTests();if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});

test('failed contract persistence keeps marks, dismissal and finalized verdict per storage and franchise',()=>{
 const s=store(),d=dashboard('contract-a');s.denyWrite=true;markObjective(d,'depth-chart',s);markObjective(d,'answer-the-phone',s);assert.deepEqual(readContractState(d,s).marks,{'depth-chart':true,'answer-the-phone':true});
 dismissContract(d,s);assert.equal(readContractState(d,s).dismissed,true);assert.equal(readContractState(d,s).startYear,2026);assert.deepEqual(readContractState(dashboard('contract-b'),s).marks,{});assert.deepEqual(readContractState(d,store()).marks,{});
 const closed={...d,phase:'season-awards',cap:{capSpace:0},latestStandings:[{teamId:'BUF',wins:1,losses:16,ties:0}]};const result=finalizeFirstSeasonContract(closed,s);assert.ok(result);assert.deepEqual(finalizeFirstSeasonContract({...closed,currentYear:2027,cap:{capSpace:-1}},s),result);assert.deepEqual(readContractState(d,s).finalized,result);
 const copy=readContractState(d,s);copy.finalized.rows.length=0;assert.equal(readContractState(d,s).finalized.rows.length,5);
});

test('contract renderer shows temporary tracking and fires completion once under quota',()=>{
 const s=store();s.denyWrite=true;const d={...dashboard('contract-complete'),phase:'season-awards',cap:{capSpace:0},latestStandings:[{teamId:'BUF',wins:1,losses:16,ties:0}]};
 for(const id of ['sign-starter','depth-chart','answer-the-phone'])markObjective(d,id,s);
 const nodes={firstSeasonContract:{hidden:false,dataset:{}},firstSeasonContractList:{innerHTML:''},firstSeasonContractProgress:{textContent:''}};const documentRef={getElementById:id=>nodes[id]};
 const first=renderFirstSeasonContract({dashboard:d,storage:s,documentRef});assert.equal(first.completedNow,true);assert.match(nodes.firstSeasonContractProgress.textContent,/this tab only/);assert.equal(renderFirstSeasonContract({dashboard:d,storage:s,documentRef}).completedNow,false);
});

test('default contract context survives denied getter and recovery without losing either action',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),s=store(),d=dashboard('contract-getter-transition');
 try{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:s});markObjective(d,'depth-chart');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Denied getter');}});
 assert.equal(readContractState(d).marks['depth-chart'],true);markObjective(d,'answer-the-phone');dismissContract(d);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:s});
 assert.deepEqual(readContractState(d).marks,{'depth-chart':true,'answer-the-phone':true});assert.equal(readContractState(d).dismissed,true);
 assert.deepEqual(readContractState(d,s).marks,{'depth-chart':true});assert.deepEqual(readContractState(dashboard('contract-getter-other')).marks,{});
 }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
