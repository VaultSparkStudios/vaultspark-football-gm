#!/usr/bin/env node
/**
 * verify-live-origin.mjs — prove the live domain serves the build we just made.
 *
 * The failure this exists to catch went unnoticed for a month. The repo's Deploy
 * Pages workflow was green the whole time, but it published to *GitHub* Pages,
 * while `playfranchisearchitect.com` is a CNAME to a *Cloudflare* Pages project
 * that had no git connection and had last been uploaded by hand on 2026-07-03.
 * Every gate was green and the live site was a month stale, because nothing ever
 * asserted that the deploy reached the domain the players actually use.
 *
 * A green deploy step is not evidence of a current site. This is.
 *
 * Compares the locally built `static/_health` against the live one and fails if
 * the style asset fingerprint does not match, then spot-checks the files whose
 * absence was the original symptom.
 */

import fs from "node:fs";
import path from "node:path";

const ORIGIN = process.env.LIVE_ORIGIN || "https://playfranchisearchitect.com";
const ATTEMPTS = Number(process.env.LIVE_VERIFY_ATTEMPTS || 10);
const DELAY_MS = Number(process.env.LIVE_VERIFY_DELAY_MS || 6000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function localHealth() {
  const file = path.join(process.cwd(), "static", "_health");
  if (!fs.existsSync(file)) {
    throw new Error("static/_health is missing — run `npm run build:pages` before verifying.");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!response.ok) return { status: response.status, body: null };
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  const expected = localHealth();
  const expectedAsset = expected.styleAsset;
  if (!expectedAsset) throw new Error("local _health carries no styleAsset to verify against.");

  console.log(`verify-live-origin · ${ORIGIN}`);
  console.log(`  expecting styleAsset ${expectedAsset}`);

  let live = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const health = await fetchJson(`${ORIGIN}/_health`);
    if (health.status === 200 && health.body?.styleAsset === expectedAsset) {
      live = health.body;
      console.log(`  ✓ live origin matches on attempt ${attempt}`);
      break;
    }
    const seen = health.status === 200 ? health.body?.styleAsset || "(no styleAsset)" : `HTTP ${health.status}`;
    console.log(`  … attempt ${attempt}/${ATTEMPTS}: ${seen}`);
    if (attempt < ATTEMPTS) await sleep(DELAY_MS);
  }

  if (!live) {
    console.error(
      `\n⛔ ${ORIGIN} is not serving this build.\n` +
      `   Expected styleAsset ${expectedAsset}.\n` +
      "   The deploy step reported success, so the artifact went somewhere the domain does not read.\n" +
      "   Check that the CNAME still points at the Cloudflare Pages project this workflow publishes to."
    );
    process.exit(1);
  }

  // The files whose absence was the original symptom.
  const required = ["/sw.js", "/deploy-manifest.json", "/edge-policy-receipt.json"];
  const missing = [];
  for (const route of required) {
    const response = await fetch(`${ORIGIN}${route}`, { method: "HEAD" });
    if (!response.ok) missing.push(`${route} → HTTP ${response.status}`);
  }
  if (missing.length) {
    console.error(`\n⛔ live origin is missing generated artifacts:\n   ${missing.join("\n   ")}`);
    process.exit(1);
  }

  console.log(`  ✓ ${required.length} generated artifacts present`);
  console.log(`  revision: ${live.sourceRevision || "(unstamped)"}`);
  console.log("verify-live-origin: PASS");
}

main().catch((error) => {
  console.error(`verify-live-origin failed: ${error.message}`);
  process.exit(1);
});
