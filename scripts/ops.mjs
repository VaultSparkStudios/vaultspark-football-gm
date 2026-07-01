#!/usr/bin/env node
import { spawnSync } from "./lib/safe-spawn.mjs";
import path from "path";

const root = process.cwd();
const node = process.execPath;
const [command, ...rest] = process.argv.slice(2);

const dispatch = {
  "blocker-preflight": ["scripts/blocker-preflight.mjs"],
  "cache-genius-list": ["scripts/cache-genius-list.mjs"],
  "startup-brief": ["scripts/render-startup-brief.mjs"],
  "brief": ["scripts/render-startup-brief.mjs"],
  "doctor": ["scripts/blocker-preflight.mjs", "--json"],
  "innovation-pack": ["scripts/generate-innovation-pack.mjs"],
  "launch-evidence": ["scripts/launch-evidence-report.mjs"]
};

if (command === "genius-list") {
  console.log("No fresh project-local genius list generator is configured. Use the latest docs/AUDIT_*.md for ranked work.");
  process.exit(0);
}

const target = dispatch[command];
if (!target) {
  console.error(`ops: unsupported command "${command || ""}"`);
  console.error(`supported: ${Object.keys(dispatch).concat("genius-list").sort().join(", ")}`);
  process.exit(1);
}

const result = spawnSync(node, [...target, ...rest], {
  cwd: root,
  stdio: "inherit",
  shell: false
});

process.exit(result.status ?? 1);
