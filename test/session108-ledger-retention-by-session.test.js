import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEWEST_FIRST,
  NEWEST_LAST,
  POINTER_SENTINEL,
  ROLLABLE_LEDGERS,
  rollLedgers,
  sessionOfHeading,
  splitLedger,
  splitLedgerByPosition,
  stripPointerBlocks
} from "../scripts/ledger-roll.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * S108 — retention by session number, and a pointer found wherever it sits.
 *
 * Both defects were found by running the roll's dry run on the live tree.
 * Every newest-last ledger reported "fewer entries than the retention window"
 * while holding twelve, because each closeout since S105 had appended its
 * entry beneath the pointer and the splitter sliced the source at the
 * sentinel. And the live files were never in session order — TRUTH_AUDIT held
 * S83, S82, S80 above S99–S107 — so the positional rule would have archived
 * S82 and S83 and kept S80.
 */

// The shape TRUTH_AUDIT actually had at S108: three old entries, descending,
// above the modern ascending block.
const TRUTH_SHAPE = [83, 82, 80, 99, 100, 101, 102, 103, 104, 105, 106, 107];
const truthPattern = ROLLABLE_LEDGERS.find((l) => l.file === "TRUTH_AUDIT.md").entry;

function ledgerOf(sessions, { pointerAfter = null } = {}) {
  const lines = ["# Truth Audit", "", "Standing header paragraph.", ""];
  for (const session of sessions) {
    const heading = session < 100 ? `## 2026-08-12 - Session ${session} truth update` : `## 2026-09-1${session % 10} — S${session} — entry`;
    lines.push(heading, "", `Body of S${session}, line one.`, `Body of S${session}, line two.`, "");
    if (pointerAfter === session) {
      lines.push(POINTER_SENTINEL, "---", "", "Older entries are retained verbatim in `context/archive/TRUTH_AUDIT.archive.md`. Nothing is summarised.", "");
    }
  }
  return lines.join("\n");
}

const everyLineSurvives = (source, split) => {
  for (const line of source.split("\n").filter((l) => l.trim() && !l.includes(POINTER_SENTINEL) && !l.startsWith("Older entries") && l !== "---")) {
    assert.ok(split.head.includes(line) || split.tail.includes(line), `line survives verbatim: ${line}`);
  }
};

test("the session a heading carries is read from either heading era", () => {
  assert.equal(sessionOfHeading("## 2026-08-12 - Session 83 truth update", truthPattern), 83);
  assert.equal(sessionOfHeading("## 2026-09-13 — S107 — A recorded cause", truthPattern), 107);
  assert.equal(sessionOfHeading("Not a heading", truthPattern), null);
});

test("retention keeps the highest session numbers present, wherever they sit in the file", () => {
  const source = ledgerOf(TRUTH_SHAPE);
  const split = splitLedger(source, truthPattern, 10, NEWEST_LAST);
  assert.ok(split, "twelve entries against a window of ten must roll");
  assert.deepEqual(split.archivedSessions, [82, 80], "the two lowest sessions move, not the two first in file order");
  assert.deepEqual(split.retainedSessions, [83, 99, 100, 101, 102, 103, 104, 105, 106, 107]);
  assert.equal(split.archivedEntries, 2);
  assert.match(split.head, /^# Truth Audit/, "the file header stays live");
  assert.match(split.head, /Standing header paragraph/);
  assert.ok(split.head.trimEnd().endsWith("Body of S107, line two."), "a newest-last ledger still ends with its newest entry");
  assert.doesNotMatch(split.head, /Session 82 truth update/);
  assert.doesNotMatch(split.tail, /S107/);
  everyLineSurvives(source, split);
});

test("negative control: the pre-S108 positional rule keeps the wrong sessions on that shape", () => {
  const source = ledgerOf(TRUTH_SHAPE);
  const wrong = splitLedgerByPosition(source, truthPattern, 10, NEWEST_LAST);
  assert.match(wrong.tail, /Session 83 truth update/, "positional retention archives the newest of the three old entries");
  assert.match(wrong.tail, /Session 82 truth update/);
  assert.match(wrong.head, /Session 80 truth update/, "and keeps the oldest one live");
});

test("retained entries are emitted in session order for the order the ledger declares", () => {
  const source = ledgerOf([107, 99, 100]);
  const newestLast = splitLedger(source, truthPattern, 2, NEWEST_LAST);
  assert.deepEqual(newestLast.retainedSessions, [100, 107]);
  assert.equal(newestLast.reordered, true);
  assert.ok(newestLast.head.indexOf("S100") < newestLast.head.indexOf("S107"));
  const newestFirst = splitLedger(source, truthPattern, 2, NEWEST_FIRST);
  assert.deepEqual(newestFirst.retainedSessions, [107, 100]);
  assert.ok(newestFirst.head.indexOf("S107") < newestFirst.head.indexOf("S100"));
});

test("nothing moves when every entry is inside the retained sessions, and the reason names the duplicates", () => {
  const source = ledgerOf([105, 105, 106, 107]);
  const split = splitLedger(source, truthPattern, 3, NEWEST_LAST);
  assert.equal(split.nothingToArchive, "duplicate session headings inside the retention window", "four entries, three distinct sessions, window of three");
  assert.equal(split.distinctSessions, 3);
  assert.equal(splitLedger(ledgerOf([106, 107]), truthPattern, 3, NEWEST_LAST), null, "a short ledger is still simply null");
});

test("a mid-file pointer is relocated to EOF even when the roll has nothing to archive", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s108-roll-"));
  fs.mkdirSync(path.join(dir, "context"), { recursive: true });
  const livePath = path.join(dir, "context", "TRUTH_AUDIT.md");
  // Ten distinct sessions, one written twice, pointer above the newest two.
  fs.writeFileSync(livePath, ledgerOf([98, 99, 100, 101, 102, 103, 104, 105, 105, 106, 107], { pointerAfter: 105 }));

  const [row] = rollLedgers({ root: dir, apply: true, retain: 10 });
  assert.equal(row.archived, 0);
  assert.equal(row.skipped, "duplicate session headings inside the retention window");
  assert.equal(row.pointerRelocated, true);
  const live = fs.readFileSync(livePath, "utf8");
  assert.equal(live.split(POINTER_SENTINEL).length - 1, 1, "exactly one pointer");
  assert.ok(live.indexOf(POINTER_SENTINEL) > live.lastIndexOf("Body of S107"), "and it now sits beneath the newest entry");
  assert.match(live, /Body of S98, line two/, "nothing was archived");

  // Idempotent: a second roll finds the pointer already at EOF and leaves the file alone.
  const before = fs.readFileSync(livePath, "utf8");
  const [again] = rollLedgers({ root: dir, apply: true, retain: 10 });
  assert.equal(again.pointerRelocated, false);
  assert.equal(fs.readFileSync(livePath, "utf8"), before);
});

test("the pointer strip only recognises a line that IS the sentinel, and never swallows a heading", () => {
  const quoted = ["# L", "", "## 2026-09-14 — S108 — entry", "", `This entry quotes \`${POINTER_SENTINEL}\` in prose.`, "More of the same paragraph.", ""].join("\n");
  assert.equal(stripPointerBlocks(quoted), quoted, "a quoted sentinel is content");

  const crowded = ["# L", "", "## 2026-09-13 — S107 — old", "body7", "", POINTER_SENTINEL, "---", "", "Older entries are retained verbatim in `x`.", "## 2026-09-14 — S108 — new", "body8", ""].join("\n");
  const stripped = stripPointerBlocks(crowded);
  assert.match(stripped, /## 2026-09-14 — S108 — new\nbody8/, "a heading appended directly beneath the prose survives");
  assert.doesNotMatch(stripped, /retained verbatim/);
  assert.equal(splitLedger(crowded, truthPattern, 1, NEWEST_LAST).archivedSessions.join(), "107");
});

test("a pointer in the middle of the file hides nothing: entries beneath it are ordinary entries", () => {
  const source = ledgerOf(TRUTH_SHAPE, { pointerAfter: 105 });
  const stripped = stripPointerBlocks(source);
  assert.ok(!stripped.includes(POINTER_SENTINEL));
  assert.ok(!stripped.includes("Older entries are retained verbatim"));
  assert.match(stripped, /Body of S106, line one/);

  const split = splitLedger(source, truthPattern, 10, NEWEST_LAST);
  assert.equal(split.entries, 12, "S106 and S107 beneath the pointer are counted");
  assert.deepEqual(split.archivedSessions, [82, 80]);
  assert.match(split.head, /S106/);
  assert.match(split.head, /S107/);
  assert.ok(!split.tail.includes(POINTER_SENTINEL), "the pointer is never archived as content");

  // Negative control: the pre-S108 slice-at-sentinel reading of the same
  // file sees ten entries and reports nothing to roll.
  const sliced = source.slice(0, source.indexOf(POINTER_SENTINEL));
  assert.equal(splitLedger(sliced, truthPattern, 10, NEWEST_LAST), null, "the old reading could not see the entries beneath the pointer");
});

test("an applied roll on a mid-file pointer keeps every entry live or archived and leaves one pointer at EOF", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s108-roll-"));
  fs.mkdirSync(path.join(dir, "context"), { recursive: true });
  const livePath = path.join(dir, "context", "TRUTH_AUDIT.md");
  const source = ledgerOf(TRUTH_SHAPE, { pointerAfter: 105 });
  fs.writeFileSync(livePath, source);

  const [row] = rollLedgers({ root: dir, apply: true, retain: 10 });
  assert.equal(row.archived, 2);
  const live = fs.readFileSync(livePath, "utf8");
  const archive = fs.readFileSync(path.join(dir, "context", "archive", "TRUTH_AUDIT.archive.md"), "utf8");

  assert.equal(live.split(POINTER_SENTINEL).length - 1, 1, "exactly one pointer");
  assert.ok(live.indexOf(POINTER_SENTINEL) > live.lastIndexOf("Body of S107"), "and it sits beneath the newest entry");
  for (const session of TRUTH_SHAPE) {
    const inLive = live.includes(`Body of S${session}, line two.`);
    const inArchive = archive.includes(`Body of S${session}, line two.`);
    assert.ok(inLive !== inArchive, `S${session} is in exactly one of live/archive (live=${inLive}, archive=${inArchive})`);
  }
  assert.match(archive, /Session 82 truth update/);
  assert.match(archive, /Session 80 truth update/);
  assert.doesNotMatch(archive, /Session 83 truth update/);
});

test("no live ledger carries more than one session of roll debt", () => {
  // A closeout appends its entry after the receipt runs, so one session past
  // the window is the normal state between sessions — the same tolerance the
  // release-note gate uses. Two means a closeout skipped the roll.
  const results = rollLedgers({ root: ROOT, apply: false });
  const overdue = results
    .filter((row) => !row.skipped && row.archived > 0 && new Set(row.archivedSessions).size > 1)
    .map((row) => `${row.file} would archive S${row.archivedSessions.join(", S")}`);
  assert.deepEqual(overdue, [], "run `node scripts/ledger-roll.mjs --apply` at closeout");
});
