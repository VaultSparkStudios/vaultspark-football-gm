import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ROLLABLE_LEDGERS } from "../scripts/ledger-roll.mjs";
import { HEAL_MAP } from "../scripts/lib/doctor-remedies.mjs";
import { resolveSessionAuthority } from "../scripts/lib/session-authority.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * S106 — a gate that declares a ceiling must declare its population.
 *
 * `check-ledger-budget` asserted every ROLLABLE_LEDGERS entry stayed under
 * 96 KB, and the list named four files sitting at 34-43 KB while the two
 * LARGEST append-only ledgers in the repo — WORK_LOG at 213 KB and TASK_BOARD
 * at 206 KB — were not in it at all. `ledger-roll`'s own header comment had
 * named TASK_BOARD append-only since S94. The gate was green on the two files
 * it most needed to see.
 *
 * So the population is derived from disk here rather than trusted: any Markdown
 * file in context/ or logs/ carrying a run of dated session headings IS an
 * append-only ledger, and must be policed.
 */
test("every append-only ledger on disk is registered as rollable", () => {
  const registered = new Set(ROLLABLE_LEDGERS.map((l) => `${l.dir || "context"}/${l.file}`));
  const sessionHeading = /^(?:##\s+|- )(?:\d{4}-\d{2}-\d{2}[:\s—–-]*)?(?:Session\s+|S)\d+\b/gim;
  const unpoliced = [];
  for (const dir of ["context", "logs"]) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (!name.endsWith(".md")) continue;
      const rel = `${dir}/${name}`;
      const source = fs.readFileSync(path.join(ROOT, dir, name), "utf8");
      const entries = (source.match(sessionHeading) || []).length;
      // A handful of session references is prose; a long run of them is a ledger.
      if (entries >= 12 && !registered.has(rel)) unpoliced.push(`${rel} (${entries} session entries)`);
    }
  }
  assert.deepEqual(unpoliced, [], "these files accumulate session entries but no gate polices their size");
});

/**
 * S106 — a newest-last ledger must actually end with its newest entry.
 *
 * Retention keeps the LAST N entries, so "last in the file" and "newest
 * session" have to be the same thing. This session broke that in four ledgers
 * at once by appending the S106 entry with the S105 heading as its anchor,
 * which inserted it BEFORE S105: every file ended `… S104, S106, S105`. Nothing
 * was lost, but the next roll would have retained by position and archived the
 * wrong end — the S105 defect wearing a different hat.
 */
test("every newest-last ledger ends with its highest-numbered session entry", () => {
  const offenders = [];
  for (const ledger of ROLLABLE_LEDGERS) {
    if ((ledger.order || "") !== "newest-last") continue;
    const source = fs.readFileSync(path.join(ROOT, ledger.dir || "context", ledger.file), "utf8");
    const sessions = [...source.matchAll(/^#{2,3}[^\n]*?\b(?:Session\s+|S)(\d+)\b/gim)].map((m) => Number(m[1]));
    if (sessions.length < 2) continue;
    const last = sessions.at(-1);
    const highest = Math.max(...sessions);
    if (last !== highest) offenders.push(`${ledger.file}: ends at S${last}, newest is S${highest}`);
  }
  assert.deepEqual(offenders, [], "append new entries at the END of a newest-last ledger, never above the previous one");
});

/**
 * S106 — the brief reported a divergence it had just repaired.
 *
 * `render-startup-brief` resolved the session authority once, then self-healed
 * PROJECT_STATUS.currentSession later in the same run. At S105 closeout the
 * first render healed 104 → 105 and emitted `status=S104 … divergent=true`; a
 * second render emitted `divergent=false`. The value on disk was right both
 * times — only the rendered line lagged by one render, and it was invisible
 * until S105 made the handoff a third authority.
 */
test("a healed status resolves to agreement, so the line the brief prints after healing is not divergent", () => {
  const sil = "## 2026-09-12 — Session 106 — x\nSIL v3.0: **900 / 1000**";
  const handoff = "# Latest Handoff — Session 106 → Session 107";
  const lagging = resolveSessionAuthority({ sil, status: { currentSession: 105 }, handoff });
  assert.equal(lagging.divergence, true, "the pre-heal read must diverge, or this proves nothing");
  assert.equal(lagging.repairStatusSession, 106);
  const healed = resolveSessionAuthority({ sil, status: { currentSession: lagging.repairStatusSession }, handoff });
  assert.equal(healed.divergence, false);
  assert.match(healed.detail, /status=S106/);
});

test("the brief recomputes its session authority after the self-heal, not before", () => {
  // Read rather than executed: driving the whole renderer to prove an ordering
  // is far heavier than the property warrants, and the ordering IS the property.
  const source = fs.readFileSync(path.join(ROOT, "scripts", "render-startup-brief.mjs"), "utf8");
  const healAt = source.indexOf("currentSession: healed");
  assert.ok(healAt > 0, "the self-heal must still write the healed session");
  const recomputeAt = source.indexOf("sessionAuthority = resolveSessionAuthority", healAt);
  assert.ok(recomputeAt > healAt, "the authority must be re-resolved after the heal writes");
  const emitAt = source.indexOf("<!-- session-authority:", recomputeAt);
  assert.ok(emitAt > recomputeAt, "the emitted line must come after the recompute");
});

test("no doctor remedy prescribes a file this project's authority contract forbids", () => {
  // S104 wrote check-last-session-summary.mjs, the studio shard rejected it as a
  // forbidden fourth mutator of PROJECT_STATUS.json, and it was deleted rather
  // than allowlisted — but the remedy kept prescribing it, and doctor defines no
  // such check here, so it was inert advice to violate the contract.
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, "context", "PROJECT_AUTHORITY_CONTRACT.json"), "utf8"));
  const forbidden = (contract.forbiddenFiles || []).map((f) => path.posix.basename(f));
  assert.ok(forbidden.length > 0, "the contract must actually forbid something, or this proves nothing");
  const offenders = Object.entries(HEAL_MAP)
    .filter(([, remedy]) => forbidden.includes(String(remedy?.script || "")))
    .map(([id, remedy]) => `${id} → ${remedy.script}`);
  assert.deepEqual(offenders, []);
});
