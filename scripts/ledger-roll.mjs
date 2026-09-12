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
 * The pointer always stays at the END of the live file, for both orders:
 * `splitLedger` strips from the sentinel to EOF, so a pointer written into the
 * middle of a newest-last ledger would make the next roll delete every entry
 * beneath it.
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
export function splitLedger(source, entryPattern, retain = RETAINED_SESSION_ENTRIES, order = NEWEST_FIRST) {
  // Drop any pointer a previous roll appended. Without this it is re-read as
  // ordinary content and moved into the middle of an archive whose entire
  // promise is that it is verbatim.
  const pointerAt = source.indexOf(POINTER_SENTINEL);
  const body = pointerAt === -1 ? source : source.slice(0, pointerAt).replace(/\n---\n\s*$/, "");
  const lines = body.split(/\r?\n/);
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (entryPattern.test(lines[index])) starts.push(index);
  }
  if (starts.length <= retain) return null;

  const finish = (keptLines, archivedLines) => ({
    entries: starts.length,
    retainedEntries: retain,
    archivedEntries: starts.length - retain,
    order,
    head: keptLines.join("\n").replace(/\s+$/, "") + "\n",
    tail: archivedLines.join("\n").replace(/\s+$/, "") + "\n"
  });

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
    if (!split) {
      results.push({ file: ledger.file, before, after: before, archived: 0, skipped: "fewer entries than the retention window" });
      continue;
    }

    const archiveName = ledger.file.replace(/\.md$/, "") + ".archive.md";
    const archivePath = path.join(archiveDir, archiveName);
    const archiveRel = `${dir}/archive/${archiveName}`;
    const pointer =
      `\n${POINTER_SENTINEL}\n---\n\nOlder entries are retained verbatim in \`${archiveRel}\`. ` +
      `Nothing is summarised or removed on the way; the live file holds the working set only ` +
      `(newest ${retain} entries), so a reader does not pay for the whole project's history to ` +
      `learn what is true this week.\n`;
    const head = split.head + pointer;

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
    const note = row.skipped ? ` (${row.skipped})` : ` · archived ${row.archived} entries (${row.order})`;
    console.log(`  ${row.file.padEnd(26)} ${Math.round(row.before / 1024)} KB → ${Math.round(row.after / 1024)} KB${note}`);
  }
  console.log(`  ${"TOTAL".padEnd(26)} ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
