import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('generated relatives share saved family identity and show their relationship in the actual dossier',async({page})=>{
  test.setTimeout(180000);await createPlayScenario(page);
  for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
  const response=await page.request.post('/api/draft/prepare',{data:{}});expect(response.ok()).toBe(true);
  const draft=(await response.json()).draft,relative=draft.available.find(p=>p.profile?.familyRelationship);
  expect(relative).toBeTruthy();
  const relation=relative.profile.familyRelationship;
  const read=async id=>(await(await page.request.get('/api/player?playerId='+id)).json()).profile.player;
  const anchor=await read(relation.anchorId),child=await read(relative.id);
  expect(child.profile.family).toEqual(anchor.profile.family);
  expect(child.profile.identity.surveyCategory).toBe(anchor.profile.identity.surveyCategory);
  expect(child.profile.identity.heritage).toEqual(anchor.profile.identity.heritage);
  expect(Math.abs(child.appearance.complexion-anchor.appearance.complexion)).toBeLessThan(.14);
  expect(child.profile.appearanceRecipe.seed).not.toBe(anchor.profile.appearanceRecipe.seed);
  await page.emulateMedia({reducedMotion:'reduce'});await fs.mkdir('output/playwright',{recursive:true});
  for(const [size,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    if(size==='mobile'){await expect(page.locator('#mlFullViewBtn')).toBeVisible();await page.locator('#mlFullViewBtn').click();}
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      for(const [label,id]of [['relative',child.id],['anchor',anchor.id]]){
        await page.evaluate(async id=>(await import('/lib/appCore.js')).loadPlayerModal(id),id);
        await expect(page.locator('#playerModal')).toBeVisible();
        if(label==='relative')await expect(page.locator('#playerProfileSummary')).toContainText(`Family: ${relation.relation} of ${relation.anchorName}`);
        await page.locator('.player-portrait-card').scrollIntoViewIfNeeded();
        await page.screenshot({path:`output/playwright/s118-family-${size}-${theme}-${label}.png`});
        await page.locator('#closePlayerModalBtn').click();
      }
    }
  }
  await page.reload();await expect(page.locator('#statusChip')).toContainText('Ready');
  expect((await read(child.id)).profile.family).toEqual(child.profile.family);
});
