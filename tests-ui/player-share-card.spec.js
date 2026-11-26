import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

// S133: the dossier's "Download player card" builds a 1200x630 PNG in the page,
// with the game-kit silhouette drawn on the left and the scout numbers beside it.
test("the player card downloads as a PNG with the silhouette and numbers drawn", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/"); await expect(page.locator("#setupStatus")).toContainText("Ready");
  await page.evaluate(() => document.querySelectorAll("details").forEach((e) => { e.open = true; }));
  await page.fill("#seedInput", "20260306"); await page.selectOption("#teamSelect", "BUF"); await page.click("#createLeagueBtn"); await page.waitForURL(/game\.html$/);
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60000 });
  for (const id of ["#firstDebriefDecline", "#tutSkipBtn"]) if (await page.locator(id).isVisible()) await page.locator(id).click();
  await page.click('[data-testid="tab-roster"]'); await page.click("#loadRosterBtn"); await page.locator("#rosterTable button[data-player-id]").first().click();
  const button = page.locator("[data-player-card]").first();
  await expect(button).toBeVisible({ timeout: 20000 });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^franchise-architect-[a-z0-9-]+\.png$/);
  const bytes = await fs.readFile(await download.path());
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  // Decode it back in the page and check both halves carry drawing, not just the gradient.
  const ink = await page.evaluate(async (b64) => {
    const image = new Image(); image.src = `data:image/png;base64,${b64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const variety = (x, y, w, h) => { const d = ctx.getImageData(x, y, w, h).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 7) seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`); return seen.size; };
    return { width: image.width, height: image.height, silhouette: variety(80, 60, 300, 520), text: variety(420, 40, 700, 180) };
  }, bytes.toString("base64"));
  expect(ink.width).toBe(1200); expect(ink.height).toBe(630);
  expect(ink.silhouette).toBeGreaterThan(40);
  expect(ink.text).toBeGreaterThan(20);
});
