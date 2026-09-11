import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildBriefSemanticFingerprint } from "../scripts/lib/brief-semantic-fingerprint.mjs";

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

test("this project's handoff heading is committed authority, and only for the closed session", () => {
  // Pre-S105 the parser knew only `# Session N Closeout`, and this project has
  // written `# Latest Handoff — Session N → Session N+1` at every closeout since
  // at least S96, so the handoff authority read null for its whole history.
  assert.equal(parseHandoffCloseoutAuthority("# Latest Handoff — Session 104 → Session 105\n\n## Where We Left Off"), 104);
  assert.equal(parseHandoffCloseoutAuthority("# Latest Handoff - Session 7 -> Session 8"), 7);
  // The arrow's right-hand side is intent, never a completed session.
  assert.equal(parseHandoffCloseoutAuthority("# Latest Handoff — Session 104 → Session 105"), 104);
  // Negative control: the pre-S105 pattern, reproduced explicitly, misses it.
  const preS105 = /^#{1,6}\s+(?:Prior\s+)?Session\s+(\d+)\s+Closeout\b/gim;
  assert.equal([..."# Latest Handoff — Session 104 → Session 105".matchAll(preS105)].length, 0);
});

test("the live handoff and the newest SIL entry name the same closed session", () => {
  // Binds the committed record rather than a fixture: a heading change, or a
  // closeout that appends a SIL entry and never rewrites the handoff, now goes
  // red instead of silently degrading the authority to two sources.
  const root = path.resolve(import.meta.dirname, "..");
  const handoff = fs.readFileSync(path.join(root, "context", "LATEST_HANDOFF.md"), "utf8");
  const sil = fs.readFileSync(path.join(root, "context", "SELF_IMPROVEMENT_LOOP.md"), "utf8");
  const handoffSession = parseHandoffCloseoutAuthority(handoff);
  assert.ok(Number.isInteger(handoffSession), "the live handoff must carry a parseable closed session");
  assert.equal(handoffSession, parseSilSessionAuthority(sil));
  assert.equal(buildBriefSemanticFingerprint(root)?.handoffSession, handoffSession);
});

test("unparseable inputs fall back explicitly instead of inventing a session", () => {
  const empty = resolveSessionAuthority({ sil: "", status: {}, handoff: "" });
  assert.equal(empty.committedSession, null);
  assert.equal(empty.nextSession, null);
  const fallback = resolveSessionAuthority({ fallbackCompletedSession: 62 });
  assert.equal(fallback.nextSession, 63);
});
