/**
 * Usage: node scripts/check-browser-boot-budget.mjs [--json]
 *        node scripts/check-browser-boot-budget.mjs --help
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const publicDir = path.join(root, "public");

function staticImports(source) {
  const imports = [];
  const executable = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const pattern = /^\s*(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (let match = pattern.exec(executable); match; match = pattern.exec(executable)) {
    if (match[1].startsWith(".")) imports.push(match[1]);
  }
  return imports;
}

async function resolveModule(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  throw new Error(`Unresolved static boot import '${specifier}' from ${path.relative(publicDir, fromFile)}`);
}

export async function analyzeBrowserBoot({ manifestPath = path.join(publicDir, "boot-manifest.json") } = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const entry = path.resolve(publicDir, manifest.entry);
  const visited = new Set();
  const queue = [entry];
  while (queue.length) {
    const current = queue.pop();
    if (visited.has(current)) continue;
    if (!current.startsWith(`${publicDir}${path.sep}`)) throw new Error(`Boot graph escaped public root: ${current}`);
    visited.add(current);
    const source = await fs.readFile(current, "utf8");
    for (const specifier of staticImports(source)) queue.push(await resolveModule(current, specifier));
  }
  const modules = [...visited].map((file) => path.relative(publicDir, file).replaceAll("\\", "/")).sort();
  const staticBytes = (await Promise.all([...visited].map(async (file) => (await fs.stat(file)).size))).reduce((sum, size) => sum + size, 0);
  const lazyLeaks = (manifest.lazyRoots || []).filter((file) => modules.includes(file));
  const findings = [];
  if (staticBytes > manifest.budgets.staticBytes) findings.push(`static bytes ${staticBytes} exceed ${manifest.budgets.staticBytes}`);
  if (modules.length > manifest.budgets.staticModules) findings.push(`static modules ${modules.length} exceed ${manifest.budgets.staticModules}`);
  if (lazyLeaks.length) findings.push(`lazy roots leaked into boot: ${lazyLeaks.join(", ")}`);
  return {
    schemaVersion: "1.0",
    kind: "browser-boot-budget-receipt",
    ok: findings.length === 0,
    entry: manifest.entry,
    staticBytes,
    staticModules: modules.length,
    budgets: manifest.budgets,
    lazyRoots: manifest.lazyRoots,
    lazyLeaks,
    modules,
    findings
  };
}

async function main() {
  const receipt = await analyzeBrowserBoot();
  if (process.argv.includes("--json")) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`Browser boot budget: ${receipt.staticBytes}/${receipt.budgets.staticBytes} bytes · ${receipt.staticModules}/${receipt.budgets.staticModules} modules · ${receipt.lazyLeaks.length} lazy leaks.`);
  if (!receipt.ok) throw new Error(receipt.findings.join("; "));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--help")) {
    console.log("Usage: node scripts/check-browser-boot-budget.mjs [--json]");
    process.exit(0);
  }
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
