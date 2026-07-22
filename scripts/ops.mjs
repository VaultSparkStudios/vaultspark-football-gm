#!/usr/bin/env node
import { spawnSync } from "./lib/safe-spawn.mjs";
import path from "path";
import fs from "fs";

const root = process.cwd();
const node = process.execPath;
const [command, ...rest] = process.argv.slice(2);

const dispatch = {
  "blocker-preflight": ["scripts/blocker-preflight.mjs"],
  "cache-genius-list": ["scripts/cache-genius-list.mjs"],
  "genius-list": ["scripts/cache-genius-list.mjs", "--write"],
  "startup-brief": ["scripts/render-startup-brief.mjs"],
  "brief": ["scripts/render-startup-brief.mjs"],
  "doctor": ["scripts/doctor.mjs"],
  "innovation-pack": ["scripts/generate-innovation-pack.mjs"],
  "launch-evidence": ["scripts/launch-evidence-report.mjs"],
  "staging-evidence": ["scripts/verify-staging-receipt.mjs"]
};

const target = dispatch[command];
if (!target) {
  console.error(`ops: unsupported command "${command || ""}"`);
  console.error(`supported: ${Object.keys(dispatch).sort().join(", ")}`);
  process.exit(1);
}

const result = spawnSync(node, [...target, ...rest], {
  cwd: root,
  stdio: "inherit",
  shell: false
});

if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

if (command === "genius-list") {
  const cachePath = path.join(root, ".cache", "genius-list.json");
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    console.log(`genius list: ${cache.status} · ${cache.items?.length || 0} open · ${cache.closed?.length || 0} closed · source ${cache.source || "none"}`);
    console.log(JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error(`genius list: cache write passed but cache read failed: ${error.message}`);
    process.exit(1);
  }
}

process.exit(0);
