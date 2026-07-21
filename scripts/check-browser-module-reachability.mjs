import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function walkFiles(dir) {
  const rows = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...(await walkFiles(target)));
    else rows.push(target);
  }
  return rows;
}

function localScriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((source) => !/^(?:https?:)?\/\//i.test(source));
}

function relativeImports(source) {
  const imports = [];
  const executableSource = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const declarationPattern = /\b(?:import|export)\b\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const pattern of [declarationPattern, dynamicPattern]) {
    for (let match = pattern.exec(executableSource); match; match = pattern.exec(executableSource)) {
      if (match[1].startsWith(".")) imports.push(match[1]);
    }
  }
  return imports;
}

async function resolveModule(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // Try the next browser-compatible resolution.
    }
  }
  throw new Error(`Unresolved browser import '${specifier}' from ${fromFile}`);
}

export async function analyzeBrowserModuleReachability({ publicDir, allowlist = [] }) {
  const root = path.resolve(publicDir);
  const files = await walkFiles(root);
  const htmlFiles = files.filter((file) => file.endsWith(".html"));
  const jsFiles = files.filter((file) => file.endsWith(".js"));
  const entries = new Set();
  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, "utf8");
    for (const source of localScriptSources(html)) {
      const cleanSource = source.split(/[?#]/, 1)[0];
      entries.add(path.resolve(path.dirname(htmlFile), cleanSource));
    }
  }

  const reachable = new Set();
  const queue = [...entries];
  while (queue.length) {
    const current = queue.pop();
    if (reachable.has(current)) continue;
    if (!current.startsWith(`${root}${path.sep}`) && current !== root) {
      throw new Error(`Browser module escaped public root: ${current}`);
    }
    reachable.add(current);
    const source = await fs.readFile(current, "utf8");
    for (const specifier of relativeImports(source)) queue.push(await resolveModule(current, specifier));
  }

  const allowed = new Set(allowlist.map((file) => path.resolve(root, file)));
  const orphaned = jsFiles.filter((file) => !reachable.has(file) && !allowed.has(file)).sort();
  return {
    ok: orphaned.length === 0,
    entries: [...entries].map((file) => path.relative(root, file).replaceAll("\\", "/")).sort(),
    reachable: [...reachable].filter((file) => file.endsWith(".js")).map((file) => path.relative(root, file).replaceAll("\\", "/")).sort(),
    orphaned: orphaned.map((file) => path.relative(root, file).replaceAll("\\", "/"))
  };
}

export async function assertBrowserModuleReachability(options) {
  const report = await analyzeBrowserModuleReachability(options);
  if (!report.ok) throw new Error(`Orphaned browser modules: ${report.orphaned.join(", ")}`);
  return report;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(scriptDir, "..", "public");
  const report = await assertBrowserModuleReachability({ publicDir });
  console.log(`Browser reachability green: ${report.reachable.length} modules from ${report.entries.length} HTML entries.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
