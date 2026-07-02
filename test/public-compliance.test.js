import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const requiredFiles = [
  "../public/contact.html",
  "../public/privacy.html",
  "../public/terms.html",
  "../public/agents.json",
  "../public/.well-known/llms.txt",
  "../public/sitemap.xml"
];

test("public Pages bundle has contact, legal, sitemap, and agent metadata sources", () => {
  for (const file of requiredFiles) {
    const url = new URL(file, import.meta.url);
    assert.equal(fs.existsSync(url), true, `${file} exists`);
  }

  const agents = JSON.parse(fs.readFileSync(new URL("../public/agents.json", import.meta.url), "utf8"));
  assert.equal(agents.rights, "Proprietary - All Rights Reserved");
  assert.equal(agents.contact, "football@playfranchisearchitect.com");
  assert.ok(agents.entrypoints.some((entry) => entry.label === "Privacy"));

  const llms = fs.readFileSync(new URL("../public/.well-known/llms.txt", import.meta.url), "utf8");
  assert.match(llms, /Proprietary - All Rights Reserved/);
  assert.match(llms, /football@playfranchisearchitect\.com/);

  const sitemap = fs.readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /contact\.html/);
  assert.match(sitemap, /privacy\.html/);
  assert.match(sitemap, /terms\.html/);
  assert.match(sitemap, /landing\.html/, "sitemap lists landing.html");
  assert.match(sitemap, /changelog\.html/, "sitemap lists changelog.html");
});

test("index footer links the landing marketing page", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(index, /href="\.\/landing\.html"/, "index links landing.html");
});

test("primary public pages link contact, privacy, and terms", () => {
  for (const file of ["../public/index.html", "../public/game.html", "../public/landing.html"]) {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /contact\.html/, `${file} links contact`);
    assert.match(source, /privacy\.html/, `${file} links privacy`);
    assert.match(source, /terms\.html/, `${file} links terms`);
  }
});

const themedStaticPages = [
  "../public/about.html",
  "../public/changelog.html",
  "../public/status.html",
  "../public/ip.html",
  "../public/contact.html",
  "../public/privacy.html",
  "../public/terms.html",
  "../public/landing.html"
];

test("themeBoot is a dependency-free classic script honoring the shared theme key", () => {
  const boot = fs.readFileSync(new URL("../public/lib/themeBoot.js", import.meta.url), "utf8");
  assert.match(boot, /franchise-architect-theme/, "themeBoot reads the shared storage key");
  assert.match(boot, /prefers-color-scheme/, "themeBoot falls back to the OS preference");
  assert.match(boot, /try\s*\{/, "themeBoot guards storage access so it never throws");
  assert.doesNotMatch(boot, /^\s*(import|export)\b/m, "themeBoot stays a classic non-module script");
});

test("static public pages boot the saved theme before first paint", () => {
  for (const file of themedStaticPages) {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    const headEnd = source.indexOf("</head>");
    assert.ok(headEnd > -1, `${file} has a head`);
    assert.match(source.slice(0, headEnd), /lib\/themeBoot\.js/, `${file} loads themeBoot in <head>`);
    assert.doesNotMatch(source, /<html[^>]*data-theme=/, `${file} does not hardcode a theme themeBoot cannot override`);
  }
});

test("landing page inline palette responds to light theme", () => {
  const landing = fs.readFileSync(new URL("../public/landing.html", import.meta.url), "utf8");
  assert.match(landing, /\[data-theme="light"\]/, "landing defines a light palette override");
});