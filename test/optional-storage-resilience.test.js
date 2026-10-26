import test from 'node:test';
import assert from 'node:assert/strict';
import { readLastVisit, recordReturnBoundary } from '../public/lib/returnDigest.js';
import { readContractState, markObjective } from '../public/lib/firstSeasonContract.js';
import { getTutorialState, markTutorialSeen, resetTutorial } from '../public/lib/tutorialCampaign.js';
import { readTradeBlockIds, saveTradeBlockIds } from '../public/lib/appCore.js';
import { loadContextualFeedbackLedger, saveContextualFeedbackLedger } from '../public/lib/contextualFeedback.js';
import { buildLocalPlaytestReceipt, loadLocalPlaytestReceipts, saveLocalPlaytestReceipt } from '../public/lib/playtestReceipts.js';

const a={franchiseId:'storage-a',controlledTeamId:'BUF'},b={franchiseId:'storage-b',controlledTeamId:'BUF'};
const receipt=()=>buildLocalPlaytestReceipt({clarity:3,agency:4,pace:3,returnIntent:4,note:'Retained draft.'});
function memory(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function denied(){return {getItem(){throw new DOMException('denied','SecurityError');},setItem(){throw new DOMException('full','QuotaExceededError');},removeItem(){throw new DOMException('denied','SecurityError');}};}

for(const kind of ['denied-getter','missing'])test(`${kind}: optional panels remain usable and receipt writes never claim success`,()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{
  if(kind==='denied-getter')Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('denied','SecurityError');}});
  else Object.defineProperty(globalThis,'localStorage',{configurable:true,value:null});
  assert.equal(readLastVisit(a),null);
  assert.equal(recordReturnBoundary(a),false);
  assert.deepEqual(readContractState(a).marks,{});
  assert.doesNotThrow(()=>markObjective(a,'depth-chart'));
  assert.equal(getTutorialState(a),null);
  assert.doesNotThrow(()=>markTutorialSeen(a));
  assert.doesNotThrow(()=>resetTutorial(a));
  assert.deepEqual(readTradeBlockIds(a),[]);
  assert.deepEqual(saveTradeBlockIds(['p1'],a),['p1']);
  assert.equal(loadContextualFeedbackLedger().lastPromptAt,0);
  assert.doesNotThrow(()=>saveContextualFeedbackLedger({}));
  assert.deepEqual(loadLocalPlaytestReceipts(),[]);
  assert.throws(()=>saveLocalPlaytestReceipt(receipt()),/not saved/);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});

test('denied methods preserve optional fallbacks but fail actual feedback writes',()=>{
 const storage=denied();
 assert.equal(readLastVisit(a,storage),null);
 assert.equal(recordReturnBoundary(a,{},storage),false);
 assert.deepEqual(readContractState(a,storage).marks,{});
 assert.equal(getTutorialState(a,storage),null);
 assert.doesNotThrow(()=>markTutorialSeen(a,storage));
 assert.doesNotThrow(()=>resetTutorial(a,storage));
 assert.deepEqual(readTradeBlockIds(a,storage),[]);
 assert.equal(loadContextualFeedbackLedger(storage).lastPromptAt,0);
 assert.doesNotThrow(()=>saveContextualFeedbackLedger({},storage));
 assert.deepEqual(loadLocalPlaytestReceipts(storage),[]);
 assert.throws(()=>saveLocalPlaytestReceipt(receipt(),storage),{name:'QuotaExceededError'});
});

test('injected storage retains real writes and isolates franchise boundaries',()=>{
 const storage=memory();
 assert.equal(recordReturnBoundary(a,{},storage),true);
 assert.equal(readLastVisit(a,storage).scope,'storage-a');
 assert.equal(readLastVisit(b,storage),null);
 markTutorialSeen(a,storage);assert.equal(getTutorialState(a,storage),'done');assert.equal(getTutorialState(b,storage),null);
 markTutorialSeen(a,storage,'deferred');assert.equal(getTutorialState(a,storage),'deferred');
 resetTutorial(a,storage);assert.equal(getTutorialState(a,storage),null);
 saveTradeBlockIds(['p1','p1'],a,storage);assert.deepEqual(readTradeBlockIds(a,storage),['p1']);assert.deepEqual(readTradeBlockIds(b,storage),[]);
 saveLocalPlaytestReceipt(receipt(),storage);assert.equal(loadLocalPlaytestReceipts(storage).length,1);
});

for(const content of ['null','[]','not-json'])test(`malformed optional feedback ledger ${content} uses safe defaults`,()=>{
 const ledger=loadContextualFeedbackLedger({getItem:()=>content});
 assert.equal(ledger.lastPromptAt,0);assert.deepEqual(ledger.occurrences,{});
});
