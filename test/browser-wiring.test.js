import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("app shell wires share-card and newsletter through the lazy export island", () => {
  const appSource = read("../public/app.js");
  const gameSource = read("../public/game.html");
  const islandSource = read("../public/lib/uiIslands.js");

  assert.equal(appSource.includes('from "./lib/franchiseNewsletter.js"'), false);
  assert.equal(appSource.includes('from "./lib/leagueStoryExport.js"'), false);
  assert.ok(islandSource.includes('import("./franchiseNewsletter.js")'));
  assert.ok(islandSource.includes('import("./leagueStoryExport.js")'));
  assert.ok(appSource.includes("leagueStoryCardBtn"));
  assert.ok(appSource.includes('await loadUiIsland("exports")'));
  assert.ok(appSource.includes("exportsIsland.story.downloadLeagueStory(story)"));
  assert.ok(gameSource.includes('id="leagueStoryCardBtn"'));
  assert.ok(appSource.includes("exportsIsland.newsletter.generateFranchiseNewsletter(state)"));
  const contractLoad = appSource.indexOf("await loadContractsTeam();");
  assert.ok(contractLoad >= 0);
  assert.ok(appSource.indexOf("renderCapCasualtyPanel();", contractLoad) > contractLoad);
  assert.equal(appSource.includes("await loadContracts();"), false);
});
test("news ticker renderer targets the actual game markup", () => {
  const overviewSource = read("../public/lib/tabOverview.js");
  const gameHtml = read("../public/game.html");

  assert.match(gameHtml, /id="newsTickerContent"/);
  assert.match(overviewSource, /getElementById\("newsTickerContent"\)/);
  assert.doesNotMatch(overviewSource, /news-ticker-track/);
});

test("commissioner browser wiring uses local runtime payload contract", () => {
  const appSource = read("../public/app.js");
  const settingsSource = read("../public/lib/tabSettings.js");

  assert.match(appSource, /commissionerId/);
  assert.match(appSource, /controlledTeamId/);
  assert.match(appSource, /body: \{ userId, displayName: userId, controlledTeamId \}/);
  assert.doesNotMatch(appSource, /body: \{ lobbyId, gmId, displayName: gmId, teamId: gmId \}/);
  assert.match(settingsSource, /lobby\.leagueId/);
  assert.match(settingsSource, /lobby\.gateStatus/);
  assert.match(settingsSource, /p\.status === "ready"/);
});
test("advance-week browser wiring sends selected GM decision choice", () => {
  const appSource = read("../public/app.js");
  const engagementSource = read("../public/lib/engagementFeatures.js");
  const composerSource = read("../public/lib/weeklyPlanComposer.js");
  const gameFlowSource = read("../public/lib/gameFlow.js");

  assert.match(engagementSource, /decisionId: active\.id/);
  assert.match(engagementSource, /choiceId: choice/);
  assert.match(engagementSource, /occurrenceKey: active\.occurrenceKey/);
  assert.match(appSource, /collectDecision: checkAndShowGmDecision/);
  assert.match(appSource, /presetDecisionChoice: gmDecisionChoice \|\| state\.mobilePendingDecisionChoice/);
  assert.match(composerSource, /if \(decision\?\.status === "deferred"\)/);
  assert.match(composerSource, /body\.gmDecisionChoice = decisionChoice/);
  assert.match(appSource, /response\.gmDecision\?\.applied/);
  assert.match(appSource, /key: "franchise-simulation"/);
  assert.match(appSource, /controls: \["advanceWeekBtn", "advance4WeeksBtn", "advanceSeasonBtn", "resumeSimBtn"\]/);
  assert.match(appSource, /standingTacticFromDashboard/);
  assert.match(appSource, /standingReinforcementEvidence/);
  assert.match(gameFlowSource, /options\.initialChoice/);
});

test("Rehab Command Center is visible, actionable, and routed through both runtimes", () => {
  const appSource = read("../public/app.js");
  const overviewSource = read("../public/lib/tabOverview.js");
  const gameHtml = read("../public/game.html");
  const localRuntime = read("../src/app/api/localApiRuntime.js");
  const serverRuntime = read("../src/server.js");

  assert.match(gameHtml, /id="rehabCommandCenter"/);
  assert.match(overviewSource, /export function renderRehabCommandCenter/);
  assert.match(overviewSource, /Medical Strategy · Modeled, not clinical/);
  assert.match(appSource, /api\("\/api\/injuries\/rehab-plan"/);
  assert.match(localRuntime, /pathname === "\/api\/injuries\/rehab-plan"/);
  assert.match(serverRuntime, /url\.pathname === "\/api\/injuries\/rehab-plan"/);
});
test("first-run tutorial modal uses the shared focus trap", () => {
  const tutorialSource = read("../public/lib/tutorialCampaign.js");

  assert.match(tutorialSource, /import \{ closeModal, openModal \} from "\.\/modalManager\.js"/);
  assert.match(tutorialSource, /openModal\(overlay, \{ onClose: \(\) => dismissTutorial\(onSkip\) \}\)/);
  assert.match(tutorialSource, /markTutorialSeen\(scope, storage, "deferred"\);/, "dismiss records deferral, not completion");
  assert.match(tutorialSource, /getTutorialState\(scope, storage\) !== "done"/, "completed contracts are never downgraded");
  assert.match(tutorialSource, /await onComplete\?\.[\s\S]*markTutorialSeen\(scope, storage\);[\s\S]*renderReceipt\(receipt\)/);
});
test("first-run tutorial styles are injected before mounting onboarding", () => {
  const appSource = read("../public/app.js");

  assert.match(appSource, /import\("\.\/lib\/tutorialCampaign\.js"\)/);
  assert.match(appSource, /import\("\.\/lib\/betaFeedback\.js"\)/);
  assert.match(appSource, /injectTutorialStyles\(\);[\s\S]*?launchOpeningContract\(\{ auto: true \}\)/);
  assert.match(appSource, /scope: state\.dashboard/);
  assert.match(appSource, /completed: Boolean\(state\.dashboard\?\.startScenarioReceipt\)/);
});

test("Return Digest exposes one exact source-derived Season continuation", () => {
  const appSource = read("../public/app.js");
  const digestSource = read("../public/lib/returnDigest.js");
  const navigationSource = read("../public/lib/exactSurfaceNavigation.js");
  assert.match(digestSource, /data-action="continue-chapter"/);
  assert.match(digestSource, /onContinueChapter\?\.\(chapterAction\)/);
  assert.match(appSource, /onContinueChapter: continueSeasonChapter/);
  assert.match(appSource, /return navigateToExactSurface\(action/);
  assert.match(navigationSource, /await Promise\.resolve\(activateTab\(targetTab\)\)/);
  assert.match(navigationSource, /documentRef\?\.getElementById\?\.\(targetId\)/);
  assert.match(appSource, /the exact .* panel is unavailable/);
});
test("game flow modals use the shared focus trap", () => {
  const gameFlowSource = read("../public/lib/gameFlow.js");
  const engagementSource = read("../public/lib/engagementFeatures.js");
  const draftSource = read("../public/lib/tabDraft.js");
  const settingsSource = read("../public/lib/tabSettings.js");
  const contractsSource = read("../public/lib/tabContracts.js");
  const appSource = read("../public/app.js");

  assert.match(gameFlowSource, /import \{ closeModal, openModal \} from "\.\/modalManager\.js"/);
  assert.match(gameFlowSource, /openModal\(modal, \{ onClose: closeSeasonReviewModal \}\)/);
  assert.match(gameFlowSource, /openModal\(modal, \{ onClose: \(\) => finish\(null\) \}\)/);
  assert.match(appSource, /closeSeasonReviewModal/);

  assert.match(engagementSource, /import \{ closeModal, openModal \} from "\.\/modalManager\.js"/);
  assert.match(engagementSource, /openModal\(drawer, \{ onClose: closeInbox \}\)/);
  assert.match(engagementSource, /openModal\(modal, \{ onClose: closeFranchiseMomentModal \}\)/);
  assert.match(engagementSource, /openModal\(modal, \{ onClose: dismissGmDecision \}\)/);

  assert.match(draftSource, /import \{ closeModal, openModal \} from "\.\/modalManager\.js"/);
  assert.match(draftSource, /openModal\(modal, \{/);
  assert.match(settingsSource, /openModal\(modal, \{ onClose: closeShortcutsModal \}\)/);
  assert.match(contractsSource, /openModal\(modal, \{ onClose: closeAgentModal \}\)/);
});

test("game modal markup exposes dialog semantics", () => {
  const gameHtml = read("../public/game.html");

  assert.match(gameHtml, /id="seasonReviewModal" hidden role="dialog" aria-modal="true"/);
  assert.match(gameHtml, /id="halftimeAdjustModal" hidden role="dialog" aria-modal="true" aria-labelledby="halftimeAdjustTitle"/);
  assert.match(gameHtml, /id="halftimeAdjustTitle">Pre-Game Tactical Brief/);
  assert.match(gameHtml, /id="draftPickRevealModal" hidden role="dialog" aria-modal="true"/);
  assert.match(gameHtml, /id="franchiseMomentModal" hidden role="dialog" aria-modal="true"/);
});
