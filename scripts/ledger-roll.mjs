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
 * Ledgers are newest-first here, so the retained window is a prefix.
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

export const ROLLABLE_LEDGERS = Object.freeze([
  { file: "CURRENT_STATE.md", entry: /^- (\d{4}-\d{2}-\d{2}): Session (\d+)/ },
  { file: "DECISIONS.md", entry: /^## (\d{4}-\d{2}-\d{2}) — Session (\d+)/ },
  { file: "TRUTH_AUDIT.md", entry: /^## (\d{4}-\d{2}-\d{2}).*?Session (\d+)/ },
  { file: "SELF_IMPROVEMENT_LOOP.md", entry: /^## (\d{4}-\d{2}-\d{2}) — Session (\d+)/ }
]);

/**
 * Split a newest-first ledger into the retained prefix and the archived tail.
 * Returns null when the file has fewer entries than the retention window, so a
 * short ledger is left completely alone.
 */
export const POINTER_SENTINEL = "<!-- ledger-roll:pointer -->";

export function splitLedger(source, entryPattern, retain = RETAINED_SESSION_ENTRIES) {
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
  const cut = starts[retain];
  return {
    entries: starts.length,
    retainedEntries: retain,
    archivedEntries: starts.length - retain,
    head: lines.slice(0, cut).join("\n").replace(/\s+$/, "") + "\n",
    tail: lines.slice(cut).join("\n").replace(/\s+$/, "") + "\n"
  };
}

export function rollLedgers({ root = rootDir, apply = false, retain = RETAINED_SESSION_ENTRIES } = {}) {
  const archiveDir = path.join(root, "context", "archive");
  const results = [];
  for (const ledger of ROLLABLE_LEDGERS) {
    const livePath = path.join(root, "context", ledger.file);
    if (!fs.existsSync(livePath)) continue;
    const source = fs.readFileSync(livePath, "utf8");
    const before = Buffer.byteLength(source);
    const split = splitLedger(source, ledger.entry, retain);
    if (!split) {
      results.push({ file: ledger.file, before, after: before, archived: 0, skipped: "fewer entries than the retention window" });
      continue;
    }

    const archiveName = ledger.file.replace(/\.md$/, "") + ".archive.md";
    const archivePath = path.join(archiveDir, archiveName);
    const pointer =
      `\n${POINTER_SENTINEL}\n---\n\nOlder entries are retained verbatim in \`context/archive/${archiveName}\`. ` +
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
      // Rolled entries are newer than anything already archived, so they go on top.
      fs.writeFileSync(archivePath, banner + (existingBody ? `${split.tail}\n${existingBody}` : split.tail), "utf8");
      fs.writeFileSync(livePath, head, "utf8");
    }

    results.push({
      file: ledger.file,
      before,
      after: Buffer.byteLength(head),
      archived: split.archivedEntries,
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
    const note = row.skipped ? ` (${row.skipped})` : ` · archived ${row.archived} entries`;
    console.log(`  ${row.file.padEnd(26)} ${Math.round(row.before / 1024)} KB → ${Math.round(row.after / 1024)} KB${note}`);
  }
  console.log(`  ${"TOTAL".padEnd(26)} ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
