#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "./lib/safe-spawn.mjs";

const root = process.cwd();
const laneDir = path.join(root, "docs", "audit-lanes");
const laneRules = {
  site: /^(public\/(?:[^/]+\.html|[^/]+\.xml|\.well-known\/|community-stats\.js|footer-manifest\.json|showcase-league\.json)|scripts\/(?:build-pages|build-showcase-league)\.mjs|scripts\/lib\/public-chrome\.mjs)/,
  shell: /^(public\/(?:app\.js|game\.html|styles\.css|lib\/|images\/)|tests-ui\/|scripts\/(?:responsive-evidence|capture-public-qa|write-visual-qa-receipt)\.mjs)/,
  engine: /^(src\/|test\/|scripts\/(?:run-test-shard|check-api-contract-parity)\.mjs)/
};

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || "").trim()}`);
  return String(result.stdout || "").trim();
}

function inventory(lane) {
  const files = fs.readdirSync(laneDir).filter((name) => name.endsWith(`-${lane}.md`)).sort();
  if (!files.length) throw new Error(`No ${lane} inventory in docs/audit-lanes`);
  const file = files.at(-1);
  const content = fs.readFileSync(path.join(laneDir, file), "utf8");
  const describes = /^describes:\s*([a-f0-9]{7,40})\s*$/m.exec(content)?.[1];
  if (!describes) throw new Error(`${file} has no valid describes revision`);
  git("cat-file", "-e", `${describes}^{commit}`);
  return { file: `docs/audit-lanes/${file}`, describes };
}

const rows = Object.entries(laneRules).map(([lane, matches]) => {
  const { file, describes } = inventory(lane);
  const tracked = git("diff", "--name-only", describes, "--").split(/\r?\n/).filter(Boolean);
  const untracked = git("ls-files", "--others", "--exclude-standard").split(/\r?\n/).filter(Boolean);
  const changed = [...new Set([...tracked, ...untracked])].filter((name) => matches.test(name.replaceAll("\\", "/"))).sort();
  return { lane, inventory: file, baseline: git("rev-parse", describes), changed };
});

if (process.argv.includes("--json")) console.log(JSON.stringify({ lanes: rows }, null, 2));
else for (const row of rows) {
  console.log(`${row.lane}: ${row.changed.length} changed since ${row.baseline.slice(0, 8)} (${row.inventory})`);
  for (const file of row.changed) console.log(`  ${file}`);
}
