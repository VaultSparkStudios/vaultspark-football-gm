import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { HAIRSTYLES, HAIR_COLORS, EYE_COLORS, playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { ensurePlayerVisualIdentity } from '../src/domain/playerVisualIdentity.js';
import { HAIR_STYLE_RULES } from '../public/lib/portraitAppearanceContract.js';

for (const renderer of ['legacy-svg', 'current-shared-head']) {
test(`${renderer}: supported grooming and pigmentation values have distinct rendered coverage`, async ({ page }) => {
  test.setTimeout(240000);
  const phase = process.env.IDENTITY_CAPTURE_PHASE || 'coverage-after';
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Ready', { timeout: 30000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const p = ensurePlayerVisualIdentity({ id: 'appearance-coverage', name: 'Controlled appearance', age: 24,
    heightInches: 74, weightLbs: 220, ratings: { strength: 80 }, profile: { faceSeed: 'appearance-coverage' } }, { newPlayer: true });
  const a = { ...playerAppearance(p), hairstyle: 'long', hairTexture: 'curly', facialHair: 'clean',
    hairColor: '#66472e', naturalHairColor: '#66472e', dyedHairColor: null, grayMix: 0,
    eyeColor: '#587496', complexion: .4, freckles: false, mole: null };
  const groups = [
    ['hairstyle', HAIRSTYLES], ['hairColor', HAIR_COLORS], ['eyeColor', EYE_COLORS],
    ['hairTexture', ['straight', 'wavy', 'curly', 'coily']],
    ['facialHair', ['clean', 'stubble', 'mustache', 'goatee', 'short-beard', 'full-beard']],
    ['complexion', [.05, .25, .45, .65, .85, .98]]
  ];
  const make = (key, value) => ({ ...p, name: `${key}: ${value}`, visualFrame: playerFrame(p),
    appearance: { ...a, [key]: value,
      ...(key === 'hairstyle' ? { hairTexture: HAIR_STYLE_RULES[value].textures[0] } : {}),
      ...(key === 'hairColor' ? { naturalHairColor: value } : {}) } });
  const render = players => page.evaluate(async ({players,renderer}) => {
    const { buildPlayerPortraitSvg,buildLegacyPlayerPortraitSvg } = await import('/lib/playerPortraitFace.js');
    let g = document.getElementById('appearanceCoverage');
    if (!g) { g = document.createElement('section'); g.id = 'appearanceCoverage'; document.body.replaceChildren(g); }
    g.style.cssText = 'display:grid;gap:12px;padding:16px;max-width:1100px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    g.replaceChildren();
    for (const [i, player] of players.entries()) {
      const card = document.createElement('article');
      const saved=JSON.stringify(player),projected={...player,appearance:{...player.appearance}};
      // Legacy categorical controls predate the continuous coordinate; decode that contract explicitly.
      if(renderer==='legacy-svg'){delete projected.appearance.hairTextureVersion;delete projected.appearance.hairTexturePosition;}
      else if(player.name.startsWith('hairTexture:'))projected.appearance.hairTexturePosition=['straight','wavy','curly','coily'].indexOf(player.appearance.hairTexture);
      const build=renderer==='legacy-svg'?buildLegacyPlayerPortraitSvg:buildPlayerPortraitSvg;
      card.innerHTML = build(projected, { headOnly: true, idSuffix: `-coverage-${i}` });
      if(renderer==='current-shared-head'&&(!card.querySelector('[data-head-renderer] image')||card.querySelectorAll('image').length!==1))throw Error('Current shared head missing');
      if(JSON.stringify(player)!==saved)throw Error('Saved fixture changed');
      card.querySelector('svg').style.cssText = 'display:block;width:100%;height:auto';
      const label = document.createElement('p'); label.textContent = player.name; card.append(label); g.append(card);
    }
  }, {players,renderer});
  await fs.mkdir('output/playwright', { recursive: true });
  const report = { renderer, kind: 'provisional-rendered-coverage', comparisons: [], captures: [] };
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [key, values] of groups) {
    const hashes = [];
    for (const value of values) {
      await render([make(key, value)]);
      await page.locator('#appearanceCoverage').evaluate(g => { g.style.width = '280px'; g.style.gridTemplateColumns = '1fr'; });
      const pixels = await page.locator('#appearanceCoverage svg').screenshot();
      hashes.push({ value, sha256: crypto.createHash('sha256').update(pixels).digest('hex') });
    }
    report.comparisons.push({ key, hashes });
    // PNG equality detects inert controls, but human inspection is still
    // required for readable colors, credible anatomy and distinct silhouettes.
    expect(new Set(hashes.map(h => h.sha256)).size, `${key}: duplicated rendered values`).toBe(values.length);
    for (let offset = 0; offset < values.length; offset += 6) {
      await render(values.slice(offset, offset + 6).map(value => make(key, value)));
      for (const [viewport, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.locator('#appearanceCoverage').evaluate((g, columns) => {
          g.style.width = 'auto'; g.style.gridTemplateColumns = `repeat(${columns},minmax(0,1fr))`;
        }, viewport === 'desktop' ? 3 : 2);
        for (const theme of ['dark', 'light']) {
          await page.evaluate(async t => (await import('/lib/themeCustomizer.js')).applyTheme(t), theme);
          const file = `output/playwright/s117-${phase}-${renderer}-${key}-${offset}-${viewport}-${theme}.png`;
          await page.locator('#appearanceCoverage').screenshot({ path: file });
          report.captures.push({ file, key, values: values.slice(offset, offset + 6), viewport, width, theme });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  await fs.writeFile(`output/playwright/s117-${phase}-${renderer}.json`, JSON.stringify(report, null, 2));
});

}
