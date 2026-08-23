#!/usr/bin/env node
/**
 * S94: a bounded projection of the task board.
 *
 * The audit protocol's step 1 calls for `task-slice.mjs --audit-context`
 * precisely so a session does not have to read the whole board to know what is
 * open. The script did not exist in this repo, so the bounded read path the
 * protocol depends on was a silent contract break: every audit either read
 * TASK_BOARD.md whole (153 KB, roughly 38,000 tokens) or skipped it.
 *
 * This is the cheap half of the token work. The expensive half — the five
 * append-only ledgers totalling 861 KB — is addressed by `ledger-roll.mjs`.
 * Both exist for the same reason: the live file should hold the working set and
 * the archive should hold the rest, rather than every reader paying for ninety
 * sessions of history to learn what is open today.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const OPEN_ITEM = /^\s*[-*]\s*\[ \]\s*(.+)$/;
const DONE_ITEM = /^\s*[-*]\s*\[[xX]\]\s*/;
const HEADING = /^(#{2,4})\s+(.+)$/;

export function sliceTaskBoard(source, { maxChars = 8000 } = {}) {
  const lines = source.split(/\r?\n/);
  const open = [];
  const humanAction = [];
  let heading = "";
  let inHumanSection = false;

  for (const line of lines) {
    const headingMatch = line.match(HEADING);
    if (headingMatch) {
      heading = headingMatch[2].trim();
      inHumanSection = /human action required/i.test(heading);
      continue;
    }
    if (DONE_ITEM.test(line)) continue;
    const openMatch = line.match(OPEN_ITEM);
    if (!openMatch) continue;
    const entry = { section: heading, text: openMatch[1].trim() };
    (inHumanSection ? humanAction : open).push(entry);
  }

  // Dedupe carried entries. This board re-states unchanged items across
  // sessions ("carried, unchanged"), so a raw list over-reports what is open.
  const seen = new Set();
  const unique = [];
  for (const entry of open) {
    const key = entry.text.replace(/\s*\((?:carried|re-verified)[^)]*\)\s*$/i, "").slice(0, 120).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }

  // Truncate to the character budget by dropping the tail, and SAY SO. A slice
  // that silently omits work reads as "this is everything", which is the exact
  // failure mode this project's own rule against silent caps names.
  const render = (entry) => `- [${entry.section || "unfiled"}] ${entry.text}`;
  const rendered = [];
  let used = 0;
  let dropped = 0;
  for (const entry of [...humanAction, ...unique]) {
    const line = render(entry);
    if (used + line.length + 1 > maxChars) {
      dropped += 1;
      continue;
    }
    rendered.push(line);
    used += line.length + 1;
  }

  return {
    openCount: unique.length,
    humanActionCount: humanAction.length,
    rendered,
    dropped,
    truncated: dropped > 0,
    note: dropped
      ? `${dropped} open item(s) omitted to stay inside ${maxChars} characters — this slice is NOT the whole board`
      : "complete: every open item fits the budget"
  };
}

function main(argv = process.argv.slice(2)) {
  const maxIndex = argv.indexOf("--max-chars");
  const maxChars = maxIndex >= 0 ? Number(argv[maxIndex + 1]) : 8000;
  const boardPath = path.join(rootDir, "context", "TASK_BOARD.md");
  if (!fs.existsSync(boardPath)) {
    console.error("context/TASK_BOARD.md not found");
    process.exitCode = 1;
    return;
  }
  const source = fs.readFileSync(boardPath, "utf8");
  const slice = sliceTaskBoard(source, { maxChars });
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ ...slice, sourceBytes: Buffer.byteLength(source) }, null, 2));
    return;
  }
  console.log(`TASK BOARD SLICE — ${slice.openCount} open · ${slice.humanActionCount} human-action`);
  console.log(`source ${Math.round(Buffer.byteLength(source) / 1024)} KB → slice ${Math.round(slice.rendered.join("\n").length / 1024)} KB`);
  console.log(slice.note);
  console.log("");
  for (const line of slice.rendered) console.log(line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
