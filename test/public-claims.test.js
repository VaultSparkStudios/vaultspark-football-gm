import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyClaimBlocks,
  CLAIM_BLOCKS,
  findUnfilledMarkers,
  inspectClaimBlocks,
  loadClaims,
  validateClaims
} from "../scripts/lib/public-claims.mjs";
import {
  ensurePageMetadata,
  parseReleaseNotes,
  renderChangelogFeed,
  renderPublicChrome
} from "../scripts/lib/public-chrome.mjs";
import { FORBIDDEN_MARKETING_VOCAB, marketingVocabularyProblems } from "../scripts/check-public-truth.mjs";

/**
 * Public copy has one source: public/content/claims.json. Pages carry marker
 * blocks that the build re-renders, so a claim cannot drift between the
 * landing page, the feature tour, the FAQ and the press kit.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const claims = loadClaims(rootDir);
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "footer-manifest.json"), "utf8"));
const pages = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html")).sort();

// What the build does to a page before it ships: render claims, then strip
// every comment (injectHtmlDefaults), then apply the shared chrome.
function built(name) {
  const source = fs.readFileSync(path.join(publicDir, name), "utf8");
  const rendered = applyClaimBlocks(source, claims).html.replace(/<!--[\s\S]*?-->/g, "");
  return renderPublicChrome(rendered, { pageName: name, manifest });
}

test("claims.json is valid and every block name a page uses is known", () => {
  assert.equal(validateClaims(claims), true);
  for (const name of pages) {
    const source = fs.readFileSync(path.join(publicDir, name), "utf8");
    for (const match of source.matchAll(/<!--\s*claims:([a-z-]+)(?::start)?\s*-->/g)) {
      assert.ok(CLAIM_BLOCKS[match[1]], `${name} uses unknown claims block ${match[1]}`);
    }
  }
});

test("every claims block in the source tree is in sync with claims.json", () => {
  const withBlocks = [];
  for (const name of pages) {
    const source = fs.readFileSync(path.join(publicDir, name), "utf8");
    const report = inspectClaimBlocks(source, claims);
    assert.deepEqual(report.stale, [], `${name} has stale claims blocks; run node scripts/lib/public-claims.mjs --write`);
    assert.deepEqual(report.unfilled, [], `${name} has unfilled claims markers`);
    if (/claims:[a-z-]+:start/.test(source)) withBlocks.push(name);
  }
  for (const expected of ["index.html", "features.html", "faq.html", "press.html", "status.html", "about.html"]) {
    assert.ok(withBlocks.includes(expected), `${expected} renders its copy from claims.json`);
  }
});

test("every marker is filled and the built output carries no marker text", () => {
  for (const name of pages) {
    const html = built(name);
    assert.deepEqual(findUnfilledMarkers(html), [], `${name} ships unfilled claims markers`);
  }
  const index = built("index.html");
  const cards = (index.match(/class="why-card"/g) || []).length;
  assert.equal(cards, claims.features.filter((feature) => feature.index).length, "index renders one card per index feature");
  assert.match(index, /class="why-card"[\s\S]*href="\.\/simulation\.html"/, "the measured-realism teaser links the methodology page");
  const tour = built("features.html");
  for (const feature of claims.features) {
    assert.ok(tour.includes(`id="${feature.id}"`), `features.html has a section for ${feature.id}`);
  }
  const press = built("press.html");
  for (const fact of claims.facts) assert.ok(press.includes(fact.label), `press fact sheet lists ${fact.label}`);
});

test("NEGATIVE CONTROL: a stale, unknown or bare block is caught, and claim text is escaped", () => {
  const stale = '<p><!-- claims:status-label:start -->Free open beta<!-- claims:status-label:end --></p>';
  assert.deepEqual(inspectClaimBlocks(stale, claims).stale, ["status-label"]);
  const bare = "<p><!-- claims:privacy --></p>";
  assert.deepEqual(inspectClaimBlocks(bare, claims).unfilled, ["privacy"]);
  assert.match(applyClaimBlocks(bare, claims).html, new RegExp(claims.privacyLine.slice(0, 20)));
  assert.throws(() => applyClaimBlocks("<!-- claims:not-a-block -->", claims), /Unknown claims block/);
  const hostile = { ...claims, statusLabel: '<script>alert("x")</script>' };
  const rendered = applyClaimBlocks("<!-- claims:status-label -->", hostile).html;
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
  assert.throws(() => applyClaimBlocks("<!-- claims:facts -->", { ...claims, facts: [{ label: "x", value: "y", href: "javascript:alert(1)" }] }), /unsupported link/);
  // An unrendered marker is visible to the leftover check even after comments go.
  assert.deepEqual(findUnfilledMarkers("<p>claims:facts</p>"), ["claims:facts"]);
});

test("every screenshot a claim cites exists, is a JPEG, and stays under 200 KB", () => {
  const images = new Set(claims.features.filter((feature) => feature.image).map((feature) => feature.image.src));
  images.add("./images/screens/hero.jpg");
  assert.ok(images.size >= 5, "at least five gameplay screenshots back the feature tour and press kit");
  for (const src of images) {
    const file = path.join(publicDir, src.replace(/^\.\//, ""));
    assert.ok(fs.existsSync(file), `${src} exists`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes[0], 0xff, `${src} is a JPEG`);
    assert.equal(bytes[1], 0xd8, `${src} is a JPEG`);
    assert.ok(bytes.length < 200 * 1024, `${src} is ${bytes.length} bytes`);
  }
});

test("status label and copy say free early access, never open beta", () => {
  assert.equal(claims.statusLabel, "Free early access");
  for (const name of pages) {
    if (name === "game.html") continue;
    const source = fs.readFileSync(path.join(publicDir, name), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    assert.doesNotMatch(source, /open beta/i, `${name} still says open beta`);
  }
});

test("NEGATIVE CONTROL: the marketing vocabulary gate flags ops words and spares ordinary ones", () => {
  for (const leak of ["film receipts", "a test shard", "the SIL score", "shipped in S94", "per the canon", "schema 2 update", "an allowlisted payload", "Studio OS"]) {
    assert.ok(marketingVocabularyProblems("x.html", leak).length > 0, `flags: ${leak}`);
  }
  for (const fine of ['<link rel="canonical">', "canonical URL", "S1 of the season", "Week 17", "a schema for saves", "Sim-Watch"]) {
    assert.deepEqual(marketingVocabularyProblems("x.html", fine), [], `spares: ${fine}`);
  }
  assert.ok(FORBIDDEN_MARKETING_VOCAB.length >= 7);
});

test("every built public page has social and install metadata", () => {
  for (const name of pages) {
    if (name === "game.html") continue;
    const html = ensurePageMetadata(built(name));
    for (const tag of ['property="og:title"', 'property="og:description"', 'name="twitter:card"', 'name="theme-color"', 'rel="apple-touch-icon"', 'rel="manifest"', 'rel="icon"']) {
      assert.ok(html.includes(tag), `${name} carries ${tag}`);
    }
    assert.match(html, /class="bg-layer"/, `${name} uses the shared page template`);
  }
  assert.ok(fs.existsSync(path.join(publicDir, "images", "apple-touch-icon.png")));
  const webmanifest = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8"));
  for (const icon of webmanifest.icons) {
    assert.ok(fs.existsSync(path.join(publicDir, icon.src.replace(/^\.\//, ""))), `${icon.src} exists`);
  }
});

test("the landing page keeps the shared header, the theme toggle once, and hooks setup.js depends on", () => {
  const index = built("index.html");
  assert.equal((index.match(/class="site-header"/g) || []).length, 1);
  assert.equal((index.match(/id="setupThemeToggleBtn"/g) || []).length, 1);
  assert.match(index, /id="setupThemeToggleBtn"[^>]*aria-label="Customize theme"/);
  for (const id of ["instantStartBtn", "continueActiveBtn", "resumeLatestBtn", "activeLeagueText", "teamSelect", "createLeagueBtn", "setupStatus", "challengeCodeInput", "applyChallengeCodeBtn", "seedInput", "modeInput", "modeHelpText", "runtimeModeSelect", "runtimeModeDescription", "setupGuideContent", "dataPathsSection", "savesTable", "backupsTable"]) {
    assert.equal((index.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `index keeps #${id}`);
  }
  // Developer-facing controls live under Advanced, not in the page furniture.
  const advanced = index.slice(index.indexOf('id="advanced"'), index.indexOf('id="savedLeaguesSection"'));
  for (const id of ["seedInput", "runtimeModeSelect", "dataPathsSection"]) assert.ok(advanced.includes(`id="${id}"`), `#${id} is under Advanced`);
  assert.doesNotMatch(index, /title="[^"]+">\?<\/span>/, "no title-only help glyph");
  // Order: hero, features, quick start, then the community pulse below the fold.
  const order = ["instantStartBtn", 'id="why"', 'id="quick-start"', "data-community-pulse"].map((marker) => index.indexOf(marker));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "hero → features → quick start → community pulse");
  assert.equal((index.match(/class="btn-primary btn-lg"/g) || []).length, 2, "one primary start (plus the continue variant shown instead of it)");
});

test("release notes get stable anchors and an RSS feed generated from the same parse", () => {
  const notes = parseReleaseNotes(fs.readFileSync(path.join(publicDir, "status.html"), "utf8"));
  assert.ok(notes.length > 4);
  const ids = notes.map((note) => note.id);
  assert.equal(new Set(ids).size, ids.length, "anchors are unique");
  assert.ok(ids.every((id) => /^note-\d{4}-\d{2}-\d{2}(-\d+)?$/.test(id)));
  const feed = renderChangelogFeed(notes, { siteUrl: "https://playfranchisearchitect.com/", pagePath: "status-archive.html" });
  assert.match(feed, /^<\?xml version="1\.0"/);
  assert.equal((feed.match(/<item>/g) || []).length, notes.length);
  assert.match(feed, new RegExp(`status-archive\\.html#${ids[0]}`));
  assert.doesNotMatch(feed.replace(/<[^>]+>/g, ""), /<p>|<strong>/, "descriptions are plain text");
});
