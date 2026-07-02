import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("test-results/theme-shots");
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:4273";

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log("shot:", name);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem("franchise-architect-theme", t);
    document.documentElement.dataset.theme = t;
    document.body.dataset.theme = t;
  }, theme);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Setup screen
await page.goto(BASE + "/");
await page.waitForSelector("#setupStatus");
await page.waitForTimeout(1500);
for (const theme of ["dark", "light"]) {
  await setTheme(page, theme);
  await page.waitForTimeout(300);
  await shot(page, `setup-${theme}`);
}

// Create a league
await setTheme(page, "dark");
await page.click("#createLeagueBtn");
await page.waitForURL(/game\.html$/, { timeout: 90000 });
await page.waitForSelector("#statusChip");
await page.waitForTimeout(2500);
// dismiss tutorial
const skip = page.locator("#tutSkipBtn");
if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
await page.waitForTimeout(500);

const tabs = [
  ["overviewTab", "overview"],
  ["rosterTab", "roster"],
  ["contractsTab", "contracts"],
  ["scoutingTab", "scouting"],
  ["historyTab", "history"],
  ["statsTab", "stats"],
  ["settingsTab", "settings"]
];

for (const theme of ["dark", "light"]) {
  await setTheme(page, theme);
  await page.waitForTimeout(300);
  for (const [tabId, label] of tabs) {
    const btn = page.locator(`[data-tab="${tabId}"]`).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    await shot(page, `game-${label}-${theme}`);
  }
}

await browser.close();
console.log("DONE ->", OUT);
