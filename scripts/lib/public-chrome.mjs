/**
 * public-chrome.mjs — one header, one footer, one theme toggle for every
 * public page, rendered at build from public/footer-manifest.json.
 *
 * S109. Nine source pages carried nine hand-copied footers (about.html had no
 * Privacy or Terms link, stats.html had no About or Status link, contact and
 * the legal pages carried a lone "Return" link), three pages carried a theme
 * toggle and two of those never wired it (simulation.html had no init script;
 * stats.html passed an object to a function that takes an element id). The
 * footer contract only ever asserted the copyright line and the Studio
 * link-back, so none of that could fail a build.
 *
 * Source pages keep a minimal footer so the source-tree contract still holds
 * and the dev server still renders; the build replaces it with the canonical
 * one. Everything here is a pure string transform so it can be tested without
 * building.
 */

export const THEME_INIT_SCRIPT =
  '<script type="module">import { initThemeCustomizer } from "./lib/themeCustomizer.js"; initThemeCustomizer("setupThemeToggleBtn");</script>';

export const THEME_TOGGLE_BUTTON =
  '<button id="setupThemeToggleBtn" class="theme-toggle-btn" type="button" title="Theme" aria-label="Customize theme">◐</button>';

// index.html owns its own footer (runtime picker, the full link set — asserted
// below rather than replaced) and game.html is the app shell. index.html still
// receives the shared site header; game.html receives nothing.
export const CHROME_EXEMPT_PAGES = new Set(["index.html", "game.html"]);
export const HEADER_EXEMPT_PAGES = new Set(["game.html"]);

const STUDIO_LEGAL =
  '<span class="studio-copyright" data-studio-copyright>© 2026 VaultSpark Studios LLC. All rights reserved.</span> · <a href="https://vaultsparkstudios.com/" rel="author">Studio home</a>';

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


function pageKey(value) {
  return String(value || "").replace(/^\.?\//, "").replace(/\.html$/, "");
}

function samePage(href, currentPage) {
  return Boolean(currentPage) && !/^https?:/.test(href) && pageKey(href) === pageKey(currentPage);
}

export function footerLinkLabel(href, manifest) {
  const labels = manifest?.labels || {};
  if (labels[href]) return labels[href];
  const name = href.replace(/^\.\//, "").replace(/\.html$/, "").replace(/^\//, "");
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : href;
}

export function renderFooter(manifest, { currentPage = "" } = {}) {
  const links = (manifest?.footerLinks || []).map((href) => {
    const label = escapeHtml(footerLinkLabel(href, manifest));
    const external = /^https?:\/\//.test(href);
    const isCurrent = samePage(href, currentPage);
    const attrs = [
      `href="${escapeHtml(href)}"`,
      external ? 'target="_blank" rel="noopener"' : "",
      isCurrent ? 'aria-current="page"' : ""
    ].filter(Boolean).join(" ");
    return `<a ${attrs}>${label}</a>`;
  });
  return [
    '<footer class="setup-footer public-chrome-footer">',
    `  <nav class="public-chrome-nav" aria-label="Site">${links.join(" · ")}</nav>`,
    `  ${STUDIO_LEGAL}`,
    "</footer>"
  ].join("\n");
}

/**
 * One primary navigation for every public page, from manifest.headerLinks.
 * Carries the theme toggle, so no page needs a second one.
 */
export function renderSiteHeader(manifest, { currentPage = "" } = {}) {
  const links = (manifest?.headerLinks || []).filter((href) => href !== "./index.html").map((href) => {
    const isCurrent = samePage(href, currentPage);
    const attrs = [`href="${escapeHtml(href)}"`, isCurrent ? 'aria-current="page"' : ""].filter(Boolean).join(" ");
    const label = manifest?.headerLabels?.[href] || footerLinkLabel(href, manifest);
    return `<a ${attrs}>${escapeHtml(label)}</a>`;
  });
  // The landing page's own hero button is its one primary call to action.
  const play = samePage("./index.html", currentPage) ? "" : '    <a class="site-play btn-primary" href="./index.html">Play free</a>';
  return [
    '<header class="site-header" data-site-header>',
    '  <div class="site-header-inner">',
    '    <a class="site-brand" href="./index.html"><img src="./images/franchise-architect-mark.svg" alt="" width="28" height="28" /><span>Franchise Architect</span></a>',
    `    <nav class="site-nav" aria-label="Primary">${links.join("")}</nav>`,
    play,
    `    ${THEME_TOGGLE_BUTTON}`,
    "  </div>",
    "</header>"
  ].filter(Boolean).join("\n");
}

const SITE_HEADER = /<header class="site-header"[^>]*>[\s\S]*?<\/header>/;
const SOURCE_BREADCRUMB = /[ \t]*<nav class="community-breadcrumb"[^>]*>[\s\S]*?<\/nav>[ \t]*\r?\n?/g;

export function injectSiteHeader(html, { pageName, manifest }) {
  if (HEADER_EXEMPT_PAGES.has(pageName)) return html;
  const header = renderSiteHeader(manifest, { currentPage: pageName });
  if (SITE_HEADER.test(html)) return html.replace(SITE_HEADER, header);
  return html.replace(/(<main\b)/, `${header}\n$1`);
}

export function renderBreadcrumb(title) {
  return (
    '<nav class="community-breadcrumb" aria-label="Breadcrumb">' +
    '<a href="./index.html">Franchise Architect</a><span aria-hidden="true">/</span>' +
    `<span>${escapeHtml(title)}</span>${THEME_TOGGLE_BUTTON}</nav>`
  );
}


// Repeated link groups and lone "Return to" links are navigation that the
// canonical footer owns. Other single links can be primary actions or contact.
const LINK_ONLY_PARAGRAPH = /[ \t]*<p(?:\s+class="[^"]*")?>\s*(?:<a\b[^>]*>[^<]*<\/a>\s*(?:·|&middot;|\|)?\s*)+<\/p>[ \t]*\r?\n?/g;
const LEGACY_FOOTER = /<footer class="(?:studio-legal-footer|setup-footer)"[^>]*>[\s\S]*?<\/footer>/;
const INLINE_THEME_INIT = /[ \t]*<script type="module">\s*import \{ initThemeCustomizer \}[^<]*<\/script>[ \t]*\r?\n?/g;

/**
 * Transform one built page. Idempotent: running it on its own output changes
 * nothing, which is what lets the build call it without tracking state.
 */
export function renderPublicChrome(html, { pageName, manifest }) {
  if (HEADER_EXEMPT_PAGES.has(pageName)) return html;
  if (CHROME_EXEMPT_PAGES.has(pageName)) return injectSiteHeader(String(html), { pageName, manifest });
  let next = String(html);

  next = next.replace(LINK_ONLY_PARAGRAPH, (paragraph) => {
    const links = [...paragraph.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)];
    if (links.length > 1) return "";
    if (links.length === 1 && links[0][1] === "./index.html" && /^Return to\b/i.test(links[0][2].trim())) return "";
    return paragraph;
  });

  const footer = renderFooter(manifest, { currentPage: pageName });
  if (next.includes("public-chrome-footer")) {
    next = next.replace(/<footer class="setup-footer public-chrome-footer">[\s\S]*?<\/footer>/, footer);
  } else if (LEGACY_FOOTER.test(next)) {
    next = next.replace(LEGACY_FOOTER, footer);
  } else {
    next = next.replace("</body>", `${footer}\n</body>`);
  }

  // The shared site header carries navigation and the theme toggle, so
  // the per-page breadcrumb (and the toggle inside it) is retired.
  next = next.replace(SOURCE_BREADCRUMB, "");
  next = injectSiteHeader(next, { pageName, manifest });

  next = next.replace(INLINE_THEME_INIT, "");
  next = next.replace(/[ \t]*<\/body>/, `${THEME_INIT_SCRIPT}\n</body>`);
  return next;
}

// XML has no view-source exemption either: the sitemap carried an internal
// rationale comment naming a session.
export function stripXmlComments(xml) {
  return String(xml).replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n?/g, "");
}

// A built note carries an id anchor (<h3 id="note-…">); the source does not.
// Both shapes parse, so the transform stays idempotent.
const NOTE_PATTERN = /<h3(?:\s+id="[^"]*")?>(\d{4}-\d{2}-\d{2})\s*—\s*([\s\S]*?)<\/h3>\s*([\s\S]*?)(?=<h3(?:\s+id="[^"]*")?>\d{4}-\d{2}-\d{2}|<p class="small">Earlier notes|<\/section>)/g;

export function parseReleaseNotes(html) {
  const section = html.match(/<h2>(?:Release Notes|Every release note)<\/h2>([\s\S]*?)<\/section>/);
  if (!section) return [];
  const notes = [];
  // The capture stops before </section>; the last note needs that terminator
  // back or its body never closes and the oldest note silently vanishes.
  for (const match of `${section[1]}</section>`.matchAll(NOTE_PATTERN)) {
    notes.push({ date: match[1], title: match[2].trim(), body: match[3].trim() });
  }
  return assignNoteIds(notes);
}

// Stable, linkable anchors: note-YYYY-MM-DD, with -2, -3 for a second note
// on the same day (counted oldest first so an older anchor never moves).
function assignNoteIds(notes) {
  const seen = new Map();
  for (const note of [...notes].reverse()) {
    const count = (seen.get(note.date) || 0) + 1;
    seen.set(note.date, count);
    note.id = count === 1 ? `note-${note.date}` : `note-${note.date}-${count}`;
  }
  return notes;
}

function renderNote(note) {
  return `<h3 id="${note.id}">${note.date} — ${note.title}</h3>\n${note.body}`;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function plainText(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * RSS 2.0 feed of every release note, generated from the same parse as the
 * status and changelog pages, so the feed cannot say something they do not.
 */
export function renderChangelogFeed(notes, { siteUrl, pagePath = "changelog.html", feedPath = "changelog.xml", title = "Franchise Architect: Football — Changelog" } = {}) {
  const base = String(siteUrl).replace(/\/?$/, "/");
  const items = notes.map((note) => {
    const link = `${base}${pagePath}#${note.id}`;
    return [
      "    <item>",
      `      <title>${xmlEscape(note.title)}</title>`,
      `      <link>${xmlEscape(link)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      `      <pubDate>${new Date(`${note.date}T12:00:00Z`).toUTCString()}</pubDate>`,
      `      <description>${xmlEscape(plainText(note.body))}</description>`,
      "    </item>"
    ].join("\n");
  });
  const newest = notes[0] ? new Date(`${notes[0].date}T12:00:00Z`).toUTCString() : new Date(0).toUTCString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xmlEscape(title)}</title>`,
    `    <link>${xmlEscape(`${base}${pagePath}`)}</link>`,
    `    <atom:link href="${xmlEscape(`${base}${feedPath}`)}" rel="self" type="application/rss+xml" />`,
    "    <description>Every dated change to Franchise Architect: Football, newest first.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${newest}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    ""
  ].join("\n");
}

/**
 * status.html keeps the newest `keep` notes and points at the archive; the
 * archive page carries every note. The source page stays complete so the
 * public-truth freshness gate (which reads the source) and the history both
 * keep one home.
 */
export function splitStatusNotes(html, { keep = 4, archiveHref = "./status-archive.html" } = {}) {
  const notes = parseReleaseNotes(html);
  if (notes.length <= keep) return { latest: html, archive: null, notes };
  const kept = notes.slice(0, keep).map(renderNote).join("\n");
  const pointer =
    `<p class="small">Earlier notes — ${notes.length - keep} more, back to ${notes[notes.length - 1].date} — are in the ` +
    `<a href="${archiveHref}">changelog</a>, also available as an <a href="./changelog.xml">RSS feed</a>.</p>`;
  const latest = html.replace(
    /(<h2>Release Notes<\/h2>)([\s\S]*?)(<\/section>)/,
    (whole, open, body, close) => `${open}\n${kept}\n${pointer}\n${close}`
  );
  const archiveDescription = "Every dated change to Franchise Architect: Football, newest first.";
  const archive = html
    .replace(/<title>[^<]*<\/title>/, "<title>Changelog — Franchise Architect: Football</title>")
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${archiveDescription}"`)
    .replace(/<meta property="og:title" content="[^"]*"/, '<meta property="og:title" content="Changelog — Franchise Architect: Football"')
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${archiveDescription}"`)
    .replace(/<h1>[^<]*<\/h1>/, "<h1>Changelog</h1>")
    .replace(/(<h2>Release Notes<\/h2>)([\s\S]*?)(<\/section>)/, (whole, open, body, close) =>
      `<h2>Every release note</h2>\n<p class="small">Newest first. The <a href="./status.html">status page</a> carries the latest ${keep}; subscribe with the <a href="./changelog.xml">RSS feed</a>.</p>\n${notes.map(renderNote).join("\n")}\n${close}`
    );
  return { latest, archive, notes };
}

/**
 * index.html is exempt from replacement, so it is asserted instead: its own
 * footer must carry every manifest destination or the exemption hides drift.
 */
export function inspectIndexFooter(html, manifest) {
  const footer = html.match(/<footer class="setup-footer"[^>]*>[\s\S]*?<\/footer>/)?.[0] || "";
  const hrefs = new Set([...footer.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  // The root page does not link to itself.
  const missing = (manifest?.footerLinks || []).filter((href) => href !== "./index.html" && !hrefs.has(href));
  return { ok: missing.length === 0, missing };
}

// Social and install metadata, guaranteed on every public page at build. A
// page that declares its own og:title/description keeps it; one that does not
// inherits its <title> and meta description, so no page shares as a bare URL.
const THEME_COLOR_DARK = "#090c0e";
const THEME_COLOR_LIGHT = "#f3f6f2";

function attributeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().replace(/"/g, "&quot;");
}

export function ensurePageMetadata(html, { ogImageUrl = "https://playfranchisearchitect.com/images/cover.png" } = {}) {
  let next = html;
  const title = attributeText(next.match(/<title>([^<]*)<\/title>/)?.[1]);
  const description = attributeText(next.match(/<meta name="description" content="([^"]*)"/)?.[1]);
  const ogTitle = next.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || title;
  const ogDescription = next.match(/<meta property="og:description" content="([^"]*)"/)?.[1] || description;
  const tags = [];
  const missing = (pattern) => !pattern.test(next);
  if (missing(/property="og:title"/)) tags.push(`<meta property="og:title" content="${title}" />`);
  if (missing(/property="og:description"/) && description) tags.push(`<meta property="og:description" content="${description}" />`);
  if (missing(/property="og:type"/)) tags.push('<meta property="og:type" content="website" />');
  if (missing(/property="og:site_name"/)) tags.push('<meta property="og:site_name" content="Franchise Architect: Football" />');
  if (missing(/name="twitter:card"/)) tags.push('<meta name="twitter:card" content="summary_large_image" />');
  if (missing(/name="twitter:title"/)) tags.push(`<meta name="twitter:title" content="${ogTitle}" />`);
  if (missing(/name="twitter:description"/) && ogDescription) tags.push(`<meta name="twitter:description" content="${ogDescription}" />`);
  if (missing(/name="twitter:image"/)) tags.push(`<meta name="twitter:image" content="${ogImageUrl}" />`);
  if (missing(/name="theme-color"/)) {
    tags.push(`<meta name="theme-color" content="${THEME_COLOR_DARK}" media="(prefers-color-scheme: dark)" />`);
    tags.push(`<meta name="theme-color" content="${THEME_COLOR_LIGHT}" media="(prefers-color-scheme: light)" />`);
  }
  if (missing(/rel="icon"/)) tags.push('<link rel="icon" href="./favicon.svg" type="image/svg+xml" />');
  if (missing(/rel="apple-touch-icon"/)) tags.push('<link rel="apple-touch-icon" href="./images/apple-touch-icon.png" />');
  if (missing(/rel="manifest"/)) tags.push('<link rel="manifest" href="./manifest.webmanifest" />');
  if (!tags.length) return next;
  return next.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}
