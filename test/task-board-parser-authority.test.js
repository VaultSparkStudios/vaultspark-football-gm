import assert from "node:assert/strict";
import test from "node:test";

import { parseTaskBoardItems, parseUnifiedItems, taskItemKey } from "../scripts/lib/task-board.mjs";
import { parseTaskBoard as parseCrossRepoTaskBoard } from "../scripts/lib/cross-repo-tasks.mjs";

const LIVE_FORMAT_FIXTURE = `
## Legacy ranked queue

| # | Item | Status |
|---:|---|---|
| 1 | alpha-authority — first version | ✅ Done |
| 2 | old-only-task | ✅ Done |

## Session 52

| Item | Status |
|---|---|
| alpha-authority | Open — premise changed |
| beta-agency | Blocked — external evidence |
| gamma-command | Done — verified |
`;

test("shared task-board parser reads ranked and session tables with latest status winning", () => {
  const rows = parseTaskBoardItems(LIVE_FORMAT_FIXTURE);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  assert.equal(byKey.get("alpha-authority").status, "open");
  assert.equal(byKey.get("beta-agency").status, "blocked");
  assert.equal(byKey.get("gamma-command").status, "done");
  assert.equal(byKey.get("old-only-task").status, "done");
  assert.deepEqual(parseUnifiedItems(LIVE_FORMAT_FIXTURE), rows);
});

test("cross-repo adapter consumes the shared normalized rows", () => {
  const shared = parseTaskBoardItems(LIVE_FORMAT_FIXTURE);
  const cross = parseCrossRepoTaskBoard(LIVE_FORMAT_FIXTURE);
  assert.equal(cross.length, shared.length);
  assert.deepEqual(
    cross.map((row) => [taskItemKey(row.title), row.status, row.done]),
    shared.map((row) => [row.key, row.status, row.status === "done"])
  );
  assert.ok(cross.every((row) => row.source === "shared-task-board-parser"));
});

test("two-column session tables are not invisible to portfolio observability", () => {
  const rows = parseCrossRepoTaskBoard(`| Item | Status |\n|---|---|\n| visible-work | Open |`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "visible-work");
  assert.equal(rows[0].done, false);
});
