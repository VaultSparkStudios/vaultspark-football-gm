import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * S109 — a design-token sweep of public/styles.css. 258 six-digit hex color
 * literals sat in ordinary rules outside the token blocks, so a component
 * restyle had to be hunted down one selector at a time instead of one
 * variable edit. Every literal now resolves to a custom property declared in
 * a "token block" — a rule whose body consists solely of --custom-property
 * declarations (:root, the light-theme block, the accent presets, and the
 * per-tab section-accent overrides all qualify; an ordinary rule that merely
 * happens to be scoped under :root[data-theme="light"] does not, because it
 * assigns real visual properties like `color` or `background`).
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = path.join(rootDir, "public", "styles.css");
const css = fs.readFileSync(cssPath, "utf8");

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

/** Splits `text` into top-level (and nested) CSS rules: {selector, start, end}. */
function parseRules(text) {
  const rules = [];
  let i = 0;
  const n = text.length;
  let selStart = 0;
  const stack = [];
  while (i < n) {
    const ch = text[i];
    if (ch === "{") {
      stack.push({ selector: text.slice(selStart, i).trim(), bodyStart: i + 1 });
      i++;
      selStart = i;
    } else if (ch === "}") {
      const top = stack.pop();
      if (top) rules.push({ selector: top.selector, start: top.bodyStart, end: i });
      i++;
      selStart = i;
    } else {
      i++;
    }
  }
  return rules;
}

/** A "token block" is a rule whose every declaration is a --custom-property assignment. */
function isPureCustomPropBlock(body) {
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const decls = stripped.split(";").map((s) => s.trim()).filter(Boolean);
  if (decls.length === 0) return false;
  return decls.every((d) => /^--[a-zA-Z0-9-]+\s*:/.test(d));
}

function tokenBlockRanges(text) {
  return parseRules(text)
    .filter((r) => isPureCustomPropBlock(text.slice(r.start, r.end)))
    .map((r) => [r.start, r.end]);
}

function countHexOutsideTokenBlocks(text) {
  const ranges = tokenBlockRanges(text);
  const inRange = (idx) => ranges.some(([s, e]) => idx >= s && idx < e);
  let count = 0;
  let m;
  const re = new RegExp(HEX_RE);
  while ((m = re.exec(text))) {
    if (!inRange(m.index)) count++;
  }
  return count;
}

test("negative control: a stray hex literal in an ordinary rule is detected", () => {
  const fixture = `
:root {
  --ink: #f5f1e7;
}
.card {
  color: #ff00aa;
}
`;
  assert.equal(countHexOutsideTokenBlocks(fixture), 1);
});

test("negative control: a hex literal inside a pure custom-property block is not flagged", () => {
  const fixture = `
:root {
  --ink: #f5f1e7;
  --accent: #d7a24a;
}
:root[data-theme="light"], body[data-theme="light"] {
  --ink: #14232b;
}
`;
  assert.equal(countHexOutsideTokenBlocks(fixture), 0);
});

test("styles.css has zero hex color literals outside token blocks", () => {
  const count = countHexOutsideTokenBlocks(css);
  assert.equal(count, 0, "every #rrggbb literal must live inside a --custom-property-only rule");
});

test("every color-valued --token declared in :root has a light-theme definition or is marked theme-neutral", () => {
  const rules = parseRules(css).filter((r) => isPureCustomPropBlock(css.slice(r.start, r.end)));
  const rootBlock = rules.find((r) => r.selector.trim() === ":root");
  assert.ok(rootBlock, "expected a bare :root token block");
  const lightBlock = rules.find(
    (r) => /data-theme="light"/.test(r.selector) && /:root/.test(r.selector) && /,\s*body\[data-theme="light"\]\s*$/.test(r.selector.trim())
  );
  assert.ok(lightBlock, 'expected the ":root[data-theme=\\"light\\"], body[data-theme=\\"light\\"]" block');

  const rootBody = css.slice(rootBlock.start, rootBlock.end);
  const lightBody = css.slice(lightBlock.start, lightBlock.end);

  const colorValueRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|linear-gradient\(|radial-gradient\(/;
  const missing = [];
  for (const rawLine of rootBody.split("\n")) {
    const m = rawLine.match(/^\s*--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/);
    if (!m) continue;
    const [, name, value] = m;
    if (!colorValueRe.test(value)) continue;
    if (/theme-neutral/.test(rawLine)) continue;
    const hasLightDef = new RegExp(`--${name}\\s*:`).test(lightBody);
    if (!hasLightDef) missing.push(name);
  }

  assert.deepEqual(missing, [], `tokens missing a light-theme value or a theme-neutral marker: ${missing.join(", ")}`);
});

test("styles.css still contains no @import", () => {
  assert.equal(/@import/.test(css), false);
});
