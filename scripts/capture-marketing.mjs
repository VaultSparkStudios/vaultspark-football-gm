import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const OUT = path.resolve("test-results/theme-shots");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4273";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const p of ["landing.html", "index.html"]) {
  for (const theme of ["dark", "light"]) {
    await page.goto(`${BASE}/${p}`);
    await page.evaluate((t) => {
      localStorage.setItem("franchise-architect-theme", t);
      document.documentElement.dataset.theme = t;
      document.body && (document.body.dataset.theme = t);
    }, theme);
    await page.waitForTimeout(400);
    const name = `mkt-${p.replace(".html", "")}-${theme}`;
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log("shot:", name);
  }
}
await browser.close();
