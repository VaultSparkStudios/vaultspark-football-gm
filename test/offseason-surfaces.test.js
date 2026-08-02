/**
 * Session 67 — the player-facing half of the offseason.
 *
 * Session 64's lesson was that an engine change can ship green while its
 * player-facing half is dead (the matchup-edge receipt rendered nothing because
 * the dashboard projection dropped the fields it needed). These tests drive the
 * browser modules against a real session's dashboard, so the free-agency window
 * and the draft board's pick provenance cannot ship invisible.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildSeasonChapter } from "../public/lib/seasonChapters.js";
import { buildDraftPressureModel } from "../public/lib/tabDraft.js";
import { createSession } from "../src/runtime/bootstrap.js";

function sessionAtStage(stage, { seed = 4242 } = {}) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });
  let guard = 0;
  while (session.phase !== "offseason" && guard < 12) {
    session.advanceWeek();
    guard += 1;
  }
  for (let i = 0; i < 16; i += 1) {
    const pipeline = session.getOffseasonPipeline();
    if (pipeline.completed || pipeline.stage === stage) break;
    if (pipeline.stage === "draft" && session.getDraftAuthority()?.userActionRequired) {
      session.runCpuDraft({ untilUserPick: false });
    }
    session.advanceOffseasonPipeline();
  }
  return session;
}

test("the dashboard publishes the free-agency window the browser reads", () => {
  const session = sessionAtStage("free-agency");
  session.advanceOffseasonPipeline();
  const dashboard = session.getDashboardState();

  assert.ok(dashboard.freeAgencyWindow, "the window must reach the browser at all");
  assert.equal(dashboard.freeAgencyWindow.open, true);
  assert.equal(dashboard.freeAgencyWindow.totalWaves, 3);
  assert.ok(dashboard.freeAgencyWindow.premiumAvailable > 0);
  assert.ok(dashboard.freeAgencyWindow.poolSize >= dashboard.freeAgencyWindow.premiumAvailable);
});

test("the season chapter routes the GM to the open market with real counts", () => {
  const session = sessionAtStage("free-agency");
  session.advanceOffseasonPipeline();
  const dashboard = session.getDashboardState();
  const chapter = buildSeasonChapter(dashboard);

  assert.equal(chapter.id, "free-agency-window");
  assert.equal(chapter.label, "Free Agency");
  assert.equal(chapter.targetTab, "faTab");
  assert.match(chapter.title, /Wave 1 of 3/);
  assert.match(chapter.title, new RegExp(`${dashboard.freeAgencyWindow.premiumAvailable} premium`));
  assert.ok(chapter.evidence.includes(`premium:${dashboard.freeAgencyWindow.premiumAvailable}`));
});

test("free agency opening announces itself in the inbox", () => {
  const session = sessionAtStage("free-agency");
  session.advanceOffseasonPipeline();
  const opened = (session.league.newsLog || []).find((row) => row.type === "free-agency-open");
  assert.ok(opened, "a market the GM cannot see is not a market");
  assert.match(opened.headline, /Free agency is open/);
});

test("a closed window hands the chapter back to the generic offseason call", () => {
  const session = sessionAtStage("draft");
  const dashboard = session.getDashboardState();
  assert.equal(dashboard.freeAgencyWindow.open, false);
  const chapter = buildSeasonChapter(dashboard);
  assert.notEqual(chapter.id, "free-agency-window");
});

test("the draft war room names a pick that was traded for", () => {
  const session = createSession({ seed: 4242, startYear: 2026, controlledTeamId: "BUF" });
  session.ensureDraftPickAssets();
  const first = session.league.draftPicks.find(
    (pick) => pick.year === 2027 && pick.round === 1 && pick.originalTeamId === "BUF"
  );
  assert.ok(first);
  first.ownerTeamId = "MIA";

  const { slots } = session.buildDraftOrder(2027);
  const acquiredIndex = slots.findIndex((slot) => slot.acquired);
  assert.ok(acquiredIndex >= 0);

  const model = buildDraftPressureModel({
    controlledTeamId: "MIA",
    scoutingBoard: [],
    rosterNeeds: [{ position: "WR", delta: -2 }],
    draft: {
      currentPick: acquiredIndex + 1,
      totalPicks: slots.length,
      order: slots.map((slot) => slot.teamId),
      slots,
      available: [{ id: "p1", name: "Field Tilt", position: "WR", scouting: { rank: 4, projectedRound: 1 } }]
    }
  });

  assert.ok(
    model.chips.some((chip) => chip === "Acquired from BUF"),
    `war room must show pick provenance, saw ${JSON.stringify(model.chips)}`
  );
});

test("the draft war room names a compensatory pick", () => {
  const slots = [
    { pickId: "COMP-2027-BUF-6-1", round: 6, slot: 1001, teamId: "BUF", originalTeamId: "BUF", acquired: false, compensatory: true }
  ];
  const model = buildDraftPressureModel({
    controlledTeamId: "BUF",
    scoutingBoard: [],
    rosterNeeds: [],
    draft: {
      currentPick: 1,
      totalPicks: 1,
      order: ["BUF"],
      slots,
      available: [{ id: "p1", name: "Late Value", position: "TE", scouting: { rank: 190, projectedRound: 6 } }]
    }
  });
  assert.ok(model.chips.some((chip) => chip === "Compensatory pick (BUF)"));
});

test("an unfilled controlled roster becomes an actionable chapter, not silence", () => {
  const dashboard = {
    phase: "offseason",
    currentWeek: 0,
    currentYear: 2027,
    offseasonPipeline: { stage: "camp-cuts" },
    freeAgencyWindow: { open: false },
    rosterShortfall: { teamId: "BUF", positions: [{ position: "OL", missing: 2 }] }
  };
  const chapter = buildSeasonChapter(dashboard);
  assert.equal(chapter.id, "roster-shortfall");
  assert.match(chapter.title, /2× OL/);
  assert.equal(chapter.targetTab, "faTab");
});
