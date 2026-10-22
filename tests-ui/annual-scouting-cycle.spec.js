import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('upcoming class is available for actual regular-season scouting without an open draft clock', async ({ page }) => {
  test.setTimeout(180000);
  const phase = process.env.ANNUAL_SCOUTING_PHASE || 'after';
  if (phase === 'before') await page.route('**/api/scouting?*', async route => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.scouting = { active: false, teamId: 'BUF', points: 0, locked: false, weeklyReports: [], prospects: [] };
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Ready');
  await page.evaluate(() => document.querySelectorAll('details').forEach(e => e.open = true));
  await page.fill('#seedInput', '117801');
  await page.selectOption('#teamSelect', 'BUF');
  await page.click('#createLeagueBtn');
  await page.waitForURL(/game\.html$/);
  await expect(page.locator('#statusChip')).toContainText('Ready', { timeout: 60000 });
  for (const id of ['#firstDebriefDecline', '#tutSkipBtn']) if (await page.locator(id).isVisible()) await page.locator(id).click();
  await page.click('[data-testid="tab-scouting"]');
  await page.click('#loadScoutingBtn');
  if (phase === 'after') {
    await expect(page.locator('#scoutingTable button[data-scout-player-id]').first()).toBeVisible();
    await page.locator('#scoutingTable button[data-scout-player-id]').first().click();
    await expect(page.locator('#scoutingReportTable')).toContainText('10');
    const draft = await page.request.get('/api/draft');
    expect((await draft.json()).draft).toBeNull();
  } else await expect(page.locator('#scoutingTable button[data-scout-player-id]')).toHaveCount(0);
  await fs.mkdir('output/playwright', { recursive: true });
  for (const [viewport, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    if (await page.locator('#mlFullViewBtn').isVisible()) await page.locator('#mlFullViewBtn').click();
    await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async t => (await import('/lib/themeCustomizer.js')).applyTheme(t), theme);
      await expect(page.locator('#toastStack .toast')).toHaveCount(0, { timeout: 10000 });
      if (await page.locator('#mlFullViewBtn').isVisible()) await page.locator('#mlFullViewBtn').click();
      await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
      await page.evaluate(() => document.querySelectorAll('#scoutingTab .table-wrap').forEach(e => e.scrollLeft = 0));
      await page.locator('#loadScoutingBtn').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `output/playwright/s117-annual-scouting-${phase}-${viewport}-${theme}.png` });
    }
  }
});
