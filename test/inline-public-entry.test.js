import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { inlinePublicEntry, PUBLIC_ENTRY_MAX_BYTES, PUBLIC_ENTRY_MAX_TRANSFER_RATIO } from "../scripts/lib/inline-public-entry.mjs";
import { inspectHtmlForEdgePolicy, inspectInlineStyleHashes, buildEdgeHeaders } from "../scripts/lib/edge-security-policy.mjs";
import { renderPublicChrome, ensurePageMetadata } from "../scripts/lib/public-chrome.mjs";
import { applyClaimBlocks, loadClaims } from "../scripts/lib/public-claims.mjs";
import { SW_REGISTRATION_SNIPPET } from "../scripts/lib/service-worker.mjs";

const read = (name) => fs.readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sha = (value, encoding = "hex") => createHash("sha256").update(value).digest(encoding);
const styles = read("styles.css"), siteStyles = read("site.css"), themeBoot = read("lib/themeBoot.js");
const styleHref = `styles.${sha(styles).slice(0, 10)}.css`, siteStyleHref = `site.${sha(siteStyles).slice(0, 10)}.css`;
const heroJpeg = fs.readFileSync(new URL("../public/images/screens/hero.jpg", import.meta.url));
const footerManifest = JSON.parse(read("footer-manifest.json"));
let html = applyClaimBlocks(read("index.html"), loadClaims()).html.replace(/<!--[\s\S]*?-->/g, "");
html = ensurePageMetadata(renderPublicChrome(html, { pageName: "index.html", manifest: footerManifest }), { ogImageUrl: "https://playfranchisearchitect.com/images/cover.png" })
  .replace('<head>', '<head>\n    <base href="./" />')
  .replace('./styles.css', './' + styleHref).replace('./site.css', './' + siteStyleHref)
  .replace('</head>', '<link rel="modulepreload" href="./lib/api/createApiClient.js" /></head>')
  .replace('</body>', SW_REGISTRATION_SNIPPET + '</body>');
const fixture = { pageName: "index.html", html, themeBoot, styles, siteStyles, heroJpeg, styleHref, siteStyleHref };
const built = inlinePublicEntry(fixture);
const dataUrl = `data:image/jpeg;base64,${heroJpeg.toString("base64")}`;

test("real entry bundles exact normalized trusted bodies in place and preserves every other HTML byte", () => {
  const restored = built.html.replace(`<script>${themeBoot}</script>`, '<script src="./lib/themeBoot.js"></script>')
    .replace(`<style>${styles}</style>`, `<link rel="stylesheet" href="./${styleHref}" />`)
    .replace(`<style>${siteStyles}</style>`, `<link rel="stylesheet" href="./${siteStyleHref}" />`)
    .replace(dataUrl, './images/screens/hero.jpg');
  assert.equal(restored, html, "claims, chrome, gallery, links, attributes, module preloads and service-worker registration are untouched");
  assert.ok(built.html.indexOf(`<script>${themeBoot}`) < built.html.indexOf(`<style>${styles}`));
  assert.ok(built.html.indexOf(`<style>${styles}`) < built.html.indexOf(`<style>${siteStyles}`));
  const encoded = built.html.match(/src="data:image\/jpeg;base64,([^"]+)"/)[1];
  assert.deepEqual(Buffer.from(encoded, "base64"), heroJpeg, "the existing JPEG is not re-encoded or edited");
  const img = built.html.match(/<img[^>]*src="data:image\/jpeg[^>]+>/)[0];
  assert.match(img, /width="1440" height="900" loading="eager" fetchpriority="high" decoding="async"/);
});

test("real cold entry stays below fixed decoded and comparable gzip/brotli budgets", (t) => {
  assert.equal(PUBLIC_ENTRY_MAX_BYTES, 512 * 1024);
  assert.equal(PUBLIC_ENTRY_MAX_TRANSFER_RATIO, 1.05);
  assert.ok(built.metrics.decodedBytes < PUBLIC_ENTRY_MAX_BYTES);
  for (const sample of Object.values(built.metrics.encodings)) assert.ok(sample.afterBytes <= sample.beforeBytes * PUBLIC_ENTRY_MAX_TRANSFER_RATIO);
  t.diagnostic(JSON.stringify(built.metrics));
});

test("native CSP mechanism exact-hashes the inserted bodies without broadening policy", () => {
  const scriptHashes = inspectHtmlForEdgePolicy(built.html, "index.html"), styleHashes = inspectInlineStyleHashes(built.html);
  assert.ok(scriptHashes.includes(`'sha256-${sha(themeBoot, "base64")}'`));
  assert.deepEqual(styleHashes, [styles, siteStyles].map(body => `'sha256-${sha(body, "base64")}'`));
  const after = buildEdgeHeaders({ inlineScriptHashes: scriptHashes, inlineStyleHashes: styleHashes });
  const before = buildEdgeHeaders({ inlineScriptHashes: inspectHtmlForEdgePolicy(html), inlineStyleHashes: inspectInlineStyleHashes(html) });
  const withoutHashes = headers => headers.replace(/\s+'sha256-[^']+'/g, "");
  assert.equal(withoutHashes(after), withoutHashes(before));
  assert.doesNotMatch(after, /(?:script-src|style-src-elem)[^;]*'unsafe-inline'/);
});

test("LF/CRLF checkouts yield the same inline bodies, image and CSP bytes", () => {
  const crlf = value => value.replace(/\n/g, "\r\n");
  const output = inlinePublicEntry({ ...fixture, html: crlf(html), themeBoot: crlf(themeBoot), styles: crlf(styles), siteStyles: crlf(siteStyles) });
  assert.equal(output.html, built.html);
});

test("HTML attribute case cannot silently leave the hero external", () => {
  const output = inlinePublicEntry({ ...fixture, html: html.replace('src="./images/screens/hero.jpg"', 'SRC="./images/screens/hero.jpg"') });
  assert.ok(output.html.includes(`SRC="${dataUrl}"`));
  assert.ok(!output.html.includes('SRC="./images/screens/hero.jpg"'));
});

test("every other real public page is returned byte-for-byte without requiring entry assets", () => {
  for (const name of fs.readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.html') && name !== 'index.html')) {
    const original = read(name);
    assert.deepEqual(inlinePublicEntry({ pageName: name, html: original }), { html: original, metrics: null });
  }
});

test("existing mount-relative assets, gallery/download references and service worker remain usable", () => {
  const replaced = new Set(['./lib/themeBoot.js', './' + styleHref, './' + siteStyleHref, './images/screens/hero.jpg']);
  const references = value => [...value.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  const retainedBefore = references(html).filter(reference => !replaced.has(reference));
  const retainedAfter = references(built.html).filter(reference => !reference.startsWith('data:image/jpeg;'));
  for (const base of ['https://example.test/', 'https://example.test/games/franchise-architect/']) {
    assert.deepEqual(retainedAfter.map(reference => new URL(reference, base).href), retainedBefore.map(reference => new URL(reference, base).href));
    assert.ok(built.html.includes(SW_REGISTRATION_SNIPPET));
    assert.equal(new URL(dataUrl, base).href, dataUrl);
  }
});

test("missing, duplicated, altered and already-bundled targets fail closed", () => {
  for (const changed of [html.replace('<script src="./lib/themeBoot.js"></script>', ''),
    html.replace('<script src="./lib/themeBoot.js"></script>', '<script async src="./lib/themeBoot.js"></script>'),
    html.replace('</head>', '<script src="./lib/themeBoot.js"></script></head>'),
    html.replace('</head>', "<script src='./lib/themeBoot.js'></script></head>"),
    html.replace(`<link rel="stylesheet" href="./${styleHref}" />`, `<link media="print" rel="stylesheet" href="./${styleHref}" />`),
    html.replace('</head>', `<link rel="stylesheet" href="./${siteStyleHref}" /></head>`),
    html.replace('./images/screens/hero.jpg', './images/screens/hero.jpg?changed'),
    html.replace('</body>', '<img src="./images/screens/hero.jpg" /></body>'), built.html]) {
    assert.throws(() => inlinePublicEntry({ ...fixture, html: changed }), /exactly one|attributes changed|empty classic/);
  }
  assert.throws(() => inlinePublicEntry({ ...fixture, styleHref: 'styles.0000000000.css' }), /content hash/);
});

test("raw text closers, escaped CSS URLs/imports, invalid JPEGs and oversized entries are refused", () => {
  for (const themeBoot of ['const bad = "</script>";', '/* </ScRiPt> */', '/* </style> */']) assert.throws(() => inlinePublicEntry({ ...fixture, themeBoot }), /closer/);
  for (const suffix of ['\n/* </style> */', '\na{background:url(../image.png)}', '\n@import "theme.css";', '\na{background:u\\72l(../image.png)}', '\n@im\\70ort "theme.css";', '\na{background:u/**/rl(../image.png)}']) {
    const altered = styles + suffix;
    assert.throws(() => inlinePublicEntry({ ...fixture, styles: altered, styleHref: `styles.${sha(altered).slice(0, 10)}.css` }), /closer|hazard/);
  }
  assert.throws(() => inlinePublicEntry({ ...fixture, heroJpeg: Buffer.from('not-jpeg') }), /JPEG/);
  assert.throws(() => inlinePublicEntry({ ...fixture, html: html + 'x'.repeat(PUBLIC_ENTRY_MAX_BYTES) }), /512 KiB/);
});
