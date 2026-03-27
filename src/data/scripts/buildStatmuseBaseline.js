/**
 * Build StatMuse 2025 Baseline
 *
 * Validates and summarizes the output/statmuse-2025-baseline.json file generated
 * from StatMuse division-split player queries.
 *
 * Data generation (manual step):
 *   1. For each position room (QB, RB, WR, TE, OL, DL, LB, CB, S, K, P):
 *      - Query StatMuse by division for per-game stats from 2025
 *      - Compute 17-game equivalents for each starter-room slot
 *   2. Save results as output/statmuse-2025-baseline.json
 *   3. Run this script to validate and print a summary
 *
 * Usage:
 *   npm run build:statmuse-baseline
 *   npm run build:statmuse-baseline -- --apply   (writes smoothed profile to output)
 *
 * The --apply flag merges the StatMuse baseline with the current PFR weighted profile
 * using 50/50 smoothing and writes the result to output/statmuse-smoothed-profile.json.
 */

import fs from "node:fs";
import path from "node:path";

const INPUT_PATH = "output/statmuse-2025-baseline.json";
const OUTPUT_PATH = "output/statmuse-smoothed-profile.json";
const APPLY = process.argv.includes("--apply");

// ── Load baseline ─────────────────────────────────────────────────────────────

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`[statmuse-baseline] ERROR: ${INPUT_PATH} not found.`);
  console.error("Generate it manually by running division-split StatMuse queries and saving the result.");
  console.error("See the StatMuse query structure in context/CURRENT_STATE.md for reference.");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
const meta = raw.profile?.meta || {};
const positions = raw.profile?.positions || {};

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("[statmuse-baseline] StatMuse 2025 Baseline Summary");
console.log(`  Source:    ${meta.source || "unknown"}`);
console.log(`  Generated: ${meta.generatedAt || "unknown"}`);
console.log(`  Season:    ${meta.season || "unknown"}`);
console.log(`  Weighting: ${meta.weighting || "unknown"}`);
console.log("");
console.log("[statmuse-baseline] Position Coverage:");

const posKeys = Object.keys(positions);
if (!posKeys.length) {
  console.error("[statmuse-baseline] ERROR: No positions found in baseline.");
  process.exit(1);
}

for (const pos of posKeys) {
  const p = positions[pos];
  const metricCount = Object.keys(p.metrics || {}).length;
  console.log(`  ${pos.padEnd(4)} — ${metricCount} metrics, ${p.depthPerTeam || "?"} starter slots/team`);
}

// ── Validate key QB metrics ───────────────────────────────────────────────────

const qb = positions["QB"]?.metrics;
if (qb) {
  const compPct = qb["passing.att"] > 0 ? ((qb["passing.cmp"] / qb["passing.att"]) * 100).toFixed(1) : "?";
  const ypA = qb["passing.att"] > 0 ? (qb["passing.yards"] / qb["passing.att"]).toFixed(1) : "?";
  console.log("");
  console.log("[statmuse-baseline] QB Sanity Check:");
  console.log(`  Pass Yds/Season: ${qb["passing.yards"]?.toFixed(0)}`);
  console.log(`  TD/Season:       ${qb["passing.td"]?.toFixed(1)}`);
  console.log(`  INT/Season:      ${qb["passing.int"]?.toFixed(1)}`);
  console.log(`  Comp %:          ${compPct}%`);
  console.log(`  YPA:             ${ypA}`);
}

// ── Smoothing (--apply flag) ──────────────────────────────────────────────────

if (APPLY) {
  let pfrProfile;
  try {
    const { PFR_RECENT_WEIGHTED_PROFILE } = await import("../../stats/profiles/pfrRecentWeightedProfile.js");
    pfrProfile = PFR_RECENT_WEIGHTED_PROFILE;
  } catch {
    console.error("[statmuse-baseline] Could not load PFR_RECENT_WEIGHTED_PROFILE for smoothing.");
    process.exit(1);
  }

  const smoothed = { meta: { ...meta, smoothedAt: new Date().toISOString(), method: "50/50 StatMuse + PFR" }, positions: {} };

  for (const pos of posKeys) {
    const sm = positions[pos]?.metrics || {};
    const pfr = pfrProfile[pos] || {};
    const merged = {};
    const allKeys = new Set([...Object.keys(sm), ...Object.keys(pfr)]);
    for (const key of allKeys) {
      const smVal = sm[key];
      const pfrVal = pfr[key];
      if (typeof smVal === "number" && typeof pfrVal === "number") {
        merged[key] = (smVal * 0.5 + pfrVal * 0.5);
      } else if (typeof smVal === "number") {
        merged[key] = smVal;
      } else if (typeof pfrVal === "number") {
        merged[key] = pfrVal;
      }
    }
    smoothed.positions[pos] = { depthPerTeam: positions[pos]?.depthPerTeam, metrics: merged };
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(smoothed, null, 2));
  console.log(`\n[statmuse-baseline] Smoothed profile written to ${OUTPUT_PATH}`);
  console.log("Review and manually apply to PFR_RECENT_WEIGHTED_PROFILE if satisfied.");
} else {
  console.log("\n[statmuse-baseline] Run with --apply to generate a smoothed output profile.");
}

console.log("[statmuse-baseline] Done.");
