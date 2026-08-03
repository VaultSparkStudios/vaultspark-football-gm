#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateReleaseEvidenceFreshness } from "./lib/release-truth.mjs";

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export function checkReleaseEvidenceFreshness({ root = process.cwd(), liveReport = null, expectedRevision = null, now = Date.now() } = {}) {
  const status = JSON.parse(fs.readFileSync(path.join(root, "context", "PROJECT_STATUS.json"), "utf8"));
  return evaluateReleaseEvidenceFreshness({ contract: status.releaseEvidence, liveReport, expectedRevision, now });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const livePath = valueAfter(args, "--live-report");
  const liveReport = livePath ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), livePath), "utf8")) : null;
  const result = checkReleaseEvidenceFreshness({
    liveReport,
    expectedRevision: valueAfter(args, "--expected-revision")
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.current) process.exitCode = 1;
}