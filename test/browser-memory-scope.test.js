import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../public/lib/appState.js";
import {
  readTradeBlockIds,
  saveTradeBlockIds,
  syncTradeBlockScope
} from "../public/lib/appCore.js";
import {
  hasTutorialBeenSeen,
  markTutorialSeen,
  resetTutorial,
  tutorialSeenKey
} from "../public/lib/tutorialCampaign.js";
import {
  buildReturnChapterAction,
  buildReturnDigest,
  readLastVisit,
  writeLastVisit
} from "../public/lib/returnDigest.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function dashboard(franchiseId, overrides = {}) {
  return {
    franchiseId,
    controlledTeamId: "BUF",
    controlledTeam: { abbrev: "BUF", name: "Buffalo" },
    startYear: 2026,
    currentYear: 2026,
    currentWeek: 6,
    phase: "regular-season",
    latestStandings: [{ team: "BUF", wins: 4, losses: 2 }],
    ...overrides
  };
}

test("Opening Contract seen state belongs only to its franchise", () => {
  const storage = new MemoryStorage();
  const first = dashboard("fa-first-BUF");
  const second = dashboard("fa-second-BUF");
  assert.notEqual(tutorialSeenKey(first), tutorialSeenKey(second));
  markTutorialSeen(first, storage);
  assert.equal(hasTutorialBeenSeen(first, storage), true);
  assert.equal(hasTutorialBeenSeen(second, storage), false);
  resetTutorial(first, storage);
  assert.equal(hasTutorialBeenSeen(first, storage), false);
});

test("Return Digest rejects unknown or cross-franchise memory", () => {
  const storage = new MemoryStorage();
  const first = dashboard("fa-first-BUF");
  const second = dashboard("fa-second-BUF");
  const now = 1_000_000_000_000;
  writeLastVisit(first, {
    timestamp: now - 10_000,
    year: 2026,
    week: 5,
    record: { wins: 3, losses: 2 }
  }, storage);
  const prior = readLastVisit(first, storage);
  assert.ok(prior);
  assert.equal(readLastVisit(second, storage), null);
  assert.equal(buildReturnDigest(second, prior, now), null);
  assert.equal(buildReturnDigest(first, { ...prior, scope: undefined }, now), null);
});

test("trade targets restore only within their owning franchise", () => {
  const storage = new MemoryStorage();
  const first = dashboard("fa-first-BUF");
  const second = dashboard("fa-second-BUF");
  const previous = {
    dashboard: state.dashboard,
    tradeBlockIds: state.tradeBlockIds,
    tradeBlockScope: state.tradeBlockScope
  };
  try {
    state.dashboard = first;
    state.tradeBlockScope = null;
    saveTradeBlockIds(["P1", "P1", "P2"], first, storage);
    assert.deepEqual(readTradeBlockIds(first, storage), ["P1", "P2"]);

    syncTradeBlockScope(second, storage);
    assert.deepEqual(state.tradeBlockIds, []);
    saveTradeBlockIds(["P9"], second, storage);

    syncTradeBlockScope(first, storage);
    assert.deepEqual(state.tradeBlockIds, ["P1", "P2"]);
    syncTradeBlockScope(second, storage);
    assert.deepEqual(state.tradeBlockIds, ["P9"]);
  } finally {
    state.dashboard = previous.dashboard;
    state.tradeBlockIds = previous.tradeBlockIds;
    state.tradeBlockScope = previous.tradeBlockScope;
  }
});

test("Return Digest exposes the exact live chapter target", () => {
  const action = buildReturnChapterAction({
    seasonChapter: {
      id: "deadline-pressure",
      label: "Deadline Pressure",
      targetTab: "transactionsTab",
      targetId: "tradeDeadlineFrenzy"
    }
  });
  assert.deepEqual(action, {
    kind: "continue-season-chapter",
    label: "Continue Deadline Pressure",
    targetTab: "transactionsTab",
    targetId: "tradeDeadlineFrenzy",
    chapterId: "deadline-pressure"
  });
});
