import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYTEST_RECEIPT_STORAGE_KEY, buildLocalPlaytestReceipt,
  loadLocalPlaytestReceipts, saveLocalPlaytestReceipt,
  buildLocalPlaytestTrend, buildLocalPlaytestExport
} from '../public/lib/playtestReceipts.js';

const receipt = (clarity=4) => buildLocalPlaytestReceipt({createdAt:'2026-10-29T00:00:00Z',clarity,agency:5,pace:3,returnIntent:4,note:'A useful decision.'},{teamId:'BUF',year:2026,week:1});
function storage(rows) { const data=new Map([[PLAYTEST_RECEIPT_STORAGE_KEY,JSON.stringify(rows)]]);return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}; }

test('mixed damaged notes cannot distort counts or ratings and valid history survives',()=>{
  const good=receipt(),bad={...good,ratings:{...good.ratings,clarity:99}};
  const rows=[null,[],false,{},bad,{...good,ratings:{...good.ratings,pace:[3]}},{...good,createdAt:'not-a-date'},{...good,note:{secret:'extra'}},good];
  assert.equal(loadLocalPlaytestReceipts(storage(rows)).length,1);
  assert.equal(buildLocalPlaytestTrend(rows).count,1);
  assert.equal(buildLocalPlaytestTrend([bad,bad,bad]).available,false);
  const trend=buildLocalPlaytestTrend([receipt(3),receipt(4),receipt(5),bad]);
  assert.equal(trend.count,3);assert.equal(trend.averages.clarity,4);
});

test('copy packets project nested disclosed fields and never forward unknown payloads',()=>{
  const good=receipt();good.accountIdentifier='sentinel-account';good.context.savePayload={secret:'sentinel-save'};good.ratings.token='sentinel-token';good.privacy.extra='sentinel-private';good.receiptId='sentinel-id';
  const packet=buildLocalPlaytestExport([good],{}),serialized=JSON.stringify(packet);
  assert.equal(packet.count,1);assert.doesNotMatch(serialized,/sentinel/);
  assert.equal(packet.receipts[0].note,'A useful decision.');
  assert.deepEqual(packet.receipts[0].ratings,{clarity:4,agency:5,pace:3,returnIntent:4});
  assert.deepEqual(Object.keys(packet.receipts[0].context),['year','week','phase','teamId','openingContractStatus','evidenceMoment']);
  assert.equal(good.accountIdentifier,'sentinel-account');
});

test('saving validates before storage, strips unknown data, and keeps canonical deduplication',()=>{
  const good=receipt(),s=storage([good]);
  assert.throws(()=>saveLocalPlaytestReceipt({...good,ratings:{}},s),/valid playtest note/);
  assert.equal(loadLocalPlaytestReceipts(s).length,1);
  good.hidden='sentinel';assert.equal(saveLocalPlaytestReceipt(good,s).length,1);
  assert.doesNotMatch(s.getItem(PLAYTEST_RECEIPT_STORAGE_KEY),/sentinel/);
  assert.throws(()=>saveLocalPlaytestReceipt(good,{setItem(){throw Error('quota');}}),/quota/);
});

test('non-array input and malformed records produce honest empty packets',()=>{
  for(const rows of [null,{},false,'notes']){
    assert.equal(buildLocalPlaytestTrend(rows).count,0);
    assert.equal(buildLocalPlaytestExport(rows,{}).count,0);
  }
  const rows=[...Array.from({length:25},()=>null),receipt()];
  assert.equal(loadLocalPlaytestReceipts(storage(rows)).length,1);
});
