// Renders one 1200x630 share card per site page into public/og/.
// Title = the page's <h1>, line = its og:description (or meta description),
// label = the release label in public/content/claims.json.
//
//   node scripts/generate-share-images.mjs            every page
//   node scripts/generate-share-images.mjs status faq   only the named pages
//
// The cards are committed, not built: the build only links public/og/<page>.png
// (see shareImageUrlFor in build-pages.mjs). Run this when a page is added or
// when its title, description or the release label changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseLabel = JSON.parse(fs.readFileSync(path.join(repo, "public", "content", "claims.json"), "utf8")).statusLabel;

const pub = path.join(repo, "public");
const outDir = path.join(pub, "og");
fs.mkdirSync(outDir, { recursive: true });
const b64 = (p) => fs.readFileSync(path.join(repo, p)).toString("base64");
const fontCss = `
@font-face{font-family:"Barlow";font-weight:400;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2")}) format("woff2")}
@font-face{font-family:"Barlow";font-weight:600;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2")}) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:700;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2")}) format("woff2")}`;
const mark = `data:image/svg+xml;base64,${b64("public/images/franchise-architect-mark.svg")}`;

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const overrides = {
  index: { title: "Build your dynasty" },
  "status-archive": { title: "Changelog", line: "Every dated change to Franchise Architect: Football, newest first." },
  simulation: { title: "How honest is this simulation?" }
};
const pages = ["index", "stats", "about", "contact", "privacy", "terms", "status", "status-archive", "simulation", "press", "features", "faq", "guides", "media"];
const only = process.argv.slice(2);
for (const slug of only) if (!pages.includes(slug)) throw new Error(`Unknown page "${slug}". Known: ${pages.join(", ")}`);
const cards = pages.filter((slug) => !only.length || only.includes(slug)).map((slug) => {
  const source = slug === "status-archive" ? "status" : slug;
  const html = fs.readFileSync(path.join(pub, `${source}.html`), "utf8");
  const g = (r) => decode((html.match(r) || [])[1] || "");
  const title = overrides[slug]?.title || g(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const line = overrides[slug]?.line || g(/og:description" content="([^"]*)/) || g(/name="description" content="([^"]*)/);
  return { slug, title, line };
});

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const template = ({ title, line }) => `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#090c0e;color:#f5f1e7;font-family:"Barlow",sans-serif;position:relative}
.stripe{position:absolute;left:0;top:0;bottom:0;width:14px;background:#d7a24a}
.field{position:absolute;right:0;top:0;bottom:0;width:372px;background:#0f1619;border-left:2px solid #2f4645}
.yard{position:absolute;left:0;right:0;height:2px;background:#213238}
.hash{position:absolute;width:18px;height:2px;background:#2f4645}
.bigmark{position:absolute;right:86px;top:215px;width:200px;height:200px}
.brand{position:absolute;left:78px;top:64px;display:flex;align-items:center;gap:18px}
.brand img{width:56px;height:56px}
.brand span{font:700 27px "Barlow Semi Condensed";letter-spacing:.14em;text-transform:uppercase;color:#46b69a}
.copy{position:absolute;left:78px;top:176px;width:700px}
h1{font:700 var(--size,88px)/1.02 "Barlow Semi Condensed";letter-spacing:.02em;text-transform:uppercase;color:#fff9ef;text-wrap:balance}
p{margin-top:26px;font:400 33px/1.32 "Barlow";color:#cdd8d3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.foot{position:absolute;left:78px;bottom:56px;display:flex;align-items:center;gap:22px;font:600 25px "Barlow"}
.chip{border:2px solid #d7a24a;color:#f4c97a;border-radius:8px;padding:5px 16px;text-transform:uppercase;letter-spacing:.08em;font-size:21px}
.url{color:#99a8a1}
</style></head><body>
<div class="field">${Array.from({ length: 6 }, (_, i) => `<div class="yard" style="top:${90 * (i + 1)}px"></div>`).join("")}${Array.from({ length: 27 }, (_, i) => `<div class="hash" style="top:${22.5 * (i + 1)}px;left:40px"></div><div class="hash" style="top:${22.5 * (i + 1)}px;right:40px"></div>`).join("")}</div>
<img class="bigmark" src="${mark}" alt="">
<div class="stripe"></div>
<div class="brand"><img src="${mark}" alt=""><span>Franchise Architect: Football</span></div>
<div class="copy"><h1>${esc(title)}</h1><p>${esc(line)}</p></div>
<div class="foot"><span class="chip">${esc(releaseLabel)}</span><span class="url">playfranchisearchitect.com</span></div>
</body></html>`;

const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const report = [];
for (const card of cards) {
  await page.setContent(template(card), { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Shrink the title until the title and line clear the footer.
    const h1 = document.querySelector("h1"), copy = document.querySelector(".copy");
    let size = 88;
    while (size > 52 && (copy.getBoundingClientRect().bottom > 505 || h1.scrollWidth > 700)) { size -= 4; h1.style.setProperty("--size", `${size}px`); }
  });
  const file = path.join(outDir, `${card.slug}.png`);
  await page.screenshot({ path: file, type: "png" });
  report.push(`${card.slug}.png ${fs.statSync(file).size} | ${card.title} | ${card.line.slice(0, 60)}`);
}
await browser.close();
console.log(report.join("\n"));
