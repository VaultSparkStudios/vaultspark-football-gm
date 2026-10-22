import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createPlayScenario,readDashboard,reachScenarioWeek,WEEKLY_SCENARIOS} from './helpers/weekly-scenarios.js';

for(const scenario of WEEKLY_SCENARIOS) test(`generated ${scenario.name} guidance remains visible in both themes and sizes`,async({page})=>{
  test.setTimeout(180000);
  await createPlayScenario(page,scenario);
  await expect(page.locator('#tutSkipBtn')).toBeVisible();
  await page.locator('#tutSkipBtn').click();
  await reachScenarioWeek(page,scenario);
  const state=await readDashboard(page);
  expect(state.controlledOnBye).toBe(scenario.onBye);
  await page.emulateMedia({reducedMotion:'reduce'});
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>window.innerWidth===document.documentElement.clientWidth);
    const mobileLoop=page.locator('#mobileLoopOverlay');
    if(viewport==='mobile') {
      await expect(mobileLoop).toBeVisible();
      await expect(mobileLoop).toContainText(scenario.onBye?'No game this week':/Next game/i);
    } else await expect(mobileLoop).toBeHidden();
    for(const theme of ['dark','light']) {
      await page.evaluate(async value=>(await import('/lib/themeCustomizer.js')).applyTheme(value),theme);
      await expect(page.locator('#yearCard')).toContainText(`/ W${state.currentWeek}`);
      await expect(page.locator('#advanceWeekBtn')).toBeVisible();
      await page.screenshot({path:`output/playwright/s117-bye-window-${scenario.onBye?'bye':'game'}-${viewport}-${theme}.png`});
    }
  }
});
