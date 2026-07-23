import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// ── Source wiring checks (static analysis, no DOM needed) ─────────────────

test("mobileNav module exports initMobileNav and MOBILE_NAV_BREAKPOINT", () => {
  const src = fs.readFileSync(
    new URL("../public/lib/mobileNav.js", import.meta.url),
    "utf8"
  );
  assert.match(src, /export function initMobileNav/);
  assert.match(src, /export const MOBILE_NAV_BREAKPOINT/);
});

test("mobileNav breakpoint matches the existing mobile CSS breakpoint (640)", () => {
  const src = fs.readFileSync(
    new URL("../public/lib/mobileNav.js", import.meta.url),
    "utf8"
  );
  assert.match(src, /MOBILE_NAV_BREAKPOINT\s*=\s*640/);
});

test("app.js imports and initialises the mobile nav", () => {
  const src = fs.readFileSync(
    new URL("../public/app.js", import.meta.url),
    "utf8"
  );
  assert.match(src, /from "\.\/lib\/mobileNav\.js"/);
  assert.match(src, /initMobileNav\(\)/);
});

test("game.html contains mobile nav bar with five quick-access slots", () => {
  const html = fs.readFileSync(
    new URL("../public/game.html", import.meta.url),
    "utf8"
  );
  assert.match(html, /id="mobileNavBar"/);
  assert.match(html, /class="mobile-nav-more"/);
  assert.match(html, /id="mobileNavMoreBtn"/);
  // Four quick-access tabs + one More button = five slots
  const quickSlots = [...html.matchAll(/class="mobile-nav-btn"/g)];
  assert.equal(quickSlots.length, 4);
});

test("game.html contains the 100dvh drawer with all section groups", () => {
  const html = fs.readFileSync(
    new URL("../public/game.html", import.meta.url),
    "utf8"
  );
  assert.match(html, /id="mobileNavDrawer"/);
  assert.match(html, /id="mobileNavCloseBtn"/);
  assert.match(html, /id="mobileNavBackdrop"/);
  // All four section groups present
  assert.match(html, /Gameday/);
  assert.match(html, /mobile-nav-drawer-group-label/);
  // All 14 tab IDs represented in the drawer
  const tabIds = [
    "overviewTab", "statsTab", "calendarTab",
    "rosterTab", "faTab", "depthTab", "contractsTab",
    "transactionsTab", "scoutingTab", "draftTab",
    "logTab", "historyTab", "rulesTab", "settingsTab"
  ];
  for (const tabId of tabIds) {
    assert.match(
      html,
      new RegExp(`class="mobile-nav-drawer-item"[^>]*data-tab="${tabId}"`),
      `drawer missing tab: ${tabId}`
    );
  }
});

test("styles.css includes mobile nav bar, drawer, and backdrop rules", () => {
  const css = fs.readFileSync(
    new URL("../public/styles.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /\.mobile-nav-bar/);
  assert.match(css, /\.mobile-nav-drawer/);
  assert.match(css, /\.mobile-nav-backdrop/);
  assert.match(css, /100dvh/);
  assert.match(css, /body\.has-mobile-nav/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test("mobileNav delegates tab clicks through the existing .menu-btn system", () => {
  const src = fs.readFileSync(
    new URL("../public/lib/mobileNav.js", import.meta.url),
    "utf8"
  );
  // Must click the canonical .menu-btn, not call activateTab directly,
  // so all existing ARIA, state, and deep-link logic stays intact.
  assert.match(src, /\.menu-btn\[data-tab=/);
  assert.match(src, /\.click\(\)/);
  assert.doesNotMatch(src, /import.*activateTab/);
});

test("mobileNav uses MutationObserver to sync active state from other callers", () => {
  const src = fs.readFileSync(
    new URL("../public/lib/mobileNav.js", import.meta.url),
    "utf8"
  );
  assert.match(src, /MutationObserver/);
  assert.match(src, /attributeFilter.*class/);
});
