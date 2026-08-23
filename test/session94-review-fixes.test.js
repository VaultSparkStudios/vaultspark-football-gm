import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sliceTaskBoard } from "../scripts/task-slice.mjs";
import { splitLedger, rollLedgers, POINTER_SENTINEL } from "../scripts/ledger-roll.mjs";
import { writeCaptureLedger } from "../scripts/visual-qa-retention.mjs";
import { inspectPublicTruth } from "../scripts/check-public-truth.mjs";
import { TAB_HYDRATION_DOMAINS } from "../public/lib/tabHydration.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

// Every test here pins a defect a review found in THIS session's own code.
// They are regression tests, not coverage theatre: each one fails on the shape
// that shipped an hour earlier.

test("the pre-cohort invitation never renders an unbound opt-in button", () => {
  const source = read("public/community-stats.js");
  // The atlas already renders a consent block into its own shell and binds it.
  // A second copy inside the invitation would be inert — the primary call to
  // action of the new surface, dead on click — and a duplicate aria-live region.
  assert.match(source, /\$\{compact \? participationMarkup\(\) : ""\}/);
  const atlas = source.slice(source.indexOf("function renderAtlas"));
  assert.match(atlas, /invitationMarkup\(false\)/);
  assert.match(atlas, /data-community-consent-shell/);
});

test("rival intel loads with its tab, retries, and surfaces failure where a player can see it", () => {
  const source = read("public/app.js");
  // Scope to the loader itself. A wider window bleeds into the neighbouring
  // Season Arcs binding, which legitimately uses .catch on a raw promise.
  const start = source.indexOf("const loadRivalFrontOfficeIntel");
  const block = source.slice(start, source.indexOf("  });", source.indexOf("data-tab='scoutingTab'")) + 5);
  // observeBackgroundTask resolves on failure, so a trailing .catch is dead code
  // and the panel would sit blank in silence. onError is the live seam.
  assert.match(block, /onError:/);
  assert.doesNotMatch(block, /\)\s*\.catch\(/);
  // And it must not fire on every cold boot — that is the request the island
  // architecture exists to avoid.
  assert.match(block, /data-tab='scoutingTab'/);
  assert.match(block, /rivalIntelLoaded/);
});

test("the dev surface is revealed before hydration failure can throw", () => {
  const source = read("public/lib/gameFlow.js");
  const reveal = source.indexOf('islandName === "settings"');
  const thrown = source.indexOf("hydration failed:");
  assert.ok(reveal > -1 && thrown > -1);
  // A diagnostics block that hides itself when hydration degrades is hidden
  // exactly when it is worth reading — Retry Degraded Panels included.
  assert.ok(reveal < thrown, "the reveal must precede the throw");
});

test("Settings stopped hydrating panels that moved to the Boardroom", () => {
  for (const domain of ["staff", "owner"]) {
    assert.ok(!TAB_HYDRATION_DOMAINS.settingsTab.includes(domain), `settingsTab must not hydrate ${domain}`);
    assert.ok(TAB_HYDRATION_DOMAINS.boardroomTab.includes(domain), `boardroomTab hydrates ${domain}`);
  }
});

test("the command palette has no two rows with the same label", () => {
  const source = read("public/lib/tabSettings.js");
  const labels = [...source.matchAll(/\{ id: "[^"]+", label: "([^"]+)"/g)].map((m) => m[1]);
  const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);
  assert.deepEqual(duplicates, [], "two indistinguishable rows is worse than one");
  // The Rules affordance survived the merge rather than being lost with the tab.
  assert.match(source, /label: "Open Rules", run: \(\) => openGuideModal\("guideRulesPanel"\)/);
});

test("a guide deep link shows a skeleton and a real error, never a permanently blank table", () => {
  const source = read("public/lib/tabOverview.js");
  const open = source.slice(source.indexOf("export function openGuideModal"));
  assert.match(open, /setTableSkeleton/);
  assert.match(open, /onError:/);
  assert.match(open, /retry:/);
});

test("task-slice drops the tail, not an arbitrary subset", () => {
  const board = [
    "## Now",
    "- [ ] " + "A".repeat(400),
    "- [ ] short one",
    "- [ ] another short one"
  ].join("\n");
  const slice = sliceTaskBoard(board, { maxChars: 120 });
  // The long first item does not fit. `continue` would have skipped it and then
  // emitted both short ones, producing a slice that is not the prefix it claims.
  assert.equal(slice.rendered.length, 0);
  assert.equal(slice.dropped, 3);
  assert.match(slice.note, /NOT the whole board/);
});

test("an unparseable budget falls back instead of silently disabling the cap", () => {
  const board = "## Now\n" + Array.from({ length: 40 }, (_, i) => `- [ ] item ${i} ${"x".repeat(300)}`).join("\n");
  for (const bad of [undefined, NaN, "abc", 0, -5]) {
    const slice = sliceTaskBoard(board, { maxChars: bad });
    assert.equal(slice.maxChars, 8000, `${String(bad)} must fall back to the default`);
    assert.ok(slice.truncated, "a NaN budget must not report completeness it never checked");
  }
});

test("rolling a ledger twice keeps the archive header and never archives the pointer", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s94-roll-"));
  fs.mkdirSync(path.join(dir, "context"), { recursive: true });
  const livePath = path.join(dir, "context", "CURRENT_STATE.md");
  const entry = (session, day) => `- 2026-08-${String(day).padStart(2, "0")}: Session ${session} did a thing.`;
  const first = Array.from({ length: 14 }, (_, i) => entry(99 - i, 28 - i));
  fs.writeFileSync(livePath, "# Current State\n" + first.join("\n") + "\n");

  rollLedgers({ root: dir, apply: true, retain: 10 });
  const archivePath = path.join(dir, "context", "archive", "CURRENT_STATE.archive.md");
  assert.match(fs.readFileSync(archivePath, "utf8"), /^# CURRENT_STATE\.md — archive/);
  assert.match(fs.readFileSync(livePath, "utf8"), /context\/archive\//);

  // Add newer entries and roll again — the second roll is where the old shape
  // ate the archive heading and archived its own pointer paragraph.
  const live = fs.readFileSync(livePath, "utf8");
  const newer = Array.from({ length: 4 }, (_, i) => entry(103 - i, 31 - i));
  fs.writeFileSync(livePath, live.replace("# Current State\n", "# Current State\n" + newer.join("\n") + "\n"));
  rollLedgers({ root: dir, apply: true, retain: 10 });

  const secondArchive = fs.readFileSync(archivePath, "utf8");
  assert.match(secondArchive, /^# CURRENT_STATE\.md — archive/, "the archive keeps its own heading across rolls");
  assert.ok(!secondArchive.includes(POINTER_SENTINEL), "the live file's pointer is never archived as content");
  assert.ok(!secondArchive.includes("Older entries are retained verbatim"), "nor its prose");
  // And the oldest entries are still there — a roll moves, it never drops.
  assert.ok(secondArchive.includes("Session 86"), "previously archived entries survive the second roll");
});

test("splitLedger ignores a pointer left by a previous roll", () => {
  const pattern = /^- (\d{4}-\d{2}-\d{2}): Session (\d+)/;
  const source = [
    "# Ledger",
    "- 2026-08-22: Session 93 a.",
    "- 2026-08-21: Session 92 b.",
    "- 2026-08-20: Session 91 c.",
    "",
    POINTER_SENTINEL,
    "---",
    "",
    "Older entries are retained verbatim in `context/archive/X.md`."
  ].join("\n");
  const split = splitLedger(source, pattern, 1);
  assert.ok(!split.tail.includes(POINTER_SENTINEL));
  assert.ok(!split.tail.includes("retained verbatim"));
  assert.ok(split.tail.includes("Session 92"));
});

test("the capture ledger notices a capture re-baselined under the same name", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s94-captures-"));
  fs.mkdirSync(path.join(dir, "docs", "visual-qa"), { recursive: true });
  const capture = path.join(dir, "docs", "visual-qa", "baseline.png");
  fs.writeFileSync(capture, "first bytes");
  const first = writeCaptureLedger({ root: dir });
  assert.equal(first.added, 1);
  const ledgerPath = path.join(dir, "docs", "visual-qa", "CAPTURE_LEDGER.json");
  const firstDigest = JSON.parse(fs.readFileSync(ledgerPath, "utf8")).captures["baseline.png"].sha256;

  // Same name, different bytes. Keying on the filename alone kept the stale
  // digest forever, voiding the guarantee the whole prune rests on. The
  // unversioned captures are both the ones re-baselined in place and the ones
  // the policy never prunes, so this is exactly where it would bite.
  fs.writeFileSync(capture, "second bytes");
  const second = writeCaptureLedger({ root: dir });
  assert.equal(second.added, 0);
  assert.equal(second.revised, 1);
  const row = JSON.parse(fs.readFileSync(ledgerPath, "utf8")).captures["baseline.png"];
  assert.notEqual(row.sha256, firstDigest);
  assert.deepEqual(row.supersededSha256, [firstDigest], "what was reviewed before is not overwritten");

  // Unchanged bytes are a no-op, so the ledger stays append-only in practice.
  const third = writeCaptureLedger({ root: dir });
  assert.equal(third.added, 0);
  assert.equal(third.revised, 0);
});

test("the rival-club gate fails loudly when its subject moves", () => {
  // The engine-count branch already did this; the rival branch passed in silence,
  // and this session had to hand-repair that exact regex when the markup changed.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s94-truth-"));
  for (const sub of ["public", "context", "src/engine", "public/images"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "src", "engine", "a.js"), "");
  fs.writeFileSync(path.join(dir, "context", "PROJECT_STATUS.json"), JSON.stringify({ lastSession: 0 }));
  for (const name of ["public-identity.json", "agents.json", "footer-manifest.json"]) {
    fs.writeFileSync(path.join(dir, "public", name), "{}");
  }
  fs.writeFileSync(
    path.join(dir, "public", "index.html"),
    '<strong class="stat-num">1</strong><span class="stat-label">Engine Systems</span>'
      + '<div class="stat-num">31</div><div class="stat-label">Rival Front Offices</div>'
  );
  const report = inspectPublicTruth(dir);
  assert.ok(
    report.problems.some((problem) => /rival-front-office count in a shape this gate can read/.test(problem)),
    "a gate that goes quiet when its subject moves is worse than no gate"
  );
});
