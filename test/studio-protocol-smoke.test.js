import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHumanItems, parseUnifiedItems } from "../scripts/lib/task-board.mjs";
import { classifyBlocker } from "../scripts/lib/blocker-rules.mjs";

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
  assert.equal(items.some((item) => item.title.includes("Map-based")), true);
  assert.equal(parseHumanItems(markdown).length, 1);
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
    ["scripts/ops.mjs", "blocker-preflight", "--json"]
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  }
});

test("closeout brief renderer writes a public-safe markdown artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsfgm-closeout-"));
  mkdirSync(join(dir, ".cache"), { recursive: true });
  const input = join(dir, ".cache", "brief.json");
  writeFileSync(input, JSON.stringify({
    session: "TEST",
    date: "2026-06-15",
    repo: "vaultspark-football-gm",
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
