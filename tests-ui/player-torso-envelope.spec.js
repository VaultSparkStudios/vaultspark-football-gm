import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
test('common-scale measured body comparisons preserve torso dimensions in all projections',async({page})=>{
 const base=ensurePlayerVisualIdentity({id:'torso-gallery',name:'Torso comparison',age:24,heightInches:74,weightLbs:225,ratings:{speed:85,acceleration:80,jumping:75,agility:75,strength:80},profile:{}},{newPlayer:true});
 const cases=[[74,190],[74,330],[68,225],[82,225],[86,140],[62,400]];
 const players=cases.map(([heightInches,weightLbs])=>{const p={...base,heightInches,weightLbs};return {...p,name:`${heightInches} in / ${weightLbs} lb`,appearance:playerAppearance(p),visualFrame:playerFrame(p)};});
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(async players=>{
  const {buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
  const gallery=document.createElement('main');gallery.id='torsoGallery';gallery.style.cssText='display:grid;gap:16px;padding:16px;max-width:1240px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  for(const[i,p]of players.entries()){
   const card=document.createElement('article');card.dataset.case=i;card.innerHTML=`<h3>${p.name}</h3><div style="display:flex">${buildPlayerPhysiqueSvg(p,{idSuffix:`-${i}`})}${buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:`-${i}`})}${buildPlayerMotionSvg(p,{mode:'run',phase:.37,idSuffix:`-${i}`})}</div>`;
   card.querySelectorAll('svg').forEach(s=>s.style.cssText='width:33.33%;height:auto;display:block;align-self:start');gallery.append(card);
  }document.body.replaceChildren(gallery);window.torsoPlayers=players;
 },players);
 for(let i=0;i<players.length;i++){
  const shapes=page.locator(`[data-case="${i}"] .player-torso-surface`);await expect(shapes).toHaveCount(3);
  const dims=await shapes.evaluateAll(rows=>rows.map(r=>({chest:r.dataset.chest,waist:r.dataset.waist,length:r.dataset.torsoLength,projection:r.dataset.projection})));
  expect(dims[1]).toEqual(dims[2]);expect(dims[0].length).toEqual(dims[1].length);
 }
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#torsoGallery').evaluate((g,columns)=>g.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`,size==='desktop'?2:1);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await page.locator('#torsoGallery').screenshot({path:`output/playwright/s117-torso-envelope-after-${size}-${theme}-gallery.png`});
  }
 }
 expect(await page.evaluate(()=>window.torsoPlayers)).toEqual(players);
});

for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} dossier keeps solved torso through actual save and restoration`,async({page})=>{
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 const snapshot=(await readClient(page,'/api/snapshot/export')).snapshot;
 const p=snapshot.league.players.find(p=>p.teamId==='BUF'&&p.position==='LB');
 const original=(await readClient(page,`/api/player?playerId=${p.id}`)).profile.player;
 const slot=`torso-envelope-${worker?'worker':'in-page'}`;await saveSlot(page,slot);
 await page.evaluate(async()=>{const{api}=await import('./lib/appState.js');await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2027,controlledTeamId:'MIA',mode:'play'}});await(await import('./lib/gameFlow.js')).loadState();});
 expect((await readClient(page,'/api/state')).controlledTeamId).toBe('MIA');
 await page.locator('[data-testid="tab-settings"]').click();await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
 await page.locator('#saveSlotInput').fill(slot);await page.locator('#loadBtn').click();await expect.poll(async()=>(await readClient(page,'/api/state')).controlledTeamId).toBe('BUF');
 await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=(await readClient(page,`/api/player?playerId=${p.id}`)).profile.player;
 expect(restored.visualFrame).toEqual(original.visualFrame);expect(restored.appearance).toEqual(original.appearance);
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${p.id}"]`).click();
 for(const selector of ['.player-physique','.player-physique-side','.player-movement'])await page.locator(`${selector} > summary`).click();
 await expect(page.locator('.player-training-collar')).toHaveCount(3);await expect(page.locator('.physique-section-light')).toHaveCount(6);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('[data-character-renderer="shared-3d"]')).toHaveCount(3);
 const rasterImages=()=>page.locator('[data-player-character3d]').evaluateAll(nodes=>nodes.map(c=>c.toDataURL()));
 const rendered=await rasterImages();expect(rendered).toHaveLength(3);expect(new Set(rendered).size).toBe(3);
 // Retain the SVG fallback's section contract separately from displayed pixels.
 const dimensions=async selector=>page.locator(`${selector} > .player-torso-surface`).evaluate(node=>({chest:node.dataset.chest,waist:node.dataset.waist,length:node.dataset.torsoLength,projection:node.dataset.projection}));
 const front=await dimensions('.physique-athlete'),side=await dimensions('.physique-side-athlete');
 expect(await dimensions('.motion-trunk')).toEqual(side);
 await page.locator('[data-motion-mode]').selectOption('cut');expect(await dimensions('.motion-trunk')).toEqual(front);
 await page.locator('[data-motion-mode]').selectOption('jump');expect(await dimensions('.motion-trunk')).toEqual(side);
 await expect.poll(async()=>(await rasterImages())[2]).not.toBe(rendered[2]);
 expect((await rasterImages()).slice(0,2)).toEqual(rendered.slice(0,2));
 const final=(await readClient(page,'/api/snapshot/export')).snapshot;
 expect(Number.isFinite(snapshot.rngSeed)).toBe(true);expect(final.rngSeed).toEqual(snapshot.rngSeed);expect(final.rngStreams).toEqual(snapshot.rngStreams);
 expect(final.league.players.find(q=>q.id===p.id)).toEqual(p);
 const manifest=JSON.parse(await fs.readFile('static/deploy-manifest.json','utf8'));
 await fs.mkdir('.cache/player-proximal-client',{recursive:true});await fs.writeFile(`.cache/player-proximal-client/${worker?'worker':'in-page'}.json`,JSON.stringify({worker,playerId:p.id,artifactDigest:manifest.artifactFingerprint.digest,namedSaveReplacementLoadReload:true,personRecipeAndMeasurementsExact:true,displayedCharacterViews:3,displayedMotionChanges:true,staticViewsStable:true,fallbackSectionDimensionsExact:true,fallbackCollars:3,fallbackSectionLights:6,rngExact:true},null,2)+'\n');
});
