#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function auditIdentity(name = "") {
  const match = name.match(/^AUDIT_(\d{4}-\d{2}-\d{2})(?:_SESSION(\d+))?\.json$/i);
  return match ? { date: match[1], session: Number(match[2] || 0) } : null;
}

export function findAuditSidecar(root, { date = null, session = null, input = null } = {}) {
  if (input) return path.resolve(root, input);
  const docs = path.join(root, "docs");
  const candidates = fs.readdirSync(docs)
    .map((name) => ({ name, identity: auditIdentity(name) }))
    .filter((entry) => entry.identity)
    .filter((entry) => !date || entry.identity.date === date)
    .filter((entry) => session == null || entry.identity.session === Number(session))
    .sort((a, b) => b.identity.date.localeCompare(a.identity.date) || b.identity.session - a.identity.session);
  if (!candidates.length) throw new Error("No matching docs/AUDIT_*.json sidecar found.");
  return path.join(docs, candidates[0].name);
}

function text(value, fallback = "—") {
  const rendered = String(value ?? "").trim();
  return rendered || fallback;
}

function tableText(value) {
  return text(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function validateAudit(audit) {
  const errors = [];
  if (!audit || typeof audit !== "object") errors.push("sidecar must be an object");
  if (!audit?.date) errors.push("date is required");
  if (!Number.isInteger(Number(audit?.session))) errors.push("session must be numeric");
  if (!audit?.project) errors.push("project is required");
  if (!Array.isArray(audit?.items)) errors.push("items must be an array");
  for (const [index, item] of (audit?.items || []).entries()) {
    for (const key of ["rank", "tier", "category", "effortHours", "impact", "innovation", "priority", "slug", "title", "status", "premise"]) {
      if (item?.[key] == null || item[key] === "") errors.push(`items[${index}].${key} is required`);
    }
    if (!item?.ladder?.L2?.recipe) errors.push(`items[${index}].ladder.L2.recipe is required`);
  }
  if (errors.length) throw new Error(`Invalid audit sidecar:\n- ${errors.join("\n- ")}`);
  return audit;
}

function profileLines(audit) {
  const p = audit.profile || {};
  const loop = audit.gameLoopReview || {};
  const loopBits = [
    ["tightness", loop.loopTightness],
    ["progression", loop.progression],
    ["session engagement", loop.sessionEngagement],
    ["retention", loop.retention],
    ["soul fidelity", loop.soulFidelity],
    ["overall", loop.overall]
  ].filter(([, value]) => value != null).map(([label, value]) => `${label} ${value}`);
  const lines = [
    `- Product: ${text(p.audience)} ${text(p.type)}`,
    `- Rubric: ${text(p.rubric)}; staging: ${text(p.staging)}`,
    `- Profile source: ${text(p.source)}`
  ];
  if (loopBits.length) lines.push(`- Game-loop review: ${loopBits.join(" · ")}`);
  if (loop.evidence) lines.push(`- Evidence caveat: ${text(loop.evidence)}`);
  return lines;
}

export function renderAuditMarkdown(audit) {
  validateAudit(audit);
  const summary = audit.summary || {};
  const title = audit.displayName || "Franchise Architect: Football";
  const lines = [
    `# Audit — ${title} — Session ${audit.session}`,
    "",
    "Public-safe live-code audit. The JSON sidecar is the sole source of truth.",
    "",
    "## Profile and review lens",
    "",
    ...profileLines(audit),
    "",
    "## Ranked implementation plan",
    "",
    "| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |",
    "|---:|---|---|---:|---:|---:|---:|---|"
  ];
  for (const item of [...audit.items].sort((a, b) => Number(a.rank) - Number(b.rank))) {
    lines.push(`| ${item.rank} | ${tableText(item.tier)} | ${tableText(item.category)} | ${Number(item.effortHours).toFixed(1)}h | ${item.impact} | ${item.innovation} | ${Number(item.priority).toFixed(1)} | **${tableText(item.slug)}** — ${tableText(item.ladder.L2.recipe)} |`);
  }
  const combined = Number(summary.combinedPriority ?? audit.items.reduce((sum, item) => sum + Number(item.priority || 0), 0));
  lines.push("", `Combined priority: **${combined.toFixed(1)}**.`);

  lines.push("", "## Premise verification and rejected phantom work", "");
  if (audit.preverifiedSkips?.length) {
    for (const skip of audit.preverifiedSkips) lines.push(`- Rejected/deferred “${text(skip.candidate)}”: ${text(skip.reason)}`);
  } else {
    lines.push("- No rejected candidates were recorded.");
  }

  lines.push("", "## Three recommended design moves", "");
  const moves = audit.recommendedMoves?.length
    ? audit.recommendedMoves.slice(0, 3)
    : [...audit.items].sort((a, b) => Number(a.rank) - Number(b.rank)).slice(0, 3).map((item) => item.ladder.L2.recipe);
  moves.forEach((move, index) => lines.push(`${index + 1}. ${text(move)}`));

  lines.push("", "## Execution Log", "", "| Item | Status | Evidence |", "|---|---|---|");
  for (const item of [...audit.items].sort((a, b) => Number(a.rank) - Number(b.rank))) {
    const evidence = item.executionEvidence || (Array.isArray(item.verification) ? item.verification.join("; ") : "—");
    lines.push(`| ${tableText(item.slug)} | ${tableText(item.status)} | ${tableText(evidence)} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderAuditFile(root, options = {}) {
  const sidecar = findAuditSidecar(root, options);
  const audit = validateAudit(JSON.parse(fs.readFileSync(sidecar, "utf8")));
  const output = sidecar.replace(/\.json$/i, ".md");
  const markdown = renderAuditMarkdown(audit);
  const existing = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : null;
  if (options.check) {
    if (existing !== markdown) throw new Error(`${path.relative(root, output)} is stale; run node scripts/render-audit-md.mjs.`);
    return { sidecar, output, changed: false, checked: true };
  }
  const changed = existing !== markdown;
  if (changed) fs.writeFileSync(output, markdown, "utf8");
  return { sidecar, output, changed, checked: false };
}

function cliOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") options.check = true;
    else if (arg === "--date") options.date = argv[++i];
    else if (arg === "--session") options.session = Number(argv[++i]);
    else if (arg === "--input") options.input = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = renderAuditFile(process.cwd(), cliOptions(process.argv.slice(2)));
    console.log(`${result.checked ? "✓ audit markdown current" : result.changed ? "✓ audit markdown rendered" : "✓ audit markdown unchanged"}: ${path.relative(process.cwd(), result.output)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
