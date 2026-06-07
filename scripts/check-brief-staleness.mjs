#!/usr/bin/env node
import fs from "fs";
import path from "path";

const briefPath = path.join(process.cwd(), "docs", "STARTUP_BRIEF.md");
if (!fs.existsSync(briefPath)) {
  console.error("STARTUP_BRIEF.md missing");
  process.exit(1);
}

const text = fs.readFileSync(briefPath, "utf8");
const generatedAt = text.match(/generated-at:\s*([0-9-]+)/)?.[1] || null;
const today = new Date();
const generated = generatedAt ? new Date(`${generatedAt}T00:00:00Z`) : null;
const ageDays = generated ? Math.floor((today - generated) / 86400000) : 999;

if (ageDays > 1) {
  console.log(`STALE: startup brief is ${ageDays} days old`);
  process.exit(1);
}

console.log(`FRESH: startup brief is ${ageDays} days old`);
process.exit(0);
