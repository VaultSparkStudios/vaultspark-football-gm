import {test,expect} from '@playwright/test';

async function ready(page){
 await page.goto('/game.html?runtime=client');
 await expect(page.locator('#statusChip')).toHaveText('Ready',{timeout:30000});
 const skip=page.locator('#tutSkipBtn');if(await skip.isVisible())await skip.click();
}

for(const failure of ['getter','read','quota'])test(`Full View remains usable after preference storage ${failure}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await ready(page);
 await page.evaluate(async failure=>{
  const m=await import('/lib/mobileLoop.js'),{state}=await import('/lib/appState.js');
  m.setMobileModeEnabled(true);m.syncMobileMode(state,()=>{});
  if(failure==='getter')Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}});
  else{const method=failure==='read'?'getItem':'setItem',original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(key==='vsfgm_mobile_loop')throw new DOMException('Denied','SecurityError');return original.call(this,key,...args);};}
 },failure);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('button',{name:'Full View',exact:true}).click();
 await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
 expect(await page.evaluate(async()=>{const m=await import('/lib/mobileLoop.js');const first=m.isMobileModeEnabled();m.setMobileModeEnabled(true);return {full:first,deck:m.isMobileModeEnabled(1440)};})).toEqual({full:false,deck:true});
 expect(errors).toEqual([]);
});

for(const corrupt of ['null','[]','"broken"'])test(`dashboard hydration survives optional prediction map ${corrupt}`,async({page})=>{
 await ready(page);
 const result=await page.evaluate(async corrupt=>{
  const {state}=await import('/lib/appState.js'),{applyDashboard}=await import('/lib/gameFlow.js'),p=await import('/lib/spreadPredictions.js');
  const prior=state.dashboard,year=prior.currentYear,week=1;
  const next={...prior,latestWeekResults:{year,week,games:[{awayTeamId:'NYJ',homeTeamId:'BUF',awayScore:10,homeScore:20,winnerId:'BUF'}]}};
  const prefix=`fa:predictions:${prior.franchiseId}:`;
  localStorage.setItem(prefix+`${year}-${week}`,corrupt);
  localStorage.setItem(prefix+'receipts','[null,42,{}]');
  applyDashboard(next);
  const hydrated=state.dashboard===next,discarded=p.getRecentPredictionReceipts(prior.franchiseId).length;
  const game={awayTeamId:'NYJ',homeTeamId:'BUF',played:false};
  p.submitPrediction(prior.franchiseId,year,week,game,{winnerId:'BUF',margin:10});
  const first=p.resolveDashboardPredictions(next),again=p.resolveDashboardPredictions(next);
  return {hydrated,discarded,graded:first.receipts.length,correct:first.receipts[0]?.winnerCorrect,repeated:again.receipts.length};
 },corrupt);
 expect(result).toEqual({hydrated:true,discarded:0,graded:1,correct:true,repeated:0});
 await expect(page.locator('#statusChip')).toHaveText('Ready');
});

test('Trophy Case keeps tab awards under quota and saves them after recovery',async({page})=>{
 await ready(page);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const first=await page.evaluate(async()=>{
  const trophies=await import('/lib/achievements.js');
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,...args){if(key==='fa:achievements:v1')throw new DOMException('Full','QuotaExceededError');return original.call(this,key,...args);};
  window.s126RestoreTrophyStorage=()=>{Storage.prototype.setItem=original;};
  const unlocked=trophies.recordAchievementEvent('draft-pick').unlocked.map(row=>row.id);
  trophies.renderTrophyCase();
  const repeated=trophies.recordAchievementEvent('draft-pick').unlocked.map(row=>row.id);
  return {unlocked,repeated,earned:Boolean(trophies.readEarnedAchievements()['first-pick'])};
 });
 expect(first).toEqual({unlocked:['first-pick'],repeated:[],earned:true});
 await expect(page.locator('#trophyCaseContent [data-trophy-id="first-pick"]')).toHaveClass(/trophy-earned/);
 await expect(page.locator('.trophy-case-summary')).toContainText('new trophies stay in this tab only');
 await expect(page.locator('#trophyCasePanel .narrative-panel-kicker')).not.toContainText('Permanent');
 const recovered=await page.evaluate(async()=>{
  window.s126RestoreTrophyStorage();delete window.s126RestoreTrophyStorage;
  const trophies=await import('/lib/achievements.js');trophies.renderTrophyCase();
  return {saved:Boolean(JSON.parse(localStorage.getItem('fa:achievements:v1'))?.['first-pick']),repeated:trophies.recordAchievementEvent('draft-pick').unlocked.length};
 });
 expect(recovered).toEqual({saved:true,repeated:0});
 await expect(page.locator('.trophy-case-summary')).toContainText('Saved across every franchise in this browser');
 await expect(page.locator('.trophy-case-summary')).not.toContainText('this tab only');
 expect(errors).toEqual([]);
});
