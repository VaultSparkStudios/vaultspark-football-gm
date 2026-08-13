import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPublicFooterContract, PUBLIC_COPYRIGHT, PUBLIC_STUDIO_ORIGIN } from "../scripts/lib/public-footer.mjs";
import { inspectPublicTruth } from "../scripts/check-public-truth.mjs";

const requiredFiles = [
  "../public/contact.html",
  "../public/privacy.html",
  "../public/terms.html",
  "../public/agents.json",
  "../public/public-identity.json",
  "../public/footer-manifest.json",
  "../public/_health",
  "../public/favicon.ico",
  "../public/.well-known/llms.txt",
  "../public/sitemap.xml",
  "../public/stats.html",
  "../public/stats-surface.json"
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
  assert.match(sitemap, /status\.html/, "sitemap lists the merged status+release-notes page");
  assert.match(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/, "sitemap entries carry lastmod");
  assert.doesNotMatch(sitemap, /changelog\.html/, "changelog is a redirect stub and stays out of the sitemap");
  assert.doesNotMatch(sitemap, /play\.html/, "play.html is a redirect stub and stays out of the sitemap");
  assert.doesNotMatch(sitemap, /game\.html/, "the app shell is not an indexable page");
  assert.doesNotMatch(sitemap, /ip\.html/, "ip.html merged into terms.html");
});

test("public identity, health, and footer contracts use the actual deploy repository", () => {
  const identity = JSON.parse(fs.readFileSync(new URL("../public/public-identity.json", import.meta.url), "utf8"));
  const footer = JSON.parse(fs.readFileSync(new URL("../public/footer-manifest.json", import.meta.url), "utf8"));
  const health = JSON.parse(fs.readFileSync(new URL("../public/_health", import.meta.url), "utf8"));
  assert.equal(identity.repository, "VaultSparkStudios/vaultspark-football-gm");
  assert.equal(identity.canonicalOrigin, "https://playfranchisearchitect.com");
  assert.equal(health.launchReady, false, "runtime health must not fabricate launch readiness");
  for (const required of footer.headerLinks) {
    assert.ok(footer.footerLinks.includes(required), `footer includes header destination ${required}`);
  }
  assert.match(fs.readFileSync(new URL("../public/landing.html", import.meta.url), "utf8"), /VaultSparkStudios\/vaultspark-football-gm/);
  assert.doesNotMatch(fs.readFileSync(new URL("../public/landing.html", import.meta.url), "utf8"), /VaultSparkStudios\/franchise-architect-football/);
});

test("index footer links the landing marketing page", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(index, /href="\.\/landing\.html"/, "index links landing.html");
});

test("Community Stats uses its clean canonical route and player-first homepage copy", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const stats = fs.readFileSync(new URL("../public/stats.html", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../public/community-stats.js", import.meta.url), "utf8");
  assert.match(index, /href="\/stats"/, "homepage links the redirect-free canonical route");
  assert.doesNotMatch(index, /href="\.\/stats\.html"/, "homepage does not send players through the HTML redirect");
  assert.match(stats, /rel="canonical" href="https:\/\/playfranchisearchitect\.com\/stats"/);
  assert.doesNotMatch(index, /participating football architects|anonymous, aggregate|refreshed near live/i);
  assert.doesNotMatch(stats, /allowlisted game receipts|bounded local ledger/i);
  assert.doesNotMatch(client, /eligible receipts|Live aggregate unavailable|n=\$\{/i);
  assert.doesNotMatch(client, /stat\.interpretation|period\.insights/, "the public UI never renders backend analytics language directly");
  assert.match(client, /PLAYER_STAT_DESCRIPTIONS/, "every expanded metric uses curated player-language copy");
  assert.match(client, /periodStatus !== "live"/, "warming or private samples never claim a percentile rank");
  assert.match(client, /Share anonymous game stats/);
  assert.match(client, /data-community-freshness.*Temporarily unavailable/, "failed loads resolve the homepage status instead of leaving Connecting visible");
  assert.doesNotMatch(client, /Stats Atlas is offline/, "error copy remains player-facing");
});

test("Community Stats descriptor is one privacy-bounded Analytica feed with a curated live showcase", () => {
  const descriptor = JSON.parse(fs.readFileSync(new URL("../public/stats-surface.json", import.meta.url), "utf8"));
  assert.equal(descriptor.feedVersion, "analytica-feed-v1");
  assert.deepEqual(descriptor.showcase, ["participating-browsers", "weeks-managed", "strategy-mix"]);
  assert.equal(descriptor.refreshSeconds, 30);
  assert.equal(descriptor.refreshMechanism, "poll");
  assert.equal(descriptor.privacy.aggregateOnly, true);
  assert.ok(descriptor.metrics.length >= descriptor.showcase.length + 3, "the in-depth page is materially deeper than its homepage tile");
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
  "../public/landing.html",
  "../public/stats.html"
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

test("public truth gate: derived stats match source and no internal vocabulary ships", () => {
  const report = inspectPublicTruth(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  assert.deepEqual(report.problems, []);
  assert.equal(report.ok, true);
  assert.ok(report.engineCount >= 30, "engine count derivation reads src/engine");
});

test("root page is visitor-first: no server-first copy, no disabled hero buttons in markup", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(index, /Connecting to server/, "first paint never claims a server on a zero-backend product");
  assert.doesNotMatch(index, /<button[^>]*continue-active-btn[^>]*disabled/, "Continue is hidden, not disabled, for new visitors");
  assert.match(index, /instant-start-btn/, "one-click start exists");
  assert.match(index, /<meta name="vsfgm-runtime-default" content="client"/, "source runtime metas match deployed truth");
  assert.match(index, /<title>Franchise Architect: Football — Deep NFL Franchise Simulator<\/title>/, "homepage title is not an in-app breadcrumb");
  assert.doesNotMatch(index, /<details[^>]*class="setup-section setup-details"[^>]*\sopen/, "empty save tables are not expanded by default");
});

test("redirect stubs and merged pages hold their contracts", () => {
  const play = fs.readFileSync(new URL("../public/play.html", import.meta.url), "utf8");
  const changelog = fs.readFileSync(new URL("../public/changelog.html", import.meta.url), "utf8");
  const ip = fs.readFileSync(new URL("../public/ip.html", import.meta.url), "utf8");
  const terms = fs.readFileSync(new URL("../public/terms.html", import.meta.url), "utf8");
  const status = fs.readFileSync(new URL("../public/status.html", import.meta.url), "utf8");
  const notFound = fs.readFileSync(new URL("../public/404.html", import.meta.url), "utf8");
  assert.match(play, /http-equiv="refresh"[^>]*index\.html/);
  assert.match(changelog, /http-equiv="refresh"[^>]*status\.html/);
  assert.match(ip, /http-equiv="refresh"[^>]*terms\.html/);
  assert.match(terms, /not affiliated with or endorsed by any professional sports league/, "terms absorbed the IP non-affiliation notice");
  assert.match(status, /Release Notes/, "status page carries dated release notes");
  assert.match(status, /\d{4}-\d{2}-\d{2}/, "release notes are dated");
  assert.match(notFound, /notFoundHomeLink/, "404 page is real and links home");
});

test("private creative-direction ledger is absent from the public repository", () => {
  const privateLedger = new URL("../docs/CREATIVE_DIRECTION_RECORD.md", import.meta.url);
  assert.equal(fs.existsSync(privateLedger), false, "private Studio OS ledger is not committed publicly");
});
test("every public HTML surface carries the exact proprietary copyright contract", () => {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
  const report = inspectPublicFooterContract(publicDir);
  assert.deepEqual(report.missingLinkbacks, []);
  assert.deepEqual(report.invalidLinkbacks, []);
  assert.equal(report.htmlFiles.length > 0, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.openSourceClaims, []);
  for (const name of report.htmlFiles) {
    const source = fs.readFileSync(path.join(publicDir, name), "utf8");
    assert.match(source, new RegExp(`href=["']${PUBLIC_STUDIO_ORIGIN.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")}\\/?["']`), name + " links the Studio over HTTPS");
    assert.equal(report.ok, true);
    assert.match(source, /<footer\b[\s\S]*© 2026 VaultSpark Studios LLC\. All rights reserved\.[\s\S]*<\/footer>/, name + " keeps the line inside a footer");
    assert.equal(source.includes(PUBLIC_COPYRIGHT), true);
  }
});
