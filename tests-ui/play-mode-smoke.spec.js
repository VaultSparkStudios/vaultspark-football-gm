import { test, expect } from "@playwright/test";

test("create league in play mode reaches the franchise screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.selectOption("#modeInput", "play");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 25_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 25_000 });
  await expect(page.locator("#yearCard")).toContainText("2026");
});
