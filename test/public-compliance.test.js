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
  assert.equal(agents.contact, "footballgm@vaultsparkstudios.com");
  assert.ok(agents.entrypoints.some((entry) => entry.label === "Privacy"));

  const llms = fs.readFileSync(new URL("../public/.well-known/llms.txt", import.meta.url), "utf8");
  assert.match(llms, /Proprietary - All Rights Reserved/);
  assert.match(llms, /footballgm@vaultsparkstudios\.com/);

  const sitemap = fs.readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /contact\.html/);
  assert.match(sitemap, /privacy\.html/);
  assert.match(sitemap, /terms\.html/);
});

test("primary public pages link contact, privacy, and terms", () => {
  for (const file of ["../public/index.html", "../public/game.html", "../public/landing.html"]) {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /contact\.html/, `${file} links contact`);
    assert.match(source, /privacy\.html/, `${file} links privacy`);
    assert.match(source, /terms\.html/, `${file} links terms`);
  }
});