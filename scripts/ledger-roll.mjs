#!/usr/bin/env node
/**
 * S94: roll the append-only context ledgers.
 *
 * Five files in context/ are append-only and grow every session:
 * SELF_IMPROVEMENT_LOOP, TASK_BOARD, DECISIONS, TRUTH_AUDIT and CURRENT_STATE.
 * Measured at S94 they totalled 861 KB — roughly 215,000 tokens, more than a
 * full context window — and any reader that greps one pays for ninety sessions
 * of history to learn what is true this week.
 *
 * The fix is NOT deletion. This is a real archive of a genuinely long project
 * and every word of it was earned. The fix is that the live file should hold
 * the working set and the archive should hold the rest: entries older than the
 * retained window move verbatim into context/archive/, with a pointer line left
 * behind, and nothing is rewritten or summarised on the way.
 *
 * S105 — THE LEDGERS ARE NOT ALL NEWEST-FIRST, AND ASSUMING THEY WERE MOVED THE
 * WRONG END. This file used to declare "ledgers are newest-first here, so the
 * retained window is a prefix". That is true of CURRENT_STATE only. DECISIONS,
 * TRUTH_AUDIT and SELF_IMPROVEMENT_LOOP are append-only with the NEWEST entry
 * last, so keeping the first ten entries archived the newest sections and kept
 * the oldest. Run live at S105 it moved that very session's decisions, truth
 * audit and SIL entry into the archives and left the live SIL holding sessions
 * 85-98 with no intent lines at all.
 *
 * Two independent things were wrong, and both are fixed here:
 *   1. Direction. Each ledger now declares its `order`, and the retained window
 *      is a prefix for newest-first and a SUFFIX for newest-last.
 *   2. The entry patterns did not match the headings this project has written
 *      since S100 (`## 2026-09-11 — S105 — …`), only the older
 *      `— Session 105` form. So for DECISIONS the cut landed at the eleventh
 *      OLD-style entry and every modern section below it was swept into the
 *      archive as one contiguous tail. A pattern that silently matches a subset
 *      of a ledger's entries is how a roll moves far more than it reports.
 *
 * S108 — RETENTION IS BY SESSION NUMBER, AND THE POINTER IS FOUND WHEREVER IT
 * SITS. Two more things were wrong after S105, and both were found by running
 * the dry run on the live tree rather than on a fixture:
 *   3. Retention was positional: "the last N entries in file order". The live
 *      ledgers have never been strictly ordered (the SIL held S78-S80 in
 *      descending order ABOVE S99-S107; TRUTH_AUDIT held S83, S82, S80 the
 *      same way), so a positional suffix on TRUTH_AUDIT would have archived
 *      S82 and S83 and kept S80. `splitLedger` now retains the N highest
 *      distinct session numbers present, wherever they sit, and emits the
 *      retained entries in session order (ascending for newest-last,
 *      descending for newest-first), every line verbatim. The positional
 *      rule survives as `splitLedgerByPosition`, exported only so the tests
 *      can prove the difference on the shapes that were observed.
 *   4. The previous header said the pointer "always stays at the END" and that
 *      a mid-file pointer "would make the next roll delete every entry beneath
 *      it" — and then every closeout since S105 appended its entry BENEATH the
 *      pointer, because that is where the end of the file is. Measured at S108:
 *      all four newest-last ledgers carried the pointer above S106 and S107.
 *      `splitLedger` sliced the source at the sentinel, so those entries were
 *      invisible to the roll (every newest-last ledger reported "fewer entries
 *      than the retention window" while holding twelve), and an applied roll
 *      would have rewritten the live file WITHOUT them. The pointer block is
 *      now removed wherever it occurs and re-appended at EOF, so an entry
 *      written after it is an ordinary entry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// How many dated session entries stay in the live file. Ten covers roughly two
// weeks of work here, which is the span a session actually reasons about; the
// startup brief already summarises further back, and the archive holds the rest.
export const RETAINED_SESSION_ENTRIES = 10;

// Ledger size beyond which the live file is doing archive duty rather than
// working-set duty. Enforced by check-ledger-budget so it cannot creep back.
export const LIVE_LEDGER_BYTE_CEILING = 96 * 1024;

export const NEWEST_FIRST = "newest-first";
export const NEWEST_LAST = "newest-last";

// Session headings come in two shapes here: `— Session 105 —` (through S99) and
// `— S105 —` (S100 onward). Both must match, or the roll silently treats one
// era as "not an entry" and moves it wholesale.
// S106 — the population this gate polices used to be four files, and the two
// LARGEST append-only ledgers in the repo were not among them. Measured at S106:
// logs/WORK_LOG.md 213 KB and context/TASK_BOARD.md 206 KB, both more than twice
// the 96 KB ceiling, while the four policed ledgers sat at 34-43 KB. The header
// above has named TASK_BOARD as append-only since S94 — the list simply never
// included it, so `check-ledger-budget` reported green on the two files it most
// needed to see. A gate that declares a ceiling must declare its population too.
//
// `dir` exists because WORK_LOG lives in logs/, not context/; each ledger
// archives beside itself.
export const ROLLABLE_LEDGERS = Object.freeze([
  { file: "CURRENT_STATE.md", dir: "context", entry: /^- (\d{4}-\d{2}-\d{2}): (?:Session\s+|S)(\d+)\b/, order: NEWEST_FIRST },
  { file: "DECISIONS.md", dir: "context", entry: /^## (\d{4}-\d{2}-\d{2})\s*[—–-]\s*(?:Session\s+|S)(\d+)\b/, order: NEWEST_LAST },
  { file: "TRUTH_AUDIT.md", dir: "context", entry: /^## (\d{4}-\d{2}-\d{2}).*?\b(?:Session\s+|S)(\d+)\b/, order: NEWEST_LAST },
  { file: "SELF_IMPROVEMENT_LOOP.md", dir: "context", entry: /^## (\d{4}-\d{2}-\d{2})\s*[—–-]\s*(?:Session\s+|S)(\d+)\b/, order: NEWEST_LAST },
  // Two heading eras, both live in this file: `## 2026-09-11 — Session 105 — …`
  // and `## Session 103 — 2026-09-10 — …`. Matching only one would sweep the
  // other era wholesale, which is exactly the S105 defect.
  { file: "WORK_LOG.md", dir: "logs", entry: /^##\s+(?:\d{4}-\d{2}-\d{2}\s*[—–-]\s*)?(?:Session\s+|S)(\d+)\b/, order: NEWEST_LAST },
  // Newest-first, and its standing `## Now` / `## Next` sections sit above the
  // first session entry — they are the working set and stay live by construction,
  // because the retained window starts at the first matching entry.
  { file: "TASK_BOARD.md", dir: "context", entry: /^##\s+(?:Session\s+|S)(\d+)\b/, order: NEWEST_FIRST }
]);

export const POINTER_SENTINEL = "<!-- ledger-roll:pointer -->";

/**
 * Split a ledger into the retained working set and the archived remainder.
 *
 * `order` says which end is new. Returns null when the file has fewer entries
 * than the retention window, so a short ledger is left completely alone.
 *
 * `head` is always the live content (file header plus retained entries, in the
 * file's own order) and `tail` is always the block that moves to the archive.
 */
/**
 * Remove every pointer block a previous roll left behind, wherever it sits.
 *
 * A block is the sentinel line, the `---` rule beneath it, and the prose
 * paragraph that follows (up to the next blank line or EOF). Before S108 the
 * source was sliced at the sentinel, which silently discarded every entry a
 * later closeout had appended beneath it.
 */
export function stripPointerBlocks(source) {
  const lines = String(source).split(/\r?\n/);
  const kept = [];
  // Only a line that IS the sentinel starts a block — an entry that quotes the
  // sentinel in prose (this fix's own DECISIONS entry, say) is content.
  const isSentinel = (line) => line.trim() === POINTER_SENTINEL;
  // The prose paragraph ends at a blank line OR at the next heading, so an
  // entry appended directly beneath the prose with no blank line between is
  // never swallowed into the block.
  const endsParagraph = (line) => line.trim() === "" || /^#/.test(line);
  for (let index = 0; index < lines.length; index += 1) {
    if (!isSentinel(lines[index])) {
      kept.push(lines[index]);
      continue;
    }
    // Sentinel line dropped. Then the rule, blank lines, and one prose paragraph.
    let cursor = index + 1;
    if (cursor < lines.length && /^---\s*$/.test(lines[cursor])) cursor += 1;
    while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
    while (cursor < lines.length && !endsParagraph(lines[cursor])) cursor += 1;
    // Collapse the blank run the block sat in so entries do not drift apart.
    while (kept.length && kept[kept.length - 1].trim() === "" && cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
    index = cursor - 1;
  }
  return kept.join("\n");
}

/** The session number a heading carries: the last capture group the pattern filled. */
export function sessionOfHeading(line, entryPattern) {
  const match = entryPattern.exec(line);
  if (!match) return null;
  const groups = match.slice(1).filter((group) => group !== undefined);
  const session = Number(groups[groups.length - 1]);
  return Number.isFinite(session) ? session : null;
}

function indexEntries(source, entryPattern) {
  const lines = stripPointerBlocks(source).split(/\r?\n/);
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (entryPattern.test(lines[index])) starts.push(index);
  }
  const entries = starts.map((start, position) => ({
    position,
    start,
    end: position + 1 < starts.length ? starts[position + 1] : lines.length,
    session: sessionOfHeading(lines[start], entryPattern)
  }));
  return { lines, starts, entries };
}

function finishSplit({ entries, retainedEntries, archivedEntries, order, keptLines, archivedLines, extra = {} }) {
  return {
    entries,
    retainedEntries,
    archivedEntries,
    order,
    head: keptLines.join("\n").replace(/\s+$/, "") + "\n",
    tail: archivedLines.join("\n").replace(/\s+$/, "") + "\n",
    ...extra
  };
}

/**
 * Split a ledger into the retained working set and the archived remainder,
 * retaining the `retain` HIGHEST distinct session numbers present.
 *
 * Returns null when nothing would move: fewer entries than the window, or no
 * entry outside the retained sessions. `head` holds the file header plus the
 * retained entries in session order (ascending for newest-last, descending
 * for newest-first — the order the ledger declares for itself); `tail` holds
 * the archived entries in their original file order. Every line of every
 * entry survives verbatim in exactly one of the two.
 */
export function splitLedger(source, entryPattern, retain = RETAINED_SESSION_ENTRIES, order = NEWEST_FIRST) {
  const { lines, starts, entries } = indexEntries(source, entryPattern);
  if (starts.length <= retain) return null;

  const distinct = [...new Set(entries.map((entry) => entry.session))].sort((a, b) => b - a);
  const keep = new Set(distinct.slice(0, retain));
  const retained = entries.filter((entry) => keep.has(entry.session));
  const archived = entries.filter((entry) => !keep.has(entry.session));
  // More headings than the window but no more distinct sessions than it: a
  // session that wrote twice (a post-push correction, say). Nothing moves, and
  // the caller is told WHY, distinctly from "too short", because the two
  // states need different remedies.
  if (!archived.length) return { nothingToArchive: "duplicate session headings inside the retention window", entries: starts.length, distinctSessions: distinct.length };

  const bySession = order === NEWEST_LAST
    ? (a, b) => a.session - b.session || a.position - b.position
    : (a, b) => b.session - a.session || a.position - b.position;
  const ordered = [...retained].sort(bySession);
  const reordered = ordered.some((entry, index) => entry !== retained[index]);
  const block = (list) => list.flatMap((entry) => lines.slice(entry.start, entry.end));

  return finishSplit({
    entries: starts.length,
    retainedEntries: retained.length,
    archivedEntries: archived.length,
    order,
    keptLines: lines.slice(0, starts[0]).concat(block(ordered)),
    archivedLines: block(archived),
    extra: {
      retainedSessions: ordered.map((entry) => entry.session),
      archivedSessions: archived.map((entry) => entry.session),
      reordered
    }
  });
}

/**
 * The pre-S108 rule — "keep the last `retain` entries in file order" — kept
 * only as a negative control. On a ledger whose entries are not in session
 * order it retains the wrong sessions; see `test/session108-ledger-retention-by-session.test.js`.
 */
export function splitLedgerByPosition(source, entryPattern, retain = RETAINED_SESSION_ENTRIES, order = NEWEST_FIRST) {
  const { lines, starts } = indexEntries(source, entryPattern);
  if (starts.length <= retain) return null;

  const finish = (keptLines, archivedLines) =>
    finishSplit({ entries: starts.length, retainedEntries: retain, archivedEntries: starts.length - retain, order, keptLines, archivedLines });

  if (order === NEWEST_LAST) {
    // The newest entries are at the bottom, so the retained window is the last
    // `retain` of them. The file header above the first entry stays live.
    const cut = starts[starts.length - retain];
    const header = lines.slice(0, starts[0]);
    return finish(header.concat(lines.slice(cut)), lines.slice(starts[0], cut));
  }
  const cut = starts[retain];
  return finish(lines.slice(0, cut), lines.slice(cut));
}

/** The pointer block a roll leaves at the END of a live ledger. */
export function pointerFor(ledger, dir = ledger.dir || "context", retain = RETAINED_SESSION_ENTRIES) {
  const archiveRel = `${dir}/archive/${ledger.file.replace(/\.md$/, "")}.archive.md`;
  return (
    `\n${POINTER_SENTINEL}\n---\n\nOlder entries are retained verbatim in \`${archiveRel}\`. ` +
    `Nothing is summarised or removed on the way; the live file holds the working set only ` +
    `(newest ${retain} entries), so a reader does not pay for the whole project's history to ` +
    `learn what is true this week.\n`
  );
}

export function rollLedgers({ root = rootDir, apply = false, retain = RETAINED_SESSION_ENTRIES } = {}) {
  const results = [];
  for (const ledger of ROLLABLE_LEDGERS) {
    const dir = ledger.dir || "context";
    const archiveDir = path.join(root, dir, "archive");
    const livePath = path.join(root, dir, ledger.file);
    if (!fs.existsSync(livePath)) continue;
    const source = fs.readFileSync(livePath, "utf8");
    const before = Buffer.byteLength(source);
    const order = ledger.order || NEWEST_FIRST;
    const split = splitLedger(source, ledger.entry, retain, order);
    if (!split || split.nothingToArchive) {
      // Nothing to move. A pointer left mid-file by an earlier closeout is
      // still relocated to EOF, so the file's shape does not depend on whether
      // the roll happened to have entries to archive that day.
      const stripped = stripPointerBlocks(source);
      const pointerMoved = stripped !== source && source.includes(POINTER_SENTINEL) && !source.trimEnd().endsWith(pointerFor(ledger, dir, retain).trimEnd());
      if (apply && pointerMoved) fs.writeFileSync(livePath, stripped.replace(/\s+$/, "") + "\n" + pointerFor(ledger, dir, retain), "utf8");
      results.push({
        file: ledger.file,
        before,
        after: before,
        archived: 0,
        pointerRelocated: pointerMoved,
        skipped: split?.nothingToArchive || "fewer entries than the retention window"
      });
      continue;
    }

    const archiveName = ledger.file.replace(/\.md$/, "") + ".archive.md";
    const archivePath = path.join(archiveDir, archiveName);
    const head = split.head + pointerFor(ledger, dir, retain);

    if (apply) {
      fs.mkdirSync(archiveDir, { recursive: true });
      // The banner is written from the same constant every time rather than
      // preserved-or-recreated. The previous shape stripped the existing header
      // with a regex and only re-added one when the file was new, so the SECOND
      // roll silently ate the archive's own heading and explanation.
      const banner =
        `# ${ledger.file} — archive\n\nAppend-only archive of entries rolled out of the live ledger. ` +
        `Verbatim; newest first. See \`context/${ledger.file}\` for the working set.\n\n`;
      const existingBody = fs.existsSync(archivePath)
        ? fs.readFileSync(archivePath, "utf8").replace(banner, "")
        : "";
      // Where the rolled block belongs depends on which end is new. For a
      // newest-first ledger the rolled entries are newer than anything already
      // archived and go on top; for a newest-last ledger they are the OLDEST
      // entries and belong beneath what is already there.
      const merged = !existingBody
        ? split.tail
        : order === NEWEST_LAST
          ? `${existingBody.replace(/\s+$/, "")}\n\n${split.tail}`
          : `${split.tail}\n${existingBody}`;
      fs.writeFileSync(archivePath, banner + merged, "utf8");
      fs.writeFileSync(livePath, head, "utf8");
    }

    results.push({
      file: ledger.file,
      before,
      after: Buffer.byteLength(head),
      archived: split.archivedEntries,
      archivedSessions: split.archivedSessions,
      retainedSessions: split.retainedSessions,
      reordered: split.reordered,
      order,
      archivePath: path.relative(root, archivePath)
    });
  }
  return results;
}

function main(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const results = rollLedgers({ apply });
  const before = results.reduce((sum, row) => sum + row.before, 0);
  const after = results.reduce((sum, row) => sum + row.after, 0);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ apply, results, before, after }, null, 2));
    return;
  }
  console.log(apply ? "Rolling ledgers" : "Ledger roll (dry run — pass --apply)");
  for (const row of results) {
    const note = row.skipped
      ? ` (${row.skipped})`
      : ` · archived ${row.archived} entries [S${(row.archivedSessions || []).join(", S")}] (${row.order}${row.reordered ? ", retained entries re-sequenced by session" : ""})`;
    console.log(`  ${row.file.padEnd(26)} ${Math.round(row.before / 1024)} KB → ${Math.round(row.after / 1024)} KB${note}`);
  }
  console.log(`  ${"TOTAL".padEnd(26)} ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
