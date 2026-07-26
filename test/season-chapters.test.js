import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeasonChapter, SEASON_CHAPTER_SCHEMA_VERSION } from "../public/lib/seasonChapters.js";
import { buildThreeHorizonBlueprint } from "../public/lib/franchiseArchitecture.js";

function dashboard(overrides = {}) {
  return {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 1,
    gmCommitments: { active: [] },
    ...overrides
  };
}

test("season chapter transitions are deterministic across the live calendar", () => {
  assert.equal(buildSeasonChapter(dashboard({ currentWeek: 2 })).id, "foundation");
  assert.equal(buildSeasonChapter(dashboard({ currentWeek: 6 })).id, "identity-test");
  assert.equal(buildSeasonChapter(dashboard({ currentWeek: 10 })).id, "deadline-pressure");
  assert.equal(buildSeasonChapter(dashboard({ currentWeek: 13 })).id, "separation");
  assert.equal(buildSeasonChapter(dashboard({ currentWeek: 17 })).id, "playoff-push");
  assert.equal(buildSeasonChapter(dashboard({ phase: "postseason", currentWeek: 19 })).id, "postseason");
  assert.equal(buildSeasonChapter(dashboard({ phase: "season-awards", currentWeek: 19 })).id, "season-reckoning");
});

test("opening contract and active deadline promise remain exact source authorities", () => {
  const opening = buildSeasonChapter(dashboard({
    currentWeek: 1,
    openingContractProgress: {
      status: "active",
      nextAction: "Play the opening week.",
      steps: [{ label: "Opening Week", complete: false }]
    }
  }));
  assert.equal(opening.id, "opening-contract");
  assert.equal(opening.nextCall, "Play the opening week.");

  const deadline = buildSeasonChapter(dashboard({
    currentWeek: 10,
    gmCommitments: { active: [{ id: "C1", label: "Acquire a starter", deadlineWeek: 11 }] }
  }));
  assert.match(deadline.title, /Acquire a starter/);
  assert.match(deadline.nextCall, /Week 11/);
  assert.equal(deadline.schemaVersion, SEASON_CHAPTER_SCHEMA_VERSION);
  assert.match(deadline.disclaimer, /do not predict/i);
});

test("Week Room and return digest consume one season chapter authority", () => {
  const horizons = buildThreeHorizonBlueprint({ dashboard: dashboard({ currentWeek: 10 }) });
  const season = horizons.find((entry) => entry.id === "season");
  assert.equal(season.chapter.id, "deadline-pressure");
  assert.equal(season.milestone, season.chapter.nextCall);

  const architecture = readFileSync(new URL("../public/lib/franchiseArchitecture.js", import.meta.url), "utf8");
  const digest = readFileSync(new URL("../public/lib/returnDigest.js", import.meta.url), "utf8");
  assert.match(architecture, /buildSeasonChapter/);
  assert.match(digest, /seasonChapter: buildSeasonChapter/);
  assert.match(digest, /chapterLine/);
});
