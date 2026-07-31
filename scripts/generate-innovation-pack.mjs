#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseHumanItems, parseUnifiedItems } from "./lib/task-board.mjs";
import { dedupeInnovationCandidates } from "./lib/innovation-candidates.mjs";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const status = readJson(path.join(root, "context", "PROJECT_STATUS.json"), {});
const session = (Number(status.currentSession) || 0) + 1;
const outPath = path.join(root, "docs", "INNOVATION_PACK.md");
const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--stdout");

function readText(file, fallback = "") {
  try { return fs.readFileSync(file, "utf8"); } catch { return fallback; }
}

function readJson(file, fallback = null) {
  try { return JSON.parse(readText(file)); } catch { return fallback; }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "static", "test-results", ".cache"].includes(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(mjs|js|html|css|md|json)$/.test(name)) out.push(p);
  }
  return out;
}

function latestAudit() {
  const docs = path.join(root, "docs");
  if (!fs.existsSync(docs)) return null;
  const latest = fs.readdirSync(docs)
    .filter((name) => /^AUDIT_.*\.md$/.test(name))
    .map((name) => {
      const file = path.join(docs, name);
      const sidecar = readJson(file.replace(/\.md$/i, ".json"), {});
      const fileDate = name.match(/^AUDIT_(\d{4}-\d{2}-\d{2})/)?.[1] || "";
      const fileSession = Number(name.match(/_SESSION(\d+)/i)?.[1] || 0);
      return {
        name,
        file,
        mtime: fs.statSync(file).mtimeMs,
        sidecar,
        authorityDate: String(sidecar.date || fileDate),
        authoritySession: Number(sidecar.session || fileSession || 0)
      };
    })
    .sort((a, b) =>
      b.authorityDate.localeCompare(a.authorityDate)
      || b.authoritySession - a.authoritySession
      || b.name.localeCompare(a.name)
    )[0] || null;
  if (!latest) return null;
  const sidecar = latest.sidecar;
  const items = Array.isArray(sidecar.items) ? sidecar.items : [];
  return {
    ...latest,
    openItems: items.filter((item) => !/^(?:done|complete|completed|shipped)$/i.test(String(item.status || ""))),
    shippedInnovations: (Array.isArray(sidecar.secondOrderCandidates) ? sidecar.secondOrderCandidates : [])
      .filter((item) => /^(?:done|complete|completed|shipped|second-order-shipped)$/i.test(String(item.status || "")))
  };
}

function commentFragments(line) {
  const fragments = [];
  const html = line.match(/<!--(.*?)(?:-->|$)/);
  if (html) fragments.push(html[1]);
  const block = line.match(/\/\*(.*?)(?:\*\/|$)/);
  if (block) fragments.push(block[1]);
  const star = line.match(/^\s*\*\s+(.*)$/);
  if (star) fragments.push(star[1]);
  const slashIndex = line.indexOf("//");
  if (slashIndex >= 0) fragments.push(line.slice(slashIndex + 2));
  return fragments;
}

function markerCandidates() {
  const patterns = [
    { re: /\bTODO\b|\bFIXME\b|\bHACK\b/i, reason: "inline engineering marker" },
    { re: /not implemented|\bstub\b/i, reason: "unfinished behavior marker" },
  ];
  const rows = [];
  for (const sourceDir of ["src", "public", "scripts", "test"]) {
    for (const file of walk(path.join(root, sourceDir))) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (rel === "scripts/generate-innovation-pack.mjs") continue;
      const lines = readText(file).split(/\r?\n/);
      lines.forEach((line, idx) => {
        const fragment = commentFragments(line).find((comment) => patterns.some((pattern) => pattern.re.test(comment)));
        if (!fragment) return;
        if (/Client-only runtime not implemented|unresolved computed-block stub/.test(fragment)) return;
        const hit = patterns.find((pattern) => pattern.re.test(fragment));
        if (sourceDir === "test" && hit.reason === "unfinished behavior marker") return;
        rows.push({ rel, line: idx + 1, reason: hit.reason, text: fragment.trim().slice(0, 120) });
      });
    }
  }
  return rows;
}

function buildPack() {
  const board = readText(path.join(root, "context", "TASK_BOARD.md"));
  const openBoard = parseUnifiedItems(board).filter((item) => item.status !== "done");
  const human = parseHumanItems(board);
  const markers = markerCandidates();
  const audit = latestAudit();
  const candidates = [];

  for (const item of openBoard.filter((item) => item.status !== "human-blocked").slice(0, 4)) {
    candidates.push({
      title: item.title,
      source: "TASK_BOARD open item",
      action: item.description || item.statusText || "Verify current premise against live code, then ship or close honestly.",
      evidence: item.rawItem || item.item,
      disposition: /defer|hold|blocked/i.test(String(item.description || item.statusText || ""))
        ? "deferred"
        : "ranked",
    });
  }

  for (const marker of markers.slice(0, 6)) {
    candidates.push({
      title: `${marker.rel}:${marker.line}`,
      source: marker.reason,
      action: "Inspect the marker, decide whether it is live debt, then either implement the missing behavior or record why it is intentionally deferred.",
      evidence: marker.text,
    });
  }

  if (audit?.openItems?.length) {
    candidates.push({
      title: `latest-audit-follow-through (${audit.name})`,
      source: "latest audit artifact",
      action: "Re-check the open audit execution rows against live code before adding new work.",
      evidence: `${audit.openItems.length} open item${audit.openItems.length === 1 ? "" : "s"} · mtime ${new Date(audit.mtime).toISOString()}`,
    });
  }

  for (const item of human.slice(0, 3)) {
    candidates.push({
      title: item.title,
      source: "human-blocked queue",
      action: "Run secrets discovery and blocker preflight before preserving this as human-only.",
      evidence: item.description || item.raw,
    });
  }

  const deduped = dedupeInnovationCandidates(candidates);
  return {
    ranked: deduped.filter((candidate) => candidate.disposition !== "deferred"),
    shipped: (audit?.shippedInnovations || []).map((item) => ({
      title: item.slug || item.title,
      evidence: item.implementationEvidence?.join(" ")
        || item.evidence?.join(" ")
        || item.executionLog?.at(-1)?.evidence
        || "Shipped in the latest audit."
    })),
    deferred: deduped.filter((candidate) => candidate.disposition === "deferred")
  };
}

function render(pack) {
  const lines = [
    `# Innovation Pack - Session ${session}`,
    "",
    `Generated by \`node scripts/ops.mjs innovation-pack\` on ${today}. Candidates are source-derived from TASK_BOARD, inline debt markers, latest audit metadata, and human-blocked queue state.`,
    "",
    "## Ranked Candidates",
    "",
  ];
  if (!pack.ranked.length) {
    lines.push("- No unclassified live innovation candidates remain. Re-run after new code or authority evidence changes.");
  } else {
    pack.ranked.forEach((candidate, idx) => {
      lines.push(`${idx + 1}. **${candidate.title}**`);
      lines.push(`   - Source: ${candidate.source}`);
      lines.push(`   - Action: ${candidate.action}`);
      lines.push(`   - Evidence: ${candidate.evidence || "n/a"}`);
      if (candidate.duplicateCount > 1) lines.push(`   - Collapsed: ${candidate.duplicateCount} semantically equivalent candidates`);
    });
  }
  lines.push("", "## Shipped This Session", "");
  if (!pack.shipped.length) lines.push("- No shipped innovation rows found in the latest audit sidecar.");
  else {
    for (const item of pack.shipped) {
      lines.push(`- **${item.title}**: ${item.evidence}`);
    }
  }
  lines.push("", "## Rejected / Deferred", "");
  if (!pack.deferred.length) lines.push("- No source-classified deferrals.");
  else {
    for (const item of pack.deferred) {
      lines.push(`- **${item.title}**: ${item.action}`);
      lines.push(`  - Evidence: ${item.evidence || "n/a"}`);
      if (item.duplicateCount > 1) lines.push(`  - Collapsed: ${item.duplicateCount} semantically equivalent candidates`);
    }
  }
  return `${lines.join("\n")}\n`;
}

const pack = buildPack();
const body = render(pack);
if (dryRun) {
  console.log(body);
  console.error(`innovation-pack: dry run (${pack.ranked.length} open, ${pack.shipped.length} shipped, ${pack.deferred.length} deferred)`);
} else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, "utf8");
  console.log(`innovation-pack: wrote docs/INNOVATION_PACK.md (${pack.ranked.length} open, ${pack.shipped.length} shipped, ${pack.deferred.length} deferred)`);
}
