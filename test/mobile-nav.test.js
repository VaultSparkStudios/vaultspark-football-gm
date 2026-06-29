import test from "node:test";
import assert from "node:assert/strict";
import { sectionForTab } from "../public/lib/mobileNav.js";

test("sectionForTab maps overview to gameday", () => {
  assert.equal(sectionForTab("overviewTab"), "gameday");
});

test("sectionForTab maps statsTab to gameday", () => {
  assert.equal(sectionForTab("statsTab"), "gameday");
});

test("sectionForTab maps rosterTab to roster", () => {
  assert.equal(sectionForTab("rosterTab"), "roster");
});

test("sectionForTab maps contractsTab to roster", () => {
  assert.equal(sectionForTab("contractsTab"), "roster");
});

test("sectionForTab maps draftTab to builds", () => {
  assert.equal(sectionForTab("draftTab"), "builds");
});

test("sectionForTab maps transactionsTab to builds", () => {
  assert.equal(sectionForTab("transactionsTab"), "builds");
});

test("sectionForTab maps logTab to history", () => {
  assert.equal(sectionForTab("logTab"), "history");
});

test("sectionForTab maps historyTab to history", () => {
  assert.equal(sectionForTab("historyTab"), "history");
});

test("sectionForTab maps settingsTab to config", () => {
  assert.equal(sectionForTab("settingsTab"), "config");
});

test("sectionForTab maps rulesTab to config", () => {
  assert.equal(sectionForTab("rulesTab"), "config");
});

test("sectionForTab defaults to gameday for unknown tab", () => {
  assert.equal(sectionForTab("unknownTab"), "gameday");
});

test("sectionForTab maps all 14 known tabs to an explicit non-null section", () => {
  const expected = {
    overviewTab: "gameday", statsTab: "gameday", calendarTab: "gameday",
    rosterTab: "roster", faTab: "roster", depthTab: "roster", contractsTab: "roster",
    transactionsTab: "builds", scoutingTab: "builds", draftTab: "builds",
    logTab: "history", historyTab: "history",
    rulesTab: "config", settingsTab: "config",
  };
  for (const [tabId, expectedSection] of Object.entries(expected)) {
    assert.equal(sectionForTab(tabId), expectedSection, `${tabId} → ${expectedSection}`);
  }
});
