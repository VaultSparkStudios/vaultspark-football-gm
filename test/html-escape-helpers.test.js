import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every locally defined HTML/XML escape helper in the browser code must escape
 * & < > " ' — one copy once left the quotes out, which is enough to break out
 * of an attribute. The canonical helper is `escapeHtml` in public/lib/appCore.js.
 * Standalone modules (pure, Node-tested, or loaded outside the main bundle)
 * keep a local copy rather than importing appCore's whole module graph, so this
 * test finds each copy in the source, runs it, and compares it to the canon.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBE = `<a href="x" title='y'>Tom & "Jerry's"</a>`;
const EXPECTED = "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; &quot;Jerry&#39;s&quot;&lt;/a&gt;";

function browserSources() {
  const files = [];
  const walk = (directory, recurse) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (recurse) walk(full, true); } else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  walk(path.join(ROOT, "public"), false);
  walk(path.join(ROOT, "public", "lib"), true);
  return files;
}

function matchBraces(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") { depth -= 1; if (depth === 0) return index + 1; }
  }
  return -1;
}

/**
 * Finds helpers by what they do, not by name: a function or arrow constant
 * whose body replaces a character with the literal "&amp;" and "&lt;".
 */
export function findEscapeHelpers(source) {
  const helpers = [];
  const seen = new Set();
  const literal = /(["'])&amp;\1/g;
  const definition = /(?:function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g;
  for (let hit = literal.exec(source); hit; hit = literal.exec(source)) {
    let start = null;
    definition.lastIndex = 0;
    for (let candidate = definition.exec(source); candidate && candidate.index < hit.index; candidate = definition.exec(source)) start = candidate;
    if (!start || seen.has(start.index)) continue;
    seen.add(start.index);
    let expression;
    if (start[1]) {
      const end = matchBraces(source, start.index + start[0].length - 1);
      expression = source.slice(start.index, end);
    } else {
      const arrowStart = source.indexOf("=", start.index) + 1;
      const bodyStart = start.index + start[0].length;
      const firstBodyChar = source.slice(bodyStart).search(/\S/) + bodyStart;
      const end = source[firstBodyChar] === "{" ? matchBraces(source, firstBodyChar) : source.indexOf("\n", bodyStart);
      expression = source.slice(arrowStart, end === -1 ? source.length : end).trim().replace(/;\s*$/, "");
    }
    // The literal must sit inside the definition found, and the definition must
    // be an escaper (it also maps "<"), not a renderer that mentions an entity.
    if (!expression.includes(hit[0]) || !/(["'])&lt;\1/.test(expression)) continue;
    helpers.push({ name: start[1] || start[2], expression });
  }
  return helpers;
}

function run(helper) {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${helper.expression});`)()(PROBE);
}

const found = browserSources().flatMap((file) => findEscapeHelpers(fs.readFileSync(file, "utf8"))
  .map((helper) => ({ ...helper, file: path.relative(ROOT, file).replaceAll("\\", "/") })));

test("the scanner finds the escape helpers that exist in the browser code", () => {
  const files = new Set(found.map((helper) => helper.file));
  for (const expected of [
    "public/lib/appCore.js", "public/lib/firstSeasonContract.js", "public/lib/franchiseNewsletter.js",
    "public/lib/leagueStoryExport.js", "public/lib/mobileLoop.js", "public/lib/frontOfficeAdvisor.js",
    "public/lib/playerPortrait.js", "public/lib/lookAhead.js", "public/setup.js"
  ]) assert.ok(files.has(expected), `expected to find an escape helper in ${expected}`);
  assert.ok(found.length >= 15, `only ${found.length} helpers found; the scanner has stopped seeing them`);
});

test("every locally defined escape helper escapes & < > \" ' exactly as the shared helper does", () => {
  const failures = [];
  for (const helper of found) {
    let output;
    try { output = run(helper); } catch (error) { failures.push(`${helper.file} ${helper.name}: could not be run (${error.message})`); continue; }
    if (output !== EXPECTED) failures.push(`${helper.file} ${helper.name}: ${JSON.stringify(output)}`);
  }
  assert.deepEqual(failures, [], `escape helpers that differ from ${JSON.stringify(EXPECTED)}`);
});

test("the check goes red for a helper that leaves a quote unescaped", () => {
  const defective = [
    `function esc(s) {\n  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");\n}`,
    `function esc(s) {\n  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");\n}`,
    `const escape = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);\n`
  ];
  for (const source of defective) {
    const helpers = findEscapeHelpers(source);
    assert.equal(helpers.length, 1, "the defective helper must be found");
    assert.notEqual(run(helpers[0]), EXPECTED);
  }
});
