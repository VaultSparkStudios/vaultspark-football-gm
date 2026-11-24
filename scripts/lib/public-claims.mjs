/**
 * public-claims.mjs — one source of public copy.
 *
 * Feature descriptions, the fact sheet, the status label and the privacy and
 * intelligence one-liners live in public/content/claims.json. Pages carry
 * marker blocks:
 *
 *   <!-- claims:features-cards:start --> … <!-- claims:features-cards:end -->
 *
 * and the build re-renders every block from claims.json, so a page cannot ship
 * a second, drifted copy of a claim. Source pages keep the rendered block
 * between the markers so the dev server shows real copy; `--write` refreshes
 * them and the test suite fails when they fall out of sync.
 *
 * Everything that reaches HTML is escaped here. Pure string transforms, so it
 * can be tested without building.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, "..", "..");

export const CLAIMS_RELATIVE_PATH = path.join("public", "content", "claims.json");
export const SHOWCASE_RELATIVE_PATH = path.join("public", "showcase-league.json");

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Only same-site relative links, https and mailto are rendered as hrefs.
function safeHref(href) {
  const value = String(href ?? "").trim();
  if (/^(?:\.\/|#|https:\/\/|mailto:)/.test(value)) return escapeHtml(value);
  throw new Error(`claims.json carries an unsupported link: ${value}`);
}

export function loadClaims(root = defaultRoot) {
  const claims = JSON.parse(fs.readFileSync(path.join(root, CLAIMS_RELATIVE_PATH), "utf8"));
  validateClaims(claims);
  // The landing page quotes the simulated decade that the Community Stats page
  // shows. It is read from the generated file, never retyped into claims.json,
  // so the two pages cannot report different numbers for the same league.
  const showcasePath = path.join(root, SHOWCASE_RELATIVE_PATH);
  if (fs.existsSync(showcasePath)) claims.showcase = JSON.parse(fs.readFileSync(showcasePath, "utf8"));
  return claims;
}

export function validateClaims(claims) {
  const problems = [];
  for (const key of ["statusLabel", "heroSubline", "privacyLine", "intelligenceLine", "statusLine"]) {
    if (typeof claims?.[key] !== "string" || !claims[key].trim()) problems.push(`claims.${key} is missing`);
  }
  if (!Array.isArray(claims?.facts) || !claims.facts.length) problems.push("claims.facts is empty");
  if (!Array.isArray(claims?.features) || !claims.features.length) problems.push("claims.features is empty");
  const ids = new Set();
  for (const feature of claims?.features || []) {
    if (!/^[a-z0-9-]+$/.test(feature.id || "")) problems.push(`feature id ${feature.id} is not a slug`);
    if (ids.has(feature.id)) problems.push(`feature id ${feature.id} is duplicated`);
    ids.add(feature.id);
    for (const key of ["title", "teaser", "description"]) {
      if (typeof feature[key] !== "string" || !feature[key].trim()) problems.push(`feature ${feature.id} lacks ${key}`);
    }
    // Every feature is shown, not only described: a screenshot and what it shows.
    if (typeof feature.image?.src !== "string" || !feature.image.src.trim()) problems.push(`feature ${feature.id} lacks a screenshot`);
    else if (typeof feature.image.alt !== "string" || feature.image.alt.trim().length < 20) problems.push(`feature ${feature.id} lacks alt text for its screenshot`);
  }
  if (problems.length) throw new Error(`claims.json is invalid:\n- ${problems.join("\n- ")}`);
  return true;
}

function renderLink(link, className = "") {
  if (!link) return "";
  const cls = className ? ` class="${className}"` : "";
  return `<a${cls} href="${safeHref(link.href)}">${escapeHtml(link.label)} <span aria-hidden="true">→</span></a>`;
}

function renderFeatureCards(claims) {
  const cards = claims.features.filter((feature) => feature.index).map((feature) => {
    const more = feature.link
      ? ` ${renderLink(feature.link)}`
      : ` <a href="./features.html#${escapeHtml(feature.id)}" aria-label="More about ${escapeHtml(feature.title)}">More <span aria-hidden="true">→</span></a>`;
    return [
      '<article class="why-card">',
      // S133: each card shows its own screenshot; lazy, sized, and decoded off
      // the main thread so the landing page's first paint does not wait on it.
      ...(feature.image?.src ? [`  <img class="why-card-shot" src="${escapeHtml(feature.image.src)}" alt="${escapeHtml(feature.image.alt || "")}" width="1440" height="900" loading="lazy" decoding="async" />`] : []),
      `  <h3>${escapeHtml(feature.title)}</h3>`,
      `  <p>${escapeHtml(feature.teaser)}${more}</p>`,
      "</article>"
    ].join("\n");
  });
  return `<div class="why-grid">\n${cards.join("\n")}\n</div>`;
}

function renderFigure(image, { eager = false } = {}) {
  if (!image) return "";
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  return [
    '<figure class="site-shot">',
    `  <img src="${safeHref(image.src)}" alt="${escapeHtml(image.alt)}" ${imageSize(image)} ${loading} decoding="async" />`,
    "</figure>"
  ].join("\n");
}

// Screenshots are 1440 by 900 unless the claim says otherwise.
function imageSize(image) {
  const width = Number.isInteger(image.width) ? image.width : 1440;
  const height = Number.isInteger(image.height) ? image.height : 900;
  return `width="${width}" height="${height}"`;
}

function imageFormat(image) {
  return /\.webp$/i.test(image.src) ? "WebP" : /\.png$/i.test(image.src) ? "PNG" : "JPEG";
}

const isShowcase = (feature) => Boolean(feature.image && feature.showcase);

function renderFeatureSection(feature, heading = "h2") {
  const showcase = isShowcase(feature);
  const copy = [
    '  <div class="site-feature-copy">',
    `    <${heading}>${escapeHtml(feature.title)}</${heading}>`,
    `    <p>${escapeHtml(feature.description)}</p>`,
    feature.link ? `    <p>${renderLink(feature.link)}</p>` : "",
    "  </div>"
  ];
  const figure = feature.image ? renderFigure(feature.image) : "";
  return [
    `<section class="site-feature${showcase ? " site-feature--shot" : ""}" id="${escapeHtml(feature.id)}">`,
    // A showcase row puts the copy beside its screenshot; a card leads with it.
    ...(showcase ? [...copy, figure] : [figure, ...copy]),
    "</section>"
  ].filter(Boolean).join("\n");
}

// Showcase features get a full row each; the rest share a grid of cards, each
// led by its own screenshot.
function renderFeatureTour(claims) {
  const shown = claims.features.filter(isShowcase).map((feature) => renderFeatureSection(feature));
  const rest = claims.features.filter((feature) => !isShowcase(feature)).map((feature) => renderFeatureSection(feature, "h3"));
  return [
    ...shown,
    '<div class="site-section site-more">',
    "<h2>And there is more</h2>",
    `<div class="site-feature-list">\n${rest.join("\n")}\n</div>`,
    "</div>"
  ].join("\n");
}

function renderFacts(claims) {
  const rows = claims.facts.map((fact) => {
    const value = fact.href
      ? `<a href="${safeHref(fact.href)}">${escapeHtml(fact.value)}</a>`
      : escapeHtml(fact.value);
    return `<div class="site-fact"><dt>${escapeHtml(fact.label)}</dt><dd>${value}</dd></div>`;
  });
  return `<dl class="site-facts">\n${rows.join("\n")}\n</dl>`;
}

function renderGallery(claims) {
  const shots = [
    ...(claims.heroImage ? [{ title: claims.heroImage.title, image: claims.heroImage }] : []),
    ...claims.features.filter((feature) => feature.image)
  ];
  const items = shots.map((feature) => [
    '<figure class="site-gallery-item">',
    `  <img src="${safeHref(feature.image.src)}" alt="${escapeHtml(feature.image.alt)}" ${imageSize(feature.image)} loading="lazy" decoding="async" />`,
    `  <figcaption>${escapeHtml(feature.title)} · <a href="${safeHref(feature.image.src)}" download>Download ${imageFormat(feature.image)}</a></figcaption>`,
    "</figure>"
  ].join("\n"));
  return `<div class="site-gallery">\n${items.join("\n")}\n</div>`;
}

// Three figures from the simulated decade, in the order a newcomer would ask:
// is the league competitive, can a club still build a dynasty, do careers add up.
const HERO_DECADE_CARDS = Object.freeze(["champions", "dynasty", "passing"]);

function renderHeroDecade(claims) {
  const showcase = claims.showcase;
  const cards = HERO_DECADE_CARDS.map((id) => (showcase?.cards || []).find((card) => card.id === id));
  if (!showcase || cards.some((card) => !card)) return "";
  const stats = cards.map((card) =>
    `<div class="hero-decade-stat"><dt>${escapeHtml(card.label)}</dt><dd>${escapeHtml(card.value)}</dd><dd class="hero-decade-detail">${escapeHtml(card.detail)}</dd></div>`);
  return [
    '<aside class="hero-decade" aria-labelledby="heroDecadeTitle">',
    `  <p class="hero-decade-kicker" id="heroDecadeTitle">One league, ${escapeHtml(showcase.seasons)} seasons, played out by the game itself</p>`,
    `  <dl class="hero-decade-stats">\n${stats.join("\n")}\n  </dl>`,
    `  <p class="hero-decade-note">A simulated league, seasons ${escapeHtml(showcase.startYear)} to ${escapeHtml(showcase.endYear)}, not player data. <a href="./stats">See the whole decade</a></p>`,
    "</aside>"
  ].join("\n");
}

export const CLAIM_BLOCKS = Object.freeze({
  "hero-decade": renderHeroDecade,
  "features-cards": renderFeatureCards,
  "feature-tour": renderFeatureTour,
  facts: renderFacts,
  gallery: renderGallery,
  "hero-shot": (claims) => (claims.heroImage ? renderFigure(claims.heroImage, { eager: true }).replace('class="site-shot"', 'class="hero-shot"') : ""),
  "status-label": (claims) => escapeHtml(claims.statusLabel),
  "status-line": (claims) => escapeHtml(claims.statusLine),
  "hero-subline": (claims) => escapeHtml(claims.heroSubline),
  privacy: (claims) => escapeHtml(claims.privacyLine),
  intelligence: (claims) => escapeHtml(claims.intelligenceLine)
});

const BLOCK_PATTERN = /<!--\s*claims:([a-z-]+):start\s*-->([\s\S]*?)<!--\s*claims:\1:end\s*-->/g;
const BARE_MARKER = /<!--\s*claims:([a-z-]+)\s*-->/g;

function renderBlock(name, claims) {
  const render = CLAIM_BLOCKS[name];
  if (!render) throw new Error(`Unknown claims block "${name}"`);
  return render(claims);
}

/**
 * Re-render every claims block in a page. Both paired blocks (kept in source)
 * and bare single markers are filled. Returns the new html plus the names it
 * filled, so callers can assert coverage.
 */
export function applyClaimBlocks(html, claims) {
  const filled = [];
  let next = String(html).replace(BLOCK_PATTERN, (whole, name) => {
    filled.push(name);
    return `<!-- claims:${name}:start -->${renderBlock(name, claims)}<!-- claims:${name}:end -->`;
  });
  next = next.replace(BARE_MARKER, (whole, name) => {
    filled.push(name);
    return `<!-- claims:${name}:start -->${renderBlock(name, claims)}<!-- claims:${name}:end -->`;
  });
  return { html: next, filled };
}

/** Blocks in `html` whose current content differs from claims.json. */
export function inspectClaimBlocks(html, claims) {
  const stale = [];
  const bare = [...String(html).matchAll(BARE_MARKER)].map((match) => match[1]);
  for (const match of String(html).matchAll(BLOCK_PATTERN)) {
    if (match[2] !== renderBlock(match[1], claims)) stale.push(match[1]);
  }
  return { ok: stale.length === 0 && bare.length === 0, stale, unfilled: bare };
}

/** Any marker text left over after rendering and comment stripping. */
export function findUnfilledMarkers(html) {
  return [...String(html).matchAll(/claims:[a-z-]+(?::start|:end)?/g)].map((match) => match[0]);
}

export function writeClaimBlocks(root = defaultRoot) {
  const claims = loadClaims(root);
  const publicDir = path.join(root, "public");
  const written = [];
  for (const name of fs.readdirSync(publicDir).filter((file) => file.endsWith(".html"))) {
    const file = path.join(publicDir, name);
    const source = fs.readFileSync(file, "utf8");
    const { html, filled } = applyClaimBlocks(source, claims);
    if (filled.length && html !== source) {
      fs.writeFileSync(file, html, "utf8");
      written.push(name);
    }
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const written = writeClaimBlocks();
    console.log(written.length ? `claims blocks refreshed: ${written.join(", ")}` : "claims blocks already current");
  } else {
    const claims = loadClaims();
    const publicDir = path.join(defaultRoot, "public");
    let stale = 0;
    for (const name of fs.readdirSync(publicDir).filter((file) => file.endsWith(".html"))) {
      const report = inspectClaimBlocks(fs.readFileSync(path.join(publicDir, name), "utf8"), claims);
      if (!report.ok) {
        stale += 1;
        console.error(`${name}: stale ${report.stale.join(", ") || "-"} · unfilled ${report.unfilled.join(", ") || "-"}`);
      }
    }
    if (stale) {
      console.error("Run: node scripts/lib/public-claims.mjs --write");
      process.exitCode = 1;
    } else {
      console.log("claims blocks: OK");
    }
  }
}
