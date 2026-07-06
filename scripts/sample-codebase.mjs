#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const maxTokens = readNumberFlag("--max-tokens", 30000);
const MAX_FILE_TOKENS = 3200;
const MIN_FILE_TOKENS = 120;

const SKIP_DIRS = new Set([
  ".git",
  ".cache",
  ".ops-cache",
  ".pw-saves",
  ".wrangler",
  "node_modules",
  "output",
  "static",
  "test-results"
]);

const INCLUDE_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".md"]);
const ROOTS = ["public", "src", "scripts", "test", "tests-ui", "context", "docs"];

function readNumberFlag(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function approxTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    if (/^AUDIT_.*\.(md|json)$/.test(name) || /^CLOSEOUT_BRIEF/.test(name)) continue;
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      walk(file, out);
      continue;
    }
    if (!INCLUDE_EXT.has(path.extname(name).toLowerCase())) continue;
    out.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return out;
}

function priorityFor(rel) {
  const normalized = rel.replace(/\\/g, "/");
  const score = [
    [/^public\/app\.js$/, 120, "browser app shell"],
    [/^public\/lib\/(gameFlow|appCore|mobileLoop|engagementFeatures|tab[A-Z].*)\.js$/, 115, "browser game module"],
    [/^src\/runtime\//, 105, "runtime source"],
    [/^src\/engine\//, 100, "simulation engine"],
    [/^scripts\/(ops|cache-genius-list|generate-innovation-pack|render-startup-brief|run-test-shard|sample-codebase)\.mjs$/, 119, "studio protocol script"],
    [/^scripts\/lib\//, 92, "shared studio helper"],
    [/^test\//, 82, "node regression test"],
    [/^tests-ui\//, 78, "browser regression test"],
    [/^public\/(index|game|landing|setup)\.html$/, 72, "public page"],
    [/^public\/styles\.css$/, 70, "public styling"],
    [/^context\/(PROJECT_STATUS|TASK_BOARD|CURRENT_STATE)\.(json|md)$/, 62, "project state"],
    [/^docs\/(SESSION_PROTOCOL|STARTUP_BRIEF|INNOVATION_PACK)\.md$/, 58, "protocol context"]
  ].find(([re]) => re.test(normalized));
  return score ? { score: score[1], reason: score[2] } : { score: 20, reason: "supporting file" };
}

function trimToTokenBudget(text, tokenBudget) {
  const maxChars = Math.max(0, tokenBudget * 4);
  if (text.length <= maxChars) return text;
  let excerpt = `${text.slice(0, Math.max(0, maxChars - 120)).trimEnd()}\n\n/* sample truncated by token budget */\n`;
  while (approxTokens(excerpt) > tokenBudget && excerpt.length > 0) {
    excerpt = excerpt.slice(0, -16).trimEnd();
  }
  return excerpt;
}

function buildSample() {
  const candidates = ROOTS.flatMap((name) => walk(path.join(root, name)))
    .map((entry) => {
      const rel = path.relative(root, entry.file).replace(/\\/g, "/");
      return { ...entry, rel, ...priorityFor(rel) };
    })
    .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));

  const files = [];
  let usedTokens = 0;
  for (const candidate of candidates) {
    if (usedTokens >= maxTokens) break;
    let body = "";
    try {
      body = fs.readFileSync(candidate.file, "utf8");
    } catch {
      continue;
    }
    const remaining = maxTokens - usedTokens;
    if (remaining < MIN_FILE_TOKENS) break;
    const fileBudget = Math.min(MAX_FILE_TOKENS, remaining);
    const excerpt = trimToTokenBudget(body, fileBudget);
    const tokens = approxTokens(excerpt);
    if (tokens <= 0 || tokens > remaining) continue;
    files.push({
      path: candidate.rel,
      reason: candidate.reason,
      bytes: Buffer.byteLength(body),
      sampledTokens: tokens,
      truncated: excerpt.length < body.length,
      excerpt
    });
    usedTokens += tokens;
  }
  return {
    generatedAt: new Date().toISOString(),
    root: path.basename(root),
    maxTokens,
    usedTokens,
    fileCount: files.length,
    files
  };
}

function renderMarkdown(sample) {
  const lines = [
    `# Codebase Sample - ${sample.root}`,
    "",
    `Generated at ${sample.generatedAt}. Used approximately ${sample.usedTokens}/${sample.maxTokens} tokens across ${sample.fileCount} files.`,
    ""
  ];
  for (const file of sample.files) {
    lines.push(`## ${file.path}`);
    lines.push(`Reason: ${file.reason} · bytes ${file.bytes} · sampled tokens ${file.sampledTokens}${file.truncated ? " · truncated" : ""}`);
    lines.push("");
    lines.push("```");
    lines.push(file.excerpt.trimEnd());
    lines.push("```");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const sample = buildSample();
if (jsonMode) {
  console.log(JSON.stringify(sample, null, 2));
} else {
  console.log(renderMarkdown(sample));
}
