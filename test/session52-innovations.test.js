import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildFeedbackIssueUrl,
  buildLocalPlaytestExport,
  buildLocalPlaytestReceipt,
  loadLocalPlaytestReceipts,
  saveLocalPlaytestReceipt
} from "../public/lib/betaFeedback.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value))
  };
}

test("explicit local playtest receipts are bounded, anonymous, and save-payload free", () => {
  const receipt = buildLocalPlaytestReceipt({
    clarity: 4,
    agency: 5,
    pace: 3,
    returnIntent: 5,
    note: "  Draft choice felt mine.\nKeep this momentum.  ",
    createdAt: "2026-07-21T20:00:00.000Z"
  }, {
    year: 2026,
    week: 2,
    phase: "regular-season",
    teamId: "BUF",
    openingContractStatus: "completed"
  });
  assert.deepEqual(receipt.ratings, { clarity: 4, agency: 5, pace: 3, returnIntent: 5 });
  assert.equal(receipt.note, "Draft choice felt mine. Keep this momentum.");
  assert.equal(receipt.privacy.personalIdentifiersCollected, false);
  assert.equal(receipt.privacy.savePayloadIncluded, false);
  assert.equal("email" in receipt, false);
  assert.equal("snapshot" in receipt, false);
  assert.throws(() => buildLocalPlaytestReceipt({ clarity: 6, agency: 5, pace: 3, returnIntent: 5 }), /1 to 5/);
});

test("receipt storage is local, deduplicated, bounded, and explicitly exportable", () => {
  const storage = memoryStorage();
  for (let index = 0; index < 24; index += 1) {
    saveLocalPlaytestReceipt(buildLocalPlaytestReceipt({
      clarity: 3, agency: 4, pace: 3, returnIntent: 4,
      createdAt: `2026-07-21T20:${String(index).padStart(2, "0")}:00.000Z`
    }, { teamId: "BUF" }), storage);
  }
  const receipts = loadLocalPlaytestReceipts(storage);
  assert.equal(receipts.length, 20);
  const pack = buildLocalPlaytestExport(receipts);
  assert.equal(pack.count, 20);
  assert.match(pack.privacy, /no account identifier or save payload/i);
});

test("only an explicitly recorded receipt is attached to commissioner feedback", () => {
  const receipt = buildLocalPlaytestReceipt({
    clarity: 5, agency: 4, pace: 3, returnIntent: 5,
    note: "Opening receipt made the consequence clear.",
    createdAt: "2026-07-21T20:00:00.000Z"
  }, { teamId: "BUF" });
  const without = new URL(buildFeedbackIssueUrl({ phase: "regular-season" })).searchParams.get("body");
  const withReceipt = new URL(buildFeedbackIssueUrl({ phase: "regular-season", playtestReceipt: receipt })).searchParams.get("body");
  assert.doesNotMatch(without, /Playtest\/Clarity/);
  assert.match(withReceipt, /Playtest\/Clarity: 5\/5/);
  assert.match(withReceipt, /Opening receipt made the consequence clear/);
});

test("build and startup scripts expose no false-success fallback or missing v5 renderer", () => {
  const bundle = readFileSync(new URL("../scripts/build-bundle.mjs", import.meta.url), "utf8");
  const startup = readFileSync(new URL("../scripts/render-startup-brief.mjs", import.meta.url), "utf8");
  assert.match(bundle, /runCanonicalPagesFallback\(\)/);
  assert.match(bundle, /result\.status !== 0/);
  assert.doesNotMatch(bundle, /process\.exit\(0\).*graceful degradation/);
  assert.doesNotMatch(startup, /render-startup-brief-v5|STUDIO_BRIEF_V5|BRIEF_V5/);
});
