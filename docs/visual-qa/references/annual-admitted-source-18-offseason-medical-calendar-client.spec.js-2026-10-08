import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} actual offseason intervals survive named franchise replacement/load/reload`,async({page})=>{
 test.setTimeout(180000);
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=s.league;
 const p=l.players.find(row=>row.teamId==='BUF'&&row.rosterSlot==='active'&&row.age<25);
 applyInjury(p,{type:'Controlled ordinary long injury',weeksRemaining:50});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 l.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});s.phase='offseason';s.currentWeek=19;l.settings.autoProgressOffseason=false;
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 const actual=await page.evaluate(async snapshot=>{
  const {api}=await import('./lib/appState.js');await api('/api/snapshot/import',{method:'POST',body:{snapshot}});
  const exportState=async()=>(await api('/api/snapshot/export')).snapshot;
  const step=async()=>{await api('/api/advance-week',{method:'POST',body:{count:1}});return exportState();};
  const anchored=await step(),history=[{stage:anchored.league.offseasonPipeline.stage,throughWeek:anchored.league.offseasonMedicalCalendar[0].throughWeek}];
  let state=anchored;
  for(let i=0;i<12&&state.league.offseasonPipeline.stage!=='draft';i++){
   state=await step();history.push({stage:state.league.offseasonPipeline.stage,throughWeek:state.league.offseasonMedicalCalendar[0].throughWeek});
  }
  await(await import('./lib/gameFlow.js')).loadState();return {snapshot:state,history};
 },s.toSnapshot());
 expect(actual.snapshot.league.offseasonPipeline.stage).toBe('draft');expect(actual.snapshot.league.offseasonMedicalCalendar[0].throughWeek).toBe(6);
 expect(actual.history[0].throughWeek).toBe(0);expect(actual.history.filter(row=>row.stage==='free-agency').every(row=>row.throughWeek===0)).toBe(true);
 const savedPlayer=[...actual.snapshot.league.players,...actual.snapshot.league.retiredPlayers].find(row=>row.id===p.id);
 expect(savedPlayer.injury.weeksRemaining).toBeLessThan(50);expect(actual.snapshot.league.admittedInjuryPayroll?.length||0).toBe(0);
 if(await page.locator('#closeSeasonReviewBtn').isVisible())await page.locator('#closeSeasonReviewBtn').click();await expect(page.locator('#seasonReviewModal')).not.toBeVisible();
 const slot=`offseason-medical-${worker?'worker':'in-page'}`;await saveSlot(page,slot);
 await page.evaluate(async()=>{const {api}=await import('./lib/appState.js');await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2026,controlledTeamId:'MIA',mode:'play'}});await(await import('./lib/gameFlow.js')).loadState();});
 expect((await readClient(page,'/api/state')).controlledTeamId).toBe('MIA');
 await page.locator('[data-testid="tab-settings"]').click();await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
 await page.locator('#saveSlotInput').fill(slot);await page.locator('#loadBtn').click();await expect.poll(async()=>(await readClient(page,'/api/state')).controlledTeamId).toBe('BUF');
 await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=(await readClient(page,'/api/snapshot/export')).snapshot;
 expect(restored.league.offseasonMedicalCalendar).toEqual(actual.snapshot.league.offseasonMedicalCalendar);
 expect([...restored.league.players,...restored.league.retiredPlayers].find(row=>row.id===p.id).injury).toEqual(savedPlayer.injury);
 const manifest=JSON.parse(await fs.readFile('static/deploy-manifest.json','utf8'));
 await fs.mkdir('.cache/offseason-medical-client',{recursive:true});await fs.writeFile(`.cache/offseason-medical-client/${worker?'worker':'in-page'}.json`,JSON.stringify({worker,playerId:p.id,artifactDigest:manifest.artifactFingerprint.digest,actualAdvanceWeekCommands:true,stageHistory:actual.history,throughWeek:6,medicalStateRestored:true,namedSaveReplacementLoadReload:true,annualDefaultChanged:false},null,2)+'\n');
});
