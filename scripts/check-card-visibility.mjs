#!/usr/bin/env node
// check-card-visibility.mjs — S89 empty-state husk guard.
//
// THE BUG (shipped twice, found by hand both times): a renderer toggles `.hidden`
// on an INNER node of a card — the score paragraph, the value span — while the
// surrounding card wrapper stays visible. On an empty or failed state the player
// is left looking at a husk: a header, a grade badge and several sub-widgets with
// no data in them, instead of a cleanly hidden card. S88 fixed the second known
// instance (`<p id="gmLegacyCard">` inside `<article id="gmLegacyCardWrap">`, which
// left five visible siblings behind) and its audit explicitly asked for a gate,
// because nothing stopped a third.
//
// WHAT THIS CHECKS: every id that receives a visibility toggle anywhere in
// public/lib is resolved against a real element tree parsed from public/game.html.
// A toggle is a suspect when its target is a leaf/text-level element sitting
// inside a card-like block that would keep visible siblings, and that block is
// itself addressable but never toggled anywhere.
//
// WHY IT PARSES RATHER THAN GREPS: two earlier versions of this check were built
// and thrown away. A class-name heuristic produced 39 false positives out of 48
// toggled ids. A corrected version returned a clean result on HEAD but FAILED its
// negative control — run against the pre-S88 worktree it reported nothing, i.e. it
// would have waved the known bug straight through. The wrapper's class is
// `gm-legacy-card` (hyphen-prefixed, so word-boundary class matching misses it)
// and the sibling card has no class at all, so the reliable signal is structural:
// leaf element, card-like ancestor, surviving siblings. `test/card-visibility-gate.test.js`
// pins that negative control so this gate can never quietly start passing again.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "template"]);
// Hiding one of these can never hide a card, only blank a line inside one.
const LEAF = new Set(["p", "span", "small", "strong", "em", "b", "i", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "li", "label", "code"]);
// Blocks that read to the player as a discrete card.
const BLOCK = new Set(["article", "section", "aside", "fieldset"]);
const BLOCKISH_CLASS = /(^|[\s-])(card|panel|widget|module|tile)([\s-]|$)/i;

export function scanCardVisibility({ libDir = path.join(ROOT, "public/lib"), htmlFile = path.join(ROOT, "public/game.html") } = {}) {
  const toggled = collectToggledIds(libDir);
  const { byId } = parseTree(fs.readFileSync(htmlFile, "utf8"));

  const findings = [];
  for (const [id, sites] of toggled) {
    const node = byId.get(id);
    if (!node) continue; // created dynamically; not statically checkable
    if (!LEAF.has(node.tag)) continue; // hiding a block element is the correct shape
    const host = nearestCard(node);
    if (!host) continue;
    if (!host.id) continue; // unaddressable wrapper cannot be the intended target
    if (toggled.has(host.id)) continue; // the card itself is toggled — correct
    const survivors = host.children.filter((c) => c !== node && !isDescendant(node, c));
    if (!survivors.length) continue; // nothing would remain visible; no husk
    findings.push({
      id,
      tag: node.tag,
      host: host.id,
      survivingSiblings: survivors.map((c) => (c.id ? `${c.tag}#${c.id}` : `<${c.tag}>`)),
      sites: [...sites]
    });
  }
  return { toggledIds: toggled.size, staticIds: [...toggled.keys()].filter((k) => byId.has(k)).length, findings };
}

function collectToggledIds(libDir) {
  const toggled = new Map();
  for (const file of walkJs(libDir)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const binding = new Map();
    lines.forEach((line, index) => {
      for (const m of line.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:document\.)?getElementById\(\s*["']([^"']+)["']/g)) {
        binding.set(m[1], m[2]);
      }
      for (const m of line.matchAll(/(?:document\.)?getElementById\(\s*["']([^"']+)["']\s*\)\s*(?:\?\.|\.)\s*(?:hidden\s*=(?!=)|classList\s*\.\s*(?:add|remove|toggle)\(\s*["']hidden)/g)) {
        push(m[1], `${rel}:${index + 1}`);
      }
      for (const m of line.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*(?:hidden\s*=(?!=)|classList\s*\.\s*(?:add|remove|toggle)\(\s*["']hidden)/g)) {
        if (binding.has(m[1])) push(binding.get(m[1]), `${rel}:${index + 1}`);
      }
    });
    function push(id, where) {
      if (!toggled.has(id)) toggled.set(id, new Set());
      toggled.get(id).add(where);
    }
  }
  return toggled;
}

function nearestCard(node) {
  for (let a = node.parent; a; a = a.parent) if (BLOCK.has(a.tag) || BLOCKISH_CLASS.test(a.cls)) return a;
  return null;
}

function isDescendant(ancestor, node) {
  for (let a = node; a; a = a.parent) if (a === ancestor) return true;
  return false;
}

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(p));
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

export function parseTree(src) {
  const root = { tag: "#root", id: null, cls: "", children: [], parent: null };
  const byId = new Map();
  const stack = [root];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const [, closing, rawTag, attrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const idm = /\bid\s*=\s*"([^"]*)"/.exec(attrs);
    const clsm = /\bclass\s*=\s*"([^"]*)"/.exec(attrs);
    const parent = stack[stack.length - 1];
    const node = { tag, id: idm ? idm[1] : null, cls: clsm ? clsm[1] : "", children: [], parent };
    parent.children.push(node);
    if (node.id && !byId.has(node.id)) byId.set(node.id, node);
    if (VOID.has(tag) || selfClose) continue;
    if (RAW.has(tag)) {
      const close = src.indexOf(`</${tag}`, tagRe.lastIndex);
      if (close !== -1) tagRe.lastIndex = close;
      continue;
    }
    stack.push(node);
  }
  return { root, byId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = scanCardVisibility();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.findings.length) {
    console.error(`✖ card-visibility: ${result.findings.length} empty-state husk suspect(s) across ${result.toggledIds} toggled ids`);
    for (const f of result.findings) {
      console.error(`  - #${f.id} <${f.tag}> hides inside #${f.host}, leaving visible: ${f.survivingSiblings.join(", ")}`);
      for (const site of f.sites) console.error(`      ${site}`);
    }
    console.error("  Toggle the card wrapper, not the inner node, so the empty state hides cleanly.");
  } else {
    console.log(`✓ card-visibility: 0 husk suspects (${result.toggledIds} toggled ids, ${result.staticIds} static targets)`);
  }
  process.exit(result.findings.length ? 1 : 0);
}
