#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const cachePath = path.join(root, ".cache", "genius-list.json");
const docsDir = path.join(root, "docs");
const taskBoardPath = path.join(root, "context", "TASK_BOARD.md");

function statMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function auditSortKey(name) {
  const date = name.match(/^AUDIT_(\d{4}-\d{2}-\d{2})/)?.[1] ?? "0000-00-00";
  const session = Number(name.match(/SESSION(\d+)/)?.[1] ?? 0);
  return { date, session };
}

function latestAudit() {
  try {
    return fs.readdirSync(docsDir)
      .filter((name) => /^AUDIT_.*\.md$/.test(name))
      .map((name) => {
        const file = path.join(docsDir, name);
        return { name, file, mtimeMs: statMs(file), ...auditSortKey(name) };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.session - a.session || b.mtimeMs - a.mtimeMs)[0] ?? null;
  } catch {
    return null;
  }
}

function parseAuditItems(auditFile) {
  if (!auditFile || !fs.existsSync(auditFile)) return [];
  const text = fs.readFileSync(auditFile, "utf8");
  return text.split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cols = line.split("|").slice(1, -1).map((col) => col.trim());
      const titleMatch = (cols[7] ?? "").match(/\*\*([^*]+)\*\*/);
      const status = /shipped|implemented|done|verified|recipe shipped/i.test(cols[7] ?? "") ? "done" : "open";
      return {
        rank: Number(cols[0]),
        tier: cols[1],
        axis: cols[2],
        effort: cols[3],
        impact: Number(cols[4]) || null,
        innovation: Number(cols[5]) || null,
        priority: Number(cols[6]) || null,
        slug: titleMatch?.[1] ?? `audit-item-${cols[0]}`,
        title: (cols[7] ?? "").replace(/\*\*/g, "").trim(),
        status,
      };
    });
}

function buildCache() {
  const audit = latestAudit();
  const allItems = parseAuditItems(audit?.file);
  const items = allItems.filter((item) => item.status !== "done");
  return {
    generatedAt: new Date().toISOString(),
    source: audit?.name ?? null,
    status: items.length > 0 ? "open" : "exhausted",
    items,
    exhaustedReason: items.length === 0
      ? "Latest audit has no open ranked items; run /audit for a new live-code plan."
      : null,
  };
}

function isFresh() {
  const cacheMs = statMs(cachePath);
  if (!cacheMs) return false;
  const audit = latestAudit();
  const inputMs = Math.max(statMs(taskBoardPath), audit?.mtimeMs ?? 0);
  return cacheMs >= inputMs;
}

if (args.has("--check")) {
  process.exit(isFresh() ? 0 : 1);
}

if (args.has("--write")) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const cache = buildCache();
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  console.log(`genius cache: wrote ${path.relative(root, cachePath)} (${cache.items.length} open item${cache.items.length === 1 ? "" : "s"})`);
  process.exit(0);
}

console.error("Usage: node scripts/cache-genius-list.mjs --check | --write");
process.exit(2);
