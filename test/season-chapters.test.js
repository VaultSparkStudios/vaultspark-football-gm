import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSeasonChapter,
  buildSeasonThesisLedger,
  SEASON_CHAPTER_SCHEMA_VERSION,
  SEASON_THESIS_SCHEMA_VERSION
} from "../public/lib/seasonChapters.js";
import { buildThreeHorizonBlueprint } from "../public/lib/franchiseArchitecture.js";

function dashboard(overrides = {}) {
  return {
    phase: "regular-season",
    currentYear: 2026,
    currentWeek: 1,
    gmCommitments: { active: [] },
    startScenarioReceipt: {
      receiptId: "opening-2026-BUF-v1",
      selections: { identity: "trench-builder" },
      effects: { identity: { id: "trench-builder", label: "Build through the trenches" } }
    },
    tacticalFilmLedger: [],
    architectLedger: [],
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

test("season thesis keeps one exact Opening Contract authority across every season chapter", () => {
  const cases = [
    [2, "foundation"],
    [6, "identity-test"],
    [10, "deadline-pressure"],
    [13, "separation"],
    [17, "playoff-push"]
  ];
  for (const [currentWeek, checkpointId] of cases) {
    const result = buildSeasonChapter(dashboard({ currentWeek }));
    assert.equal(result.seasonThesis.thesisId, "opening-2026-BUF-v1:season:2026");
    assert.equal(result.seasonThesis.checkpointId, checkpointId);
    assert.ok(result.evidence.includes("thesis:opening-2026-BUF-v1:season:2026"));
  }
  const postseason = buildSeasonChapter(dashboard({ phase: "postseason", currentWeek: 19 }));
  const reckoning = buildSeasonChapter(dashboard({ phase: "season-awards", currentWeek: 19 }));
  assert.equal(postseason.seasonThesis.checkpointId, "postseason");
  assert.equal(reckoning.seasonThesis.checkpointId, "season-reckoning");
  assert.match(reckoning.seasonThesis.reckoning.disclaimer, /does not claim.*caused/i);
});

test("season thesis binds bounded receipts without inventing causal evidence", () => {
  const result = buildSeasonThesisLedger(dashboard({
    currentWeek: 10,
    tacticalFilmLedger: [
      { id: "film-w2", year: 2026, week: 2, tactic: "run-heavy", aligned: true },
      { id: "film-w6", year: 2026, week: 6, tactic: "pass-heavy", aligned: false }
    ],
    architectLedger: [{ id: "architect-w7", year: 2026, week: 7 }],
    gmCommitments: {
      active: [{ id: "promise-w10", createdYear: 2026, createdWeek: 10 }],
      latestReceipt: { id: "promise-receipt", year: 2026, status: "active" }
    }
  }));
  assert.equal(result.schemaVersion, SEASON_THESIS_SCHEMA_VERSION);
  assert.equal(result.status, "installing");
  assert.deepEqual(result.checkpoints.find((row) => row.id === "foundation").evidenceIds, ["film-w2"]);
  assert.deepEqual(
    result.checkpoints.find((row) => row.id === "identity-test").evidenceIds,
    ["film-w6", "architect-w7"]
  );
  assert.deepEqual(
    result.checkpoints.find((row) => row.id === "deadline-pressure").evidenceIds,
    ["promise-w10", "promise-receipt"]
  );
  assert.match(result.reckoning.summary, /2 executed tactical calls/);
  assert.match(result.reckoning.disclaimer, /does not claim.*caused/i);
});

test("missing Opening Contract receipt stays visibly unproven", () => {
  const input = dashboard({ startScenarioReceipt: null, currentWeek: 6 });
  const ledger = buildSeasonThesisLedger(input);
  const result = buildSeasonChapter(input);
  assert.equal(ledger.available, false);
  assert.equal(ledger.thesisId, null);
  assert.equal(ledger.status, "unproven");
  assert.equal(result.seasonThesis.thesisId, null);
  assert.match(result.detail, /unproven/i);
  assert.ok(!result.evidence.some((entry) => entry.startsWith("thesis:")));
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
  assert.match(digest, /const seasonChapter = buildSeasonChapter/);
  assert.match(digest, /chapterLine/);
});

test("future phase evidence cannot certify postseason or season reckoning", () => {
  const result = buildSeasonThesisLedger(dashboard({
    currentWeek: 3,
    tacticalFilmLedger: [
      { id: "future-film", year: 2026, week: 20, aligned: true }
    ]
  }));
  assert.equal(result.status, "declared");
  assert.equal(result.checkpoints.find((row) => row.id === "postseason").status, "upcoming");
  assert.equal(result.checkpoints.find((row) => row.id === "season-reckoning").status, "upcoming");
});

test("contested receipts install but never establish a season thesis", () => {
  const result = buildSeasonThesisLedger(dashboard({
    currentWeek: 4,
    tacticalFilmLedger: [1, 2, 3].map((week) => ({
      id: `failed-w${week}`,
      year: 2026,
      week,
      aligned: false
    }))
  }));
  const foundation = result.checkpoints.find((row) => row.id === "foundation");
  assert.equal(result.status, "installing");
  assert.equal(foundation.status, "evidenced-contested");
  assert.deepEqual(foundation.alignedEvidenceIds, []);
  assert.deepEqual(foundation.contestedEvidenceIds, ["failed-w1", "failed-w2", "failed-w3"]);
  assert.equal(result.receipts.alignedTargets, 0);
  assert.equal(result.receipts.contestedTargets, 3);
});

test("established requires aligned evidence across eligible checkpoints", () => {
  const input = dashboard({
    currentWeek: 7,
    tacticalFilmLedger: [
      { id: "aligned-w2", year: 2026, week: 2, aligned: true },
      { id: "aligned-w3", year: 2026, week: 3, aligned: true },
      { id: "aligned-w6", year: 2026, week: 6, aligned: true }
    ]
  });
  const result = buildSeasonThesisLedger(input);
  assert.equal(result.status, "established");
  assert.equal(result.checkpoints.find((row) => row.id === "foundation").status, "evidenced-aligned");
  assert.equal(result.checkpoints.find((row) => row.id === "identity-test").status, "evidenced-aligned");
  assert.deepEqual(buildSeasonThesisLedger(JSON.parse(JSON.stringify(input))), result, "restore preserves exact evidence semantics");
});
