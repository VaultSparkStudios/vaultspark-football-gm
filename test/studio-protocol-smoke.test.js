import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseHumanItems, parseUnifiedItems } from "../scripts/lib/task-board.mjs";
import { classifyBlocker } from "../scripts/lib/blocker-rules.mjs";

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
