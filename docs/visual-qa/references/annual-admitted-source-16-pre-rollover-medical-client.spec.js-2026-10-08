import {test,expect} from '@playwright/test';
import {createSession} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {startStaticClientHost,configureClient,createClientLeague,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';

let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});

// Portable controlled-final fixture. The actual saved managed-career failure
// is checked separately; this verifies the built clients and persistence.
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} annual medical advance retains actual saved injury pay`,async({page})=>{
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const p=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const playerId=p.id;
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 expect(declareStandardElevation({league:session.league,player:p,teamId:'BUF',game,capSpace:1e8}).ok).toBe(true);
 settleStandardElevationGame({league:session.league,result:{...game,winnerId:'BUF'}});
 applyInjury(p,{type:'Controlled qualifying injury',weeksRemaining:3},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 session.league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
 session.phase='offseason';session.currentWeek=19;
 const snapshot=session.toSnapshot();
 const original=snapshot.league.players.find(p=>p.id===playerId).elevationInjuryPay;
 await configureClient(page,worker);
 await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});
 await assertRuntime(page,worker);
 const result=await page.evaluate(async snapshot=>{
  const {api}=await import('./lib/appState.js');
  await api('/api/snapshot/import',{method:'POST',body:{snapshot}});
  await api('/api/advance-week',{method:'POST',body:{count:1}});
  return (await api('/api/snapshot/export')).snapshot;
 },snapshot);
 const player=result.league.players.find(p=>p.id===playerId);
 expect(player.elevationInjuryPay.episodes[0].status).toBe('recovered');
 expect(player.injury).toBeNull();
 expect(result.league.injurySalaryClaims).toBeUndefined();
 expect(result.league.annualElevationInjuryResolutions).toBeUndefined();
 expect(result.league.admittedInjuryContinuations).toHaveLength(1);
 expect(player.elevationInjuryPay.payroll.slice(0,original.payroll.length)).toEqual(original.payroll);
 const added=player.elevationInjuryPay.payroll.slice(original.payroll.length);
 expect(added.map(row=>row.week)).toEqual([24,25,26]);
 expect(added.every(row=>row.teamId==='BUF'&&row.year===2026&&row.practiceCents===0&&row.capChargeCents===row.additionalCents&&row.capTreatmentVersion==='injury-compensation-cap-v2')).toBe(true);
 expect(result.league.preRolloverMedicalCalendar).toHaveLength(1);
 // Re-import the exact save: future receipt corruption must refuse without
 // overwriting the valid calendar or retained payroll.
 const rejected=await page.evaluate(async snapshot=>{
  const {api}=await import('./lib/appState.js');
  snapshot.league.preRolloverMedicalCalendar[0].year=2199;
  try{await api('/api/snapshot/import',{method:'POST',body:{snapshot}});return null;}
  catch(error){return {message:error.message};}
 },result);
 expect(rejected).not.toBeNull();
 await saveSlot(page,`annual-medical-${worker?'worker':'in-page'}`);
 await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=await page.evaluate(async id=>{
  const {api}=await import('./lib/appState.js');const {snapshot}=await api('/api/snapshot/export');
  return {pay:snapshot.league.players.find(p=>p.id===id).elevationInjuryPay,calendar:snapshot.league.preRolloverMedicalCalendar,
   claims:snapshot.league.injurySalaryClaims,resolutions:snapshot.league.annualElevationInjuryResolutions,rights:snapshot.league.admittedInjuryContinuations};
 },playerId);
 expect(restored.pay).toEqual(player.elevationInjuryPay);
 expect(restored.calendar).toEqual(result.league.preRolloverMedicalCalendar);
 expect(restored.claims).toEqual(result.league.injurySalaryClaims);
 expect(restored.resolutions).toEqual(result.league.annualElevationInjuryResolutions);
 expect(restored.rights).toEqual(result.league.admittedInjuryContinuations);
});

for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} unproved injury contract term refuses with its reason and preserves franchise state`,async({page})=>{
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const p=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 expect(declareStandardElevation({league:session.league,player:p,teamId:'BUF',game,capSpace:1e8}).ok).toBe(true);
 settleStandardElevationGame({league:session.league,result:{...game,winnerId:'BUF'}});
 applyInjury(p,{type:'Controlled unresolved qualifying injury',weeksRemaining:9},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'DAL',awayTeamId:'NYJ',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 session.league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'DAL'});
 session.phase='offseason';session.currentWeek=19;
 await configureClient(page,worker);
 await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});
 await assertRuntime(page,worker);
 const result=await page.evaluate(async snapshot=>{
  const {api}=await import('./lib/appState.js');
  await api('/api/snapshot/import',{method:'POST',body:{snapshot}});
  const before=(await api('/api/snapshot/export')).snapshot;
  let refusal=null;
  try{await api('/api/advance-week',{method:'POST',body:{count:1}});}
  catch(error){refusal={status:error.status,reasonCode:error.payload?.reasonCode||error.details?.reasonCode||error.reasonCode};}
  const after=(await api('/api/snapshot/export')).snapshot;
  const differences=[];
  const compare=(a,b,path)=>{
   if(Object.is(a,b))return;
   if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b)){
    differences.push({path,before:a,after:b});return;
   }
   const keys=new Set([...Object.keys(a),...Object.keys(b)]);
   for(const key of keys){
    if(!Object.hasOwn(a,key)||!Object.hasOwn(b,key))differences.push({path:`${path}.${key}`,before:a[key],after:b[key]});
    else compare(a[key],b[key],`${path}.${key}`);
   }
  };
  compare(before,after,'snapshot');
  // Worker request telemetry records these actual API calls. Allow only those
  // named counter/timing paths; all other saved fields must remain identical.
  const requestTelemetry=/^snapshot\.league\.observability\.(?:counters\.api-request|lastUpdated|timings\.api:\/api\/(?:snapshot\/export|advance-week)(?:\.(?:count|totalMs|avgMs))?)$/;
  return {refusal,differences:differences.filter(row=>!requestTelemetry.test(row.path)),requestTelemetryChanges:differences.filter(row=>requestTelemetry.test(row.path)).map(row=>row.path)};
 },session.toSnapshot());
 expect(result.refusal).toEqual({status:409,reasonCode:'ELEVATION_INJURY_TERM_REQUIRED'});
 expect(result.differences).toEqual([]);
});
