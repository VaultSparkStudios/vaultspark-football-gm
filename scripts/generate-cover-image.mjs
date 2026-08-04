import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Renders the 1200x630 social share card (og:image / twitter:image) from the
// brand mark + palette. Deterministic layout; rerun when the brand changes.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outPath = path.join(rootDir, "public", "images", "cover.png");

const markSvg = await fs.readFile(path.join(rootDir, "public", "images", "franchise-architect-mark.svg"), "utf8");
const markDataUri = `data:image/svg+xml;base64,${Buffer.from(markSvg).toString("base64")}`;

const html = `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: linear-gradient(135deg, #0d0f14 0%, #1a1030 45%, #0d1a2e 100%);
    font-family: 'Segoe UI', 'Bahnschrift', system-ui, sans-serif;
    color: #e8ecf4; position: relative;
  }
  .glow { position: absolute; top: -220px; left: 50%; transform: translateX(-50%);
    width: 900px; height: 900px; border-radius: 50%;
    background: radial-gradient(circle, rgba(79,142,247,0.12) 0%, transparent 65%); }
  .field { position: absolute; bottom: 0; left: 0; right: 0; height: 190px;
    background: linear-gradient(180deg, transparent, rgba(61,186,126,0.10));
    border-top: 1px solid rgba(79,142,247,0.25); }
  .yard { position: absolute; bottom: 0; width: 2px; height: 190px; background: rgba(232,236,244,0.07); }
  .wrap { position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; z-index: 2; padding-bottom: 40px; }
  .mark { width: 130px; height: 130px; margin-bottom: 28px; }
  .kicker { font-size: 22px; letter-spacing: 9px; text-transform: uppercase; color: #4f8ef7; font-weight: 700; margin-bottom: 14px; }
  h1 { font-size: 76px; font-weight: 900; letter-spacing: -2px; line-height: 1.04; }
  h1 span { color: #4f8ef7; }
  .sub { margin-top: 20px; font-size: 27px; color: #aab3c7; font-weight: 600; }
  .badges { margin-top: 30px; display: flex; gap: 14px; }
  .badge { border: 1px solid rgba(79,142,247,0.45); background: rgba(79,142,247,0.12);
    color: #9dc0fb; border-radius: 24px; padding: 8px 22px; font-size: 20px; font-weight: 700; }
</style></head><body>
  <div class="glow"></div>
  <div class="field">${Array.from({ length: 13 }, (_, i) => `<div class="yard" style="left:${(i + 1) * 86}px"></div>`).join("")}</div>
  <div class="wrap">
    <img class="mark" src="${markDataUri}" alt="" />
    <div class="kicker">Franchise Architect</div>
    <h1>The Franchise Sim<br><span>That Remembers Everything</span></h1>
    <div class="sub">Deep NFL franchise management — in your browser</div>
    <div class="badges"><span class="badge">No Install</span><span class="badge">Free Open Beta</span><span class="badge">playfranchisearchitect.com</span></div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.screenshot({ path: outPath, type: "png" });
await browser.close();
const stat = await fs.stat(outPath);
console.log(`cover image written: ${path.relative(rootDir, outPath)} (${Math.round(stat.size / 1024)} KB)`);
