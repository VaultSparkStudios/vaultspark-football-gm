#!/usr/bin/env node
/**
 * Derive the rolling-status block at the top of context/SELF_IMPROVEMENT_LOOP.md
 * from the scored entries themselves.
 *
 * The block is read by render-startup-brief (`Last session:`, `Intent rate:`,
 * `Velocity:`, `Debt:`, the averages) and until S105 nothing wrote it: it was
 * hand-maintained, last touched at S100, and never carried an `Intent rate:`
 * line — so the brief rendered "Intent: ?% achieved" for sessions whose every
 * entry recorded "Intent outcome: Achieved". The same detector-without-a-writer
 * shape S104 found in `lastSessionSummary`.
 *
 * Everything here is a projection of the entries, never an authority:
 *   - scores are the `**N / 1000**` figure of each `## … Session N …` entry,
 *     one per session (the live file wins over the archive), calibration
 *     sessions 1-3 excluded — and the count actually used is printed, so the
 *     block cannot claim a population it did not read;
 *   - intent rate is the share of the last five scored entries that record
 *     "Intent outcome: Achieved";
 *   - `Velocity` and `Debt` are not derivable from entries, so they are carried
 *     from the existing block and labelled as carried.
 *
 *   node scripts/render-sil-rolling-status.mjs          # print the block
 *   node scripts/render-sil-rolling-status.mjs --write  # rewrite it in place
 *   node scripts/render-sil-rolling-status.mjs --check  # exit 1 when stale
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const START = "<!-- rolling-status-start -->";
const END = "<!-- rolling-status-end -->";
const CALIBRATION_SESSIONS = new Set([1, 2, 3]);
const SPARK = "▁▂▃▄▅▆▇█";

function readText(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

/** Split a SIL document into `## … Session N …` entries. */
export function parseSilEntries(markdown = "") {
  const entries = [];
  const blocks = String(markdown).split(/^(?=## )/m);
  for (const block of blocks) {
    const heading = block.match(/^## ([^\n]*)/)?.[1];
    if (!heading) continue;
    const session = Number(heading.match(/\bSession\s+(\d+)\b/i)?.[1]);
    if (!Number.isInteger(session)) continue;
    const date = heading.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;
    const score = Number(block.match(/\*\*\s*(\d+(?:\.\d+)?)\s*\/\s*1000\s*\*\*/)?.[1]);
    const intent = block.match(/Intent outcome:\s*\**\s*([A-Za-z-]+)/i)?.[1] ?? null;
    entries.push({ session, date, score: Number.isFinite(score) ? score : null, intent });
  }
  return entries;
}

function mean(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function round1(value) {
  return value == null ? "—" : String(Math.round(value * 10) / 10);
}

// A fixed 900-1000 scale, not min-max over the window: rescaling five scores
// that differ by one point renders a flat run as a cliff.
const SPARK_FLOOR = 900;
const SPARK_CEILING = 1000;

function sparkline(values) {
  if (!values.length) return "—";
  return values.map((v) => {
    const t = Math.min(1, Math.max(0, (v - SPARK_FLOOR) / (SPARK_CEILING - SPARK_FLOOR)));
    return SPARK[Math.round(t * (SPARK.length - 1))];
  }).join("");
}

function carried(block, label, fallback) {
  return block.match(new RegExp(`${label}:\\s*([^|\\n]+)`))?.[1]?.trim() || fallback;
}

/**
 * Build the block. `live` entries win over `archive` entries for the same
 * session; the result is ordered by session number.
 */
export function buildRollingStatus({ live = "", archive = "", previousBlock = "" } = {}) {
  const bySession = new Map();
  for (const entry of parseSilEntries(archive)) if (entry.score != null) bySession.set(entry.session, entry);
  for (const entry of parseSilEntries(live)) if (entry.score != null) bySession.set(entry.session, entry);
  const scored = [...bySession.values()]
    .filter((entry) => !CALIBRATION_SESSIONS.has(entry.session))
    .sort((a, b) => a.session - b.session);
  if (!scored.length) return null;

  const last = scored.at(-1);
  const previous = scored.at(-2) ?? null;
  const scores = scored.map((entry) => entry.score);
  const window = (n) => mean(scores.slice(-n));
  const lastFive = scored.slice(-5);
  const achieved = lastFive.filter((entry) => /^achieved$/i.test(entry.intent || "")).length;
  const intentKnown = lastFive.filter((entry) => entry.intent).length;
  // The denominator is entries that record an outcome: an entry that recorded
  // none is unknown, not a miss.
  const intentRate = intentKnown ? `${Math.round((achieved / intentKnown) * 100)}% (${achieved}/${intentKnown} last 5)` : "unknown";
  const velocity = carried(previousBlock, "Velocity", "unknown");
  const debt = carried(previousBlock, "Debt", "→");
  const delta = previous ? `${previous.score} → ${last.score} (${last.score - previous.score >= 0 ? "+" : ""}${last.score - previous.score})` : `${last.score}`;

  return [
    `Last session: ${last.session} (${last.date ?? "undated"}) | Total: ${last.score}/1000 | Velocity: ${velocity} | Debt: ${debt}`,
    `Avgs — 3: ${round1(window(3))} | 5: ${round1(window(5))} | 10: ${round1(window(10))} | 25: ${round1(window(25))} | all: ${round1(mean(scores))}`,
    `Sparkline: ${sparkline(scores.slice(-5))}`,
    `Intent rate: ${intentRate}`,
    `SIL delta: ${delta}. Engineering assessments, not user-outcome measurements. Derived by scripts/render-sil-rolling-status.mjs from ${scored.length} unique sessions scored /1000 in the live file and its archive (calibration sessions 1–3 excluded); Velocity and Debt are carried, not derived.`
  ].join("\n");
}

export function renderInto(markdown, block) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start < 0 || end < start) throw new Error("rolling-status markers not found");
  return `${markdown.slice(0, start + START.length)}\n${block}\n${markdown.slice(end)}`;
}

// Line endings are not content. The SIL is CRLF in a Windows working copy and
// LF once git normalises it, and an editor that re-saves the file flips the
// block's endings without changing a character of it — which made the
// committed-vs-derived comparison red locally and green in CI for the same
// bytes of text. Compare text, not terminators.
function normaliseEol(text) {
  return String(text).replace(/\r\n?/g, "\n");
}

export function currentBlock(markdown) {
  const text = normaliseEol(markdown);
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  return start < 0 || end < start ? "" : text.slice(start + START.length, end).trim();
}

export function renderForRoot(root = ROOT) {
  const silPath = path.join(root, "context", "SELF_IMPROVEMENT_LOOP.md");
  const live = readText(silPath);
  const archive = readText(path.join(root, "context", "archive", "SELF_IMPROVEMENT_LOOP.archive.md"));
  const previousBlock = currentBlock(live);
  const block = buildRollingStatus({ live, archive, previousBlock });
  return { silPath, live, previousBlock, block };
}

function main(argv) {
  const { silPath, live, previousBlock, block } = renderForRoot();
  if (!block) {
    console.error("render-sil-rolling-status: no scored entries found");
    return 1;
  }
  if (argv.includes("--check")) {
    if (previousBlock === block) {
      console.log("✓ SIL rolling-status is current");
      return 0;
    }
    console.error("✖ SIL rolling-status is stale — run: node scripts/render-sil-rolling-status.mjs --write");
    return 1;
  }
  if (argv.includes("--write")) {
    fs.writeFileSync(silPath, renderInto(live, block));
    console.log("✓ SIL rolling-status rewritten");
    return 0;
  }
  console.log(block);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.exitCode = main(process.argv.slice(2));
}
