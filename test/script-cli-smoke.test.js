import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";

const scripts = [
  "scripts/check-browser-boot-budget.mjs",
  "scripts/responsive-evidence.mjs",
  "scripts/run-test-shard.mjs",
  "scripts/render-startup-brief.mjs"
];

for (const script of scripts) {
  test(`${script} exposes a side-effect-free usage smoke path`, () => {
    const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(`${result.stdout}\n${result.stderr}`, /Usage:/);
  });
}
