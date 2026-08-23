import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sliceTaskBoard } from "../scripts/task-slice.mjs";
import { splitLedger, ROLLABLE_LEDGERS, LIVE_LEDGER_BYTE_CEILING } from "../scripts/ledger-roll.mjs";
import { planRetention, RETAINED_CAPTURE_SESSIONS } from "../scripts/visual-qa-retention.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── The bounded read path the audit protocol depends on ──────────────────────

test("the task board has a bounded projection, and it says when it truncates", () => {
  const source = fs.readFileSync(path.join(rootDir, "context", "TASK_BOARD.md"), "utf8");
  const slice = sliceTaskBoard(source, { maxChars: 8000 });
  assert.ok(slice.openCount > 0, "the board has open items");
  assert.ok(slice.rendered.join("\n").length <= 8000);
  assert.ok(slice.rendered.length > 0);
  assert.equal(slice.truncated, slice.dropped > 0);

  // A slice that quietly drops work reads as "this is everything". Force it to
  // say so — this project's own rule against silent caps.
  const tiny = sliceTaskBoard(source, { maxChars: 200 });
  assert.equal(tiny.truncated, true);
  assert.match(tiny.note, /NOT the whole board/);
  assert.ok(tiny.dropped > 0);
});

// ── Live ledgers hold the working set, the archive holds the rest ────────────

test("no live context ledger has grown back into an archive", () => {
  const oversized = [];
  for (const ledger of ROLLABLE_LEDGERS) {
    const file = path.join(rootDir, "context", ledger.file);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.statSync(file).size;
    if (bytes > LIVE_LEDGER_BYTE_CEILING) oversized.push(`${ledger.file} ${Math.round(bytes / 1024)} KB`);
  }
  assert.deepEqual(
    oversized,
    [],
    `roll them with \`node scripts/ledger-roll.mjs --apply\` (ceiling ${Math.round(LIVE_LEDGER_BYTE_CEILING / 1024)} KB)`
  );
});

test("every rolled ledger left a pointer to where its history went", () => {
  for (const ledger of ROLLABLE_LEDGERS) {
    const live = path.join(rootDir, "context", ledger.file);
    const archive = path.join(rootDir, "context", "archive", ledger.file.replace(/\.md$/, ".archive.md"));
    if (!fs.existsSync(archive)) continue;
    const source = fs.readFileSync(live, "utf8");
    assert.match(source, /context\/archive\//, `${ledger.file} must point at its archive`);
    assert.ok(fs.statSync(archive).size > 0, `${ledger.file} archive is not empty`);
  }
});

test("splitting a ledger preserves every line — the roll moves, it never summarises", () => {
  const source = [
    "# Ledger",
    "",
    "- 2026-08-22: Session 93 newest.",
    "- 2026-08-19: Session 92 middle.",
    "- 2026-08-18: Session 91 oldest."
  ].join("\n");
  const pattern = /^- (\d{4}-\d{2}-\d{2}): Session (\d+)/;
  assert.equal(splitLedger(source, pattern, 5), null, "a short ledger is left alone entirely");

  const split = splitLedger(source, pattern, 1);
  assert.equal(split.archivedEntries, 2);
  for (const line of source.split("\n").filter(Boolean)) {
    assert.ok(
      split.head.includes(line) || split.tail.includes(line),
      `line survives the split verbatim: ${line}`
    );
  }
});

// ── Capture retention keeps the proof, not the pixels ────────────────────────

test("visual QA retention keeps a bounded window and never prunes what it cannot classify", () => {
  const names = [
    "s93-a.png", "s93-b.png", "s92-a.png", "s89-a.png", "s80-a.png", "s69-a.png",
    "baseline-no-session.png", "LATEST.json"
  ];
  const plan = planRetention(names, RETAINED_CAPTURE_SESSIONS);
  assert.deepEqual(plan.keptSessions, [93, 92, 89]);
  assert.deepEqual(plan.prune.sort(), ["s69-a.png", "s80-a.png"]);
  // A capture the rule cannot age is never removed by it. Silent removal of the
  // unclassifiable is how a retention policy quietly eats evidence.
  assert.deepEqual(plan.unversioned, ["baseline-no-session.png"]);
  assert.ok(!plan.prune.includes("baseline-no-session.png"));
});

test("every capture ever taken is still provable, including the pruned ones", () => {
  const ledgerPath = path.join(rootDir, "docs", "visual-qa", "CAPTURE_LEDGER.json");
  assert.ok(fs.existsSync(ledgerPath), "the hash ledger is what makes pruning safe");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const entries = Object.entries(ledger.captures);
  assert.ok(entries.length >= 800, "the ledger covers the full history, not just the retained window");

  const onDisk = fs.readdirSync(path.join(rootDir, "docs", "visual-qa")).filter((n) => n.endsWith(".png"));
  assert.ok(entries.length > onDisk.length, "more captures are recorded than retained — that is the point");
  for (const name of onDisk) {
    assert.ok(ledger.captures[name], `${name} is recorded in the ledger`);
  }
  for (const [name, row] of entries) {
    assert.match(row.sha256, /^[0-9a-f]{64}$/, `${name} has a real digest`);
    assert.ok(row.bytes > 0);
  }
});
