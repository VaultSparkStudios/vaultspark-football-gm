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
  '<button id="setupThemeToggleBtn" class="theme-toggle-btn" type="button" title="Toggle theme">◐</button>';

// index.html owns its own footer (runtime picker, toggle, the full link set —
// asserted below rather than replaced) and game.html is the app shell.
export const CHROME_EXEMPT_PAGES = new Set(["index.html", "game.html"]);

const STUDIO_LEGAL =
  '<span class="studio-copyright" data-studio-copyright>© 2026 VaultSpark Studios LLC. All rights reserved.</span> · <a href="https://vaultsparkstudios.com/" rel="author">Studio home</a>';

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeEntities(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
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
    const isCurrent = currentPage && href.replace(/^\.\//, "") === currentPage;
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

export function renderBreadcrumb(title) {
  return (
    '<nav class="community-breadcrumb" aria-label="Breadcrumb">' +
    '<a href="./index.html">Franchise Architect</a><span aria-hidden="true">/</span>' +
    `<span>${escapeHtml(title)}</span>${THEME_TOGGLE_BUTTON}</nav>`
  );
}

function pageTitleFromH1(html) {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return "";
  return decodeEntities(match[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
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
  if (CHROME_EXEMPT_PAGES.has(pageName)) return html;
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

  if (!next.includes('class="community-breadcrumb"')) {
    const title = pageTitleFromH1(next) || "Franchise Architect: Football";
    next = next.replace(/(<main\b[^>]*>)/, `$1\n${renderBreadcrumb(title)}`);
  }

  next = next.replace(INLINE_THEME_INIT, "");
  next = next.replace(/[ \t]*<\/body>/, `${THEME_INIT_SCRIPT}\n</body>`);
  return next;
}

// XML has no view-source exemption either: the sitemap carried an internal
// rationale comment naming a session.
export function stripXmlComments(xml) {
  return String(xml).replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n?/g, "");
}

const NOTE_PATTERN = /<h3>(\d{4}-\d{2}-\d{2})\s*—\s*([\s\S]*?)<\/h3>\s*([\s\S]*?)(?=<h3>\d{4}-\d{2}-\d{2}|<\/section>)/g;

export function parseReleaseNotes(html) {
  const section = html.match(/<h2>(?:Release Notes|Every release note)<\/h2>([\s\S]*?)<\/section>/);
  if (!section) return [];
  const notes = [];
  // The capture stops before </section>; the last note needs that terminator
  // back or its body never closes and the oldest note silently vanishes.
  for (const match of `${section[1]}</section>`.matchAll(NOTE_PATTERN)) {
    notes.push({ date: match[1], title: match[2].trim(), body: match[3].trim() });
  }
  return notes;
}

function renderNote(note) {
  return `<h3>${note.date} — ${note.title}</h3>\n${note.body}`;
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
    `<p class="small">Earlier notes — ${notes.length - keep} more, back to ${notes[notes.length - 1].date} — live in the ` +
    `<a href="${archiveHref}">full release history</a>.</p>`;
  const latest = html.replace(
    /(<h2>Release Notes<\/h2>)([\s\S]*?)(<\/section>)/,
    (whole, open, body, close) => `${open}\n${kept}\n${pointer}\n${close}`
  );
  const archive = html
    .replace(/<title>[^<]*<\/title>/, "<title>Release History — Franchise Architect: Football</title>")
    .replace(/<meta name="description" content="[^"]*"/, '<meta name="description" content="Every dated release note for Franchise Architect: Football, oldest to newest."')
    .replace(/<h1>[^<]*<\/h1>/, "<h1>Release History</h1>")
    .replace(/(<h2>Release Notes<\/h2>)([\s\S]*?)(<\/section>)/, (whole, open, body, close) =>
      `<h2>Every release note</h2>\n<p class="small">The <a href="./status.html">status page</a> carries the newest ${keep}.</p>\n${notes.map(renderNote).join("\n")}\n${close}`
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
