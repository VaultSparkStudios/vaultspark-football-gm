import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TAB_HYDRATION_DOMAINS } from "../public/lib/tabHydration.js";
import { UI_ISLAND_MANIFEST } from "../public/lib/uiIslands.js";
import { isDeveloperSurfaceRequested, applyDeveloperSurfaceVisibility } from "../public/lib/devSurfaces.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const game = fs.readFileSync(path.join(rootDir, "public", "game.html"), "utf8");

// Slice to the next TAB panel, not the next <section> — game.html nests
// <section> elements inside panels (coachingMarketPanel, for one).
function section(id) {
  const start = game.indexOf(`<section id="${id}"`);
  assert.notEqual(start, -1, `${id} exists`);
  const next = game.slice(start + 10).search(/<section id="[a-zA-Z]+Tab"/);
  return next === -1 ? game.slice(start) : game.slice(start, start + 10 + next);
}

// ── The economy leaves the junk drawer ───────────────────────────────────────
// S63 closed the Coaching Staff panel's three free number boxes. S93 closed the
// byte-identical Owner Facilities panel eight lines away in the same file,
// thirty sessions later. Both lived in Settings, mixed in with trophies and
// debug tables. That is a structural fact about where the code lives, so it is
// asserted structurally.

test("the owner economy is a first-class surface, not a setting", () => {
  const boardroom = section("boardroomTab");
  for (const panel of ["Owner Controls", "Facilities Market", "Coaching Staff", "Franchise Brand Builder"]) {
    assert.ok(boardroom.includes(panel), `Boardroom owns ${panel}`);
  }
  // The S93 guarantee must survive the move: investment still routes through the
  // priced path, and the raw facility write stays closed.
  assert.ok(boardroom.includes("investFacilityBtn"), "construction still goes through investInFacility");
  assert.ok(boardroom.includes("facilityInvestPoints"), "the per-year build allowance control moved with it");

  const settings = section("settingsTab");
  for (const panel of ["Owner Controls", "Facilities Market", "Coaching Staff"]) {
    assert.ok(!settings.includes(`<h2>${panel}</h2>`), `${panel} no longer lives in Settings`);
  }
  assert.ok(game.includes('data-tab="boardroomTab"'), "the Boardroom is reachable from the tab rail");
});

test("the Boardroom hydrates its own domains rather than depending on a Settings visit", () => {
  const domains = TAB_HYDRATION_DOMAINS.boardroomTab;
  assert.ok(Array.isArray(domains));
  for (const required of ["owner", "staff", "settings"]) {
    assert.ok(domains.includes(required), `boardroomTab hydrates ${required}`);
  }
  assert.ok(
    UI_ISLAND_MANIFEST.settings.tabs.includes("boardroomTab"),
    "the Boardroom shares the settings island rather than duplicating one"
  );
});

// ── Developer diagnostics stop shipping to consumers ─────────────────────────

test("every developer diagnostic is behind the dev surface, and hidden by default", () => {
  const settings = section("settingsTab");
  const devStart = settings.indexOf("data-dev-surface");
  assert.notEqual(devStart, -1, "the dev surface exists");
  const devBlock = settings.slice(devStart);
  for (const panel of [
    "Launch Readiness",
    "System Health",
    "Realism Verification (10-20 Year)",
    "League Progression Parity",
    "Finite-Number Integrity",
    "Offseason Pipeline"
  ]) {
    assert.ok(devBlock.includes(panel), `${panel} is inside the dev surface`);
    assert.ok(
      settings.indexOf(panel) > devStart,
      `${panel} must not also appear in the consumer part of Settings`
    );
  }
  assert.match(settings.slice(devStart, devStart + 200), /hidden/, "the dev surface ships hidden");
});

test("the dev surface opens only for an explicit ?dev=1, never by accident", () => {
  assert.equal(isDeveloperSurfaceRequested("?dev=1"), true);
  for (const search of ["", "?dev=0", "?dev=true", "?development=1", "?d=1", "?devmode=1"]) {
    assert.equal(isDeveloperSurfaceRequested(search), false, `${search || "(empty)"} must not open diagnostics`);
  }
});

test("applying the dev gate toggles hidden and aria-hidden together", () => {
  const nodes = [{ hidden: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }];
  const root = { querySelectorAll: () => nodes };
  assert.equal(applyDeveloperSurfaceVisibility(root, ""), 0);
  assert.equal(nodes[0].hidden, true);
  assert.equal(nodes[0].attrs["aria-hidden"], "true");
  assert.equal(applyDeveloperSurfaceVisibility(root, "?dev=1"), 1);
  assert.equal(nodes[0].hidden, false);
  assert.equal(nodes[0].attrs["aria-hidden"], "false");
});

// ── One place to learn the game ──────────────────────────────────────────────

test("the four learning surfaces became three views of one", () => {
  assert.ok(!game.includes('id="rulesTab"'), "the 773-byte Rules tab is retired");
  assert.ok(!game.includes('data-tab="rulesTab"'), "and its rail button with it");
  assert.ok(!Object.hasOwn(TAB_HYDRATION_DOMAINS, "rulesTab"), "and its hydration declaration");

  const guideStart = game.indexOf('id="guideModal"');
  const guide = game.slice(guideStart, game.indexOf("</div>\n    </div>", guideStart) + 40);
  for (const view of ["guideHowToPanel", "guideRulesPanel", "guideActionsPanel"]) {
    assert.ok(guide.includes(view), `the guide carries the ${view} view`);
  }
  // The tables the retired tab owned came with it rather than being orphaned.
  assert.ok(guide.includes("rulesCoreTable"), "the rulebook survived the merge");
  assert.ok(guide.includes("rulesActionsTable"), "the controls reference survived the merge");
  // "How To Play" and "Game Guide" rendered the SAME GUIDE_SECTIONS into two
  // elements. Exactly one target remains.
  assert.equal((game.match(/id="rulesGuideContent"/g) || []).length, 0);
  assert.equal((game.match(/id="guideModalContent"/g) || []).length, 1);
});
