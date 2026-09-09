import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { readCommittedGeniusAuthority } from "../scripts/lib/startup-authority.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const completed = [
  { slug: "done-work", status: "done" },
  { slug: "shipped-work", status: " SHIPPED " },
  { slug: "implemented-work", status: " Implemented " },
  { slug: "complete-work", status: "Complete" },
  { slug: "completed-work", status: "completed" }
];
const unresolved = [
  { slug: "blocked-work", status: "blocked" },
  { slug: "unverified-work", status: "unverified" },
  { slug: "unknown-work", status: "unknown" },
  { slug: "missing-work" },
  { slug: "negated-work", status: "not implemented" },
  { slug: "partial-work", status: "completed partially" }
];
const closedSlugs = ["done-work", "shipped-work", "implemented-work", "complete-work", "completed-work"];
const openSlugs = ["blocked-work", "unverified-work", "unknown-work", "missing-work", "negated-work", "partial-work"];

for (const exhausted of [false, true]) {
  test(`all audit readers agree on ${exhausted ? "exhausted" : "mixed"} completion evidence`, (t) => {
    const root = mkdtempSync(join(tmpdir(), "audit-completion-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "docs"));
    const items = exhausted ? completed : [...completed, ...unresolved];
    const audit = join(root, "docs", "AUDIT_2026-09-09");
    writeFileSync(`${audit}.json`, JSON.stringify({ items }));
    writeFileSync(`${audit}.md`, [
      "# Fixture audit",
      "| # | Tier | Axis | Effort | Impact | Innovation | Priority | Item |",
      "|---|---|---|---|---|---|---|---|",
      ...items.map((item, index) => `| ${index + 1} | A | correctness | 1h | 9 | 5 | 30 | **${item.slug}** |`),
      "## Execution Log",
      "| Item | Status | Evidence |",
      "|---|---|---|",
      ...items.map((item) => `| ${item.slug} | ${item.status || ""} | fixture |`)
    ].join("\n"));

    const authority = readCommittedGeniusAuthority(root);
    assert.equal(authority.status, exhausted ? "exhausted" : "open");
    assert.deepEqual(authority.items.map((item) => item.slug), exhausted ? [] : openSlugs);
    assert.deepEqual(authority.closed, closedSlugs);

    const cacheRun = spawnSync(process.execPath, [join(repo, "scripts/cache-genius-list.mjs"), "--write"], { cwd: root, encoding: "utf8" });
    assert.equal(cacheRun.status, 0, cacheRun.stderr);
    const cache = JSON.parse(readFileSync(join(root, ".cache/genius-list.json"), "utf8"));
    assert.equal(cache.status, exhausted ? "exhausted" : "open");
    assert.deepEqual(cache.items.map((item) => item.slug), exhausted ? [] : openSlugs);
    assert.deepEqual(cache.closed, closedSlugs);
    if (!exhausted) assert.equal(cache.items[0].blocked, true);

    const pack = spawnSync(process.execPath, [join(repo, "scripts/generate-innovation-pack.mjs"), "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(pack.status, 0, pack.stderr);
    if (exhausted) {
      assert.doesNotMatch(pack.stdout, /latest-audit-follow-through/);
      assert.match(pack.stdout, /No unclassified live innovation candidates remain/);
    } else {
      assert.match(pack.stdout, /latest-audit-follow-through/);
      assert.match(pack.stdout, /6 open items/);
    }
  });
}
