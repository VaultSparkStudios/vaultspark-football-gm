import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const OUT = path.resolve("test-results/theme-shots");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4273";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(BASE + "/");
await page.waitForSelector("#setupThemeToggleBtn");
await page.waitForTimeout(800);

// Open the customizer panel
await page.click("#setupThemeToggleBtn");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "customizer-open-dark.png") });
console.log("shot: customizer-open-dark");

// Pick emerald accent
await page.click('.theme-cx-accent[data-accent="emerald"]');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "customizer-emerald-dark.png") });
console.log("shot: customizer-emerald-dark");

// Switch to Light mode
await page.click('.theme-cx-mode[data-mode="light"]');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "customizer-emerald-light.png") });
console.log("shot: customizer-emerald-light");

// Read applied state
const applied = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  accent: document.documentElement.dataset.accent,
  accentVar: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
}));
console.log("APPLIED:", JSON.stringify(applied));

await browser.close();
