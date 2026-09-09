import { test, expect } from "@playwright/test";

for (const dismissWith of ["click", "Escape"]) {
  test(`optional check-in remains dismissible with denied storage: ${dismissWith}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#setupStatus")).toContainText("Ready");
    await page.evaluate(async () => {
      const module = await import("/lib/firstDebriefPulse.js");
      const dashboard = { franchiseId: "denied-storage", controlledTeamId: "BUF" };
      const storage = { getItem() { return null; }, setItem() { throw new DOMException("Storage quota exceeded", "QuotaExceededError"); } };
      window.pulseFixture = { module, dashboard, storage, focusTarget: document.getElementById("createLeagueBtn") };
      module.maybePromptFirstDebriefPulse(window.pulseFixture);
    });
    await expect(page.locator("#firstDebriefPulse")).toBeVisible();
    if (dismissWith === "click") await page.locator("#firstDebriefDecline").click();
    else await page.keyboard.press("Escape");
    await expect(page.locator("#firstDebriefPulse")).toHaveCount(0);
    await expect(page.locator("#createLeagueBtn")).toBeFocused();
    expect(await page.evaluate(() => window.pulseFixture.module.maybePromptFirstDebriefPulse(window.pulseFixture))).toBe(false);
    expect(errors).toEqual([]);
  });
}

for (const unavailable of ["write-denied", "missing"]) {
  test(`check-in never claims saved when storage is ${unavailable}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#setupStatus")).toContainText("Ready");
    await page.evaluate(async unavailable => {
      const { maybePromptFirstDebriefPulse } = await import("/lib/firstDebriefPulse.js");
      const storage = unavailable === "missing" ? null : { getItem() { return null; }, setItem() { throw new DOMException("Storage quota exceeded", "QuotaExceededError"); } };
      maybePromptFirstDebriefPulse({ dashboard: { franchiseId: "save-failure", controlledTeamId: "BUF" }, storage, focusTarget: document.getElementById("createLeagueBtn") });
    }, unavailable);
    for (const rating of ["clarity", "agency", "pace", "returnIntent"]) await page.selectOption(`[name="${rating}"]`, "3");
    await page.getByRole("button", { name: "Save private check-in" }).click();
    await expect(page.locator("#firstDebriefError")).not.toBeEmpty();
    await expect(page.locator("#firstDebriefSavedTitle")).toHaveCount(0);
    await page.locator("#firstDebriefDecline").click();
    await expect(page.locator("#firstDebriefPulse")).toHaveCount(0);
    await expect(page.locator("#createLeagueBtn")).toBeFocused();
  });
}
