import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const TAB_IDS = [
  "overviewTab",
  "statsTab",
  "calendarTab",
  "rosterTab",
  "faTab",
  "depthTab",
  "contractsTab",
  "transactionsTab",
  "scoutingTab",
  "draftTab",
  "logTab",
  "historyTab",
  "rulesTab",
  "settingsTab",
];

test("mobile-bottom-nav element is present in game.html", () => {
  const html = read("../public/game.html");
  assert.match(html, /class="mobile-bottom-nav"/);
  assert.match(html, /id="mobileBottomNav"/);
  assert.match(html, /mobile-nav-track/);
  assert.match(html, /mobile-nav-pill/);
});

test("mobile bottom nav has a pill for every tab", () => {
  const html = read("../public/game.html");
  for (const tabId of TAB_IDS) {
    assert.match(
      html,
      new RegExp(`class="mobile-nav-pill"[^>]*data-tab="${tabId}"`),
      `Missing mobile nav pill for tab: ${tabId}`
    );
  }
});

test("mobile bottom nav group labels are present and aria-hidden", () => {
  const html = read("../public/game.html");
  assert.match(html, /class="mobile-nav-group-label"[^>]*aria-hidden="true"[^>]*>Gameday/);
  assert.match(html, /class="mobile-nav-group-label"[^>]*aria-hidden="true"[^>]*>Roster/);
  assert.match(html, /class="mobile-nav-group-label"[^>]*aria-hidden="true"[^>]*>Builds/);
  assert.match(html, /class="mobile-nav-group-label"[^>]*aria-hidden="true"[^>]*>History/);
  assert.match(html, /class="mobile-nav-group-label"[^>]*aria-hidden="true"[^>]*>Config/);
});

test("app.js binds click handlers on mobile-nav-pill elements", () => {
  const appSource = read("../public/app.js");
  assert.match(appSource, /\.mobile-nav-pill\[data-tab\]/);
  assert.match(appSource, /activateTab\(pill\.dataset\.tab\)/);
});

test("activateTab in gameFlow.js syncs mobile nav pill active state", () => {
  const gameFlowSource = read("../public/lib/gameFlow.js");
  assert.match(gameFlowSource, /\.mobile-nav-pill\[data-tab\]/);
  assert.match(gameFlowSource, /classList\.toggle\("active"/);
  assert.match(gameFlowSource, /scrollIntoView/);
});

test("mobile-bottom-nav CSS is in styles.css with 100dvh and safe-area insets", () => {
  const css = read("../public/styles.css");
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.mobile-nav-pill/);
  assert.match(css, /\.mobile-nav-track/);
});

test("sidebar side-menu is hidden on mobile via CSS", () => {
  const css = read("../public/styles.css");
  // At ≤640px the .side-menu must be display:none so the bottom nav is the sole nav
  assert.match(css, /max-width: 640px[\s\S]*?\.side-menu[\s\S]*?display: none/);
});
