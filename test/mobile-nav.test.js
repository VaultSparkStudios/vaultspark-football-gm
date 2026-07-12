import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BUCKETS, bucketForTab } from "../public/lib/mobileNav.js";

test("BUCKETS covers all 14 game tabs without duplicates", () => {
  const allTabs = BUCKETS.flatMap((b) => b.tabs);
  const expected = [
    "overviewTab", "statsTab", "calendarTab",
    "rosterTab", "faTab", "depthTab", "contractsTab",
    "transactionsTab", "scoutingTab", "draftTab",
    "logTab", "historyTab",
    "rulesTab", "settingsTab"
  ];
  assert.equal(allTabs.length, expected.length, "tab count matches");
  for (const t of expected) {
    assert.ok(allTabs.includes(t), `tab ${t} is in BUCKETS`);
  }
  // No duplicates
  assert.equal(new Set(allTabs).size, allTabs.length, "no duplicate tabs");
});

test("every bucket has matching tabLabels length", () => {
  for (const b of BUCKETS) {
    assert.equal(
      b.tabs.length,
      b.tabLabels.length,
      `${b.id}: tabs.length === tabLabels.length`
    );
  }
});

test("bucketForTab returns the correct bucket", () => {
  assert.equal(bucketForTab("overviewTab")?.id, "gameday");
  assert.equal(bucketForTab("rosterTab")?.id, "roster");
  assert.equal(bucketForTab("draftTab")?.id, "builds");
  assert.equal(bucketForTab("historyTab")?.id, "history");
  assert.equal(bucketForTab("settingsTab")?.id, "config");
  assert.equal(bucketForTab("nonexistentTab"), undefined);
});

test("BUCKETS has exactly 5 entries with required fields", () => {
  assert.equal(BUCKETS.length, 5);
  for (const b of BUCKETS) {
    assert.ok(b.id, `${b.id} has id`);
    assert.ok(b.icon, `${b.id} has icon`);
    assert.ok(b.label, `${b.id} has label`);
    assert.ok(Array.isArray(b.tabs) && b.tabs.length > 0, `${b.id} has tabs`);
    assert.ok(Array.isArray(b.tabLabels) && b.tabLabels.length > 0, `${b.id} has tabLabels`);
  }
});

test("app.js imports initMobileNav and syncMobileNavToTab", () => {
  const src = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(src, /from "\.\/lib\/mobileNav\.js"/, "imports mobileNav module");
  assert.match(src, /initMobileNav/, "calls initMobileNav");
  assert.match(src, /syncMobileNavToTab/, "calls syncMobileNavToTab");
  assert.match(src, /_activateTabAndSyncNav/, "wraps activateTab to sync mobile nav");
});

test("game.html has mobile-bottom-nav and mobile-subtab-strip elements", () => {
  const html = fs.readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  assert.match(html, /id="mobileBottomNav"/, "has bottom nav element");
  assert.match(html, /id="mobileSubtabStrip"/, "has sub-tab strip element");
  assert.match(html, /data-bucket="gameday"/, "has gameday bucket");
  assert.match(html, /data-bucket="roster"/, "has roster bucket");
  assert.match(html, /data-bucket="builds"/, "has builds bucket");
  assert.match(html, /data-bucket="history"/, "has history bucket");
  assert.match(html, /data-bucket="config"/, "has config bucket");
});

test("styles.css has 100dvh for mobile viewport fix", () => {
  const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /100dvh/, "uses 100dvh for dynamic viewport height");
  assert.match(css, /mobile-bottom-nav/, "has mobile-bottom-nav styles");
  assert.match(css, /mobile-subtab-strip/, "has mobile-subtab-strip styles");
  assert.match(css, /mbn-bucket/, "has mbn-bucket styles");
  assert.match(css, /mbn-subtab/, "has mbn-subtab styles");
  assert.match(css, /safe-area-inset-bottom/, "handles iOS safe area");
});
