import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { playerAppearance, playerFrame, HAIRSTYLES } from "../src/domain/playerIdentity.js";
import { ensurePlayerVisualIdentity, setPlayerGrooming } from "../src/domain/playerVisualIdentity.js";

test("player profile identity renders at desktop and mobile in both themes", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 30000 });
  await page.evaluate(() => document.querySelectorAll("details").forEach(element => { element.open = true; }));
  await page.fill("#seedInput", "20260306");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60000 });
  const decline = page.locator("#firstDebriefDecline");
  if (await decline.isVisible()) await decline.click();
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 10000 }).catch(() => false)) await skip.click();
  await page.click('[data-testid="tab-roster"]');
  await page.click("#loadRosterBtn");
  await expect(page.locator("#rosterTable button[data-player-id]").first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#rosterTable button[data-player-id]").first().click();
  await expect(page.locator("#playerModal")).not.toHaveClass(/hidden/);
  await expect(page.locator(".player-portrait-svg")).toBeVisible();
  await expect(page.locator('.player-portrait-svg')).toHaveAttribute('data-head-renderer','shared-head-3d-v1');
  await expect(page.locator('.player-portrait-card .player-shared-head-image')).toHaveAttribute('data-blink-pose','0');
  const currentPortrait=await page.evaluate(async()=>{
    const {api,state}=await import('/lib/appState.js');
    const player=(await api(`/api/player?playerId=${encodeURIComponent(state.activePlayerId)}&seasonType=regular`)).profile.player;
    const {tryPlayerHeadImage}=await import('/lib/playerHeadImage.js');
    const image=tryPlayerHeadImage(player);
    return Boolean(image)&&image.src===document.querySelector('.player-portrait-card .player-shared-head-image')?.getAttribute('href');
  });
  expect(currentPortrait).toBe(true);
  await fs.mkdir("output/playwright", { recursive: true });
  const phase = process.env.IDENTITY_CAPTURE_PHASE || "current";
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [label, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    // Resize dispatch is asynchronous; wait for the auto-mode to settle before
    // choosing Full View, otherwise the next resize handler can cover the modal.
    await page.waitForFunction(() => window.innerWidth === document.documentElement.clientWidth);
    if (label === "mobile") await expect(page.locator("#mlFullViewBtn")).toBeVisible();
    const fullView = page.locator("#mlFullViewBtn");
    if (await fullView.isVisible()) await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async value => {
        const { applyTheme } = await import("/lib/themeCustomizer.js");
        applyTheme(value);
      }, theme);
      await expect(page.locator(".player-portrait-svg")).toBeInViewport();
      await expect(page.locator(".player-portrait-svg")).toHaveAttribute("data-hairstyle", /.+/);
      await page.screenshot({ path: `output/playwright/s117-${phase}-${label}-player-profile-${theme}.png` });
      const physique = page.locator(".player-physique");
      await physique.locator(":scope > summary").click();
      await expect(physique.locator(".player-physique-svg")).toBeVisible();
      await expect(physique).toContainText("Arm length");
      await expect(physique).toContainText("estimated");
      await physique.scrollIntoViewIfNeeded();
      await physique.screenshot({ path: `output/playwright/s117-${phase}-${label}-player-physique-${theme}.png` });
      await expect(page.locator('#closePlayerModalBtn')).toBeInViewport();
      expect(await page.locator('.player-modal-header').evaluate(header => getComputedStyle(header).backgroundColor)).toMatch(/^rgb\(/);
      await page.screenshot({ path: `output/playwright/s117-${phase}-${label}-physique-navigation-${theme}.png` });
      const sideSummary = physique.locator('.player-physique-side > summary');
      expect(await sideSummary.evaluate(element => getComputedStyle(element, '::before').content)).toBe('"+"');
      await sideSummary.click();
      expect(await sideSummary.evaluate(element => getComputedStyle(element, '::before').content)).toBe('"−"');
      const side = physique.locator('.player-physique-side-svg');
      await side.scrollIntoViewIfNeeded();
      await expect(side).toBeVisible();
      await expect(side).toHaveAttribute('data-height', await physique.locator('.player-physique-svg').getAttribute('data-height'));
      await expect(side).toHaveAttribute('data-weight', await physique.locator('.player-physique-svg').getAttribute('data-weight'));
      await side.screenshot({ path: `output/playwright/s117-${phase}-${label}-physique-side-${theme}.png` });
      await page.screenshot({ path: `output/playwright/s117-${phase}-${label}-physique-side-navigation-${theme}.png` });
      await expect(page.locator('#closePlayerModalBtn')).toBeInViewport();
      await physique.locator('.player-physique-side summary').click();
      await physique.locator(":scope > summary").click();
      await page.locator(".player-portrait-svg").first().scrollIntoViewIfNeeded();
      await expect(page.locator("#closePlayerModalBtn")).toBeVisible();
    }
  }
  await page.evaluate(async () => {
    const { api, state } = await import("/lib/appState.js");
    const { renderPlayerProfileHero } = await import("/lib/appCore.js");
    const { profile } = await api(`/api/player?playerId=${encodeURIComponent(state.activePlayerId)}&seasonType=regular`);
    // A labeled visual fixture checks the new state without claiming to have
    // played a full injured season in this focused portrait test.
    profile.player.potentialRevision = { year: 2026, before: 94, after: 90, change: -4,
      reasons: ["Injury setbacks reduced the projected ceiling by 3.", "Below-peer production over a meaningful workload reduced the projected ceiling by 1."] };
    document.getElementById("playerProfileSummary").innerHTML = renderPlayerProfileHero(profile);
  });
  for (const [label, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    // Full View chosen above persists on later resizes; its deck button is
    // correctly absent when the deck is already dismissed.
    const fullView = page.locator("#mlFullViewBtn");
    if (await fullView.isVisible()) await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async value => (await import("/lib/themeCustomizer.js")).applyTheme(value), theme);
      const revision = page.locator(".player-potential-revision");
      await expect(revision).toContainText("94 → 90 (-4)");
      await expect(revision).toContainText("Injury setbacks");
      await revision.scrollIntoViewIfNeeded();
      await page.locator(".player-meta-grid").screenshot({ path: `output/playwright/s117-${phase}-${label}-development-fixture-${theme}.png` });
    }
  }
  await page.click("#closePlayerModalBtn");
  // The report UI must show ceiling-only movers and their actual reasons.
  await page.evaluate(async () => {
    const { developmentReportRows } = await import("/lib/offseasonDevelopmentReport.js");
    const report = { ceilingChanges: [{ playerId: "ceiling-only", name: "Held overall", position: "WR", age: 24, before: 70, after: 70, change: 0, potential: 82, potentialRevision: { before: 85, after: 82, change: -3, reasons: ["Injury setbacks reduced the projected ceiling by 3."] } }] };
    const rows = developmentReportRows(report);
    if (rows.length !== 1 || rows[0].ceiling !== "85 → 82" || !rows[0].reason.includes("Injury setbacks")) throw new Error("Ceiling-only revision missing from the development report");
  });
  const fixtures = HAIRSTYLES.map((hairstyle, index) => {
    const player = ensurePlayerVisualIdentity({ id: `gallery-${index}`, name: `${hairstyle} · ${index % 2 ? "heavy frame" : "lean frame"}`, age: index % 3 === 0 ? 42 : 23, jerseyNumber: index + 10, heightInches: index % 2 ? 80 : 70, weightLbs: index % 2 ? 340 : 190, ratings: { strength: index % 2 ? 94 : 70, speed: index % 2 ? 58 : 94 } }, { newPlayer: true });
    setPlayerGrooming(player, { hairstyle });
    player.appearance = { ...playerAppearance(player), complexion: index / (HAIRSTYLES.length - 1) };
    player.visualFrame = playerFrame(player);
    return player;
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async players => {
    // This controlled gallery exercises the retained SVG fallback component.
    const { buildLegacyPlayerPortraitSvg: buildPlayerPortraitSvg } = await import("/lib/playerPortraitFace.js");
    const gallery = document.createElement("section");
    gallery.id = "portraitGallery";
    gallery.style.cssText = "position:relative;z-index:2000;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px;background:var(--surface);color:var(--ink-strong);max-width:1000px;margin:auto";
    for (const player of players) {
      const card = document.createElement("article");
      card.innerHTML = buildPlayerPortraitSvg(player);
      const label = document.createElement("p");
      label.textContent = `${player.name} · ${player.heightInches} in / ${player.weightLbs} lb · age ${player.age}`;
      card.append(label);
      gallery.append(card);
    }
    document.body.prepend(gallery);
    gallery.scrollIntoView();
  }, fixtures);
  for (const theme of ["dark", "light"]) {
    await page.evaluate(async value => (await import("/lib/themeCustomizer.js")).applyTheme(value), theme);
    await expect(page.locator("#portraitGallery svg")).toHaveCount(HAIRSTYLES.length);
    await expect(page.locator('#portraitGallery [data-hairstyle="shaved"] .portrait-scalp-hair path')).toHaveCount(0);
    await page.locator("#portraitGallery").screenshot({ path: `output/playwright/s117-${phase}-desktop-portrait-gallery-${theme}.png` });
  }
  const bodyFixtures = [
    ["Same height · lighter", 74, 190, 70, 31],
    ["Same height · heavier", 74, 330, 70, 31],
    ["Same weight · taller", 82, 190, 70, 31],
    ["Same build · stronger", 74, 190, 98, 31],
    ["Same build · longer arms", 74, 190, 70, 36],
    ["Same build · faster", 74, 190, 70, 31, 99],
    ["Short · heavy", 62, 400, 98, 27],
    ["Tall · light", 86, 140, 70, 36]
  ].map(([name, heightInches, weightLbs, strength, armLengthInches, speed = 80]) => {
    const player = { id: "physique-comparison", name, age: 24, heightInches, weightLbs, armLengthInches, jerseyNumber: 17, ratings: { strength, speed } };
    return { ...player, appearance: playerAppearance(player), visualFrame: playerFrame(player) };
  });
  await page.evaluate(async players => {
    const { buildPlayerPhysiqueSvg } = await import("/lib/playerPortrait.js");
    const gallery = document.createElement("section");
    gallery.id = "physiqueGallery";
    gallery.style.cssText = "display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:24px;background:var(--surface);color:var(--ink-strong);max-width:1250px;margin:auto;position:relative;z-index:2000";
    players.forEach((player, index) => {
      const card = document.createElement("article");
      card.innerHTML = buildPlayerPhysiqueSvg(player, { idSuffix: `body-comparison-${index}` });
      const label = document.createElement("p");
      label.textContent = `${player.name}: ${player.heightInches}″ / ${player.weightLbs} lb / strength ${player.ratings.strength} / arm ${player.armLengthInches}″`;
      card.append(label); gallery.append(card);
    });
    document.body.prepend(gallery);
  }, bodyFixtures);
  for (const [label, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator("#physiqueGallery").evaluate((element, mobile) => {
      element.style.gridTemplateColumns = mobile ? "repeat(2,1fr)" : "repeat(4,1fr)";
      element.style.padding = mobile ? "8px" : "24px";
      element.style.gap = mobile ? "8px" : "12px";
    }, label === "mobile");
    for (const theme of ["dark", "light"]) {
    await page.evaluate(async value => (await import("/lib/themeCustomizer.js")).applyTheme(value), theme);
    await expect(page.locator("#physiqueGallery .player-physique-svg")).toHaveCount(8);
    expect(await page.locator("#physiqueGallery").evaluate(element => {
      const ids = [...element.querySelectorAll("[id]")].map(node => node.id);
      return new Set(ids).size === ids.length;
    })).toBe(true);
    await expect(page.locator("#physiqueGallery .physique-athlete").first()).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator("#physiqueGallery article").first().screenshot({ path: `output/playwright/s117-${phase}-${label}-physique-single-${theme}.png` });
    await page.locator("#physiqueGallery").screenshot({ path: `output/playwright/s117-${phase}-${label}-physique-comparisons-${theme}.png` });
    }
  }
  await page.evaluate(async players => {
    const { buildPlayerPhysiqueSvg } = await import('/lib/playerPortrait.js');
    const cards = document.querySelectorAll('#physiqueGallery article');
    players.forEach((player, index) => {
      cards[index].querySelector('svg').outerHTML = buildPlayerPhysiqueSvg(player, { view: 'side', idSuffix: `-side-comparison-${index}` });
    });
  }, bodyFixtures);
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#physiqueGallery').evaluate((element, mobile) => {
      element.style.gridTemplateColumns = mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)';
    }, label === 'mobile');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async value => (await import('/lib/themeCustomizer.js')).applyTheme(value), theme);
      await expect(page.locator('#physiqueGallery .player-physique-side-svg')).toHaveCount(8);
      await page.locator('#physiqueGallery').screenshot({ path: `output/playwright/s117-${phase}-${label}-physique-side-comparisons-${theme}.png` });
    }
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const normalAnimation = await page.locator("#portraitGallery .portrait-athlete").first().evaluate(element => getComputedStyle(element).animationName);
  expect(normalAnimation).toBe("portrait-breathe");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const animation = await page.locator("#portraitGallery .portrait-eye").first().evaluate(element => getComputedStyle(element).animationName);
  expect(animation).toBe("none");
  // Controlled rendering fixtures cover the persistence layer's grooming
  // projection; they do not imply a released grooming editor exists.
  const natural = ensurePlayerVisualIdentity({ id: "lifetime-grooming", name: "Natural hair", age: 24,
    heightInches: 74, weightLbs: 220, ratings: { strength: 80 }, profile: { faceSeed: "lifetime-grooming" } }, { newPlayer: true });
  setPlayerGrooming(natural, { hairstyle: "long", hairDensity: 1, dyedHairColor: null });
  const dyed = structuredClone(natural), zero = structuredClone(natural);
  dyed.name = "Same face · dyed";
  zero.name = "Same face · zero density";
  setPlayerGrooming(dyed, { dyedHairColor: "#8844aa" });
  setPlayerGrooming(zero, { hairDensity: 0 });
  const groomingFixtures = [natural, dyed, zero].map(player => ({ ...player,
    appearance: playerAppearance(player), visualFrame: playerFrame(player) }));
  await page.evaluate(async players => {
    // This controlled gallery exercises the retained SVG fallback component.
    const { buildLegacyPlayerPortraitSvg: buildPlayerPortraitSvg } = await import("/lib/playerPortraitFace.js");
    const gallery = document.createElement("section");
    gallery.id = "groomingPersistenceGallery";
    gallery.style.cssText = "display:grid;gap:12px;padding:20px;background:var(--surface);color:var(--ink-strong);max-width:1000px;margin:auto;position:relative;z-index:2000";
    for (const player of players) {
      const card = document.createElement("article");
      card.innerHTML = buildPlayerPortraitSvg(player, { headOnly: true, idSuffix: `-${players.indexOf(player)}` });
      const label = document.createElement("p");
      label.textContent = player.name;
      card.append(label); gallery.append(card);
    }
    document.body.prepend(gallery);
  }, groomingFixtures);
  await expect(page.locator("#groomingPersistenceGallery .portrait-scalp-hair").nth(2)).toHaveAttribute("opacity", "0");
  for (const [label, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator("#groomingPersistenceGallery").evaluate((element, columns) => {
      element.style.gridTemplateColumns = `repeat(${columns},minmax(0,1fr))`;
    }, label === "desktop" ? 3 : 1);
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async value => (await import("/lib/themeCustomizer.js")).applyTheme(value), theme);
      await page.locator("#groomingPersistenceGallery").screenshot({ path: `output/playwright/s117-${phase}-${label}-grooming-persistence-${theme}.png` });
    }
  }
});
