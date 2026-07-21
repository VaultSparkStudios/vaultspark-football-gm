#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PARAMETERLESS_PROMISE_CATCH = /\.catch\s*\(\s*\(\s*\)\s*=>/g;

async function walkJavaScript(rootDir) {
  const files = [];
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(target);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
    }
  }
  return files.sort();
}

export function scanSourceForSilentPromiseSinks(source, file = "<source>") {
  const findings = [];
  let match = PARAMETERLESS_PROMISE_CATCH.exec(source);
  while (match) {
    const before = source.slice(0, match.index);
    const precedingLines = before.split(/\r?\n/).slice(-3).join("\n");
    if (!precedingLines.includes("observability-allow-silent:")) {
      findings.push({
        file,
        line: before.split(/\r?\n/).length,
        token: match[0]
      });
    }
    match = PARAMETERLESS_PROMISE_CATCH.exec(source);
  }
  PARAMETERLESS_PROMISE_CATCH.lastIndex = 0;
  return findings;
}

export async function assertBrowserPromiseObservability({ publicDir } = {}) {
  const rootDir = publicDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
  const files = await walkJavaScript(rootDir);
  const findings = [];
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    findings.push(...scanSourceForSilentPromiseSinks(source, path.relative(rootDir, file)));
  }
  if (findings.length) {
    const detail = findings.map((finding) => "  " + finding.file + ":" + finding.line + " " + finding.token).join("\n");
    throw new Error("Silent browser promise sinks are forbidden. Route failures through observeBackgroundTask:\n" + detail);
  }
  return { checkedFiles: files.length, findings: 0 };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  assertBrowserPromiseObservability()
    .then((result) => console.log("browser promise observability: " + result.checkedFiles + " files, 0 silent sinks"))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
