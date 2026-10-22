import {test,expect} from '@playwright/test';
import {expandSnapshotIdentityMetadata} from '../src/runtime/identityMetadataSnapshot.js';
import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';
import {setPlayerGrooming} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance} from '../src/domain/playerIdentity.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
test.beforeAll(async()=>{host=await startStaticClientHost();await fs.mkdir('output/playwright',{recursive:true});});
test.afterAll(async()=>{await host?.close();});
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} preserves independent facial pigment in actual dossier and rejects malformed imports`,async({page})=>{
 const s=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF',mode:'play'});
 const p=s.league.players.find(p=>p.teamId==='BUF'&&p.position==='LB');
 setPlayerGrooming(p,{facialHair:'full-beard',hairstyle:'swept',dyedHairColor:'#29201b',dyedFacialHairColor:'#a58a55',dyedBrowColor:'#80402d'});
 const expected=playerAppearance(p),originalProfile=structuredClone(p.profile);
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 const result=await page.evaluate(async snapshot=>{const{createApiClient}=await import('./lib/api/createApiClient.js');return createApiClient()('/api/snapshot/import',{method:'POST',body:{snapshot}});},s.toSnapshot());
 expect(result.ok).toBe(true);
 const check=async()=>{
  const snapshot=(await readClient(page,'/api/snapshot/export')).snapshot;
  const actual=expandSnapshotIdentityMetadata(snapshot).league.players.find(q=>q.id===p.id);expect(actual.profile).toEqual(originalProfile);
  const dto=(await readClient(page,`/api/player?playerId=${p.id}`)).profile.player;expect(dto.appearance).toEqual(expected);return snapshot;
 };
 await check();await saveSlot(page,'facial-pigment');await page.reload();await waitGameReady(page);await assertRuntime(page,worker);await check();
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${p.id}"]`).click();
 for(const selector of ['.player-physique','.player-physique-side','.player-movement'])await page.locator(`${selector} > summary`).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('.player-portrait-card [data-head-renderer]')).toHaveAttribute('data-head-renderer','shared-head-3d-v1');
 for(const selector of ['.player-physique-svg','.player-physique-side-svg','.player-motion-svg'])await expect(page.locator(selector)).toHaveAttribute('data-character-renderer','shared-3d');
 const pigmentProof=await page.evaluate(async id=>{
  const {api}=await import('./lib/appState.js'),person=(await api('/api/player?playerId='+id)).profile.player;
  const {createPlayerCharacterModel}=await import('./lib/playerCharacter3d.js'),{tryPlayerHeadImage}=await import('./lib/playerHeadImage.js');
  const model=createPlayerCharacterModel(person),colors={...model.colors};model.dispose();
  const actual=tryPlayerHeadImage(person)?.src,displayed=document.querySelector('.player-portrait-card .player-shared-head-image')?.getAttribute('href');
  // Verify each independent pigment reaches the real raster, rather than
  // querying SVG paths that the modern shared head deliberately replaces.
  const changed=['dyedHairColor','dyedBrowColor','dyedFacialHairColor'].map(key=>{
   const altered={...person,appearance:{...person.appearance,[key]:'#d450b0'}};
   const rendered=tryPlayerHeadImage(altered);return Boolean(rendered)&&rendered.src!==actual;
  });
  return{colors,actualDisplayed:Boolean(actual)&&actual===displayed,changed};
 },p.id);
 expect(pigmentProof.colors).toMatchObject({scalp:'#29201b',brow:'#80402d',beard:'#a58a55'});
 expect(pigmentProof.actualDisplayed).toBe(true);expect(pigmentProof.changed).toEqual([true,true,true]);
 if(worker)for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});if(size==='mobile')await page.locator('#mlFullViewBtn').click();
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('./lib/themeCustomizer.js')).applyTheme(t),theme);
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
   for(const[view,selector]of[['head','.player-portrait-card'],['side','.player-physique-side-svg'],['motion','.player-motion-svg']]){
    await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-facial-pigment-after-${size}-${theme}-${view}.png`});
   }
  }
 }
 const before=await check(),bad=structuredClone(before);bad.league.players.find(q=>q.id===p.id).profile.grooming.dyedBrowColor='" onload="bad';
 const refused=await page.evaluate(async snapshot=>{const{createApiClient}=await import('./lib/api/createApiClient.js');try{return await createApiClient()('/api/snapshot/import',{method:'POST',body:{snapshot}});}catch(e){return e.payload;}},bad);
 expect(refused.ok).toBe(false);expect(refused.reasonCode).toBe('SNAPSHOT_VISUAL_IDENTITY_INVALID');
 const after=await check();delete before.league.observability;delete after.league.observability;expect(after).toEqual(before);
});
