import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {expandSnapshotIdentityMetadata} from '../src/runtime/identityMetadataSnapshot.js';
import {fixture} from '../test/helpers/annualAdmittedFixture.js';
import {fileElevationInjurySalaryClaim} from '../src/domain/injurySalaryClaims.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
for(const worker of[true,false])for(const disputed of[false,true])test(`built ${worker?'worker':'in-page'} annual ${disputed?'explicit dispute':'admitted continuation'} survives replacement and reload`,async({page})=>{
 test.setTimeout(180000);
 const{s,l,p,game}=fixture(),claimedCents=10000001;
 if(disputed)fileElevationInjurySalaryClaim(l,{playerId:p.id,gameId:game.gameId,claimedCents});
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 const result=await page.evaluate(async snapshot=>{
  const{api}=await import('./lib/appState.js');await api('/api/snapshot/import',{method:'POST',body:{snapshot}});
  await api('/api/advance-week',{method:'POST',body:{count:1}});await(await import('./lib/gameFlow.js')).loadState();
  return(await api('/api/snapshot/export')).snapshot;
 },s.toSnapshot());
 const person=expandSnapshotIdentityMetadata(result).league.players.find(row=>row.id===p.id);
 expect(result.league.financialYear).toBe(2027);expect(result.league.offseasonMedicalCalendar[0].throughWeek).toBe(0);
 expect(person.profile).toEqual(p.profile);
 if(disputed){
  expect(result.league.admittedInjuryContinuations).toBeUndefined();expect(result.league.injurySalaryClaims[0].claimedCents).toBe(claimedCents);
  expect(result.league.injurySalaryClaims[0].status).toBe('filed');expect(person.elevationInjuryPay.episodes[0].status).toBe('claim-pending');
 }else{
  expect(result.league.injurySalaryClaims).toBeUndefined();expect(result.league.annualElevationInjuryResolutions).toBeUndefined();
  expect(result.league.admittedInjuryContinuations).toHaveLength(1);expect(person.injury.weeksRemaining).toBe(12);
  expect(person.elevationInjuryPay.episodes[0].status).toBe('active');expect(person.elevationInjuryPay.payroll.map(row=>row.week)).toEqual([24,25,26,27]);
 }
 if(await page.locator('#closeSeasonReviewBtn').isVisible())await page.locator('#closeSeasonReviewBtn').click();
 const mode=`${worker?'worker':'in-page'}-${disputed?'disputed':'admitted'}`,slot=`annual-${mode}`;await saveSlot(page,slot);
 await page.evaluate(async()=>{const{api}=await import('./lib/appState.js');await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2027,controlledTeamId:'MIA',mode:'play'}});await(await import('./lib/gameFlow.js')).loadState();});
 expect((await readClient(page,'/api/state')).controlledTeamId).toBe('MIA');
 await page.locator('[data-testid="tab-settings"]').click();await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
 await page.locator('#saveSlotInput').fill(slot);await page.locator('#loadBtn').click();await expect.poll(async()=>(await readClient(page,'/api/state')).controlledTeamId).toBe('BUF');
 await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=(await readClient(page,'/api/snapshot/export')).snapshot;
 for(const field of['admittedInjuryContinuations','admittedInjuryPayroll','preRolloverMedicalCalendar','offseasonMedicalCalendar','injurySalaryClaims','annualElevationInjuryResolutions','capLedger'])expect(restored.league[field]).toEqual(result.league[field]);
 const loaded=expandSnapshotIdentityMetadata(restored).league.players.find(row=>row.id===p.id);
 expect(loaded.profile).toEqual(person.profile);expect(loaded.injury).toEqual(person.injury);expect(loaded.elevationInjuryPay).toEqual(person.elevationInjuryPay);
 const manifest=JSON.parse(await fs.readFile('static/deploy-manifest.json','utf8'));
 await fs.mkdir('.cache/annual-admitted-client',{recursive:true});await fs.writeFile(`.cache/annual-admitted-client/${mode}.json`,JSON.stringify({worker,disputed,playerId:p.id,artifactDigest:manifest.artifactFingerprint.digest,actualAnnualCommand:true,namedSaveReplacementLoadReload:true,financialYear:2027,summerThroughWeek:0,sourceWeeks:person.elevationInjuryPay.payroll.map(row=>row.week),explicitDisputePreserved:disputed,automaticAdmission:!disputed},null,2)+'\n');
});
