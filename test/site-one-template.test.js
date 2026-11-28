import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { inlinePublicEntry } from "../scripts/lib/inline-public-entry.mjs";
import { applyClaimBlocks, loadClaims } from "../scripts/lib/public-claims.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const read = (name) => fs.readFileSync(path.join(publicDir, name), "utf8");

// The landing page is the play surface and the app shell is the game; every
// other page is a site page and shares one frame.
const OWN_LAYOUT = new Set(["index.html", "game.html"]);
const sitePages = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html") && !OWN_LAYOUT.has(name));

test("every site page below the landing page uses the one shared frame", () => {
  // S133 folded How to Play, How It Compares, Roadmap and Beta into Guides, the FAQ and Updates,
  // and Press and Contact into About & Press.
  assert.ok(sitePages.length >= 11, `expected the full set of site pages, found ${sitePages.length}`);
  for (const name of sitePages) {
    const html = read(name);
    const mains = html.match(/<main\b[^>]*>/g) || [];
    assert.equal(mains.length, 1, `${name} has one <main>`);
    assert.match(mains[0], /class="site-page(?: [a-z-]+)*"/, `${name} is framed by .site-page, found ${mains[0]}`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${name} has exactly one h1`);
    assert.equal(/class="[^"]*\b(?:legal-wrap|legal-panel|setup-wrap)\b/.test(html), false, `${name} carries a retired layout class`);
  }
});

test("the frame's width variants exist in the site stylesheet and nowhere needs the retired ones", () => {
  const css = read("site.css");
  for (const selector of [".site-page {", ".site-page--reading {", ".site-page.sim-wrap {", ".site-page.community-atlas-wrap {"]) {
    assert.ok(css.includes(selector), `site.css defines ${selector}`);
  }
  const used = new Set(sitePages.flatMap((name) => [...read(name).match(/<main\b[^>]*>/)[0].matchAll(/site-page--[a-z-]+/g)].map((match) => match[0])));
  for (const modifier of used) assert.ok(css.includes(`.${modifier} {`), `site.css defines .${modifier}`);
});

test("the landing hero quotes the simulated decade from the generated file, not from retyped copy", () => {
  const claims = loadClaims(root);
  const showcase = JSON.parse(read("showcase-league.json"));
  assert.deepEqual(claims.showcase, showcase);
  const html = read("index.html");
  const block = html.match(/<!-- claims:hero-decade:start -->([\s\S]*?)<!-- claims:hero-decade:end -->/)?.[1] || "";
  for (const id of ["champions", "dynasty", "passing"]) {
    const card = showcase.cards.find((entry) => entry.id === id);
    assert.ok(card, `the showcase league has a ${id} card`);
    assert.ok(block.includes(`<dd>${card.value}</dd>`), `the hero shows the ${id} figure ${card.value}`);
  }
  assert.match(block, /not player data/, "the strip says the league is simulated");
  // Negative control: a changed figure in the generated file changes the page.
  const altered = { ...claims, showcase: { ...showcase, cards: showcase.cards.map((card) => card.id === "champions" ? { ...card, value: "31" } : card) } };
  assert.match(applyClaimBlocks(html, altered).html, /<dd>31<\/dd>/);
  assert.equal(applyClaimBlocks(html, { ...claims, showcase: undefined }).html.includes("hero-decade-stats"), false, "no generated file, no strip");
});

test("the hero image can ship as a preloaded file instead of being embedded in the page", () => {
  const themeBoot = read("lib/themeBoot.js");
  const styles = "body{color:red}\n", siteStyles = ".x{color:blue}\n";
  const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 10);
  const styleHref = `styles.${hash(styles)}.css`, siteStyleHref = `site.${hash(siteStyles)}.css`;
  const html = `<html><head><script src="./lib/themeBoot.js"></script><link rel="stylesheet" href="./${styleHref}" /><link rel="stylesheet" href="./${siteStyleHref}" /></head><body><img src="./images/screens/hero.jpg" alt="x" /></body></html>`;
  const heroJpeg = fs.readFileSync(path.join(publicDir, "images", "screens", "hero.jpg"));
  const fixture = { pageName: "index.html", html, themeBoot, styles, siteStyles, heroJpeg, styleHref, siteStyleHref };
  const preload = inlinePublicEntry({ ...fixture, heroMode: "preload" }).html;
  assert.doesNotMatch(preload, /data:image\/jpeg/, "the image is not embedded");
  assert.match(preload, /<img src="\.\/images\/screens\/hero\.jpg" alt="x" \/>/, "the image tag is untouched");
  assert.equal((preload.match(/<link rel="preload" as="image" href="\.\/images\/screens\/hero\.jpg" fetchpriority="high" \/>/g) || []).length, 1);
  assert.ok(preload.indexOf('rel="preload"') < preload.indexOf("</head>"), "the hint is in the head");
  assert.match(inlinePublicEntry(fixture).html, /src="data:image\/jpeg;base64,/, "the default is unchanged");
  assert.throws(() => inlinePublicEntry({ ...fixture, heroMode: "lazy" }), /heroMode/);
  assert.throws(() => inlinePublicEntry({ ...fixture, heroMode: "preload", html: html.replace("<img", "<img src=\"./images/screens/hero.jpg\" /><img") }), /exactly one target tag/);
});
