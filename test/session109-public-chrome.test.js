import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHROME_EXEMPT_PAGES,
  inspectIndexFooter,
  parseReleaseNotes,
  renderFooter,
  renderPublicChrome,
  splitStatusNotes,
  stripXmlComments,
  THEME_INIT_SCRIPT
} from "../scripts/lib/public-chrome.mjs";
import { showcaseCards } from "../public/community-stats.js";

/**
 * S109 — nine public pages carried nine hand-copied footers, three carried a
 * theme toggle and two of those never wired it, and the footer contract only
 * asserted the copyright line. The build now renders one header, one footer
 * and one working toggle from footer-manifest.json; these tests pin that
 * transform on the real pages and on fixtures that reproduce the defects.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "footer-manifest.json"), "utf8"));
const publicPages = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html")).sort();

function builtPage(name) {
  return renderPublicChrome(fs.readFileSync(path.join(publicDir, name), "utf8"), { pageName: name, manifest });
}

test("every non-exempt public page renders the same manifest footer, one breadcrumb and one wired theme toggle", () => {
  for (const name of publicPages) {
    if (CHROME_EXEMPT_PAGES.has(name)) continue;
    const html = builtPage(name);
    const footers = html.match(/<footer\b/g) || [];
    assert.equal(footers.length, 1, `${name} has exactly one footer`);
    for (const href of manifest.footerLinks) {
      assert.ok(html.includes(`href="${href}"`), `${name} footer links ${href}`);
    }
    assert.match(html, /© 2026 VaultSpark Studios LLC\. All rights reserved\./, `${name} keeps the copyright line`);
    assert.equal((html.match(/class="community-breadcrumb"/g) || []).length, 1, `${name} has one breadcrumb`);
    assert.equal((html.match(/id="setupThemeToggleBtn"/g) || []).length, 1, `${name} has one toggle`);
    assert.equal((html.match(/initThemeCustomizer\(/g) || []).length, 1, `${name} wires the toggle exactly once`);
    assert.ok(html.includes(THEME_INIT_SCRIPT), `${name} calls initThemeCustomizer with an element id, not an object`);
    assert.doesNotMatch(html, /<p>\s*<a href="\.\/index\.html">Return to/, `${name} no longer carries a lone return link`);
  }
});

test("the transform is idempotent", () => {
  for (const name of publicPages) {
    if (CHROME_EXEMPT_PAGES.has(name)) continue;
    const once = builtPage(name);
    const twice = renderPublicChrome(once, { pageName: name, manifest });
    assert.equal(twice, once, `${name} is stable under a second pass`);
  }
});

test("NEGATIVE CONTROL: the two toggle defects the source pages shipped are repaired, not preserved", () => {
  // simulation.html: a toggle button with no init script at all.
  const noInit = '<html><body><main class="setup-wrap"><nav class="community-breadcrumb"><span>X</span><button id="setupThemeToggleBtn"></button></nav><h1>X</h1><footer class="setup-footer">old</footer></main></body></html>';
  const repairedNoInit = renderPublicChrome(noInit, { pageName: "x.html", manifest });
  assert.ok(repairedNoInit.includes('initThemeCustomizer("setupThemeToggleBtn")'));
  // stats.html: an init script passing an object where the function takes an id.
  const objectArg = '<html><body><main class="setup-wrap"><nav class="community-breadcrumb"><button id="setupThemeToggleBtn"></button></nav><h1>X</h1><footer class="setup-footer">old</footer></main>' +
    "<script type=\"module\">import { initThemeCustomizer } from './lib/themeCustomizer.js'; initThemeCustomizer({ buttonId: 'setupThemeToggleBtn' });</script></body></html>";
  const repairedObject = renderPublicChrome(objectArg, { pageName: "x.html", manifest });
  assert.equal((repairedObject.match(/initThemeCustomizer\(/g) || []).length, 1);
  assert.doesNotMatch(repairedObject, /buttonId:/);
});

test("prose and standalone calls to action survive; duplicate navigation groups are removed", () => {
  const html = '<html><body><main class="legal-wrap"><h1>T</h1><p>Questions: <a href="mailto:x@y">x@y</a></p><p><a href="./index.html">Play</a> · <a href="./about.html">About</a></p><footer class="studio-legal-footer">old</footer></main></body></html>';
  const out = renderPublicChrome(html, { pageName: "x.html", manifest });
  assert.ok(out.includes("Questions: <a"), "a paragraph with prose stays");
  assert.doesNotMatch(out, /<p><a href="\.\/index\.html">Play<\/a> ·/, "a repeated navigation group goes");
  const missingPage = builtPage("404.html");
  assert.match(missingPage, /id="notFoundHomeLink"/, "the 404 recovery action survives the footer transform");
  assert.match(builtPage("contact.html"), /mailto:football@playfranchisearchitect\.com/, "the project contact address remains visible");
});

test("index.html keeps every manifest destination in its own footer, because it is exempt from replacement", () => {
  const report = inspectIndexFooter(fs.readFileSync(path.join(publicDir, "index.html"), "utf8"), manifest);
  assert.deepEqual(report.missing, []);
  const drifted = inspectIndexFooter('<footer class="setup-footer"><a href="./about.html">About</a></footer>', manifest);
  assert.equal(drifted.ok, false, "NEGATIVE CONTROL: a footer that dropped destinations is caught");
});

test("the manifest footer labels every destination and marks the current page", () => {
  const footer = renderFooter(manifest, { currentPage: "about.html" });
  assert.match(footer, /aria-current="page"/);
  assert.match(footer, />About &amp; FAQ</);
  assert.match(footer, /target="_blank" rel="noopener"/, "external links open in a new tab");
});

test("the sitemap ships without comments", () => {
  const source = fs.readFileSync(path.join(publicDir, "sitemap.xml"), "utf8");
  assert.match(source, /<!--/, "the source sitemap carries a rationale comment (kept for the tree)");
  const built = stripXmlComments(source);
  assert.doesNotMatch(built, /<!--/);
  assert.doesNotMatch(built, /\bS\d{2,3}\b/);
  assert.match(built, /<loc>https:\/\/playfranchisearchitect\.com\/press\.html<\/loc>/);
  assert.match(built, /status-archive\.html/);
});

test("status.html splits into the newest four notes plus a complete archive", () => {
  const source = fs.readFileSync(path.join(publicDir, "status.html"), "utf8");
  const notes = parseReleaseNotes(source);
  assert.ok(notes.length > 4, "the source keeps every note");
  const split = splitStatusNotes(source, { keep: 4 });
  assert.equal(parseReleaseNotes(split.latest).length, 4);
  assert.match(split.latest, /status-archive\.html/);
  assert.equal(parseReleaseNotes(split.archive).length, notes.length);
  assert.match(split.archive, /<h1>Release History<\/h1>/);
  assert.equal(parseReleaseNotes(split.latest)[0].date, notes[0].date, "the newest note stays first on the status page");
  const chromed = renderPublicChrome(split.archive, { pageName: "status-archive.html", manifest });
  assert.equal((chromed.match(/<footer\b/g) || []).length, 1);
});

test("the showcase league is committed, labelled as simulation, and renders as cards", () => {
  const file = path.join(publicDir, "showcase-league.json");
  assert.ok(fs.existsSync(file), "public/showcase-league.json is generated by scripts/build-showcase-league.mjs");
  const showcase = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(showcase.kind, "simulation");
  assert.equal(showcase.seasons, 10);
  const cards = showcaseCards(showcase);
  assert.ok(cards.length >= 5);
  for (const card of cards) assert.match(card.period, /^Seed \d+ · 10 seasons$/);
  assert.deepEqual(showcaseCards(null), []);
});
