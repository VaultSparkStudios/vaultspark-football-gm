// S133: the public pages (landing, guides, FAQ, Census ...) loaded the whole
// game stylesheet, and the landing page inlines it. This builds the subset a
// public page can use: every rule whose selector could match something the
// site's own markup, scripts or build-time chrome can produce. Rules keep their
// original order, so the cascade on a public page is unchanged; the game page
// keeps the full sheet byte for byte.
//
// Conservative by construction: a rule is dropped only when EVERY selector in
// its list names a class that no site source mentions, either literally or as
// a template prefix (`frame-ras-${tier}` keeps every `frame-ras-*`). Rules with
// no class, at-rules other than @media, and anything using :is/:where/:has stay.

import fs from "node:fs";
import path from "node:path";

const TOKEN = /[A-Za-z_][A-Za-z0-9_-]*/g;

/** Split CSS into top-level blocks, respecting strings and comments. */
export function cssBlocks(css) {
  const blocks = [];
  let depth = 0, start = 0, quote = null;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) { if (ch === "\\") i += 1; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "/" && css[i + 1] === "*") { const end = css.indexOf("*/", i + 2); i = end < 0 ? css.length : end + 1; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) { blocks.push(css.slice(start, i + 1)); start = i + 1; }
    }
  }
  const tail = css.slice(start).trim();
  if (tail) blocks.push(tail);
  return blocks;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every identifier-like token in the corpus, plus template prefixes ("foo-"). */
export function corpusVocabulary(texts) {
  const tokens = new Set();
  const prefixes = new Set();
  for (const text of texts) {
    for (const match of String(text).matchAll(TOKEN)) {
      tokens.add(match[0]);
      if (match[0].endsWith("-") && match[0].length >= 4) prefixes.add(match[0]);
    }
  }
  return { tokens, prefixes: [...prefixes] };
}

function classUsed(name, vocabulary) {
  return vocabulary.tokens.has(name) || vocabulary.prefixes.some((prefix) => name.startsWith(prefix));
}

/** Could this selector list match on a public page? */
export function selectorMayMatch(selectorList, vocabulary) {
  if (/:(is|where|has)\(/.test(selectorList)) return true;
  return selectorList.split(",").some((selector) => {
    const positive = selector.replace(/:not\([^)]*\)/g, "");
    const classes = [...positive.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1]);
    return classes.every((name) => classUsed(name, vocabulary));
  });
}

/** The subset of a stylesheet a public page can use, in source order. */
export function subsetStylesheet(css, vocabulary) {
  const kept = [];
  for (const raw of cssBlocks(css)) {
    const block = stripComments(raw).trim();
    if (!block) continue;
    const open = block.indexOf("{");
    if (open < 0) { kept.push(block); continue; }
    const prelude = block.slice(0, open).trim();
    if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
      const inner = subsetStylesheet(block.slice(open + 1, block.lastIndexOf("}")), vocabulary);
      if (inner.trim()) kept.push(`${prelude}{${inner}}`);
      continue;
    }
    if (prelude.startsWith("@")) { kept.push(block); continue; }
    if (selectorMayMatch(prelude, vocabulary)) kept.push(block);
  }
  return kept.join("\n");
}

function moduleImports(source) {
  const found = [];
  for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+\.m?js)["']/g)) found.push(match[1]);
  return found;
}

/**
 * Everything a public page can render: its HTML (inline scripts included), the
 * scripts it loads and their static and dynamic imports, and the build scripts
 * that inject chrome at build time.
 */
export function collectSiteCorpus({ publicDir, pages, buildSources = [] }) {
  const texts = [];
  const seen = new Set();
  const queue = [];
  for (const page of pages) {
    const file = path.join(publicDir, page);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    texts.push(html);
    for (const match of html.matchAll(/<script[^>]+src="\.\/([^"?]+\.m?js)/g)) queue.push(path.join(publicDir, match[1]));
    for (const rel of moduleImports(html)) queue.push(path.join(publicDir, rel));
  }
  while (queue.length) {
    const file = path.normalize(queue.shift());
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    texts.push(source);
    for (const rel of moduleImports(source)) queue.push(path.join(path.dirname(file), rel));
  }
  for (const file of buildSources) if (fs.existsSync(file)) texts.push(fs.readFileSync(file, "utf8"));
  return { texts, modules: [...seen] };
}
