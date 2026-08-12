import test from "node:test";
import assert from "node:assert/strict";

import {
  parseHandoffCloseoutAuthority,
  parseSilSessionAuthority,
  resolveSessionAuthority
} from "../scripts/lib/session-authority.mjs";

test("session authority takes the monotonic maximum when SIL lags verified receipts", () => {
  const authority = resolveSessionAuthority({
    sil: "## 2026-08-11 — Session 80\nSIL v3.0: **996 / 1000**",
    status: { currentSession: 81 },
    handoff: "# Session 81 Closeout — exact production receipt\n## Session Intent — S82"
  });
  assert.equal(authority.committedSession, 81);
  assert.equal(authority.nextSession, 82);
  assert.equal(authority.repairStatusSession, null);
  assert.equal(authority.divergence, true);
});

test("session authority repairs status upward but never downward", () => {
  const aheadSil = resolveSessionAuthority({
    sil: "## Session 82 — 2026-08-12",
    status: { currentSession: 81 },
    handoff: "# Session 81 Closeout"
  });
  assert.equal(aheadSil.committedSession, 82);
  assert.equal(aheadSil.repairStatusSession, 82);

  const aheadStatus = resolveSessionAuthority({
    sil: "## Session 80 — 2026-08-11",
    status: { currentSession: 81 },
    handoff: "# Session 80 Closeout"
  });
  assert.equal(aheadStatus.committedSession, 81);
  assert.equal(aheadStatus.repairStatusSession, null);
});

test("only completed handoff headings count as committed authority", () => {
  const handoff = "# Session 81 Closeout\n## Session Intent — S82\n# Prior Session 79 Closeout";
  assert.equal(parseHandoffCloseoutAuthority(handoff), 81);
  assert.equal(parseSilSessionAuthority("## Session 79\n## 2026-08-11 — Session 80"), 80);
});

test("unparseable inputs fall back explicitly instead of inventing a session", () => {
  const empty = resolveSessionAuthority({ sil: "", status: {}, handoff: "" });
  assert.equal(empty.committedSession, null);
  assert.equal(empty.nextSession, null);
  const fallback = resolveSessionAuthority({ fallbackCompletedSession: 62 });
  assert.equal(fallback.nextSession, 63);
});
