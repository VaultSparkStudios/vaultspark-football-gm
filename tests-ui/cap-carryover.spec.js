import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('contract board shows current funding separately from conditional carryover', async ({page}) => {
  test.setTimeout(150000);
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
  await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
  await page.fill('#seedInput','20260306');
  await page.selectOption('#teamSelect','BUF');
  await page.click('#createLeagueBtn');
  await expect(page).toHaveURL(/\/game\.html$/,{timeout:90000});
  await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  for (const selector of ['#firstDebriefDecline','#tutSkipBtn']) {
    const button=page.locator(selector); if(await button.isVisible()) await button.click();
  }
  const phase=process.env.CAP_CAPTURE_PHASE || 'after';
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    if(size==='mobile') await expect(page.locator('#mlFullViewBtn')).toBeVisible();
    if(await page.locator('#mlFullViewBtn').isVisible()) await page.locator('#mlFullViewBtn').click();
    await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
    await page.evaluate(async()=>{
      const {activateTab}=await import('/lib/gameFlow.js'); await activateTab('contractsTab');
    });
    await page.click('#loadContractsBtn');
    if(phase!=='before') {
      const loaded=await page.evaluate(async()=>{
        const {state}=await import('/lib/appState.js'); return state.contractCap;
      });
      expect(loaded.rolloverNextYearEstimate).toBe(Math.round(Math.max(0,loaded.capSpace)));
      expect(loaded.rolloverPolicy).toBe('full-unused-room-election-v1');
    }
    for(const theme of ['dark','light']) {
      await page.evaluate(async theme=>{
        const {applyTheme}=await import('/lib/themeCustomizer.js'); applyTheme(theme);
        const {state}=await import('/lib/appState.js');
        const {renderContractsPage}=await import('/lib/tabContracts.js');
        // Explicit visual fixture checks nonzero dead money and distinct funding/forecast.
        state.contractCap={...state.contractCap,usedCap:235000000,deadCap:7000000,capSpace:13000000,
          rolloverCurrentYear:5000000,rolloverNextYearEstimate:13000000,
          rolloverPolicy:'full-unused-room-election-v1',deadCapNextYear:3000000};
        renderContractsPage();
      },theme);
      if(phase!=='before') {
        await expect(page.locator('#contractsDeadCapCard')).toContainText('$7.0M');
        await expect(page.locator('#contractsCarryoverEstimate')).toContainText('$13.0M');
        await expect(page.locator('#contractsCarryoverEstimate')).toContainText('Estimate');
        await expect(page.locator('#contractsCarryoverEstimate')).toContainText('$5.0M');
      }
      await page.locator('#contractsSpotlight').scrollIntoViewIfNeeded();
      await page.screenshot({path:`output/playwright/s117-cap-${phase}-${size}-${theme}.png`});
      if(phase!=='before') {
        await page.locator('#contractsCarryoverEstimate').screenshot({path:`output/playwright/s117-cap-${phase}-${size}-${theme}-estimate.png`});
        await page.evaluate(async()=>{
          const {state}=await import('/lib/appState.js');
          const {renderContractsPage}=await import('/lib/tabContracts.js');
          state.contractCap={...state.contractCap,rolloverNextYearEstimate:6240000,rolloverPolicy:'legacy-fractional-carryover-v1'};
          renderContractsPage();
        });
        await expect(page.locator('#contractsCarryoverEstimate')).toContainText('$6.2M');
        await expect(page.locator('#contractsCarryoverEstimate')).toContainText('48%');
        await page.locator('#contractsCarryoverEstimate').screenshot({path:`output/playwright/s117-cap-${phase}-${size}-${theme}-legacy.png`});
      }
    }
  }
});
