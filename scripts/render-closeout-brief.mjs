#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function esc(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

function renderList(items, emptyText) {
  if (!items?.length) return `- ${emptyText}`;
  return items.map((item) => {
    const title = esc(item.title || item.slug || item.id || "item");
    const evidence = esc(item.evidence || "evidence recorded");
    const scores = item.projectImpact || item.ecosystemImpact
      ? ` (${item.projectImpact ?? "?"}/10 project, ${item.ecosystemImpact ?? "?"}/10 ecosystem)`
      : "";
    return `- **${title}**${scores}: ${evidence}`;
  }).join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error("Usage: node scripts/render-closeout-brief.mjs --input <brief.json> [--ascii]");
  process.exit(1);
}

const inputPath = args.input;
const data = JSON.parse(readFileSync(inputPath, "utf8"));
const session = esc(data.session || "session");
const date = esc(data.date || new Date().toISOString().slice(0, 10));
const repo = esc(data.repo || basename(process.cwd()));
const headline = esc(data.headline || "Session closeout brief");
const items = data.items || [];
const followUps = data.followUps || [];
const blockers = data.blockers || [];
const honestyLedger = data.honestyLedger || [];

const markdown = `# Closeout Brief — ${repo} — ${session}

> ${headline}

## Shipped

${renderList(items, "No shipped items recorded.")}

## Follow-ups

${renderList(followUps, "No follow-ups recorded.")}

## Blockers

${renderList(blockers, "No blockers recorded.")}

## Honesty Ledger

${renderList(honestyLedger, "No declined or rejected items recorded.")}

## Proof

- Files changed: ${data.diffStat?.files ?? "n/a"}
- Insertions: ${data.diffStat?.insertions ?? "n/a"}
- Deletions: ${data.diffStat?.deletions ?? "n/a"}
- Suite: ${esc(data.diffStat?.suite || "not recorded")}
`;

mkdirSync(join(process.cwd(), "docs"), { recursive: true });
const outputPath = join(process.cwd(), "docs", `CLOSEOUT_BRIEF_${session}_${date}.md`);
writeFileSync(outputPath, markdown);
console.log(markdown);
console.log(`\nWrote ${outputPath}`);
