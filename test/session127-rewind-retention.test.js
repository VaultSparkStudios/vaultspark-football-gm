import test from 'node:test';
import assert from 'node:assert/strict';
import {retainRewindCheckpoints} from '../src/adapters/persistence/rewindRetention.js';
import {createMirrorStorage} from '../public/lib/api/localRuntimeWorker.js';
import {createLocalApiRuntime} from '../src/app/api/localApiRuntime.js';

const indexKey='vsfgm-rw-index', prefix='vsfgm:rw-state:';
function fixture(){
 const entries=['new','middle','old'].map((id,i)=>({id,createdAt:new Date(Date.UTC(2026,9,28-i)).toISOString()}));
 const map=new Map(entries.map(row=>[prefix+row.id,'x'.repeat(1000)]));map.set(indexKey,JSON.stringify(entries));
 return {entries,map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}
test('byte retention removes multiple oldest checkpoints without resurrecting deleted entries',async()=>{
 const storage=fixture();const result=await retainRewindCheckpoints(storage,[...storage.entries].reverse(),{maxSize:1500});
 assert.deepEqual(result.snapshots.map(row=>row.id),['new']);assert.equal(result.pruned,2);
 assert.deepEqual(JSON.parse(storage.getItem(indexKey)),result.snapshots);
 assert.equal(storage.getItem(prefix+'old'),null);assert.equal(storage.getItem(prefix+'middle'),null);assert.ok(storage.getItem(prefix+'new'));
 assert.equal((await retainRewindCheckpoints(storage,result.snapshots,{maxSize:1500})).pruned,0);
});
test('retention keeps exactly the slot limit and one newest oversized checkpoint',async()=>{
 const s=fixture();assert.equal((await retainRewindCheckpoints(s,s.entries,{maxSlots:3})).snapshots.length,3);
 assert.deepEqual((await retainRewindCheckpoints(s,s.entries,{maxSize:1})).snapshots.map(row=>row.id),['new']);
});
test('mixed missing dates have a total ordering that never evicts the dated newest first',async()=>{
 const s=fixture();const rows=[s.entries[2],{...s.entries[1],createdAt:null},s.entries[0]];
 assert.deepEqual((await retainRewindCheckpoints(s,rows,{maxSize:1500})).snapshots.map(row=>row.id),['new']);
});
test('the checkpoint just written survives future-dated inherited metadata',async()=>{
 const s=fixture();s.entries[2].createdAt='2099-01-01T00:00:00Z';
 const r=await retainRewindCheckpoints(s,s.entries,{maxSize:1500,newestId:'new'});
 assert.deepEqual(r.snapshots.map(row=>row.id),['new']);assert.ok(s.getItem(prefix+'new'));
});
test('missing payloads and duplicate metadata never remain advertised',async()=>{
 const s=fixture();s.removeItem(prefix+'middle');
 const r=await retainRewindCheckpoints(s,[null,...s.entries,s.entries[0],{id:'missing'}]);
 assert.deepEqual(r.snapshots.map(row=>row.id),['new','old']);
});
test('a failed index write cannot delete checkpoint bytes',async()=>{
 const s=fixture(),before=[...s.map];s.setItem=()=>{throw Error('index unavailable');};
 await assert.rejects(retainRewindCheckpoints(s,s.entries,{maxSize:1500}),/index unavailable/);assert.deepEqual([...s.map],before);
});
test('a failed payload removal restores its advertised checkpoint',async()=>{
 const s=fixture();s.removeItem=()=>{throw Error('remove unavailable');};
 await assert.rejects(retainRewindCheckpoints(s,s.entries,{maxSize:1500}),/remove unavailable/);
 assert.deepEqual(JSON.parse(s.getItem(indexKey)),s.entries);assert.ok(s.getItem(prefix+'old'));
});
test('retention awaits page acknowledgments and keeps the worker mirror identical',async()=>{
 const page=fixture();let mirror;const messages=[];
 mirror=createMirrorStorage([...page.map],message=>{messages.push(message);setTimeout(()=>{
  if(message.type==='storage-set')page.setItem(message.key,message.value);else page.removeItem(message.key);
  mirror.acknowledge({type:'storage-ack',storageId:message.storageId});
 },2);});
 const result=await retainRewindCheckpoints(mirror,page.entries,{maxSize:1500});await mirror.flush();
 assert.equal(mirror.pendingCount(),0);assert.equal(result.pruned,2);assert.ok(messages.every(m=>m.storageId));
 for(const key of [indexKey,...page.entries.map(row=>prefix+row.id)])assert.equal(mirror.getItem(key),page.getItem(key));
 mirror.close();
});
test('worker index NACK is reported without removing the surviving payloads',async()=>{
 const page=fixture();let mirror;
 mirror=createMirrorStorage([...page.map],m=>queueMicrotask(()=>mirror.acknowledge({type:'storage-nack',storageId:m.storageId,error:{message:'quota'},currentValue:page.getItem(m.key)})));
 await assert.rejects(retainRewindCheckpoints(mirror,page.entries,{maxSize:1500}),/quota/);
 assert.ok(page.entries.every(row=>mirror.getItem(prefix+row.id)===page.getItem(prefix+row.id)));mirror.close();
});
test('a full inherited runway frees oldest bytes before writing a new real checkpoint',async()=>{
 const s=fixture();Object.defineProperty(s,'length',{get:()=>s.map.size});s.key=i=>[...s.map.keys()][i]??null;
 for(const row of s.entries)s.map.set(prefix+row.id,'x'.repeat(1800000));
 const write=s.setItem;s.setItem=(key,value)=>{
  const size=[...s.map].reduce((sum,[k,v])=>sum+(k===key?0:v.length),String(value).length);
  if(size>5500000){const e=Error('full');e.name='QuotaExceededError';throw e;}write(key,value);
 };
 const runtime=createLocalApiRuntime({storage:s,currentYear:2026,scheduler:fn=>fn()});
 assert.equal((await runtime.request('/api/new-league',{method:'POST',body:{seed:128,startYear:2026,controlledTeamId:'BUF',mode:'drive'}})).status,200);
 const saved=await runtime.request('/api/rewind/snapshot',{method:'POST',body:{label:'After recovery'}});
 assert.equal(saved.status,200);const rows=JSON.parse(s.getItem(indexKey));
 assert.ok(rows.some(row=>row.id===saved.payload.entry.id));assert.equal(s.getItem(prefix+'old'),null);
 assert.ok(rows.every(row=>s.getItem(prefix+row.id)!=null));
});
test('real runtime restore returns a playable dashboard and next action stays on restored timeline',async()=>{
 const s=fixture();s.map.clear();Object.defineProperty(s,'length',{get:()=>s.map.size});s.key=i=>[...s.map.keys()][i]??null;
 const runtime=createLocalApiRuntime({storage:s,currentYear:2026,scheduler:fn=>fn()});
 const created=await runtime.request('/api/new-league',{method:'POST',body:{seed:127,startYear:2026,controlledTeamId:'BUF',mode:'drive'}});assert.equal(created.status,200);
 const initial=(await runtime.request('/api/state')).payload;
 const saved=await runtime.request('/api/rewind/snapshot',{method:'POST',body:{label:'Before decision'}});assert.equal(saved.status,200);
 assert.equal((await runtime.request('/api/advance-week',{method:'POST',body:{count:1}})).status,200);
 const restored=await runtime.request('/api/rewind/restore',{method:'POST',body:{id:saved.payload.entry.id}});
 assert.equal(restored.status,200);assert.equal(restored.payload.state.currentWeek,initial.currentWeek);assert.equal(restored.payload.state.controlledTeamId,initial.controlledTeamId);
 assert.equal((await runtime.request('/api/advance-week',{method:'POST',body:{count:1}})).status,200);
 assert.equal((await runtime.request('/api/state')).payload.currentWeek,initial.currentWeek+1);
});
