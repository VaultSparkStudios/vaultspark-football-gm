import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildRollingStatus, currentBlock, parseSilEntries, renderForRoot } from "../scripts/render-sil-rolling-status.mjs";
import { checkAudit } from "../scripts/check-audit-premises.mjs";
import { NEWEST_FIRST, NEWEST_LAST, ROLLABLE_LEDGERS, splitLedger } from "../scripts/ledger-roll.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * S105: the startup brief reads the SIL rolling-status block for
 * `Last session:`, `Intent rate:` and the averages, and nothing wrote it. It
 * said "Last session: 100" through S104 and had never carried an intent line,
 * so the brief rendered "Intent: ?%" beside five consecutive "Achieved"
 * entries. The block is now a projection of the entries, and this binds the
 * committed block to a fresh projection of the committed entries — a closeout
 * that appends an entry and forgets the header goes red here.
 */
test("the committed SIL rolling-status block is a current projection of the committed entries", () => {
  const { previousBlock, block } = renderForRoot(ROOT);
  assert.ok(block, "the SIL must contain scored entries");
  assert.equal(previousBlock, block, "run: node scripts/render-sil-rolling-status.mjs --write");
});

test("the rolling-status projection carries what the brief parses, derived rather than asserted", () => {
  const live = [
    "## 2026-01-02 — Session 11 — b",
    "SIL v3.0: **950 / 1000** (…). Intent outcome: Achieved.",
    "## 2026-01-03 — Session 12 — c",
    "SIL v3.0: **970 / 1000** (…). Intent outcome: Partial.",
  ].join("\n");
  const archive = [
    "## 2026-01-01 — Session 10 — a",
    "SIL v3.0: **900 / 1000**",
    // The live file wins for a session that appears in both.
    "## 2026-01-02 — Session 11 — stale copy",
    "SIL v3.0: **100 / 1000**",
    // Calibration sessions never enter the population.
    "## Session 2",
    "SIL v3.0: **10 / 1000**",
  ].join("\n");
  const block = buildRollingStatus({ live, archive, previousBlock: "Velocity: 4 | Debt: ↓" });
  assert.match(block, /^Last session: 12 \(2026-01-03\) \| Total: 970\/1000 \| Velocity: 4 \| Debt: ↓$/m);
  assert.match(block, /Avgs — 3: 940 \|/);
  assert.match(block, /Intent rate: 50% \(1\/2 last 5\)/);
  assert.match(block, /from 3 unique sessions/);
  assert.match(block, /SIL delta: 950 → 970 \(\+20\)/);
});

test("a CRLF working copy of the block compares equal to its LF derivation", () => {
  // The first canonical run of this gate went red on byte-identical text:
  // an editor re-saved the SIL with CRLF endings after `--write` had written
  // LF. Line endings are not content, and git normalises them on commit, so a
  // terminator-sensitive comparison is red locally and green in CI.
  const block = "Last session: 1 (2026-01-01) | Total: 1/1000\nIntent rate: unknown";
  const crlf = `# SIL\r\n<!-- rolling-status-start -->\r\n${block.replace(/\n/g, "\r\n")}\r\n<!-- rolling-status-end -->\r\n`;
  assert.equal(currentBlock(crlf), block);
  // Negative control: the pre-fix comparison, reproduced, disagrees.
  const start = crlf.indexOf("<!-- rolling-status-start -->") + "<!-- rolling-status-start -->".length;
  const raw = crlf.slice(start, crlf.indexOf("<!-- rolling-status-end -->")).trim();
  assert.notEqual(raw, block);
});

test("the live SIL has an intent outcome on every recent entry, so the intent rate is not a guess", () => {
  const entries = parseSilEntries(fs.readFileSync(path.join(ROOT, "context", "SELF_IMPROVEMENT_LOOP.md"), "utf8"));
  const recent = entries.filter((entry) => entry.score != null).sort((a, b) => a.session - b.session).slice(-5);
  assert.equal(recent.length, 5);
  for (const entry of recent) assert.ok(entry.intent, `Session ${entry.session} records no intent outcome`);
  assert.doesNotMatch(currentBlock(fs.readFileSync(path.join(ROOT, "context", "SELF_IMPROVEMENT_LOOP.md"), "utf8")), /Intent rate: unknown/);
});

/**
 * S105: the ledger roll moved the wrong end.
 *
 * `ledger-roll` declared "ledgers are newest-first here, so the retained window
 * is a prefix". That is true of CURRENT_STATE only — DECISIONS, TRUTH_AUDIT and
 * SELF_IMPROVEMENT_LOOP are append-only with the newest entry LAST. Run live at
 * S105 it archived this session's own decisions, truth audit and SIL entry and
 * left the live SIL holding sessions 85-98.
 */
test("a newest-last ledger retains its newest entries, not its oldest", () => {
  const source = [
    "# Ledger",
    "",
    "## 2026-01-01 — Session 1 oldest",
    "## 2026-01-02 — Session 2 middle",
    "## 2026-01-03 — S3 newest"
  ].join("\n");
  const pattern = ROLLABLE_LEDGERS.find((l) => l.file === "DECISIONS.md").entry;

  const split = splitLedger(source, pattern, 1, NEWEST_LAST);
  assert.equal(split.archivedEntries, 2);
  assert.match(split.head, /# Ledger/, "the file header stays live, it is not archived with the old entries");
  assert.match(split.head, /S3 newest/);
  assert.doesNotMatch(split.head, /Session 1 oldest/);
  assert.match(split.tail, /Session 1 oldest/);
  assert.doesNotMatch(split.tail, /S3 newest/);
  for (const line of source.split("\n").filter(Boolean)) {
    assert.ok(split.head.includes(line) || split.tail.includes(line), `line survives verbatim: ${line}`);
  }

  // Negative control: the pre-S105 behaviour, on the same ledger, archives the
  // newest entry — the defect exactly as it was observed.
  const wrong = splitLedger(source, pattern, 1, NEWEST_FIRST);
  assert.match(wrong.tail, /S3 newest/);
  assert.match(wrong.head, /Session 1 oldest/);
});

test("the entry patterns match both heading eras, so a roll cannot sweep one era wholesale", () => {
  // The DECISIONS pattern required `— Session N` while every heading since S100
  // reads `— S105 —`, so the cut landed at the eleventh old-style entry and all
  // modern sections below it moved as one contiguous block.
  const decisions = ROLLABLE_LEDGERS.find((l) => l.file === "DECISIONS.md").entry;
  assert.ok(decisions.test("## 2026-09-11 — S105 — A surface the brief reads"));
  assert.ok(decisions.test("## 2026-08-26 — Session 95"));
  assert.ok(decisions.test("## 2026-08-22 - S93: a differentiator"));
  const truth = ROLLABLE_LEDGERS.find((l) => l.file === "TRUTH_AUDIT.md").entry;
  assert.ok(truth.test("## 2026-09-11 — S105 — Three brief rows"));
  assert.ok(truth.test("## 2026-09-03 - Session 98 truth update"));
  const sil = ROLLABLE_LEDGERS.find((l) => l.file === "SELF_IMPROVEMENT_LOOP.md").entry;
  assert.ok(sil.test("## 2026-09-11 — Session 105 — Every surface the brief reads"));
});

test("every live ledger still holds this session's own entry after any roll", () => {
  // The defect was only visible because a live file stopped containing the
  // session that had just written to it. That is the invariant, stated directly.
  const session = 105;
  for (const [file, pattern] of [
    ["DECISIONS.md", /S105 — A surface the brief reads/],
    ["TRUTH_AUDIT.md", /S105 — Three brief rows/],
    ["SELF_IMPROVEMENT_LOOP.md", /## 2026-09-11 — Session 105/]
  ]) {
    const live = fs.readFileSync(path.join(ROOT, "context", file), "utf8");
    assert.match(live, pattern, `${file} must still hold S${session}'s own entry`);
  }
});

/**
 * S105: `check-audit-premises.mjs` was advisory and checked only the newest
 * sidecar, and its only caller cannot be imported here by contract. S104's
 * "zero open decay across all sidecars" was a one-off manual reading. This
 * makes open decay across the whole committed audit history fail the studio
 * shard.
 */
function auditSidecars() {
  const dir = path.join(ROOT, "docs");
  return fs.readdirSync(dir).filter((name) => /^AUDIT_.*\.json$/.test(name)).map((name) => path.join(dir, name));
}

function corpusDecay(files) {
  const problems = [];
  let verified = 0;
  for (const file of files) {
    const report = checkAudit(JSON.parse(fs.readFileSync(file, "utf8")), ROOT);
    verified += report.verified;
    if (report.openContradicted > 0 || report.unverified > 0) {
      problems.push(`${path.basename(file)}: ${report.openContradicted} open decay · ${report.unverified} unverified`);
    }
  }
  return { problems, verified };
}

test("no committed audit sidecar carries open premise decay or an unverifiable premise", () => {
  const files = auditSidecars();
  assert.ok(files.length > 50, `expected the audit history, found ${files.length} sidecars`);
  const { problems, verified } = corpusDecay(files);
  assert.deepEqual(problems, []);
  assert.ok(verified > 0, "the corpus must contain at least one verified premise, or this assertion proves nothing");
});

test("negative control: an open item whose premise is contradicted fails the corpus assertion", () => {
  const tmp = fs.mkdtempSync(path.join(ROOT, ".cache", "s105-premise-"));
  try {
    const sidecar = path.join(tmp, "AUDIT_2099-01-01.json");
    fs.writeFileSync(sidecar, JSON.stringify({
      session: 999,
      items: [{
        slug: "decayed",
        status: "planned",
        premises: [{
          claim: "package.json is absent",
          adapter: "file-exists",
          target: "package.json",
          operator: "eq",
          expected: false
        }]
      }]
    }));
    const { problems } = corpusDecay([sidecar]);
    assert.equal(problems.length, 1, "an open, contradicted premise must be reported");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
