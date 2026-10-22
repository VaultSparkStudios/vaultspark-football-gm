import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {waitForCandidateCi,REQUIRED_CI_JOBS,parseCiWaitArgs} from '../scripts/wait-for-candidate-ci.mjs';
const sha='a'.repeat(40),repository='example/project';
const run={id:42,head_sha:sha,path:'.github/workflows/ci.yml',created_at:'2026-10-22T00:00:00Z',run_attempt:2,status:'completed',conclusion:'success'};
const jobs=Object.entries(REQUIRED_CI_JOBS).map(([name,stepName],i)=>({id:i+1,run_id:42,head_sha:sha,name,status:'completed',conclusion:'success',steps:[{name:stepName,status:'completed',conclusion:'success'}]}));
function observer({runs=[run],observedJobs=jobs}={}){return async endpoint=>endpoint.includes('/jobs?')?{total_count:observedJobs.length,jobs:observedJobs}:{total_count:runs.length,workflow_runs:runs};}
const options={repository,sha,maxWaitMs:60000,pollMs:1000};

test('exact SHA latest attempt requires all seven jobs and their actual test steps',async()=>{
 const calls=[],request=observer();
 const result=await waitForCandidateCi({...options,request:async path=>{calls.push(path);return request(path);}});
 assert.equal(result.ok,true);assert.equal(result.attempt,2);assert.equal(result.requiredJobs.length,7);
 assert.ok(calls.some(path=>path.includes('/42/attempts/2/jobs?')));
 assert.equal(calls.filter(path=>path.includes('/workflows/')).length,2,'reobserve latest run after job proof');
});

test('terminal failure never falls back to an older green run or polls again',async()=>{
 let calls=0;
 await assert.rejects(waitForCandidateCi({...options,request:async()=>{calls++;return{total_count:2,workflow_runs:[{...run,run_attempt:1},{...run,id:43,conclusion:'failure'}]};},sleep:()=>assert.fail('must stop immediately')}),/did not succeed/);
 assert.equal(calls,1);
});

test('latest attempt pending cannot borrow successful jobs from an earlier attempt',async()=>{
 let clock=0,jobCalls=0;
 await assert.rejects(waitForCandidateCi({...options,maxWaitMs:2,pollMs:1,now:()=>clock,sleep:async ms=>{clock+=ms;},request:async path=>{
  if(path.includes('/jobs?'))jobCalls++;
  return{total_count:2,workflow_runs:[{...run,run_attempt:1},{...run,run_attempt:2,status:'in_progress',conclusion:null}]};
 }}),/wait expired/);
 assert.equal(jobCalls,0);
});

test('missing, duplicated, wrong-SHA, skipped jobs and failed or skipped test steps refuse promotion',async()=>{
 for(const observedJobs of [jobs.slice(1),[...jobs,jobs[0]],jobs.map((j,i)=>i?j:{...j,head_sha:'b'.repeat(40)}),jobs.map((j,i)=>i?j:{...j,conclusion:'skipped'}),jobs.map((j,i)=>i?j:{...j,steps:[]}),jobs.map((j,i)=>i?j:{...j,steps:[{...j.steps[0],conclusion:'failure'}]}),jobs.map((j,i)=>i?j:{...j,steps:[{...j.steps[0],conclusion:'skipped'}]})]){
  await assert.rejects(waitForCandidateCi({...options,request:observer({observedJobs})}),/required job/);
 }
});

test('pagination observes every page before accepting run and job coverage',async()=>{
 const calls=[];
 await waitForCandidateCi({...options,request:async endpoint=>{
  calls.push(endpoint);const second=endpoint.endsWith('page=2');
  return endpoint.includes('/jobs?')?{total_count:7,jobs:second?jobs.slice(3):jobs.slice(0,3)}:{total_count:2,workflow_runs:second?[run]:[{...run,id:1,head_sha:'b'.repeat(40)}]};
 }});
 assert.ok(calls.filter(path=>path.endsWith('page=2')).length>=3);
});

test('unknown, truncated, changing and inaccessible observations fail closed',async()=>{
 for(const request of [async()=>({}),async()=>({total_count:1001,workflow_runs:[]}),async()=>({total_count:1,workflow_runs:[]}),observer({runs:[{...run,status:'unknown'}]}),async()=>{throw Error('API unavailable');}])await assert.rejects(waitForCandidateCi({...options,request}));
 let count=0;
 await assert.rejects(waitForCandidateCi({...options,request:async()=>({total_count:++count+1,workflow_runs:[run]})}),/collection changed/);
});

test('a rerun starting during observation requires the newer attempt to finish',async()=>{
 let reads=0,clock=0;
 const result=await waitForCandidateCi({...options,now:()=>clock,sleep:async ms=>{clock+=ms;},request:async path=>{
  if(path.includes('/jobs?'))return{total_count:7,jobs};
  reads++;return{total_count:1,workflow_runs:[{...run,run_attempt:reads===1?1:2,status:reads===2?'in_progress':'completed',conclusion:reads===2?null:'success'}]};
 }});
 assert.equal(result.attempt,2);assert.ok(clock>0);
});

test('missing candidate waits only to its finite deadline; unrelated runs do not pass',async()=>{
 let clock=0;
 await assert.rejects(waitForCandidateCi({...options,maxWaitMs:3,pollMs:1,now:()=>clock,sleep:async ms=>{clock+=ms;},request:observer({runs:[{...run,head_sha:'b'.repeat(40)}]})}),/wait expired/);
 assert.equal(clock,3);
});

test('API work cannot cross the deadline and still publish a passing result',async()=>{
 let clock=0;
 await assert.rejects(waitForCandidateCi({...options,maxWaitMs:10,now:()=>clock,request:async(path,remaining)=>{
  assert.equal(remaining,10);clock=10;return observer()(path);
 }}),/wait expired during observation/);
});

test('CLI arguments reject unknown flags and unbounded or malformed waits before network access',async()=>{
 assert.deepEqual(parseCiWaitArgs(['--help']),{help:true});
 for(const args of [['--wat','x'],['--sha'],['--sha',sha,'--sha',sha],['--max-wait-minutes','1.5']])assert.throws(()=>parseCiWaitArgs(args));
 for(const maxWaitMs of [0,-1,196*60000,NaN])await assert.rejects(waitForCandidateCi({...options,maxWaitMs,request:()=>assert.fail('invalid input must not observe')}),/bounded/);
});

test('production workflows wait for exact candidate CI before either mutation path',()=>{
 const pages=fs.readFileSync(new URL('../.github/workflows/deploy-pages.yml',import.meta.url),'utf8'),backend=fs.readFileSync(new URL('../.github/workflows/deploy-backend.yml',import.meta.url),'utf8');
 for(const source of [pages,backend])assert.match(source,/actions: read/);
 assert.ok(pages.indexOf('node scripts/wait-for-candidate-ci.mjs')<pages.indexOf('- name: Publish to Cloudflare Pages'));
 assert.ok(backend.indexOf('node scripts/wait-for-candidate-ci.mjs')<backend.indexOf('- name: Copy ops and deploy backend'));
 assert.match(pages,/--sha "\$CANDIDATE_REVISION" --max-wait-minutes 90/);
 assert.match(backend,/--sha "\$CANDIDATE_REVISION" --max-wait-minutes 195/);
 assert.match(pages,/timeout-minutes: 300/);assert.match(backend,/timeout-minutes: 220/);
 for(const source of [pages,backend])assert.match(source,/GH_TOKEN: \$\{\{ github.token \}\}/);
});
