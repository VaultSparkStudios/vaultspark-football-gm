#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {releaseCandidateVerdict} from './lib/release-candidate.mjs';

const workflow='.github/workflows/ci.yml';
export const REQUIRED_CI_JOBS=Object.freeze(Object.fromEntries([
  ...['core','runtime','sim:contract','sim:realism','long','studio'].map(shard=>[`unit-shards (${shard})`,`Run ${shard} shard`]),
  ['browser-gates','Run UI tests']
]));
const pending=new Set(['queued','in_progress','waiting','pending','requested']);
function invalid(message){throw new Error(`Candidate CI unverified: ${message}`);}
function validate({repository,sha,maxWaitMs,pollMs}){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')||!/^[a-f0-9]{40}$/.test(sha||''))invalid('repository or exact SHA invalid');
  if(!Number.isSafeInteger(maxWaitMs)||maxWaitMs<=0||maxWaitMs>195*60000||!Number.isSafeInteger(pollMs)||pollMs<=0||pollMs>60000)invalid('bounded wait configuration invalid');
}
async function collection(request,endpoint,key){
  const rows=[];let total;
  for(let page=1;page<=10;page++){
    const body=await request(`${endpoint}${endpoint.includes('?')?'&':'?'}per_page=100&page=${page}`);
    if(!Number.isSafeInteger(body?.total_count)||body.total_count<0||body.total_count>1000||!Array.isArray(body[key]))invalid('malformed or truncated API collection');
    if(total!==undefined&&total!==body.total_count)invalid('API collection changed during pagination');
    total=body.total_count;rows.push(...body[key]);
    if(rows.length===total)return rows;
    if(rows.length>total||!body[key].length)invalid('truncated API collection');
  }
  invalid('API pagination limit exceeded');
}
function latestRun(runs,sha){
  const matches=runs.filter(run=>run.head_sha===sha&&run.path?.split('@')[0]===workflow);
  for(const run of matches)if(!Number.isSafeInteger(run.id)||!Number.isSafeInteger(run.run_attempt)||run.run_attempt<1||!Number.isFinite(Date.parse(run.created_at)))invalid('malformed exact-candidate run');
  return matches.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id||b.run_attempt-a.run_attempt)[0];
}
export async function waitForCandidateCi({repository,sha,maxWaitMs=90*60000,pollMs=30000,request,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=()=>{}}){
  validate({repository,sha,maxWaitMs,pollMs});
  if(typeof request!=='function')invalid('API observer missing');
  const deadline=now()+maxWaitMs,endpoint=`/repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}`;
  const observe=async path=>{
    const remaining=deadline-now();if(remaining<=0)invalid('bounded wait expired during observation');
    const result=await request(path,remaining);
    if(now()>=deadline)invalid('bounded wait expired during observation');
    return result;
  };
  while(now()<deadline){
    const run=latestRun(await collection(observe,endpoint,'workflow_runs'),sha);
    if(run){
      if(run.status!=='completed'&&!pending.has(run.status))invalid('unknown run status');
      if(run.status==='completed'){
        const verdict=releaseCandidateVerdict({sha,requiredWorkflows:[workflow],runs:[{id:run.id,headSha:run.head_sha,workflow,createdAt:run.created_at,attempt:run.run_attempt,status:run.status,conclusion:run.conclusion}]});
        if(!verdict.ok)invalid(`run ${run.id} attempt ${run.run_attempt} did not succeed`);
        const jobs=await collection(observe,`/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,'jobs');
        for(const [name,stepName]of Object.entries(REQUIRED_CI_JOBS)){
          const matches=jobs.filter(job=>job.name===name);
          if(matches.length!==1)invalid(`required job coverage missing or duplicated: ${name}`);
          const job=matches[0],step=job.steps?.filter(entry=>entry.name===stepName);
          if(job.head_sha!==sha||job.run_id!==run.id||job.status!=='completed'||job.conclusion!=='success'||step?.length!==1||step[0].status!=='completed'||step[0].conclusion!=='success')invalid(`required job or test step did not succeed: ${name}`);
        }
        if(jobs.some(job=>job.status!=='completed'||job.conclusion!=='success'))invalid('candidate contains an unsuccessful job');
        // A rerun or newer run must not borrow an earlier attempt's green jobs.
        const refreshed=latestRun(await collection(observe,endpoint,'workflow_runs'),sha);
        if(refreshed?.status==='completed'&&refreshed.conclusion!=='success')invalid(`run ${refreshed.id} attempt ${refreshed.run_attempt} did not succeed`);
        if(refreshed?.id===run.id&&refreshed.run_attempt===run.run_attempt&&refreshed.status==='completed'&&refreshed.conclusion==='success'&&now()<deadline){
          const report={ok:true,sha,runId:run.id,attempt:run.run_attempt,requiredJobs:Object.keys(REQUIRED_CI_JOBS),lane:verdict.lane};
          log(`Exact candidate CI passed: ${sha} run ${run.id} attempt ${run.run_attempt}; seven required jobs verified.`);return report;
        }
      }
    }
    if(now()>=deadline)break;
    await sleep(Math.min(pollMs,deadline-now()));
  }
  invalid('bounded wait expired before complete exact-candidate success');
}

export function parseCiWaitArgs(args){
  if(args.length===1&&args[0]==='--help')return{help:true};
  const parsed={};
  for(let i=0;i<args.length;i+=2){
    const name={'--sha':'sha','--repository':'repository','--max-wait-minutes':'minutes'}[args[i]];
    if(!name||parsed[name]!==undefined||!args[i+1]||args[i+1].startsWith('--'))invalid('unknown, repeated or missing argument');
    parsed[name]=args[i+1];
  }
  if(parsed.minutes!==undefined&&!/^\d+$/.test(parsed.minutes))invalid('wait minutes must be an integer');
  return{repository:parsed.repository,sha:parsed.sha,maxWaitMs:Number(parsed.minutes??90)*60000,pollMs:30000};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{
    const options=parseCiWaitArgs(process.argv.slice(2));
    if(options.help)console.log('Usage: node scripts/wait-for-candidate-ci.mjs --repository owner/repo --sha <40hex> [--max-wait-minutes 1..195]');
    else{
      validate(options);
      // Hosted-only ephemeral workflow credential. Never resolve local Studio secrets.
      const token=process.env.GH_TOKEN;if(!token)invalid('hosted GH_TOKEN missing');
      const request=async(endpoint,remaining)=>{
        let response;try{response=await fetch(`https://api.github.com${endpoint}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(Math.max(1,Math.min(30000,remaining)))});}catch{invalid('GitHub observation unavailable');}
        if(!response.ok)invalid(`GitHub observation HTTP ${response.status}`);
        try{return await response.json();}catch{invalid('GitHub observation JSON invalid');}
      };
      await waitForCandidateCi({...options,request,log:console.log});
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
