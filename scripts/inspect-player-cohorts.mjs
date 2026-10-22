import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createSession} from '../src/runtime/bootstrap.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {admitUndraftedFreeAgents} from '../src/domain/undraftedFreeAgency.js';
import {PLAYER_DEMOGRAPHIC_BASELINE} from '../src/data/playerDemographicBaseline.js';

// Diagnostic export using the actual player and draft authorities. This does
// not fit coefficients or certify real-world prevalence or visible realism.
const outputIndex=process.argv.indexOf('--output');
const output=path.resolve(outputIndex<0?'.cache/current-player-cohort-review.json':process.argv[outputIndex+1]||'');
assert.ok(output.startsWith(path.resolve('.')+path.sep),'evidence must stay in this repository');
const report={version:3,kind:'current-generated-cohort-diagnostics',setupYear:2026,
 baseline:{version:PLAYER_DEMOGRAPHIC_BASELINE.version,sourceYear:PLAYER_DEMOGRAPHIC_BASELINE.sourceYear,
   sourceUrl:PLAYER_DEMOGRAPHIC_BASELINE.sourceUrl,sourceTable:PLAYER_DEMOGRAPHIC_BASELINE.sourceTable,
   categories:'Original dated reporting categories; no individual phenotype inference'},
 seeds:[117,2026,4040,7411,8354,20260306],sourceHashes:{},cohorts:[],
 limits:['Generated distributions are simulation outputs, not measured world or NFL phenotype frequencies.',
 'The dated 2023 reporting margin is not certified for separate practice, draft or undrafted cohorts.',
 'Birthplace, pigment and body conditional weights remain simulation assumptions.',
 'Numerical diversity does not prove visible realism; group channels report observed variation, not an aesthetic verdict.',
 'Version/derived/hidden controls may remain constant or inapplicable; cardinality alone is not visible control coverage.',
 'Groups with fewer than two observations cannot establish within-group variation; controlled rare-category fixtures are separate from prevalence.',
 'Background counterfactuals check saved appearance/frame decoders; they do not execute football outcomes.'],invarianceChecks:0};
for(const file of ['src/domain/playerIdentity.js','src/domain/playerVisualIdentity.js','src/domain/playerMeasurements.js',
 'src/domain/playerDemographicModel.js','src/domain/playerFactory.js','src/data/playerDemographicBaseline.js',
 'src/data/playerFamilyHeritage.js','src/runtime/GameSession.js','scripts/inspect-player-cohorts.mjs'])
 report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const groups=new Map(),visualSamples=new Map();
function collect(name,seed,populationYear,players){
 const rows=players.map(p=>({seed,populationYear,teamId:p.teamId,position:p.position,identity:p.profile.identity,
   appearance:playerAppearance(p),frame:playerFrame(p),height:p.heightInches,weight:p.weightLbs,overall:p.overall,potential:p.potential}));
 groups.set(name,[...(groups.get(name)||[]),...rows]);
 for(const p of players){
   const identity=p.profile.identity;
   if(identity.birthCountry!=='United States')continue;
   const list=visualSamples.get(identity.surveyCategory)||[];
   if(list.length>=2||list.some(row=>row.player.id===p.id))continue;
   list.push({seed,cohort:name,populationYear,player:{id:p.id,name:p.name,age:p.age,position:p.position,
     teamId:p.teamId,jerseyNumber:p.jerseyNumber,heightInches:p.heightInches,weightLbs:p.weightLbs,
     profile:{identity:structuredClone(identity)},appearance:playerAppearance(p),visualFrame:playerFrame(p)}});
   visualSamples.set(identity.surveyCategory,list);
 }
 for(const p of players){
   const before=playerFrame(p),ratings=JSON.stringify(p.ratings);
   const copy=structuredClone(p);copy.profile.identity={...copy.profile.identity,
     surveyCategory:'Undisclosed',birthCountry:'Japan',heritage:['Japanese'],footballUpbringing:'Japan'};
   assert.deepEqual(playerFrame(copy),before,'background edit changed measured frame');
   assert.deepEqual(playerAppearance(copy),playerAppearance(p),'saved cosmetics changed with label');
   assert.equal(JSON.stringify(copy.ratings),ratings);
   report.invarianceChecks++;
 }
 console.log(JSON.stringify({seed,cohort:name,n:players.length}));
}
function count(rows,read){const out={};for(const row of rows){const v=String(read(row)??'missing');out[v]=(out[v]||0)+1;}return out;}
function distribution(rows,read){const values=rows.map(read).filter(Number.isFinite).sort((a,b)=>a-b);
 return {n:values.length,missing:rows.length-values.length,min:values[0]??null,
 p10:values[Math.floor((values.length-1)*.1)]??null,median:values[Math.floor((values.length-1)*.5)]??null,
 p90:values[Math.floor((values.length-1)*.9)]??null,max:values.at(-1)??null};}
function channelInventory(rows,namespace){
 const fields=[...new Set(rows.flatMap(row=>Object.keys(row[namespace]||{})))].sort();
 return Object.fromEntries(fields.map(field=>{
   const read=row=>row[namespace]?.[field],values=rows.map(read).filter(value=>value!==undefined&&value!==null);
   const distinct=new Set(values.map(value=>JSON.stringify(value))).size;
   const numeric=values.length>0&&values.every(Number.isFinite);
   const absent=rows.filter(row=>!Object.hasOwn(row[namespace]||{},field)||read(row)===undefined).length;
   const explicitlyNull=rows.filter(row=>Object.hasOwn(row[namespace]||{},field)&&read(row)===null).length;
   return [field,{observations:values.length,missing:absent,explicitlyNull,distinct,
     variation:rows.length<2?'insufficient-sample':distinct>1?'observed':'constant-in-observed-group',
     ...(numeric?{distribution:distribution(rows,read)}:{values:count(rows,row=>JSON.stringify(read(row)))})}];
 }));
}
for(const seed of report.seeds){
 const s=createSession({seed,startYear:2026,controlledTeamId:'BUF'});
 collect('opening-active',seed,s.currentYear,s.league.players.filter(p=>p.rosterSlot==='active'&&s.league.teams.some(t=>t.id===p.teamId)));
 collect('opening-practice',seed,s.currentYear,s.league.players.filter(p=>p.rosterSlot==='practice'&&s.league.teams.some(t=>t.id===p.teamId)));
 s.prepareDraft();
 collect('draft-board',seed,s.league.pendingDraft.year,s.league.pendingDraft.available);
 s.runCpuDraft({untilUserPick:false});
 assert.equal(s.league.pendingDraft.completed,true,'actual draft did not complete');
 const admitted=admitUndraftedFreeAgents(s.league,s.league.pendingDraft,{year:s.league.pendingDraft.year}).admitted;
 collect('actual-undrafted-admission',seed,s.league.pendingDraft.year,admitted);
}
const total=Object.values(PLAYER_DEMOGRAPHIC_BASELINE.surveyWeights).reduce((a,b)=>a+b,0);
for(const [name,rows]of groups){
 const categories=count(rows,r=>r.identity?.surveyCategory);
 const expected=Object.fromEntries(Object.entries(PLAYER_DEMOGRAPHIC_BASELINE.surveyWeights).map(([k,v])=>[k,rows.length*v/total]));
 const backgrounds=Object.fromEntries(Object.keys(categories).map(category=>{
   const subset=rows.filter(r=>r.identity?.surveyCategory===category);
   return [category,{n:subset.length,complexion:distribution(subset,r=>r.appearance.complexion),
     naturalHairColors:count(subset,r=>r.appearance.naturalHairColor),eyes:count(subset,r=>r.appearance.eyeColor),
     textures:count(subset,r=>r.appearance.naturalHairTexture),styles:count(subset,r=>r.appearance.hairstyle),
     channels:{appearance:channelInventory(subset,'appearance'),frame:channelInventory(subset,'frame')}}];
 }));
 const populationYears=[...new Set(rows.map(r=>r.populationYear))];
 assert.equal(populationYears.length,1,'mixed-year cohort needs separate aggregation');
 report.cohorts.push({name,populationYear:populationYears[0],n:rows.length,categories,expectedUnderDatedGenerationMargin:expected,
   countries:count(rows,r=>r.identity?.birthCountry),backgrounds,
   // Keep each club/seed separate: a pooled league can conceal a homogeneous
   // team. This measures simulation diversity, not per-team racial quotas.
   perTeam:name.startsWith('opening-')?[...new Set(rows.map(r=>`${r.seed}:${r.teamId}`))].map(key=>{
    const subset=rows.filter(r=>`${r.seed}:${r.teamId}`===key);
    assert.ok(subset[0].teamId,'opening cohort lost club identity');
    return {seed:subset[0].seed,teamId:subset[0].teamId,n:subset.length,
     overall:distribution(subset,r=>r.overall),potentialGap:distribution(subset,r=>r.potential-r.overall),
     height:distribution(subset,r=>r.height),weight:distribution(subset,r=>r.weight),
     distinctAppearanceRecipes:new Set(subset.map(r=>JSON.stringify(r.appearance))).size,
     distinctFrameRecipes:new Set(subset.map(r=>JSON.stringify(r.frame))).size,
     hairstyles:count(subset,r=>r.appearance.hairstyle),eyes:count(subset,r=>r.appearance.eyeColor),
     complexion:distribution(subset,r=>r.appearance.complexion)};
   }):[],
   byPosition:Object.fromEntries([...new Set(rows.map(r=>r.position))].map(position=>{
    const subset=rows.filter(r=>r.position===position);return [position,{n:subset.length,
      height:distribution(subset,r=>r.height),weight:distribution(subset,r=>r.weight),
      overall:distribution(subset,r=>r.overall),potentialGap:distribution(subset,r=>r.potential-r.overall)}];
   }))});
}
report.visualSamples={selection:'First two distinct actual generated US-born players per reported category across listed cohorts/seeds; selected coverage cases, not prevalence or ethnic phenotype prototypes.',
 groups:Object.fromEntries(visualSamples),limits:['Reporting category and birthplace are shared; family origins, positions and individual measurements may differ.','These DTOs support a controlled renderer gallery, not an actual UI access-path claim.']};
report.status='diagnostics-complete';report.completedAt=new Date().toISOString();
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,invarianceChecks:report.invarianceChecks,cohorts:report.cohorts.map(c=>({name:c.name,n:c.n}))}));
