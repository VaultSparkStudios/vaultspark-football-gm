import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMomentCardSvg,
  relativeLuminance,
  inkColorFor
} from "../public/lib/momentCard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(__dirname, "..", "public", "lib");

const BASE_OPTIONS = Object.freeze({
  kind: "achievement",
  headline: "Ice in the Veins",
  subline: "Win a one-score game",
  stats: [
    { label: "Tier", value: "Bronze" },
    { label: "Earned", value: "1/2/2031" },
    { label: "Franchise", value: "BUF 2031" }
  ],
  teamCode: "BUF",
  teamName: "Buffalo",
  primary: "#00338d",
  secondary: "#c60c30",
  seasonLabel: "2031 Season",
  weekLabel: "Week 7"
});

test("buildMomentCardSvg is deterministic for identical input", () => {
  const first = buildMomentCardSvg(BASE_OPTIONS);
  const second = buildMomentCardSvg({ ...BASE_OPTIONS, stats: [...BASE_OPTIONS.stats] });
  assert.equal(first, second);
});

test("buildMomentCardSvg declares the 1200x630 share-image aspect", () => {
  const svg = buildMomentCardSvg(BASE_OPTIONS);
  assert.match(svg, /<svg[^>]*\bwidth="1200"/);
  assert.match(svg, /<svg[^>]*\bheight="630"/);
});

test("buildMomentCardSvg escapes headline, subline and stat text", () => {
  const svg = buildMomentCardSvg({
    ...BASE_OPTIONS,
    headline: '<script>alert("x")</script>',
    subline: "Tom & Jerry's \"rivalry\"",
    stats: [{ label: "<b>bold</b>", value: "5 & 6" }]
  });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /&amp;/);
  assert.match(svg, /&quot;|&#39;/);
});

test("buildMomentCardSvg caps stat tiles at three even when more are given", () => {
  const svg = buildMomentCardSvg({
    ...BASE_OPTIONS,
    stats: [
      { label: "One", value: "1" },
      { label: "Two", value: "2" },
      { label: "Three", value: "3" },
      { label: "Four", value: "4" },
      { label: "Five", value: "5" }
    ]
  });
  assert.match(svg, />One</);
  assert.match(svg, />Two</);
  assert.match(svg, />Three</);
  assert.doesNotMatch(svg, />Four</);
  assert.doesNotMatch(svg, />Five</);
});

test("challenge code appears when provided and is absent when not", () => {
  const withCode = buildMomentCardSvg({ ...BASE_OPTIONS, challengeCode: "VSFC1.abc123.wxyz" });
  const withoutCode = buildMomentCardSvg({ ...BASE_OPTIONS, challengeCode: "" });
  assert.match(withCode, /VSFC1\.abc123\.wxyz/);
  assert.doesNotMatch(withoutCode, /VSFC1/);
});

test("a light primary colour yields dark headline-band text via the luminance rule", () => {
  // Pure white: maximal luminance, must resolve to dark ink.
  assert.equal(inkColorFor("#ffffff"), "#0b0f14");
  // Pure black: minimal luminance, must resolve to light ink.
  assert.equal(inkColorFor("#000000"), "#f5f7fa");
  assert.ok(relativeLuminance("#ffffff") > relativeLuminance("#000000"));

  const lightCardSvg = buildMomentCardSvg({ ...BASE_OPTIONS, primary: "#ffffff" });
  const darkCardSvg = buildMomentCardSvg({ ...BASE_OPTIONS, primary: "#000000" });
  // The band-label fill colour is the first fill attribute after the primary
  // band rect; assert it flips between the two dark/light ink constants.
  assert.match(lightCardSvg, /fill="#0b0f14">BUF/);
  assert.match(darkCardSvg, /fill="#f5f7fa">BUF/);
});

test("an optional crestSvg is embedded verbatim as a nested svg group", () => {
  const svg = buildMomentCardSvg({ ...BASE_OPTIONS, crestSvg: '<svg viewBox="0 0 10 10"><circle r="5"/></svg>' });
  assert.match(svg, /<circle r="5"\/>/);
});

// ── Static-import boundary ───────────────────────────────────────────────────
// The four producer modules must reach momentCard.js only through a dynamic
// import, never a static one, so the boot graph does not grow for players
// who never share anything.

const PRODUCERS = [
  "achievements.js",
  "seasonEpilogue.js",
  "offseasonDevelopmentReport.js",
  "draftPickReveal.js"
];

test("no producer statically imports momentCard.js; each uses a dynamic import instead", () => {
  const staticImportRe = /import\s+(?:[^;]+?)\s+from\s+["']\.\/momentCard\.js["']/;
  const dynamicImportRe = /import\(\s*["']\.\/momentCard\.js["']\s*\)/;
  for (const file of PRODUCERS) {
    const source = fs.readFileSync(path.join(libDir, file), "utf8");
    assert.doesNotMatch(source, staticImportRe, `${file} must not statically import momentCard.js`);
    assert.match(source, dynamicImportRe, `${file} must dynamically import momentCard.js`);
  }
});
