import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('reserve controls show actual placement and return prerequisites in the roster workspace', async ({ page }) => {
  test.setTimeout(180000);
  const phase = process.env.RESERVE_CAPTURE_PHASE || 'after';
  const runtimeMode = process.env.RESERVE_RUNTIME_MODE || 'client';
  await page.addInitScript(runtimeMode => {
    localStorage.setItem('vsfgm:runtime-mode', runtimeMode);
    window.__reserveRequests = [];
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message.path === '/api/roster/designation') window.__reserveRequests.push(message.body);
      return send.call(this, message, ...rest);
    };
    const fetch = window.fetch;
    window.fetch = function(url, options, ...rest) {
      if (String(url).split('?')[0].endsWith('/api/roster/designation') && options?.body)
        window.__reserveRequests.push(JSON.parse(options.body));
      return fetch.call(this, url, options, ...rest);
    };
  }, runtimeMode);
  if (phase === 'before') {
    for (const [url, file] of [['**/game.html*', 'game.html'], ['**/app.js', 'app.js'], ['**/lib/tabRoster.js', 'tabRoster.js'], ['**/styles.css', 'styles.css']])
      await page.route(url, async route => route.fulfill({ status: 200, contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: (await fs.readFile(`.cache/reserve-lists-before/${file}`, 'utf8')).replace(/styles\.[a-f0-9]+\.css/g, 'styles.css') }));
  }
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Ready', { timeout: 30000 });
  await page.evaluate(() => document.querySelectorAll('details').forEach(e => e.open = true));
  await page.fill('#seedInput', '20260306');
  await page.selectOption('#teamSelect', 'BUF');
  await page.click('#createLeagueBtn');
  await expect(page).toHaveURL(/\/game\.html(?:\?resume=tab)?$/, { timeout: 90000 });
  await expect(page.locator('#statusChip')).toContainText('Ready', { timeout: 60000 });
  for (const id of ['#firstDebriefDecline', '#tutSkipBtn']) if (await page.locator(id).isVisible()) await page.locator(id).click();
  // Disclosed fixture: a recorded injury is imported, then all designation
  // commands use the real application API. This is not a generated GM injury.
  const playerId = await page.evaluate(async () => {
    const { api } = await import('/lib/appState.js');
    const { snapshot } = await api('/api/snapshot/export');
    const player = snapshot.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'active' && p.position === 'WR');
    player.injury = { type: 'review-fixture-injury', origin: 'football', weeksRemaining: 6, year: 2026, startedWeek: 1 };
    await api('/api/snapshot/import', { method: 'POST', body: { snapshot } });
    return player.id;
  });
  await page.evaluate(async () => { const { activateTab } = await import('/lib/gameFlow.js'); await activateTab('rosterTab'); });
  await page.click('#loadRosterBtn');
  await page.click(`[data-designation-select="${playerId}"]`);
  await page.selectOption('#designationType', 'ir');
  await fs.mkdir('output/playwright', { recursive: true });
  async function capture(state) {
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);
      if (await page.locator('#mlFullViewBtn').isVisible()) await page.locator('#mlFullViewBtn').click();
      await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
      for (const theme of ['dark', 'light']) {
        await page.evaluate(async theme => { const { applyTheme } = await import('/lib/themeCustomizer.js'); applyTheme(theme); }, theme);
        if (await page.locator('#mlFullViewBtn').isVisible()) await page.locator('#mlFullViewBtn').click();
        await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
        await page.evaluate(() => {
          const target = document.getElementById('designationSelectedPlayerText');
          const header = document.querySelector('header').getBoundingClientRect().height;
          window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - header - 14));
        });
        await expect(page.locator('#toastStack .toast')).toHaveCount(0);
        await page.screenshot({ path: `output/playwright/s117-reserve-${runtimeMode === 'server' ? 'server-' : ''}${phase}-${state}-${size}-${theme}.png` });
      }
    }
  }
  await capture('selected');
  if (phase === 'before') return;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#applyDesignationBtn');
  await expect(page.locator('#reserveDesignationGuidance')).toContainText('0 of 4');
  await expect(page.locator('#beginReservePracticeBtn')).toBeDisabled();
  await expect(page.locator('#clearDesignationBtn')).toBeDisabled();
  const placed = await page.evaluate(async playerId => {
    const { api } = await import('/lib/appState.js');
    const { snapshot } = await api('/api/snapshot/export');
    const p = snapshot.league.players.find(p => p.id === playerId);
    await api('/api/snapshot/import', { method: 'POST', body: { snapshot } });
    return { slot: p.rosterSlot, missed: p.reserveStatus.gamesMissed.length, injury: p.injury.weeksRemaining };
  }, playerId);
  expect(placed).toEqual({ slot: 'reserve', missed: 0, injury: 6 });
  await capture('placed');
  await page.evaluate(async playerId => {
    const { api } = await import('/lib/appState.js');
    for (let n = 0; n < 6; n++) {
      const { roster } = await api('/api/roster?team=BUF');
      if (roster.find(p => p.id === playerId).reserveStatus.gamesMissed >= 4) return;
      await api('/api/advance-week', { method: 'POST', body: { count: 1 } });
    }
    throw new Error('The fixture did not reach four actual team games.');
  }, playerId);
  await page.click('#loadRosterBtn');
  await expect(page.locator('#statusChip')).toContainText('Ready');
  await expect(page.locator('#beginReservePracticeBtn')).toBeEnabled();
  await page.click('#beginReservePracticeBtn');
  await expect(page.locator('#reserveDesignationGuidance')).toContainText('Practice window:');
  await capture('practice');
  await page.evaluate(async playerId => {
    const { api } = await import('/lib/appState.js');
    await api('/api/advance-week', { method: 'POST', body: { count: 2 } });
    const { roster } = await api('/api/roster?team=BUF');
    const replacement = roster.find(p => p.id !== playerId && p.pos === 'WR' && p.rosterSlot === 'active');
    await api('/api/release', { method: 'POST', body: { teamId: 'BUF', playerId: replacement.id } });
  }, playerId);
  await page.click('#loadRosterBtn');
  await expect(page.locator('#statusChip')).toContainText('Ready');
  await expect(page.locator('#clearDesignationBtn')).toBeEnabled();
  await page.click('#clearDesignationBtn');
  await expect(page.locator('#clearDesignationBtn')).toHaveText('Clear Designation');
  const activated = await page.evaluate(async playerId => {
    const { api } = await import('/lib/appState.js');
    const { snapshot } = await api('/api/snapshot/export');
    await api('/api/snapshot/import', { method: 'POST', body: { snapshot } });
    const p = snapshot.league.players.find(p => p.id === playerId);
    return { slot: p.rosterSlot, reserve: p.reserveStatus, history: p.reserveHistory.length, charges: snapshot.league.reserveReturnHistory.filter(r => r.playerId === playerId).length };
  }, playerId);
  expect(activated).toEqual({ slot: 'active', reserve: null, history: 1, charges: 1 });
  expect(await page.evaluate(() => window.__reserveRequests.map(body => ({ active: body.active, practice: body.beginPractice === true }))))
    .toEqual([{ active: true, practice: false }, { active: false, practice: true }, { active: false, practice: false }]);
  await capture('activated');
});
