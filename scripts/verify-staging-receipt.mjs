#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReleaseProvenanceReport } from "./verify-release-provenance.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { expected: "static/deploy-manifest.json", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--base-url") args.baseUrl = argv[++index];
    else if (argv[index] === "--expected") args.expected = argv[++index];
    else if (argv[index] === "--fixture") args.fixture = argv[++index];
    else if (argv[index] === "--json") args.json = true;
  }
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.resolve(rootDir, file), "utf8"));
}

async function defaultStagingUrl() {
  const status = await readJson("context/PROJECT_STATUS.json");
  return status.stagingUrl || null;
}

export async function buildStagingReceiptReport({ expected, baseUrl, fixture = null } = {}) {
  const report = await buildReleaseProvenanceReport({
    expected,
    baseUrl,
    fixture,
    requireSameOrigin: true
  });
  return {
    ...report,
    generatedBy: "scripts/verify-staging-receipt.mjs",
    stagingContract: {
      sameOriginRequired: true,
      healthSchemaRequired: true,
      exactDeployIdentityRequired: true
    }
  };
}

async function main() {
  const args = parseArgs();
  const expected = await readJson(args.expected);
  const fixture = args.fixture ? await readJson(args.fixture) : null;
  const baseUrl = args.baseUrl || await defaultStagingUrl();
  if (!baseUrl) throw new Error("No staging URL is configured. Set context/PROJECT_STATUS.json.stagingUrl or pass --base-url.");
  const report = await buildStagingReceiptReport({ expected, baseUrl, fixture });
  console.log(args.json
    ? JSON.stringify(report, null, 2)
    : `${report.summary.status.toUpperCase()} — ${report.summary.checksPassed}/${report.summary.checksTotal} same-origin staging checks`);
  process.exitCode = report.summary.status === "verified" ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
