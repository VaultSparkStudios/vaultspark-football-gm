import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { playerAppearance, playerFrame } from "../src/domain/playerIdentity.js";
import { ensurePlayerVisualIdentity } from "../src/domain/playerVisualIdentity.js";
import { PORTRAIT_FEATURE_CASES } from "../test/fixtures/portrait-feature-cases.js";

for (const renderer of ['legacy-svg', 'current-shared-head']) {
test(`${renderer}: every new facial control is visibly rendered in controlled portrait pairs`, async ({ page }) => {
  test.setTimeout(180000);
  const phase = process.env.IDENTITY_CAPTURE_PHASE || "features-after";
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 30000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fs.mkdir("output/playwright", { recursive: true });
  const player = ensurePlayerVisualIdentity({ id: "feature-gallery", name: "Controlled face", age: 24,
    heightInches: 74, weightLbs: 220, ratings: { strength: 80 }, profile: { faceSeed: "feature-gallery" } }, { newPlayer: true });
  const appearance = { ...playerAppearance(player), hairstyle: "shaved", facialHair: "clean", complexion: .4, eyeColor: "#587496" };
  const base = { ...player, appearance, visualFrame: playerFrame(player) };
  const cases = [...PORTRAIT_FEATURE_CASES, ["hairTexture", "curly", "coily"], ["hairLength", .5, 2]];
  const rows = cases.map(([key, low, high]) => ({ key, players: [low, high].map(value => ({ ...base,
    name: `${key} · ${value}`, appearance: { ...appearance, [key]: value, ...(key.startsWith("hair") ? { hairstyle: "long" } : {}) } })) }));
  const render = async players => page.evaluate(async ({players,renderer}) => {
    const { buildPlayerPortraitSvg,buildLegacyPlayerPortraitSvg } = await import("/lib/playerPortraitFace.js");
    let gallery = document.getElementById("featureGallery");
    if (!gallery) {
      gallery = document.createElement("section");
      gallery.id = "featureGallery";
      gallery.style.cssText = "display:grid;gap:12px;padding:16px;max-width:1200px;margin:auto;background:var(--surface);color:var(--ink-strong)";
      document.body.replaceChildren(gallery);
    }
    gallery.replaceChildren();
    players.forEach((player, index) => {
      const card = document.createElement("article");
      const saved=JSON.stringify(player),projected={...player,appearance:{...player.appearance}};
      // Preserve the original categorical SVG contract and independently test its current continuous equivalent.
      if(renderer==='legacy-svg'){delete projected.appearance.hairTextureVersion;delete projected.appearance.hairTexturePosition;}
      else if(player.name.startsWith('hairTexture'))projected.appearance.hairTexturePosition=['straight','wavy','curly','coily'].indexOf(player.appearance.hairTexture);
      const build=renderer==='legacy-svg'?buildLegacyPlayerPortraitSvg:buildPlayerPortraitSvg;
      card.innerHTML = build(projected, { headOnly: true, idSuffix: `-case-${index}` });
      if(renderer==='current-shared-head'&&(!card.querySelector('[data-head-renderer] image')||card.querySelectorAll('image').length!==1))throw Error('Current shared head missing');
      if(JSON.stringify(player)!==saved)throw Error('Saved fixture changed');
      const svg = card.querySelector("svg");
      svg.style.cssText = "display:block;width:100%;height:auto;background:var(--surface)";
      const label = document.createElement("p");
      label.textContent = player.name;
      card.append(label); gallery.append(card);
    });
  }, {players,renderer});
  const pixelChecks = [];
  // Each pair is rasterized at the same exact screen coordinates, excluding
  // labels, to avoid detecting text changes or fractional grid placement.
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const row of rows) {
    const hashes = [];
    for (const player of row.players) {
      await render([player]);
      await page.locator("#featureGallery").evaluate(element => { element.style.width = "280px"; element.style.gridTemplateColumns = "1fr"; });
      const buffer = await page.locator("#featureGallery svg").screenshot();
      hashes.push(crypto.createHash("sha256").update(buffer).digest("hex"));
    }
    expect(hashes[0], `${row.key} has no rendered-pixel effect`).not.toBe(hashes[1]);
    pixelChecks.push({ key: row.key, hashes, sameCamera: true });
  }
  const captures = [];
  for (let group = 0; group < rows.length; group += 4) {
    const players = rows.slice(group, group + 4).flatMap(row => row.players);
    await render(players);
    for (const [viewport, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.locator("#featureGallery").evaluate((element, columns) => { element.style.width = "auto"; element.style.gridTemplateColumns = `repeat(${columns},minmax(0,1fr))`; }, viewport === "desktop" ? 4 : 2);
      for (const theme of ["dark", "light"]) {
        await page.evaluate(async theme => (await import("/lib/themeCustomizer.js")).applyTheme(theme), theme);
        const file = `output/playwright/s117-${phase}-${renderer}-${viewport}-facial-controls-${group / 4}-${theme}.png`;
        await page.locator("#featureGallery").screenshot({ path: file });
        captures.push({ file, viewport, width, theme, keys: rows.slice(group, group + 4).map(row => row.key) });
      }
    }
  }
  await fs.writeFile(`output/playwright/s117-${phase}-${renderer}-facial-controls.json`, JSON.stringify({ renderer, kind: "provisional-rendered-evidence", pixelChecks, captures }, null, 2));
});

}
