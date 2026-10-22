import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

test('actual OL dossier shows positional signature traits at desktop and mobile',async({page})=>{
 const phase=process.env.POSITION_TRAITS_PHASE||'after';
 if(phase==='before')await page.route('**/lib/playerProfileNarrative.js*',async route=>{
  const response=await route.fetch();
  const body=(await response.text()).replace('(!relevantRatings || relevantRatings.has(key)) && ','');
  await route.fulfill({response,body});
 });
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');
 await page.click('#createLeagueBtn');await page.waitForURL(/game\.html$/);
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const selector of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(selector).isVisible())await page.locator(selector).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');
 await expect(page.locator('#rosterTable button[data-player-id]').first()).toBeVisible();
 await page.locator('#rosterTable button[data-player-id]').first().click();
 await expect(page.locator('#playerModal')).not.toHaveClass(/hidden/);
 const bio=page.locator('.player-story-card--bio');
 await expect(bio).toContainText('pocket architect');
 if(phase!=='before'){
  await expect(bio.locator('.profile-signature-row')).not.toContainText(/Throw/i);
  await expect(bio.locator('.profile-signature-row')).toContainText('Pass Blocking');
 }
 await fs.mkdir('output/playwright',{recursive:true});await page.emulateMedia({reducedMotion:'reduce'});
 for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  await page.waitForTimeout(250);
  const full=page.locator('#mlFullViewBtn');if(await full.isVisible())await full.click();
  await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await bio.scrollIntoViewIfNeeded();
   await expect(bio).toBeInViewport();
   await bio.screenshot({path:`output/playwright/s117-position-traits-${phase}-${viewport}-${theme}-bio.png`});
   await page.screenshot({path:`output/playwright/s117-position-traits-${phase}-${viewport}-${theme}-viewport.png`});
  }
 }
});
