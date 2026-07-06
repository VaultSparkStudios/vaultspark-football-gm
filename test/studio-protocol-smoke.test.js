import test from "node:test";
import assert from "node:assert/strict";
// S186 window-storm guard: spawnSync comes from the hardened wrapper (forces
// windowsHide:true), never raw node:child_process — this file spawns ~15 children.
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHumanItems, parseUnifiedItems } from "../scripts/lib/task-board.mjs";
import { classifyBlocker } from "../scripts/lib/blocker-rules.mjs";
import { SCAN_ROOTS, scanDirectChildProcessImports } from "../scripts/check-windows-hide.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("task board parser extracts table and human-blocked items", () => {
  const markdown = `
## Human Action Required

- [ ] GitHub Pages deploy pipeline requires repo secrets configuration

| # | Item | Status |
|---|------|--------|
| 1 | Map-based player/team index | 🔜 Next sprint |
`;

  const items = parseUnifiedItems(markdown);
  assert.equal(items.length, 2);
  const mapItem = items.find((item) => item.title.includes("Map-based"));
  assert.equal(Boolean(mapItem), true);
  assert.equal(mapItem.status, "open");
  assert.equal(parseHumanItems(markdown).length, 1);
});

test("task board parser keeps completed three-column rows out of open queues", () => {
  const markdown = `
| # | Item | Status |
|---|------|--------|
| 1 | localStorage rewind size guard | ✅ Done |
| 2 | Next launch evidence | 🔜 Next sprint |
`;

  const items = parseUnifiedItems(markdown);
  assert.equal(items.find((item) => item.title.includes("localStorage")).status, "done");
  assert.equal(items.find((item) => item.title.includes("Next launch")).status, "open");
});

test("blocker classifier maps GitHub Pages secret work to an agent-attemptable probe", () => {
  const result = classifyBlocker("GitHub Pages deploy pipeline requires repo secrets configuration");
  assert.equal(result.attemptable, true);
  assert.equal(result.capabilities.includes("github.repo"), true);
  assert.equal(result.probeCommands.includes("gh auth status"), true);
});

test("startup and blocker protocol scripts load without missing helper modules", () => {
  const blocker = spawnSync(process.execPath, ["scripts/blocker-preflight.mjs", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(blocker.status, 0, blocker.stderr);
  assert.doesNotThrow(() => JSON.parse(blocker.stdout));

  const startup = spawnSync(process.execPath, ["scripts/render-startup-brief.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(startup.status, 0, startup.stderr);
});

test("documented Studio protocol shims load", () => {
  for (const args of [
    ["scripts/set-active-skill.mjs", "audit"],
    ["scripts/lib/skill-profile.mjs", "audit"],
    ["scripts/check-brief-staleness.mjs"],
    ["scripts/credential-watch.mjs", "--silent"],
    ["scripts/ark.mjs", "drain", "--silent"],
    ["scripts/record-skill-cost.mjs", "--skill", "studio-closeout", "--phase", "start"],
    ["scripts/sample-codebase.mjs", "--max-tokens", "1200", "--json"],
    ["scripts/cache-genius-list.mjs", "--write"],
    ["scripts/ops.mjs", "blocker-preflight", "--json"],
    ["scripts/ops.mjs", "genius-list"],
    ["scripts/ops.mjs", "cache-genius-list", "--check"],
    ["scripts/ops.mjs", "innovation-pack", "--dry-run"],
    ["scripts/ops.mjs", "launch-evidence", "--fixture", "test/fixtures/launch-evidence-ready.json"]
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  }
});


test("sample-codebase emits bounded JSON with prioritized live files", () => {
  const result = spawnSync(process.execPath, ["scripts/sample-codebase.mjs", "--max-tokens", "25000", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const sample = JSON.parse(result.stdout);
  assert.equal(sample.maxTokens, 25000);
  assert.equal(sample.usedTokens <= 25000, true);
  assert.equal(sample.files.length > 0, true);
  assert.equal(sample.files[0].path, "public/app.js");
  assert.equal(sample.files.some((file) => file.path === "scripts/ops.mjs"), true);
  assert.equal(sample.files.some((file) => file.path.includes("node_modules")), false);
});


test("ops genius-list emits a parseable cache summary", () => {
  const result = spawnSync(process.execPath, ["scripts/ops.mjs", "genius-list"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /genius list: (open|exhausted)/);
  const jsonStart = result.stdout.indexOf("{");
  assert.equal(jsonStart >= 0, true);
  const cache = JSON.parse(result.stdout.slice(jsonStart));
  assert.equal(typeof cache.status, "string");
  assert.equal(Array.isArray(cache.items), true);
  assert.equal(Array.isArray(cache.closed), true);
});

test("windows-hide guard detects dynamic child_process imports", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-window-guard-"));
  const script = join(dir, "dynamic.mjs");
  // String is split so the guard (which now scans test/ too) never self-matches this line.
  writeFileSync(script, "const cp = await import('node:" + "child_process');\nvoid cp;\n");
  const violations = scanDirectChildProcessImports(dir);
  assert.equal(violations.length, 1);
  assert.match(violations[0].file, /dynamic\.mjs$/);
});

test("windows-hide guard scans both scripts/ and test/ and the tree is clean", () => {
  assert.equal(SCAN_ROOTS.some((root) => /[\\/]scripts$/.test(root)), true);
  assert.equal(SCAN_ROOTS.some((root) => /[\\/]test$/.test(root)), true);
  // Default scan (scripts/ + test/) must be clean — a raw child_process import in
  // either tree would surface here and in `node scripts/check-windows-hide.mjs`.
  assert.deepEqual(scanDirectChildProcessImports(), []);
  // Array-of-roots form catches a violation planted under a test-style tree.
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-window-guard-roots-"));
  writeFileSync(join(dir, "raw.test.js"), "const { spawnSync } = require('node:" + "child_process');\nvoid spawnSync;\n");
  const violations = scanDirectChildProcessImports([dir]);
  assert.equal(violations.length, 1);
});

test("closeout brief renderer writes a public-safe markdown artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-closeout-"));
  mkdirSync(join(dir, ".cache"), { recursive: true });
  const input = join(dir, ".cache", "brief.json");
  writeFileSync(input, JSON.stringify({
    session: "TEST",
    date: "2026-06-15",
    repo: "franchise-architect-football",
    headline: "Test brief",
    items: [{ title: "Protocol shim", projectImpact: 7, ecosystemImpact: 5, evidence: "renderer wrote markdown" }],
    followUps: [],
    blockers: [],
    honestyLedger: []
  }));

  const result = spawnSync(process.execPath, [join(repoRoot, "scripts/render-closeout-brief.mjs"), "--input", input, "--ascii"], {
    cwd: dir,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Protocol shim/);
  assert.equal(existsSync(join(dir, "docs", "CLOSEOUT_BRIEF_TEST_2026-06-15.md")), true);
});

test("startup brief treats live pctUsed 1 as one percent, not full", () => {
  const source = readFileSync(resolve(repoRoot, "scripts/render-startup-brief.mjs"), "utf8");
  assert.match(source, /const meterUsedPctRaw = meter\.live \? meter\.pctUsed : meter\.pctUsed \* 100;/);
  assert.doesNotMatch(source, /meter\.pctUsed > 1 \? meter\.pctUsed : meter\.pctUsed \* 100/);
});

test("startup brief always renders the canonical human pressure block", () => {
  const result = spawnSync(process.execPath, ["scripts/render-startup-brief.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const brief = readFileSync(resolve(repoRoot, "docs/STARTUP_BRIEF.md"), "utf8");
  assert.match(brief, /HUMAN PRESSURE/);
});

test("genius cache check/write reports latest audit truthfully", () => {
  const write = spawnSync(process.execPath, ["scripts/cache-genius-list.mjs", "--write"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(write.status, 0, write.stderr);

  const check = spawnSync(process.execPath, ["scripts/cache-genius-list.mjs", "--check"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /FRESH/);

  const cache = JSON.parse(readFileSync(resolve(repoRoot, ".cache/genius-list.json"), "utf8"));
  assert.equal(Array.isArray(cache.items), true);
  assert.equal(Array.isArray(cache.closed), true);
  assert.equal(cache.status, cache.items.length > 0 ? "open" : "exhausted");
});

const cacheGeniusScript = join("scripts", "cache-genius-list.mjs");

function writeGeniusAuditFixture(dir, { executionLog } = {}) {
  mkdirSync(join(dir, "docs"), { recursive: true });
  const lines = [
    "# Fixture Audit",
    "",
    "## Ranked Plan",
    "",
    "| # | Tier | Axis | Effort | Impact | Innov. | Priority | Item |",
    "|---|:-:|---|---|:-:|:-:|:-:|---|",
    "| 1 | A | gamification | 2h | 8 | 8 | 32.0 | **alpha-item** — first fixture item. |",
    "| 2 | B | observability | 1h | 7 | 4 | 20.0 | **beta-item** — evidence remains unverified until launch. |",
    "| 3 | C | security | 1h | 6 | 3 | 15.0 | **gamma-item** — third fixture item. |"
  ];
  if (executionLog) {
    lines.push("", "## Execution Log", "", "| Item | Status | Evidence |", "|---|---|---|", ...executionLog);
  }
  writeFileSync(join(dir, "docs", "AUDIT_2026-01-01_SESSION1.md"), `${lines.join("\n")}\n`);
}

function runGeniusCache(dir, flag) {
  return spawnSync(process.execPath, [join(repoRoot, cacheGeniusScript), flag], {
    cwd: dir,
    encoding: "utf8"
  });
}

test("genius cache falls back to TASK_BOARD status when audit has no Execution Log", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-genius-taskboard-"));
  writeGeniusAuditFixture(dir);
  mkdirSync(join(dir, "context"), { recursive: true });
  writeFileSync(join(dir, "context", "TASK_BOARD.md"), `
## Session Fixture

| Item | Status |
|------|--------|
| alpha-item — shipped through task board only | Done |
| gamma-item — blocked through task board only | Blocked |
`);

  const write = runGeniusCache(dir, "--write");
  assert.equal(write.status, 0, write.stderr);

  const cache = JSON.parse(readFileSync(join(dir, ".cache", "genius-list.json"), "utf8"));
  assert.equal(cache.closed.includes("alpha-item"), true);
  assert.equal(cache.items.some((item) => item.slug === "alpha-item"), false);
  const beta = cache.items.find((item) => item.slug === "beta-item");
  assert.equal(beta.status, "open");
  const gamma = cache.items.find((item) => item.slug === "gamma-item");
  assert.equal(gamma.status, "open");
  assert.equal(gamma.blocked, true);
});
test("genius cache joins Execution Log status by slug and ignores prose substrings", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-genius-cache-"));
  writeGeniusAuditFixture(dir, {
    executionLog: [
      "| alpha-item | Implemented | shipped in fixture evidence |",
      "| gamma-item | Blocked | waiting on founder action |"
    ]
  });

  const write = runGeniusCache(dir, "--write");
  assert.equal(write.status, 0, write.stderr);

  const cache = JSON.parse(readFileSync(join(dir, ".cache", "genius-list.json"), "utf8"));
  const openSlugs = cache.items.map((item) => item.slug);
  // Failure mode 1 (fixed): Execution Log "Implemented" must close the item.
  assert.equal(openSlugs.includes("alpha-item"), false);
  assert.equal(cache.closed.includes("alpha-item"), true);
  // Failure mode 2 (fixed): "unverified" prose in the Item cell must NOT read as done.
  const beta = cache.items.find((item) => item.slug === "beta-item");
  assert.equal(beta.status, "open");
  // Execution Log "Blocked" keeps the item open and records blocked:true.
  const gamma = cache.items.find((item) => item.slug === "gamma-item");
  assert.equal(gamma.status, "open");
  assert.equal(gamma.blocked, true);
});

test("genius cache --check is content-aware: newer-mtime cache contradicting the audit is STALE", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-genius-check-"));
  writeGeniusAuditFixture(dir); // no Execution Log — all three items open

  const write = runGeniusCache(dir, "--write");
  assert.equal(write.status, 0, write.stderr);
  const fresh = runGeniusCache(dir, "--check");
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /FRESH/);

  // Corrupt the cache CONTENT (pretend beta-item is closed). The cache file's mtime is
  // now NEWER than the audit — the old mtime-only check would have said FRESH.
  const cachePath = join(dir, ".cache", "genius-list.json");
  const cache = JSON.parse(readFileSync(cachePath, "utf8"));
  cache.items = cache.items.filter((item) => item.slug !== "beta-item");
  cache.closed = ["beta-item"];
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);

  const stale = runGeniusCache(dir, "--check");
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stdout, /STALE/);

  // --write restores truth and --check goes FRESH again.
  assert.equal(runGeniusCache(dir, "--write").status, 0);
  assert.equal(runGeniusCache(dir, "--check").status, 0);
});

test("studio manifest launch state does not outrun active project blockers", () => {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "context/STUDIO_MANIFEST.json"), "utf8"));
  const status = JSON.parse(readFileSync(resolve(repoRoot, "context/PROJECT_STATUS.json"), "utf8"));

  assert.equal(manifest.identity.slug, status.slug);
  if ((status.blockers || []).length > 0 || status.audience === "public-unlaunched") {
    assert.notEqual(manifest.identity.vaultStatus, "SPARKED");
  }
});
test("innovation-pack marker scan ignores intentional guard sentinels", () => {
  const result = spawnSync(process.execPath, ["scripts/ops.mjs", "innovation-pack", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Client-only runtime not implemented/);
  assert.doesNotMatch(result.stdout, /unresolved computed-block stub/);
  assert.doesNotMatch(result.stdout, /scripts\/lib\/task-board\.mjs/);
});
