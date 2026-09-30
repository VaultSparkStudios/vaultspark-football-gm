import { expect } from "@playwright/test";

// Real generated schedule, not a patched dashboard or fabricated receipt.
// Both cases assert their branch before any action so engine drift fails loudly.
export const WEEKLY_SCENARIOS = Object.freeze([
  Object.freeze({ name: "scheduled game", seed: 20260306, teamId: "BUF", onBye: false }),
  Object.freeze({ name: "bye week", seed: 20260306, teamId: "CHI", onBye: true })
]);

export async function createPlayScenario(page, scenario = WEEKLY_SCENARIOS[0]) {
  await page.addInitScript(() => localStorage.setItem("vsfgm:runtime-mode", "server"));
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await expect(page.locator("#runtimeModeSelect")).toHaveValue("server");
  const settings = page.locator("details:has(#seedInput)");
  if (!(await settings.getAttribute("open"))) await settings.locator(":scope > summary").click();
  await page.fill("#seedInput", String(scenario.seed));
  await page.fill("#startYearInput", "2026");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", scenario.teamId);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 60_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
}

export async function readDashboard(page) {
  const response = await page.request.get("/api/state");
  expect(response.ok()).toBe(true);
  return response.json();
}
