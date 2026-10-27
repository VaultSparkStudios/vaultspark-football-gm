import { test, expect } from '@playwright/test';

for(const failure of ['getter','quota'])test(`game initializes and records planning despite session storage ${failure}`,async({page})=>{
 await page.addInitScript(failure=>{
  if(failure==='getter')Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}});
  else{const target=sessionStorage,original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===target)throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};}
 },failure);
 await page.goto('/game.html');await expect(page.locator('#statusChip')).toHaveText('Ready',{timeout:30000});
 const result=await page.evaluate(async()=>{const m=await import('/lib/playtestJourney.js');m.recordPlaytestJourneyCheckpoint('weekly-plan-opened');m.recordPlaytestJourneyCheckpoint('weekly-plan-reviewed');return m.buildPlaytestJourneySummary();});
 expect(result.planningFriction.reviewed).toBe(true);expect(result.events.map(e=>e.name)).toContain('session-start');expect(result).not.toHaveProperty('startedAt');
});

test('contract marks survive denied getter recovery in the rendered game',async({page})=>{
 await page.goto('/game.html');await expect(page.locator('#statusChip')).toHaveText('Ready',{timeout:30000});
 await page.locator('#tutSkipBtn').click();
 const marks=await page.evaluate(async()=>{
  const m=await import('/lib/firstSeasonContract.js'),{state}=await import('/lib/appState.js'),d=state.dashboard;
  m.markObjective(d,'depth-chart');const old=Object.getOwnPropertyDescriptor(window,'localStorage');
  try{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}});m.markObjective(d,'answer-the-phone');m.renderFirstSeasonContract({dashboard:d});return m.readContractState(d).marks;}
  finally{Object.defineProperty(window,'localStorage',old);m.renderFirstSeasonContract({dashboard:d});}
 });
 expect(marks).toEqual({'depth-chart':true,'answer-the-phone':true});await expect(page.locator('#firstSeasonContractProgress')).toContainText('2 of 5');await expect(page.locator('#firstSeasonContractProgress')).toContainText('this tab only');
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
