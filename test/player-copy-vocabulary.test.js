import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Player-copy vocabulary gate.
 *
 * The game talks to a football fan, not to the people who built it. Words that
 * describe how the software keeps its books ("receipt", "ledger", "thesis",
 * "authority", "provenance" ...) are retired from everything a player can read.
 * They stay legal in identifiers, data keys, CSS classes, storage keys and
 * comments, because renaming those would change behaviour for no player gain.
 *
 * What is scanned: every string/template literal in public/*.js, public/lib/*.js
 * and the engine under src/ (the engine writes the news, objectives, advice and
 * error text the client shows as-is), plus the markup text and the
 * aria-label/title/placeholder/alt values of public/game.html.
 * What is NOT scanned: the marketing pages, comments, and src/community. The
 * Community Stats service describes its own counting method on the stats page,
 * where "receipt" is the published name of a counted event; that wording is
 * kept in step with that page, not with the game.
 *
 * Glossary (retired -> use instead):
 *   receipt            -> result / record / recap / note (per context)
 *   thesis             -> plan / focus
 *   ledger             -> record / log
 *   evidence path(s)   -> track record
 *   committed evidence -> results so far
 *   authority          -> drop it, or "your call" / "official"
 *   prologue           -> opening
 *   provenance         -> source / where it came from
 *   render fixture, exact command, portfolio in formation -> say what it is
 *   hypothesis         -> adjustment / idea to try
 *   controlled call    -> call
 *   observed signal    -> what the game showed
 *   telemetry          -> stats
 *   packet             -> the numbers / the brief
 *   degraded           -> failed
 *
 * PLAYER_COPY_VOCAB_ROOT points the scan at another copy of the repo (used by
 * the negative control described in the test at the bottom of this file).
 */

const repoRoot = process.env.PLAYER_COPY_VOCAB_ROOT
  ? path.resolve(process.env.PLAYER_COPY_VOCAB_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RETIRED = Object.freeze([
  ["receipt", /\breceipts?\b/gi],
  ["thesis", /\bthes[ie]s\b/gi],
  ["ledger", /\bledgers?\b/gi],
  ["evidence path", /\bevidence\s+paths?\b/gi],
  ["committed evidence", /\bcommitted\s+evidence\b/gi],
  ["authority", /\bauthorit(?:y|ies)\b/gi],
  ["prologue", /\bprologues?\b/gi],
  ["provenance", /\bprovenance\b/gi],
  ["render fixture", /\brender\s+fixtures?\b/gi],
  ["exact command", /\bexact\s+commands?\b/gi],
  ["portfolio in formation", /\bportfolio\s+in\s+formation\b/gi],
  ["hypothesis", /\bhypothes[ie]s\b/gi],
  ["controlled call", /\bcontrolled\s+calls?\b/gi],
  ["observed signal", /\bobserved\s+signals?\b/gi],
  ["telemetry", /\btelemetry\b/gi],
  ["packet", /\bpackets?\b/gi],
  ["degraded", /\bdegraded\b/gi]
]);

/**
 * Literals that contain a retired word but are never shown to a player.
 * Keep this list short and say why each entry is safe.
 * Format: "<file under public/>::<exact literal text after markup stripping>".
 *
 * It is empty today: identifiers, data keys, CSS classes, storage keys, import
 * paths and comments are already skipped by the scanner itself (see
 * findRetiredWords), so nothing needs a named exception.
 */
const NOT_PLAYER_VISIBLE = new Set([]);

const IDENTIFIER_CHARS = /[-_./:=#@\\\u0000]/;
const VISIBLE_ATTRS = /\b(?:aria-label|aria-description|title|placeholder|alt|label|data-tooltip|data-tip)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Replace each tag with the text of its human-readable attributes. */
export function stripMarkup(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-zA-Z][^<>]*>/g, (tag) => {
      const kept = [];
      for (const match of tag.matchAll(VISIBLE_ATTRS)) kept.push(match[1] ?? match[2] ?? "");
      return kept.length ? ` ${kept.join(" ")} ` : " ";
    });
}

/**
 * A minimal JS scanner: yields the text of every string and template literal
 * with the line it starts on. Interpolations become "\u0000" so a word glued to
 * `${...}` reads as part of an identifier, not as prose.
 */
export function extractLiterals(source) {
  const out = [];
  let i = 0;
  let line = 1;
  let lastSignificant = "";
  const n = source.length;
  const regexAllowedAfter = /^[(,=:[!&|?{};+\-*%<>~^]$/;

  function readQuoted(quote) {
    const startLine = line;
    let text = "";
    i += 1;
    while (i < n && source[i] !== quote) {
      if (source[i] === "\\") {
        const next = source[i + 1];
        text += next === "n" || next === "t" || next === "r" ? " " : next;
        if (next === "\n") line += 1;
        i += 2;
        continue;
      }
      if (source[i] === "\n") { line += 1; break; }
      text += source[i];
      i += 1;
    }
    i += 1;
    out.push({ text, line: startLine });
  }

  function readTemplate() {
    const startLine = line;
    let text = "";
    i += 1;
    while (i < n && source[i] !== "`") {
      if (source[i] === "\\") { text += source[i + 1] === "n" ? " " : source[i + 1]; i += 2; continue; }
      if (source[i] === "$" && source[i + 1] === "{") {
        i += 2;
        text += "\u0000";
        readCode(true);
        continue;
      }
      if (source[i] === "\n") line += 1;
      text += source[i];
      i += 1;
    }
    i += 1;
    out.push({ text, line: startLine });
  }

  function readCode(untilBrace) {
    let depth = 0;
    while (i < n) {
      const ch = source[i];
      const next = source[i + 1];
      if (ch === "\n") { line += 1; i += 1; continue; }
      if (ch === "/" && next === "/") { while (i < n && source[i] !== "\n") i += 1; continue; }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < n && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") line += 1; i += 1; }
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"') { readQuoted(ch); lastSignificant = '"'; continue; }
      if (ch === "`") { readTemplate(); lastSignificant = '"'; continue; }
      if (ch === "/" && (lastSignificant === "" || regexAllowedAfter.test(lastSignificant) || /(?:return|typeof|case|in|of)$/.test(source.slice(Math.max(0, i - 8), i).trimEnd()))) {
        // regex literal: skip to the closing slash, honouring classes and escapes
        i += 1;
        let inClass = false;
        while (i < n && source[i] !== "\n") {
          if (source[i] === "\\") { i += 2; continue; }
          if (source[i] === "[") inClass = true;
          else if (source[i] === "]") inClass = false;
          else if (source[i] === "/" && !inClass) break;
          i += 1;
        }
        i += 1;
        lastSignificant = "/";
        continue;
      }
      if (untilBrace) {
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          if (depth === 0) { i += 1; return; }
          depth -= 1;
        }
      }
      if (!/\s/.test(ch)) lastSignificant = ch;
      i += 1;
    }
  }

  readCode(false);
  return out;
}

/** Retired words in one piece of text that a player would read as prose. */
export function findRetiredWords(rawText) {
  const text = stripMarkup(rawText);
  const hits = [];
  // A literal with no whitespace that does not start with a capital is a key,
  // a path, a class or an event name ("receipt", "./playtestReceipts.js").
  const trimmed = text.trim();
  if (!trimmed) return hits;
  if (!/\s/.test(trimmed) && !/^[A-Z]/.test(trimmed)) return hits;
  for (const [word, pattern] of RETIRED) {
    for (const match of text.matchAll(pattern)) {
      const before = text[match.index - 1] || " ";
      const after = text[match.index + match[0].length] || " ";
      const glued = IDENTIFIER_CHARS.test(before) || IDENTIFIER_CHARS.test(after);
      // "weekly-plan-receipt", "plan:receipt", "data-receipt=" are identifiers.
      // A capitalised or sentence-final use ("Receipt-backed", "the ledger.") is copy.
      if (glued) {
        const sentenceEnd = !IDENTIFIER_CHARS.test(before) && /[.:]/.test(after) && /^(?:\s|$)/.test(text.slice(match.index + match[0].length + 1, match.index + match[0].length + 2) || " ");
        const capitalised = /^[A-Z]/.test(match[0]) && !/[_./=#@\\\u0000]/.test(before + after);
        if (!sentenceEnd && !capitalised) continue;
      }
      hits.push({ word, found: match[0] });
    }
  }
  return hits;
}

export function scanJs(source) {
  const findings = [];
  for (const literal of extractLiterals(source)) {
    for (const hit of findRetiredWords(literal.text)) {
      findings.push({ ...hit, line: literal.line, text: stripMarkup(literal.text).replace(/\u0000/g, "…").replace(/\s+/g, " ").trim() });
    }
  }
  return findings;
}

export function scanHtml(source) {
  const findings = [];
  const body = source
    .replace(/<script\b[\s\S]*?<\/script>/gi, (block) => block.replace(/[^\n]/g, " "))
    .replace(/<style\b[\s\S]*?<\/style>/gi, (block) => block.replace(/[^\n]/g, " "))
    .replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, " "));
  body.split("\n").forEach((lineText, index) => {
    for (const hit of findRetiredWords(` ${lineText} `)) {
      findings.push({ ...hit, line: index + 1, text: stripMarkup(lineText).replace(/\s+/g, " ").trim() });
    }
  });
  return findings;
}

export function scanPlayerCopy(root = repoRoot) {
  const findings = [];
  const libDir = path.join(root, "public", "lib");
  for (const name of fs.readdirSync(libDir).filter((entry) => entry.endsWith(".js")).sort()) {
    const file = `lib/${name}`;
    for (const finding of scanJs(fs.readFileSync(path.join(libDir, name), "utf8"))) {
      if (NOT_PLAYER_VISIBLE.has(`${file}::${finding.text}`)) continue;
      findings.push({ file, ...finding });
    }
  }
  const publicDir = path.join(root, "public");
  for (const name of fs.readdirSync(publicDir).filter((entry) => entry.endsWith(".js")).sort()) {
    for (const finding of scanJs(fs.readFileSync(path.join(publicDir, name), "utf8"))) findings.push({ file: name, ...finding });
  }
  const html = fs.readFileSync(path.join(root, "public", "game.html"), "utf8");
  for (const finding of scanHtml(html)) findings.push({ file: "game.html", ...finding });
  return findings;
}

/** Directories under src/ whose text is not written for the game's player. */
const ENGINE_NOT_PLAYER_COPY = new Set(["community"]);

/** Every .js file under src/, as repo-relative paths, in a stable order. */
export function engineSourceFiles(root = repoRoot) {
  const files = [];
  const walk = (dir, top) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (top && ENGINE_NOT_PLAYER_COPY.has(entry.name)) continue;
        walk(path.join(dir, entry.name), false);
      } else if (entry.name.endsWith(".js")) {
        files.push(path.relative(root, path.join(dir, entry.name)).replaceAll("\\", "/"));
      }
    }
  };
  walk(path.join(root, "src"), true);
  return files;
}

export function scanEngineCopy(root = repoRoot) {
  const findings = [];
  for (const file of engineSourceFiles(root)) {
    for (const finding of scanJs(fs.readFileSync(path.join(root, file), "utf8"))) findings.push({ file, ...finding });
  }
  return findings;
}

test("player-visible copy carries no retired process words", () => {
  const findings = scanPlayerCopy();
  const report = findings
    .map((entry) => `  public/${entry.file}:${entry.line}  "${entry.found}"  in: ${entry.text.slice(0, 140)}`)
    .join("\n");
  assert.equal(findings.length, 0, `Retired words in player copy (see the glossary at the top of this file):\n${report}`);
});

test("text the engine sends to the player carries no retired process words", () => {
  const files = engineSourceFiles();
  assert.ok(files.length > 100, `the engine scan found only ${files.length} files; it is looking in the wrong place`);
  assert.ok(files.includes("src/runtime/GameSession.js"));
  assert.ok(!files.some((file) => file.startsWith("src/community/")));
  const findings = scanEngineCopy();
  const report = findings
    .map((entry) => `  ${entry.file}:${entry.line}  "${entry.found}"  in: ${entry.text.slice(0, 140)}`)
    .join("\n");
  assert.equal(findings.length, 0, `Retired words in engine text (see the glossary at the top of this file):\n${report}`);
});

test("the engine scan catches the wording it replaced", () => {
  // Negative control: the lines this gate was written against, as they were.
  const before = [
    '{ id: "receipt", label: "Earn the first receipt", complete: false }',
    "const line = `Receipts are in: the beat reporter went ${hits}-${misses} on preseason predictions`;",
    'return { ok: false, error: "Trade authority changed after evaluation. Re-evaluate before committing." };',
    "if (!Array.isArray(charges)) fail('cap receipts');",
    'throw new Error("Invalid reserve game ledger");',
    'const label = score >= 35 ? "Emerging Architect" : "Portfolio In Formation";'
  ];
  for (const line of before) assert.ok(scanJs(line).length > 0, `expected a finding in: ${line}`);
  // The data key that names the objective is untouched and must stay legal.
  assert.deepEqual(scanJs('{ id: "receipt", label: "Play your first game" }'), []);
});

test("the scanner flags retired words in copy and ignores identifiers", () => {
  // Negative control: copy in every shape the game uses must be caught.
  const copy = [
    'el.textContent = "Opening Contract · Receipt Earned";',
    "el.innerHTML = `<strong class=\"x\">Your Architect Thesis</strong>`;",
    "const s = `${count} tactics in the ledger`;",
    'const t = "The ledger.";',
    "const a = `<div aria-label=\"Tactical identity ledger\"></div>`;",
    'toast("Full evidence paths are available.");',
    'const p = cond ? "Live Prologue" : "ok";',
    'const q = "Source provenance is recorded";',
    'const r = "Server authority confirmed";'
  ];
  for (const line of copy) {
    assert.ok(scanJs(line).length > 0, `expected a finding in: ${line}`);
  }
  assert.ok(scanHtml('<h3 class="a">Decision Consequence Ledger</h3>').length > 0);
  assert.ok(scanHtml('<button title="Open the receipt">Go</button>').length > 0);

  // Identifiers, keys, classes, paths and comments are not copy.
  const notCopy = [
    'import { x } from "./playtestReceipts.js";',
    'const receipt = state.dashboard?.startScenarioReceipt; // the receipt ledger',
    'card.className = "weekly-plan-receipt receipt-success";',
    "el.innerHTML = `<div class=\"rehab-receipt ${tone}\" data-receipt-id=\"${id}\">Cleared</div>`;",
    'record({ surface: "desk", operation: "weekly-plan:receipt" });',
    'if (kind === "receipt") return entry["ledger"];',
    'const key = `authority:${id}`;',
    "/* the architect thesis ledger */ const n = 1;",
    'const re = /receipt "ledger"/i;'
  ];
  for (const line of notCopy) {
    assert.deepEqual(scanJs(line), [], `expected no finding in: ${line}`);
  }
  assert.deepEqual(scanHtml('<div id="receiptLedger" class="thesis-ledger" data-authority="x">Results</div><!-- ledger -->'), []);
});
