import { test, expect } from '@playwright/test';

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
