/**
 * Opening Contract recovery — skipping the tutorial is a deferral, never a dead-end.
 *
 * Regression for the S62 audit finding: every tutorial dismiss path wrote a
 * permanent "done" flag with zero recovery callers, so a skipped Opening
 * Contract (and its season chapter + rehearsal promise) was unrecoverable.
 * Skip now records an explicit deferral; Overview, Settings, and the command
 * palette all expose a declare path; completion is never downgraded.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getTutorialState,
  hasTutorialBeenSeen,
  markTutorialSeen,
  resetTutorial,
  tutorialSeenKey
} from "../public/lib/tutorialCampaign.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); }
  };
}

const SCOPE = { franchiseId: "fa-2026-BUF" };

test("skip records a deferral receipt distinct from completion", () => {
  const store = storage();
  assert.equal(getTutorialState(SCOPE, store), null);
  assert.equal(hasTutorialBeenSeen(SCOPE, store), false);

  markTutorialSeen(SCOPE, store, "deferred");
  assert.equal(getTutorialState(SCOPE, store), "deferred");
  assert.equal(hasTutorialBeenSeen(SCOPE, store), true, "deferred still suppresses auto-remount");

  markTutorialSeen(SCOPE, store);
  assert.equal(getTutorialState(SCOPE, store), "done");

  resetTutorial(SCOPE, store);
  assert.equal(getTutorialState(SCOPE, store), null);
});

test("legacy done flags and unknown values stay compatible", () => {
  const key = tutorialSeenKey(SCOPE);
  const legacy = storage({ [key]: "done" });
  assert.equal(getTutorialState(SCOPE, legacy), "done");
  const garbage = storage({ [key]: "banana" });
  assert.equal(getTutorialState(SCOPE, garbage), null, "unknown values never count as seen");
});

test("tutorial dismiss defers but never downgrades a completed contract", () => {
  const source = read("../public/lib/tutorialCampaign.js");
  assert.match(source, /getTutorialState\(scope, storage\) !== "done"/, "dismiss guards completed state");
  assert.match(source, /markTutorialSeen\(scope, storage, "deferred"\)/, "dismiss writes a deferral");
});

test("every recovery surface is wired: Overview CTA, Settings, command palette", () => {
  const appSource = read("../public/app.js");
  const overviewSource = read("../public/lib/tabOverview.js");
  const settingsSource = read("../public/lib/tabSettings.js");
  const gameHtml = read("../public/game.html");

  assert.match(appSource, /function launchOpeningContract\(/);
  assert.match(appSource, /vsfgm:run-opening-contract/, "app listens for the recovery event");
  assert.match(appSource, /resetTutorial/, "re-run clears the deferral flag");
  assert.match(overviewSource, /Declare Opening Contract/, "Overview renders the declare CTA");
  assert.match(overviewSource, /vsfgm:run-opening-contract/);
  assert.match(gameHtml, /id="runOpeningContractBtn"/, "Settings exposes the recovery button");
  assert.match(settingsSource, /Run Opening Contract/, "command palette offers the recovery command");
});

test("command palette Run buttons actually dispatch (no dead innerHTML buttons)", () => {
  const settingsSource = read("../public/lib/tabSettings.js");
  assert.match(settingsSource, /button\.addEventListener\("click"/, "palette buttons carry real handlers");
  assert.doesNotMatch(
    settingsSource,
    /cell\.innerHTML = `<button data-command-id/,
    "the dead innerHTML button pattern must not return"
  );
  assert.match(settingsSource, /dataset\.filterBound/, "palette filter input is wired");
});
