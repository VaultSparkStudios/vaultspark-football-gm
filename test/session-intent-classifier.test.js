import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildIntentSample,
  classifyIntent,
  classifySessionScope,
  extractCurrentOpenTasks,
  extractLatestSessionIntent
} from "../scripts/classify-session-intent.mjs";

test("latest numbered session intent wins over older and generic headings", () => {
  const handoff = `
## Session 54 Intent

Refresh routine docs.

## Session 55 Intent (2026-07-23)

Architect and implement the live feature blueprint.

## Session Intent

Old generic fallback.
`;
  assert.equal(
    extractLatestSessionIntent(handoff),
    "Architect and implement the live feature blueprint."
  );
});

test("session scope ignores append-only historical portfolio noise", () => {
  const result = classifySessionScope({
    currentMode: "founder",
    handoff: `
## Session 57 Intent

Implement and ship the current project audit.

## Session 12 Intent

Review the entire portfolio and studio-wide roadmap.
`,
    taskboard: `
## Session 12 — Old
| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Portfolio | Done | 1h | propagate-every-project |

## Session 57 — Live
| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Execution | Open | 2h | implement-current-authority |
`
  });
  assert.equal(result.recommended, "builder");
  assert.equal(result.shouldFlip, true);
  assert.deepEqual(result.sourceLedger.tasks, ["implement-current-authority"]);
  assert.equal(result.crossProjectRefs, 0);
});

test("current task sample consumes the latest live table without a Now bucket", () => {
  const board = `
## Session 54 — Closed

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Old | Done | 1h | stale-complete |

## Session 55 — Live

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Architecture | Open | 2h | design-live-authority |
| FIRE | Execution | Open | 1h | implement-live-route |
| FIRE | Ops | Blocked | 1h | founder-only-launch |
| FIRE | Testing | Open | 1h | verify-live-contract |
`;
  const tasks = extractCurrentOpenTasks(board);
  assert.deepEqual(
    tasks.map((item) => item.title),
    ["design-live-authority", "implement-live-route", "verify-live-contract"]
  );
});

test("intent sample exposes an explainable source ledger", () => {
  const result = buildIntentSample({
    handoff: "## Session 55 Intent\n\nBuild and integrate the architecture.\n",
    taskboard: `
## Session 55 — Live
| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Execution | Open | 1h | add-route |
`
  });
  assert.match(result.sample, /build and integrate/);
  assert.deepEqual(result.sources.tasks, ["add-route"]);
});

test("classifier uses current numbered intent and open table rows", () => {
  const root = mkdtempSync(join(tmpdir(), "fa-intent-"));
  mkdirSync(join(root, "context"));
  writeFileSync(
    join(root, "context", "LATEST_HANDOFF.md"),
    "## Session 55 Intent\n\nDesign architecture blueprint and schema change.\n"
  );
  writeFileSync(
    join(root, "context", "TASK_BOARD.md"),
    `## Session 55 — Live
| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Planning | Open | 2h | design-new-feature |
| FIRE | Historical | Done | 1h | cleanup-old-docs |
`
  );
  const result = classifyIntent(root);
  assert.equal(result.intent, "planning");
  assert.deepEqual(result.sourceLedger.tasks, ["design-new-feature"]);
  assert.ok(result.scores.planning > result.scores.ops);
});
