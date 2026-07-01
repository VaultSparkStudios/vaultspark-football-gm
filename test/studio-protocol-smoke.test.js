import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHumanItems, parseUnifiedItems } from "../scripts/lib/task-board.mjs";
import { classifyBlocker } from "../scripts/lib/blocker-rules.mjs";
import { scanDirectChildProcessImports } from "../scripts/check-windows-hide.mjs";

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
    ["scripts/cache-genius-list.mjs", "--write"],
    ["scripts/ops.mjs", "blocker-preflight", "--json"],
    ["scripts/ops.mjs", "cache-genius-list", "--check"],
    ["scripts/ops.mjs", "innovation-pack", "--dry-run"]
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  }
});

test("windows-hide guard detects dynamic child_process imports", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-window-guard-"));
  const script = join(dir, "dynamic.mjs");
  writeFileSync(script, "const cp = await import('node:child_process');\nvoid cp;\n");
  const violations = scanDirectChildProcessImports(dir);
  assert.equal(violations.length, 1);
  assert.match(violations[0].file, /dynamic\.mjs$/);
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

  const cache = JSON.parse(readFileSync(resolve(repoRoot, ".cache/genius-list.json"), "utf8"));
  assert.equal(Array.isArray(cache.items), true);
  assert.equal(cache.status, cache.items.length > 0 ? "open" : "exhausted");
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