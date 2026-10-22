import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { createPlayScenario, readDashboard } from './helpers/weekly-scenarios.js';

test('roster previews and declares a scheduled elevation with visible compensation and reversion', async ({ page }) => {
  test.setTimeout(180000);
  await createPlayScenario(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const id of ['#firstDebriefDecline', '#tutSkipBtn']) if (await page.locator(id).isVisible()) await page.locator(id).click();
  await page.click('[data-testid="tab-roster"]');
  await page.click('#loadRosterBtn');
  await expect(page.locator('#rosterTable tbody tr').first()).toBeVisible();
  await fs.mkdir('output/playwright', { recursive: true });
  const stage = process.env.ELEVATION_CAPTURE_STAGE || 'after';
  const captures = [];
  let mobileFullViewChosen = false;
  async function capture(state) {
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      if (size === 'mobile' && !mobileFullViewChosen) {
        await expect(page.locator('#mlFullViewBtn')).toBeVisible();
        await page.locator('#mlFullViewBtn').click();
        mobileFullViewChosen = true;
      }
      await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
      for (const theme of ['dark', 'light']) {
        await page.evaluate(async theme => (await import('/lib/themeCustomizer.js')).applyTheme(theme), theme);
        if (state === 'preview') await page.locator('#standardElevationCard').evaluate(el => el.scrollIntoView({ block: 'start' }));
        else if (state === 'pending') await page.locator('#rosterTable td').filter({ hasText: 'Elevated for' }).first().scrollIntoViewIfNeeded();
        else if (state === 'depth') await page.locator(size === 'mobile' ? '#depthTable' : '#depthStatusText').scrollIntoViewIfNeeded();
        else if (state === 'market') await page.locator(size === 'mobile' ? '#faTable' : '#faMarketBanner').scrollIntoViewIfNeeded();
        else await page.locator('#practiceRosterGuidance').scrollIntoViewIfNeeded();
        if (size === 'mobile' && ['depth', 'market'].includes(state)) {
          await page.locator(state === 'depth' ? '#depthTable' : '#faTable').evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 350));
        }
        const file = `output/playwright/elevation-${stage}-${state}-${size}-${theme}.png`;
        await page.screenshot({ path: file });
        captures.push({ file, state, size, theme, width, height });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await capture('roster');
  if (stage === 'before') {
    await fs.writeFile('output/playwright/elevation-before.json', JSON.stringify({ captures }, null, 2));
    return;
  }
  const button = page.locator('#rosterTable [data-act="elevate"]').first();
  const playerId = await button.getAttribute('data-id');
  await button.click();
  const card = page.locator('#standardElevationCard');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Additional cap charge');
  await expect(card).toContainText('Returns to practice after this game');
  await capture('preview');
  await page.click('#confirmStandardElevationBtn');
  await expect(card).toBeHidden();
  const row = page.locator('#rosterTable tr').filter({ has: page.locator(`[data-id="${playerId}"]`) });
  await expect(row).toContainText('Elevated for');
  await expect(row.locator('[data-act="release"]')).toBeDisabled();
  const roster = await (await page.request.get('/api/roster?team=BUF')).json();
  expect(roster.roster.find(player => player.id === playerId).standardElevation.pending).toBeTruthy();
  const saved = await (await page.request.get('/api/snapshot/export')).json();
  expect((await page.request.post('/api/snapshot/import', { data: { snapshot: saved.snapshot } })).ok()).toBe(true);
  await capture('pending');
  const state = await readDashboard(page), decision = state.gmDecisionQueue?.[0];
  const advanced = await page.request.post('/api/advance-week', { data: { count: 1, weeklyTacticOverride: 'run-heavy',
    ...(decision ? { gmDecisionChoice: { decisionId: decision.id, choiceId: decision.options[0].id, occurrenceKey: decision.occurrenceKey, week: state.currentWeek } } : {}) } });
  expect(advanced.ok(), await advanced.text()).toBe(true);
  const reverted = await (await page.request.get('/api/roster?team=BUF')).json();
  const player = reverted.roster.find(player => player.id === playerId);
  expect(player.rosterSlot).toBe('practice');
  expect(player.standardElevation.pending).toBeNull();
  expect(player.standardElevation.remainingRegular).toBe(2);
  await page.locator('#rosterTab [data-team-mode="depthTab"]').click();
  await page.click('#loadDepthBtn');
  await expect(page.locator('#depthTable th')).toHaveCount(12);
  await expect(page.locator('#depthTable .depth-share-input').first()).toBeVisible();
  await capture('depth');
  const pool = await (await page.request.get('/api/free-agents?limit=220')).json();
  if (!pool.freeAgents.length) {
    // Populate this otherwise empty generated market through a real release,
    // rather than inventing a free-agent DTO for the relocated renderer.
    const veteran = roster.roster.find(p => p.rosterSlot === 'active' && p.age >= 28);
    expect(veteran).toBeTruthy();
    const released = await page.request.post('/api/release', { data: { teamId: 'BUF', playerId: veteran.id } });
    expect(released.ok(), await released.text()).toBe(true);
  }
  await page.click('[data-testid="tab-fa"]');
  await page.click('#loadFaBtn');
  await expect(page.locator('#faTable [data-act]').first()).toBeVisible();
  await expect(page.locator('#faMarketBanner')).toContainText('Market stage:');
  await capture('market');
  await fs.writeFile('output/playwright/elevation-after.json', JSON.stringify({ playerId, captures }, null, 2));
});
