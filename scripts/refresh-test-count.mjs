#!/usr/bin/env node
import { spawnSync } from "./lib/safe-spawn.mjs";
import { inspectTestReceipt } from "./lib/test-receipt.mjs";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");

if (!checkOnly) {
  const result = spawnSync(process.execPath, ["scripts/run-test-shard.mjs", "all"], {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

const inspection = inspectTestReceipt(root);
if (!inspection.valid || !inspection.fresh) {
  console.error(`test receipt: ${inspection.reason || "invalid"}`);
  process.exit(1);
}
const receipt = inspection.receipt;
console.log(`test receipt: fresh · ${receipt.passed}/${receipt.total} · ${receipt.generatedAt} · ${receipt.testSurface.digest.slice(0, 12)}`);
