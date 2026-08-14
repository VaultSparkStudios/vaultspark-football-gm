import { test, expect } from "@playwright/test";

test("first-run Opening Contract mounts without visible layout shift", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__openingContractVitals = { cls: 0, shifts: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        globalThis.__openingContractVitals.cls += entry.value;
        globalThis.__openingContractVitals.shifts.push({ value: entry.value, scrollY: window.scrollY });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/game.html");
  await expect(page.getByRole("dialog", { name: "Who Are You Building?" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(750);

  const vitals = await page.evaluate(() => globalThis.__openingContractVitals);
  expect(vitals.cls, JSON.stringify(vitals.shifts)).toBeLessThan(0.1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
