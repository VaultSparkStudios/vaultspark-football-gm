import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildStructuredData,
  CHROME_EXEMPT_PAGES,
  ensurePageMetadata,
  ensureStructuredData,
  HEADER_EXEMPT_PAGES,
  inspectFooterGroups,
  inspectIndexFooter,
  parseFaqEntries,
  parseReleaseNotes,
  renderFooter,
  renderPublicChrome,
  renderSiteHeader,
  splitStatusNotes,
  stripXmlComments,
  THEME_INIT_SCRIPT
} from "../scripts/lib/public-chrome.mjs";
import { inspectHtmlForEdgePolicy } from "../scripts/lib/edge-security-policy.mjs";
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

test("every non-exempt public page renders the same manifest footer, one shared header and one wired theme toggle", () => {
  for (const name of publicPages) {
    if (CHROME_EXEMPT_PAGES.has(name)) continue;
    const html = builtPage(name);
    const footers = html.match(/<footer\b/g) || [];
    assert.equal(footers.length, 1, `${name} has exactly one footer`);
    for (const href of manifest.footerLinks) {
      assert.ok(html.includes(`href="${href}"`), `${name} footer links ${href}`);
    }
    assert.match(html, /© 2026 VaultSpark Studios LLC\. All rights reserved\./, `${name} keeps the copyright line`);
    assert.equal((html.match(/class="site-header"/g) || []).length, 1, `${name} has one shared site header`);
    assert.equal((html.match(/class="community-breadcrumb"/g) || []).length, 0, `${name} no longer carries a separate breadcrumb`);
    for (const href of manifest.headerLinks.filter((link) => link !== "./index.html")) {
      assert.ok(html.includes(`href="${href}"`), `${name} header links ${href}`);
    }
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
  assert.match(footer, />About &amp; Press<|>About & Press</);
  assert.doesNotMatch(footer, />Changelog</, "the changelog is reached from Updates, not the footer (S133)");
  assert.doesNotMatch(footer, /https:\/\/github\.com/, "the footer carries no off-site links since S133; Discussions lives on About & Press");
  assert.match(fs.readFileSync(path.join(publicDir, "about.html"), "utf8"), /discussions" target="_blank" rel="noopener"/, "external links open in a new tab");
});

test("the footer renders the manifest's groups, and every destination sits in exactly one of them", () => {
  assert.deepEqual(manifest.footerGroups.map((group) => group.label), ["Play", "The game", "Studio", "Legal"]);
  const report = inspectFooterGroups(manifest);
  assert.equal(report.grouped, true);
  assert.deepEqual([report.missing, report.unknown, report.duplicated, report.unlabelled], [[], [], [], []]);
  const footer = renderFooter(manifest, { currentPage: "guides.html" });
  assert.equal((footer.match(/class="public-chrome-group"/g) || []).length, manifest.footerGroups.length);
  for (const group of manifest.footerGroups) {
    assert.ok(footer.includes(`<ul aria-label="${group.label}">`), `the ${group.label} group is a labelled list`);
  }
  assert.equal((footer.match(/<a /g) || []).length, manifest.footerLinks.length + 1, "each destination is linked once, plus the Studio link-back");
  assert.match(footer, /href="\.\/guides\.html" aria-current="page"/);
  for (const page of ["guides.html", "simulation.html", "about.html"]) {
    assert.ok(manifest.footerLinks.includes(`./${page}`), `${page} is a footer destination`);
    assert.ok(fs.existsSync(path.join(publicDir, page)), `${page} exists`);
  }
  // S133: ten footer links. Press, Contact and Discussions live on About & Press,
  // so they stay one click from every page without crowding the footer.
  assert.equal(manifest.footerLinks.length, 10);
  const about = fs.readFileSync(path.join(publicDir, "about.html"), "utf8");
  for (const href of ["./press.html", "./media.html", "./contact.html", "mailto:football@playfranchisearchitect.com", "https://github.com/VaultSparkStudios/vaultspark-football-gm/discussions"]) {
    assert.ok(about.includes(`href="${href}"`), `About & Press links ${href}`);
    if (href.startsWith("./")) assert.ok(fs.existsSync(path.join(publicDir, href.slice(2))), `${href} exists`);
  }
});

test("a manifest without groups still renders the flat footer", () => {
  const { footerGroups, ...flat } = manifest;
  const footer = renderFooter(flat, { currentPage: "about.html" });
  assert.doesNotMatch(footer, /public-chrome-group/);
  assert.match(footer, /<nav class="public-chrome-nav" aria-label="Site">/);
  assert.equal((footer.match(/ · <a /g) || []).length, manifest.footerLinks.length, "links are separated inline (the last separator precedes the Studio link)");
  assert.equal(inspectFooterGroups(flat).grouped, false);
  const page = renderPublicChrome('<html><body><main><h1>X</h1></main><footer class="studio-legal-footer">old</footer></body></html>', { pageName: "x.html", manifest: flat });
  for (const href of manifest.footerLinks) assert.ok(page.includes(`href="${href}"`));
});

test("NEGATIVE CONTROL: groups that drop, invent or repeat a destination fail the render", () => {
  const dropped = { ...manifest, footerGroups: manifest.footerGroups.slice(0, 3) };
  assert.deepEqual(inspectFooterGroups(dropped).missing, ["./privacy.html", "./terms.html"]);
  assert.throws(() => renderFooter(dropped), /footerGroups disagree with footerLinks/);
  const invented = { ...manifest, footerGroups: [...manifest.footerGroups, { label: "Extra", links: ["./nowhere.html"] }] };
  assert.deepEqual(inspectFooterGroups(invented).unknown, ["./nowhere.html"]);
  const repeated = { ...manifest, footerGroups: [...manifest.footerGroups, { label: "Again", links: ["./faq.html"] }] };
  assert.deepEqual(inspectFooterGroups(repeated).duplicated, ["./faq.html"]);
  const unlabelled = { ...manifest, footerGroups: manifest.footerGroups.map((group, index) => (index ? group : { links: group.links })) };
  assert.equal(inspectFooterGroups(unlabelled).ok, false);
});

test("a destination has one label in the header and the footer", () => {
  assert.equal(manifest.headerLabels, undefined, "the header does not rename a destination the footer also links");
  const header = renderSiteHeader(manifest, { currentPage: "about.html" });
  const footer = renderFooter(manifest, { currentPage: "about.html" });
  const labelsIn = (html) => new Map([...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => [match[1], match[2]]));
  const headerLabels = labelsIn(header);
  const footerLabels = labelsIn(footer);
  for (const href of manifest.headerLinks.filter((link) => link !== "./index.html")) {
    assert.equal(headerLabels.get(href), footerLabels.get(href), `${href} is labelled the same in both`);
  }
  assert.equal(footerLabels.get("./stats"), "Gridiron Census");
  assert.equal(footerLabels.get("./status.html"), "Updates");
  const labels = Object.values(manifest.labels);
  assert.equal(new Set(labels).size, labels.length, "no two destinations share a label");
  for (const href of manifest.footerLinks) assert.ok(manifest.labels[href], `${href} has a declared label`);
});

test("the app shell is exempt from the shared chrome and is not listed as carrying it", () => {
  assert.ok(HEADER_EXEMPT_PAGES.has("game.html"));
  const shell = "<html><body><main>app</main></body></html>";
  assert.equal(renderPublicChrome(shell, { pageName: "game.html", manifest }), shell);
  assert.ok(!manifest.sharedFooterPages.includes("game.html"));
  for (const page of manifest.sharedFooterPages) {
    assert.ok(fs.existsSync(path.join(publicDir, page)), `${page} listed in sharedFooterPages exists`);
  }
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
  assert.match(split.archive, /<h1>Changelog<\/h1>/);
  assert.match(split.archive, /<h3 id="note-\d{4}-\d{2}-\d{2}">/, "every archived note carries a linkable anchor");
  assert.match(split.latest, /changelog\.xml/, "the status page points at the RSS feed");
  assert.equal(parseReleaseNotes(split.latest)[0].date, notes[0].date, "the newest note stays first on the status page");
  const chromed = renderPublicChrome(split.archive, { pageName: "status-archive.html", manifest });
  assert.equal((chromed.match(/<footer\b/g) || []).length, 1);
});

test("known issues sit above the release notes on the updates page and stay out of the changelog", () => {
  const source = fs.readFileSync(path.join(publicDir, "status.html"), "utf8");
  assert.match(source, /<h1>Updates<\/h1>/);
  const issues = source.indexOf('id="known-issues"');
  assert.ok(issues > -1 && issues < source.indexOf("<h2>Release Notes</h2>"), "known issues come first");
  const section = source.slice(issues, source.indexOf("</section>", issues));
  assert.ok((section.match(/<li>/g) || []).length >= 1, "the section lists at least one issue");
  const split = splitStatusNotes(source, { keep: 4 });
  assert.match(split.latest, /id="known-issues"/);
  assert.doesNotMatch(split.archive, /id="known-issues"/, "the changelog is history, not current state");
  assert.match(split.archive, /status\.html#known-issues/, "the changelog points back at them");
  assert.equal(parseReleaseNotes(split.archive).length, parseReleaseNotes(source).length, "removing the section loses no note");
  const about = fs.readFileSync(path.join(publicDir, "about.html"), "utf8");
  assert.doesNotMatch(about, /claims:status-line/, "about.html links the updates page instead of repeating the status paragraph");
  assert.match(about, /href="\.\/status\.html"/);
});

// What the build hands ensurePageMetadata: claims rendered, comments stripped,
// chrome applied, and the canonical link already written.
function builtWithCanonical(name, canonicalPath = name) {
  const html = builtPage(name).replace(/<!--[\s\S]*?-->/g, "");
  return ensurePageMetadata(html.replace("</title>", `</title>\n    <link rel="canonical" href="https://playfranchisearchitect.com/${canonicalPath}" />`));
}

function structuredData(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json" data-structured-data>([\s\S]*?)<\/script>/g)];
  return blocks.map((match) => JSON.parse(match[1]));
}

test("every secondary page gets one breadcrumb block; the root, the app shell and noindex pages get none", () => {
  for (const name of publicPages) {
    if (name === "game.html") continue;
    const html = builtWithCanonical(name, name === "index.html" ? "" : name === "stats.html" ? "stats" : name);
    const blocks = structuredData(html);
    if (name === "index.html" || name === "404.html") {
      assert.equal(blocks.length, 0, `${name} carries no generated block`);
      continue;
    }
    assert.equal(blocks.length, 1, `${name} carries exactly one block`);
    const crumbs = blocks[0]["@graph"].find((node) => node["@type"] === "BreadcrumbList");
    assert.deepEqual(crumbs.itemListElement.map((item) => item.position), [1, 2]);
    assert.equal(crumbs.itemListElement[0].item, "https://playfranchisearchitect.com/");
    assert.equal(crumbs.itemListElement[1].item, `https://playfranchisearchitect.com/${name === "stats.html" ? "stats" : name}`);
    const title = fs.readFileSync(path.join(publicDir, name), "utf8").match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(crumbs.itemListElement[1].name.length > 0 && !/&[a-z]+;| — /.test(crumbs.itemListElement[1].name), `${name} breadcrumb name is plain text taken from "${title}"`);
    assert.equal(ensureStructuredData(html), html, `${name} is stable under a second pass`);
    // The edge policy hashes every inline script body, so one block is one hash.
    assert.equal(inspectHtmlForEdgePolicy(html.match(/<script type="application\/ld\+json" data-structured-data>[\s\S]*?<\/script>/)[0], name).length, 1);
  }
  assert.equal(buildStructuredData("<html><head><title>X — Y</title></head></html>"), null, "a page with no canonical link is left alone");
});

test("the FAQ's structured data is its visible questions and answers, nothing else", () => {
  const source = fs.readFileSync(path.join(publicDir, "faq.html"), "utf8");
  const html = builtWithCanonical("faq.html");
  const faq = structuredData(html)[0]["@graph"].find((node) => node["@type"] === "FAQPage");
  const summaries = [...source.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((match) => match[1]);
  assert.ok(summaries.length >= 15);
  assert.equal(faq.mainEntity.length, summaries.length, "one Question per <details>");
  assert.deepEqual(faq.mainEntity.map((entry) => entry.name), parseFaqEntries(html).map((entry) => entry.question));
  const visible = html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1");
  for (const entry of faq.mainEntity) {
    assert.doesNotMatch(entry.acceptedAnswer.text, /<|&[a-z#0-9]+;|claims:/, "answers are plain text");
    assert.ok(visible.includes(entry.acceptedAnswer.text.slice(0, 60)), `answer to "${entry.name}" is on the page`);
  }
  assert.equal(faq.mainEntity.find((entry) => entry.name === "Is it free?").acceptedAnswer.text, "Yes. Franchise Architect: Football is free, and there is nothing to buy inside it.");
  for (const name of ["about.html", "guides.html"]) {
    const graph = structuredData(builtWithCanonical(name))[0]["@graph"];
    assert.equal(graph.some((node) => node["@type"] === "FAQPage"), false, `${name} is not described as a FAQ`);
  }
});

test("NEGATIVE CONTROL: structured data cannot close its own element or go stale", () => {
  const page = '<html><head><title>T — Site</title>\n<link rel="canonical" href="https://example.test/t.html" />\n  </head><body><div class="site-faq"><details><summary>Is &lt;/script&gt; safe?</summary><p>Yes &amp; no.</p></details></div></body></html>';
  const once = ensureStructuredData(page);
  assert.equal((once.match(/<\/script>/g) || []).length, 1, "a question containing a script closer is escaped");
  assert.equal(structuredData(once)[0]["@graph"][1].mainEntity[0].name, "Is </script> safe?");
  assert.equal(structuredData(once)[0]["@graph"][1].mainEntity[0].acceptedAnswer.text, "Yes & no.");
  const edited = once.replace("Yes &amp; no.", "Changed.");
  assert.equal(structuredData(ensureStructuredData(edited))[0]["@graph"][1].mainEntity[0].acceptedAnswer.text, "Changed.", "a second pass replaces the block instead of keeping or duplicating it");
  assert.equal((ensureStructuredData(edited).match(/data-structured-data/g) || []).length, 1);
  const noindex = page.replace("<title>", '<meta name="robots" content="noindex" /><title>');
  assert.doesNotMatch(ensureStructuredData(noindex), /data-structured-data/);
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
