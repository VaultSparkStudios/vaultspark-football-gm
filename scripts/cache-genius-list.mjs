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

// Done-status comes EXCLUSIVELY from the audit's Execution Log table, joined by slug.
// The old prose sniff (/shipped|implemented|done|verified|.../i on the Item cell) had two
// live failure modes: Execution Log completions never matched (rows don't start with a
// digit), and "unverified" in an Item cell matched /verified/i and wrongly closed the item.
const DONE_STATUS_RE = /^(shipped|implemented|done)$/i;
const BLOCKED_STATUS_RE = /^blocked$/i;

function normalizeTaskStatus(statusText = "") {
  const text = String(statusText || "").toLowerCase();
  if (/✅|\bdone\b|\bcomplete(?:d)?\b|\bshipped\b/.test(text)) return "done";
  if (/human|blocked|⛔|⚠/.test(text)) return "blocked";
  return "open";
}

function slugFromTaskTitle(title = "") {
  const cleaned = String(title || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
  const beforeDash = cleaned.split(/\s+—\s+/)[0]?.trim() || cleaned;
  return beforeDash.toLowerCase();
}

// Parse the "## Execution Log" section table (if present): rows are
// `| <slug> | <Status> | <Evidence> |`. Returns Map of lowercased slug -> raw status cell.
function parseExecutionLog(text) {
  const statuses = new Map();
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Execution Log\b/i.test(line.trim()));
  if (start === -1) return statuses;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^##\s/.test(line)) break; // next section
    if (!line.startsWith("|")) continue;
    const cols = line.split("|").slice(1, -1).map((col) => col.trim());
    if (cols.length < 2) continue;
    const slug = cols[0].replace(/\*\*/g, "").replace(/`/g, "").trim();
    if (!slug) continue;
    if (/^item$/i.test(slug)) continue; // header row
    if (/^:?-{2,}:?$/.test(slug)) continue; // separator row
    statuses.set(slug.toLowerCase(), cols[1]);
  }
  return statuses;
}

function parseTaskBoardStatuses() {
  const statuses = new Map();
  let text = "";
  try {
    text = fs.readFileSync(taskBoardPath, "utf8");
  } catch {
    return statuses;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const cols = line.split("|").slice(1, -1).map((col) => col.trim());
    if (cols.length < 2) continue;
    if (/^:?-{2,}:?$/.test(cols[0]) || /^item$/i.test(cols[0])) continue;

    let title = "";
    let status = "";
    if (cols.length >= 3 && /^[\d.]+$/.test(cols[0])) {
      title = cols[1];
      status = cols[2];
    } else if (cols.length >= 2) {
      title = cols[0];
      status = cols[1];
    }
    const slug = slugFromTaskTitle(title);
    if (!slug) continue;
    statuses.set(slug, normalizeTaskStatus(status));
  }
  return statuses;
}

function parseAuditItems(auditFile) {
  if (!auditFile || !fs.existsSync(auditFile)) return [];
  const text = fs.readFileSync(auditFile, "utf8");
  const execLog = parseExecutionLog(text);
  const taskBoardStatuses = parseTaskBoardStatuses();
  return text.split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cols = line.split("|").slice(1, -1).map((col) => col.trim());
      const titleMatch = (cols[7] ?? "").match(/\*\*([^*]+)\*\*/);
      const slug = titleMatch?.[1]?.trim() ?? `audit-item-${cols[0]}`;
      const logStatus = (execLog.get(slug.toLowerCase()) ?? "").trim();
      const taskStatus = taskBoardStatuses.get(slug.toLowerCase()) ?? "";
      const done = DONE_STATUS_RE.test(logStatus) || taskStatus === "done";
      const blocked = BLOCKED_STATUS_RE.test(logStatus) || (!done && taskStatus === "blocked");
      return {
        rank: Number(cols[0]),
        tier: cols[1],
        axis: cols[2],
        effort: cols[3],
        impact: Number(cols[4]) || null,
        innovation: Number(cols[5]) || null,
        priority: Number(cols[6]) || null,
        slug,
        title: (cols[7] ?? "").replace(/\*\*/g, "").trim(),
        status: done ? "done" : "open",
        ...(blocked ? { blocked: true } : {}),
      };
    });
}

function buildCache() {
  const audit = latestAudit();
  const allItems = parseAuditItems(audit?.file);
  const items = allItems.filter((item) => item.status !== "done");
  const closed = allItems.filter((item) => item.status === "done").map((item) => item.slug);
  return {
    generatedAt: new Date().toISOString(),
    source: audit?.name ?? null,
    status: items.length > 0 ? "open" : "exhausted",
    items,
    closed,
    exhaustedReason: items.length === 0
      ? "Latest audit has no open ranked items; run /audit for a new live-code plan."
      : null,
  };
}

// Content signature for freshness: source audit filename + closed slug set + per-item
// slug/status/blocked. Deliberately excludes generatedAt (a rewrite with identical truth
// stays FRESH) and file mtimes (a newer cache file whose CONTENT contradicts the audit
// is STALE — correctness beats speed; the mtime fast-path was dropped, see S186/S29).
function contentSignature(cache) {
  return JSON.stringify({
    source: cache?.source ?? null,
    closed: [...(cache?.closed ?? [])].sort(),
    items: (cache?.items ?? [])
      .map((item) => ({ slug: item.slug, status: item.status, blocked: Boolean(item.blocked) }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
  });
}

function isFresh() {
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return false;
  }
  return contentSignature(existing) === contentSignature(buildCache());
}

if (args.has("--check")) {
  const fresh = isFresh();
  console.log(fresh
    ? "genius cache: FRESH (content matches latest audit)"
    : "genius cache: STALE (content contradicts latest audit — run --write)");
  process.exit(fresh ? 0 : 1);
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
