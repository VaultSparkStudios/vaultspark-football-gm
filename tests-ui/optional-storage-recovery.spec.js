import { test, expect } from '@playwright/test';

for(const failure of ['read','quota'])test(`client game initializes despite optional journey storage ${failure}`,async({page})=>{
 await page.addInitScript(failure=>{
  const method=failure==='read'?'getItem':'setItem',original=Storage.prototype[method];
  Storage.prototype[method]=function(key,...args){if(this===sessionStorage&&key==='vsfgm:playtest-journey:v1')throw new DOMException('Optional journey storage failed',failure==='read'?'SecurityError':'QuotaExceededError');return original.call(this,key,...args);};
 },failure);
 await page.goto('/game.html?runtime=client');await expect(page.locator('#statusChip')).toHaveText('Ready',{timeout:30000});
 const result=await page.evaluate(async()=>{const m=await import('/lib/playtestJourney.js');m.recordPlaytestJourneyCheckpoint('weekly-plan-opened');m.recordPlaytestJourneyCheckpoint('weekly-plan-reviewed');return m.buildPlaytestJourneySummary();});
 expect(result.planningFriction.reviewed).toBe(true);expect(result.events.map(e=>e.name)).toContain('session-start');expect(result).not.toHaveProperty('startedAt');
});

test('client recovery remains fail closed while optional journey tolerates a denied getter',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}}));
 await page.goto('/game.html?runtime=client');
 await expect(page.getByRole('alert',{name:'Franchise recovery required'})).toBeVisible({timeout:30000});
 await expect(page.getByRole('alert')).toContainText('could not read its recovery checkpoint');
 const names=await page.evaluate(async()=>{const m=await import('/lib/playtestJourney.js');m.recordPlaytestJourneyCheckpoint('weekly-plan-opened');return m.loadPlaytestJourney().events.map(e=>e.name);});
 expect(names).toContain('weekly-plan-opened');await expect(page.locator('#statusChip')).not.toHaveText('Ready');
});

for(const closed of [false,true])test(`contract marks survive denied getter recovery in an ${closed?'ended':'open'} season`,async({page})=>{
 await page.goto('/game.html?runtime=client');await expect(page.locator('#statusChip')).toHaveText('Ready',{timeout:30000});
 await page.locator('#tutSkipBtn').click();
 const marks=await page.evaluate(async closed=>{
  const m=await import('/lib/firstSeasonContract.js');
  // Use the real component template with isolated IDs: suite-wide server state
  // and late app hydration must not supply a different season to this fixture.
  const panel=document.getElementById('firstSeasonContract').cloneNode(true),nodes={};
  for(const node of [panel,...panel.querySelectorAll('[id]')]){nodes[node.id]=node;node.id='storage-fixture-'+node.id;}
  const host=document.getElementById('overviewTab');host.hidden=false;host.style.display='block';host.prepend(panel);
  const d={franchiseId:`getter-recovery-${closed?'ended':'open'}`,controlledTeamId:'BUF',controlledTeam:{id:'BUF',owner:{expectation:{targetWins:9}}},currentYear:2026,currentWeek:closed?18:1,phase:closed?'season-awards':'regular-season',seasonsSimulated:0,cap:{capSpace:1000},latestStandings:[{teamId:'BUF',wins:0,losses:0}]};
  const render=()=>m.renderFirstSeasonContract({dashboard:d,documentRef:{getElementById:id=>nodes[id]}});
  m.markObjective(d,'depth-chart');const old=Object.getOwnPropertyDescriptor(window,'localStorage');
  try{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}});m.markObjective(d,'answer-the-phone');render();return m.readContractState(d).marks;}
  finally{Object.defineProperty(window,'localStorage',old);render();}
 },closed);
 expect(marks).toEqual({'depth-chart':true,'answer-the-phone':true});
 const fixture=page.locator('#storage-fixture-firstSeasonContract');
 await expect(fixture.locator('[data-objective="depth-chart"]')).toHaveAttribute('data-done','true');
 await expect(fixture.locator('[data-objective="answer-the-phone"]')).toHaveAttribute('data-done','true');
 await expect(fixture.locator('[data-objective="cap-compliant"]')).toHaveAttribute('data-done',String(closed));
 await expect(page.locator('#storage-fixture-firstSeasonContractProgress')).toHaveText(`${closed?3:2} of 5 · this tab only`);
});

test('optional player panels survive a denied localStorage getter',async({page})=>{
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const result=await page.evaluate(async()=>{
  const modules=await Promise.all(['returnDigest','firstSeasonContract','tutorialCampaign','appCore','contextualFeedback','playtestReceipts'].map(name=>import(`/lib/${name}.js`)));
  const previous=Object.getOwnPropertyDescriptor(window,'localStorage');
  try{
   Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}});
   const [returns,contract,tutorial,core,feedback,notes]=modules;
   return {visit:returns.readLastVisit(),written:returns.recordReturnBoundary(),marks:contract.readContractState().marks,tutorial:tutorial.getTutorialState(),trade:core.readTradeBlockIds(),cadence:feedback.loadContextualFeedbackLedger().lastPromptAt,notes:notes.loadLocalPlaytestReceipts()};
  }finally{Object.defineProperty(window,'localStorage',previous);}
 });
 expect(result).toEqual({visit:null,written:false,marks:{},tutorial:null,trade:[],cadence:0,notes:[]});
});

for(const action of ['skip','complete'])test(`tutorial ${action} works when persistence methods throw`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(async()=>{
  const {mountTutorial}=await import('/lib/tutorialCampaign.js');
  const storage={getItem(){throw new DOMException('Denied','SecurityError');},setItem(){throw new DOMException('Full','QuotaExceededError');},removeItem(){throw new DOMException('Denied','SecurityError');}};
  window.storageSkipCount=0;window.storageApplyCount=0;
  mountTutorial({scope:{franchiseId:'storage-browser',controlledTeamId:'BUF'},storage,onSkip:()=>window.storageSkipCount++,onComplete:async()=>{window.storageApplyCount++;return {effects:{identity:{label:'Balanced Attack',description:'Applied fixture receipt'}}};}});
 });
 if(action==='skip'){
  await page.locator('#tutSkipBtn').click();expect(await page.evaluate(()=>window.storageSkipCount)).toBe(1);
 }else{
  for(let step=0;step<3;step++){await page.locator('.tutorial-choice').first().click();await page.locator('#tutNextBtn').click();}
  await expect(page.locator('.tutorial-receipt')).toBeVisible();
  expect(await page.evaluate(()=>window.storageApplyCount)).toBe(1);
  await page.getByRole('button',{name:'Enter the Franchise',exact:true}).click();
 }
 await expect(page.locator('.tutorial-overlay')).toHaveCount(0);expect(errors).toEqual([]);
});

for(const mode of ['quota','missing'])test(`contextual feedback keeps drafts after ${mode} storage failure`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(async mode=>{
  const {maybeMountContextualFeedback}=await import('/lib/contextualFeedback.js');
  window.storageSavedCount=0;window.storageDenied=true;window.storageMap=new Map();
  const storage=mode==='missing'?null:{getItem:key=>window.storageMap.get(key)||null,setItem(key,value){if(window.storageDenied)throw new DOMException('Full','QuotaExceededError');window.storageMap.set(key,value);}};
  const host=document.getElementById('overviewTab');if(host){host.hidden=false;host.style.display='block';}
  maybeMountContextualFeedback({controlledTeamId:'BUF',seasonsSimulated:1,champions:[{year:2025}]},{storage,onSaved:()=>window.storageSavedCount++});
 },mode);
 await page.locator('[data-context-note]').fill('Draft stays available.');
 await page.locator('[data-context-action="save"]').click();
 await expect(page.locator('[data-context-error]')).toContainText('not saved');
 await expect(page.locator('[data-context-note]')).toHaveValue('Draft stays available.');
 expect(await page.evaluate(()=>window.storageSavedCount)).toBe(0);
 if(mode==='quota'){
  await page.evaluate(()=>{window.storageDenied=false;});await page.locator('[data-context-action="save"]').click();
  await expect(page.locator('#contextualEvidencePrompt')).toHaveCount(0);
  expect(await page.evaluate(()=>window.storageSavedCount)).toBe(1);
 }else{await page.locator('[data-context-action="dismiss"]').click();await expect(page.locator('#contextualEvidencePrompt')).toHaveCount(0);}
 expect(errors).toEqual([]);
});
