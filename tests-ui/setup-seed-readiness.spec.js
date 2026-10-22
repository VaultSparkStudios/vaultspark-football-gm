import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

async function installBaseline(page){
  for(const [url,file] of [['**/setup.js','setup.js'],['**/','index.html']])
    await page.route(url,async route=>route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':'text/javascript',
      body:(await fs.readFile(`.cache/setup-seed-before/${file}`,'utf8')).replace(/styles\.[a-f0-9]+\.css/g,'styles.css')
        .replace(/<meta name="vsfgm-runtime-default" content="[^"]*" \/>/,'<meta name="vsfgm-runtime-default" content="server" />')
        .replace(/<meta name="vsfgm-server-available" content="[^"]*" \/>/,'<meta name="vsfgm-server-available" content="true" />')}));
}

test('pending setup preserves entered seed and year and reports readiness honestly',async({page})=>{
  test.setTimeout(180000);
  const phase=process.env.SETUP_SEED_CAPTURE_PHASE || 'after';
  if(phase==='before')await installBaseline(page);
  await page.addInitScript(()=>localStorage.setItem('vsfgm:runtime-mode','server'));
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    for(const theme of ['dark','light']){
      let release,requested=false;
      const gate=new Promise(resolve=>release=resolve);
      const hold=async route=>{requested=true;await gate;await route.continue();};
      await page.route('**/api/setup/init?*',hold);
      await page.goto('/',{waitUntil:'domcontentloaded'});
      await expect.poll(()=>requested,{timeout:10000}).toBe(true);
      await page.evaluate(async theme=>{
        document.querySelectorAll('details').forEach(node=>node.open=true);
        (await import('/lib/themeCustomizer.js')).applyTheme(theme);
      },theme);
      await page.fill('#seedInput','20260417');await page.fill('#startYearInput','2027');
      if(phase==='after')await expect(page.locator('#setupStatus')).not.toContainText('Ready');
      else await expect(page.locator('#setupStatus')).toContainText('Ready');
      await expect(page.locator('#createLeagueBtn')).toBeDisabled();
      await page.locator('#setupStatus').scrollIntoViewIfNeeded();
      await page.screenshot({path:`output/playwright/s117-setup-seed-${phase}-${size}-${theme}-pending.png`});
      release();await expect(page.locator('#createLeagueBtn')).toBeEnabled({timeout:30000});
      await expect(page.locator('#setupStatus')).toContainText('Ready');
      if(phase==='after'){
        await expect(page.locator('#seedInput')).toHaveValue('20260417');
        await expect(page.locator('#startYearInput')).toHaveValue('2027');
      }else{
        await expect(page.locator('#seedInput')).not.toHaveValue('20260417');
        await expect(page.locator('#startYearInput')).not.toHaveValue('2027');
      }
      await page.locator('#seedInput').scrollIntoViewIfNeeded();
      await page.screenshot({path:`output/playwright/s117-setup-seed-${phase}-${size}-${theme}-ready.png`});
      await page.unroute('**/api/setup/init?*',hold);
    }
  }
  if(phase==='before')return;
  await page.selectOption('#teamSelect','BUF');
  const created=page.waitForRequest(request=>request.url().includes('/api/new-league')&&request.method()==='POST');
  await page.click('#createLeagueBtn');
  const body=(await created).postDataJSON();expect(body.seed).toBe(20260417);expect(body.startYear).toBe(2027);
  await expect(page).toHaveURL(/\/game\.html$/,{timeout:90000});
  await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  const dashboard=await page.evaluate(async()=>{const {api}=await import('/lib/appState.js');return api('/api/state');});
  expect(dashboard.currentYear).toBe(2027);
});

test('runtime retry and failure remain honest and allow browser recovery',async({page})=>{
  test.setTimeout(90000);
  const phase=process.env.SETUP_SEED_CAPTURE_PHASE || 'after';
  if(phase==='before')await installBaseline(page);
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
  await expect(page.locator('#runtimeModeSelect')).toBeEnabled();
  await page.evaluate(()=>document.querySelectorAll('details').forEach(node=>node.open=true));
  await page.selectOption('#teamSelect','BUF');
  await page.uncheck('#ownerModeInput');
  const choices = await page.locator('#difficultyPresetInput').evaluate(node=>[...node.options].map(option=>option.value));
  const difficulty = choices.at(-1);
  await page.selectOption('#difficultyPresetInput',difficulty);
  await page.route('**/api/setup/init?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Controlled setup outage'})}));
  await page.selectOption('#runtimeModeSelect','server');
  if(phase==='after'){
    await expect(page.locator('#createLeagueBtn')).toBeDisabled();
    await expect(page.locator('#applyChallengeCodeBtn')).toBeDisabled();
    await expect(page.locator('#teamSelect')).toBeDisabled();
  }
  if(phase==='after')await expect(page.locator('#setupStatus')).toContainText('Retrying',{timeout:15000});
  else await expect(page.locator('#activeLeagueText')).toContainText(/retrying/i,{timeout:15000});
  const capture=async state=>{
    await fs.mkdir('output/playwright',{recursive:true});
    for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
      await page.setViewportSize({width,height});
      for(const theme of ['dark','light']){
        await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
        await page.locator('#setupStatus').scrollIntoViewIfNeeded();
        await page.screenshot({path:`output/playwright/s117-setup-seed-${phase}-${size}-${theme}-${state}.png`});
      }
    }
  };
  await capture('retry');
  await expect(page.locator('#activeLeagueText')).toContainText('Could not reach the dev server',{timeout:20000});
  if(phase==='after'){
    await expect(page.locator('#setupStatus')).toContainText('unavailable');
    await expect(page.locator('#createLeagueBtn')).toBeDisabled();
    await expect(page.locator('#runtimeModeSelect')).toBeEnabled();
  }else await expect(page.locator('#setupStatus')).toContainText('Ready');
  await capture('failed');
  if(phase==='before')return;
  await page.selectOption('#runtimeModeSelect','client');
  await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:60000});
  await expect(page.locator('#createLeagueBtn')).toBeEnabled();
  await expect(page.locator('#teamSelect')).toHaveValue('BUF');
  await expect(page.locator('#difficultyPresetInput')).toHaveValue(difficulty);
  await expect(page.locator('#ownerModeInput')).not.toBeChecked();
});
