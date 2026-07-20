#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeWithRedirects } from "./launch-evidence-report.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { baseUrl: "https://playfranchisearchitect.com", expected: "static/deploy-manifest.json", json: false };
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

function parseBody(result) {
  try { return JSON.parse(result?.body || ""); } catch { return null; }
}

export async function buildReleaseProvenanceReport({ expected, baseUrl, fixture = null, probe = probeWithRedirects } = {}) {
  const origin = String(baseUrl || expected?.canonicalOrigin || "").replace(/\/+$/, "");
  const fetchRoute = async (route) => fixture?.routes?.[route] || probe(`${origin}${route}`, 7000);
  const healthResult = await fetchRoute("/_health");
  const manifestResult = await fetchRoute("/deploy-manifest.json");
  const assetRoute = `/${String(expected?.styleAsset || "styles.css").replace(/^\/+/, "")}`;
  const assetResult = await fetchRoute(assetRoute);
  const liveHealth = parseBody(healthResult);
  const liveManifest = parseBody(manifestResult);
  const checks = [
    { name: "health reachable", ok: healthResult?.ok === true },
    { name: "manifest reachable", ok: manifestResult?.ok === true },
    { name: "style asset reachable", ok: assetResult?.ok === true },
    { name: "source revision", ok: Boolean(expected?.sourceRevision && liveHealth?.sourceRevision === expected.sourceRevision && liveManifest?.sourceRevision === expected.sourceRevision), expected: expected?.sourceRevision, observed: liveManifest?.sourceRevision || liveHealth?.sourceRevision || null },
    { name: "style asset identity", ok: Boolean(expected?.styleAsset && liveHealth?.styleAsset === expected.styleAsset && liveManifest?.styleAsset === expected.styleAsset), expected: expected?.styleAsset, observed: liveManifest?.styleAsset || liveHealth?.styleAsset || null },
    { name: "repository identity", ok: Boolean(expected?.repository && liveManifest?.repository === expected.repository), expected: expected?.repository, observed: liveManifest?.repository || null },
    { name: "launch truth separation", ok: liveHealth?.launchReady === false, expected: false, observed: liveHealth?.launchReady }
  ];
  const ready = checks.every((check) => check.ok);
  return {
    schemaVersion: "1.0",
    generatedBy: "scripts/verify-release-provenance.mjs",
    checkedAt: new Date().toISOString(),
    baseUrl: origin,
    expectedRevision: expected?.sourceRevision || null,
    summary: { status: ready ? "verified" : "blocked", checksPassed: checks.filter((check) => check.ok).length, checksTotal: checks.length },
    checks
  };
}

async function main() {
  const args = parseArgs();
  const expected = await readJson(args.expected);
  const fixture = args.fixture ? await readJson(args.fixture) : null;
  const report = await buildReleaseProvenanceReport({ expected, baseUrl: args.baseUrl, fixture });
  console.log(args.json ? JSON.stringify(report, null, 2) : `${report.summary.status.toUpperCase()} — ${report.summary.checksPassed}/${report.summary.checksTotal} provenance checks`);
  process.exitCode = report.summary.status === "verified" ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
