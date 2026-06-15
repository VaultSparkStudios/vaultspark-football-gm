#!/usr/bin/env node
import { mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

function readContextMeter() {
  try {
    const raw = readFileSync(join(process.cwd(), ".cache", "context-meter-last.json"), "utf8");
    const parsed = JSON.parse(raw);
    return {
      usedTokens: parsed.usedTokens ?? null,
      remainingTokens: parsed.remainingTokens ?? null,
      pctUsed: parsed.pctUsed ?? null,
      recommendation: parsed.recommendation ?? null
    };
  } catch {
    return {
      usedTokens: null,
      remainingTokens: null,
      pctUsed: null,
      recommendation: "unknown"
    };
  }
}

const args = parseArgs(process.argv.slice(2));
const skill = args.skill || "unknown";
const phase = args.phase || "step";
const entry = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  skill,
  phase,
  step: args.step || null,
  session: args.session || null,
  meter: readContextMeter()
};

mkdirSync(join(process.cwd(), ".cache"), { recursive: true });
appendFileSync(join(process.cwd(), ".cache", "skill-cost-ledger.jsonl"), `${JSON.stringify(entry)}\n`);

console.log(`record-skill-cost: ${skill} ${phase}${entry.step ? ` ${entry.step}` : ""}`);
