#!/usr/bin/env node
/**
 * check-duplicate-prs.mjs — stop an open-loop agent from burying the queue.
 *
 * Between 2026-06-16 and 2026-07-31 a scheduled agent opened **33 pull requests
 * for the same feature**, one per day at ~08:15 UTC. The work was fine — the PRs
 * passed CI — but nothing merged or closed them, so each new day's branch left
 * the previous day's PR conflicting. 31 of the 33 ended up DIRTY, 42 PRs were
 * open in total, and 93 of the last 200 workflow runs were spent re-validating
 * the same rejected-by-inaction change.
 *
 * The automation had a *create* step, no *land* step, and no *stop* condition —
 * it could not tell that thirty-two identical PRs already existed.
 *
 * This check gives it one. It groups open PRs by a normalised title signature
 * and fails when any group exceeds the threshold, naming the group so whoever
 * sees it can land one and close the rest.
 *
 * Usage:
 *   node scripts/check-duplicate-prs.mjs [--max 3] [--json]
 *
 * Requires the `gh` CLI. Exits 0 (skipped) when `gh` is unavailable or
 * unauthenticated, so it never fails a run for an environment reason.
 */

import { pathToFileURL } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";

const args = process.argv.slice(2);
const MAX_PER_GROUP = Number(args[args.indexOf("--max") + 1]) || 3;
const asJson = args.includes("--json");

const STOP_WORDS = new Set([
  "feat", "fix", "chore", "docs", "test", "refactor", "perf",
  "with", "that", "this", "from", "into", "above", "over", "when", "then",
  "unblocks", "adds", "add", "make", "makes", "plus", "and", "the", "for"
]);

/**
 * Reduce a PR title to the words that describe what it is attempting.
 *
 * Exact signature matching does not work on real titles. The same feature
 * arrived as "scrollable 100dvh mobile nav drawer", "mobile bottom nav z-index
 * above mobileLoopOverlay" and "horizontal scrollable sticky nav strip" — those
 * share most of their meaningful words but no exact key, so grouping is done by
 * token overlap instead (see `similarity`).
 */
export function titleTokens(title) {
  return new Set(
    String(title || "")
      .toLowerCase()
      .replace(/^\w+(\([^)]*\))?!?:\s*/, "")
      .replace(/canon-\d+/g, " ")
      .replace(/\d+(dvh|px|vh|vw)?/g, " ")
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

/** Jaccard overlap of two token sets. */
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Cluster PRs whose titles overlap enough to be the same attempt.
 * Greedy single-link clustering is ample here — real duplicate groups are stark.
 */
export function clusterByTitle(prs, threshold = 0.34) {
  const clusters = [];
  for (const pr of prs) {
    const tokens = titleTokens(pr.title);
    if (!tokens.size) continue;
    const home = clusters.find((cluster) =>
      cluster.members.some((member) => similarity(tokens, member.tokens) >= threshold)
    );
    if (home) home.members.push({ ...pr, tokens });
    else clusters.push({ members: [{ ...pr, tokens }] });
  }
  return clusters;
}

function openPullRequests() {
  const result = spawnSync(
    process.platform === "win32" ? "gh.exe" : "gh",
    ["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,createdAt,author"],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function main() {
  const prs = openPullRequests();
  if (!prs) {
    console.log("check-duplicate-prs: skipped (gh unavailable or unauthenticated)");
    return 0;
  }

  const offenders = clusterByTitle(prs)
    .filter((cluster) => cluster.members.length > MAX_PER_GROUP)
    .map((cluster) => {
      // Label the group with the words every member actually shares.
      const shared = [...cluster.members[0].tokens].filter((token) =>
        cluster.members.every((member) => member.tokens.has(token))
      );
      const label = shared.length ? shared.join(" ") : cluster.members[0].title.slice(0, 40);
      return [label, cluster.members];
    })
    .sort((a, b) => b[1].length - a[1].length);

  if (asJson) {
    console.log(JSON.stringify({
      openPullRequests: prs.length,
      threshold: MAX_PER_GROUP,
      duplicateGroups: offenders.map(([signature, list]) => ({
        signature,
        count: list.length,
        numbers: list.map((pr) => pr.number)
      }))
    }, null, 2));
  }

  if (!offenders.length) {
    if (!asJson) console.log(`check-duplicate-prs: ✓ ${prs.length} open, no group over ${MAX_PER_GROUP}`);
    return 0;
  }

  if (!asJson) {
    console.error(`\n⛔ duplicate pull requests are accumulating (${prs.length} open)\n`);
    for (const [signature, list] of offenders) {
      const oldest = list.map((pr) => pr.createdAt).sort()[0]?.slice(0, 10);
      console.error(`  ${list.length}× "${signature}"  (since ${oldest})`);
      console.error(`     #${list.map((pr) => pr.number).join(", #")}`);
    }
    console.error(
      "\n  An automation is opening the same change repeatedly without landing it.\n" +
      "  Land one and close the rest, then gate or retire the job that creates them.\n"
    );
  }
  return 1;
}

// Only run the CLI when invoked directly — the clustering helpers above are
// imported by test/duplicate-pr-guard.test.js.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(main());
