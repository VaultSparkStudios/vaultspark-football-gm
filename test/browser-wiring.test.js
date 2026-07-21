import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("app shell wires share-card, newsletter, and contract tools to imported functions", () => {
  const appSource = read("../public/app.js");
  const gameSource = read("../public/game.html");

  assert.match(appSource, /import \{ generateFranchiseNewsletter \} from "\.\/lib\/franchiseNewsletter\.js"/);
  assert.match(appSource, /import \{ buildLeagueStoryFromDashboard, downloadLeagueStory \} from "\.\/lib\/leagueStoryExport\.js"/);
  assert.match(appSource, /leagueStoryCardBtn/);
  assert.match(appSource, /downloadLeagueStory\(story\)/);
  assert.match(gameSource, /id="leagueStoryCardBtn"/);
  assert.match(appSource, /generateFranchiseNewsletter\(state\)/);
  assert.match(appSource, /await loadContractsTeam\(\);\s*renderCapCasualtyPanel\(\);/s);
  assert.doesNotMatch(appSource, /await loadContracts\(\);/);
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

  assert.match(engagementSource, /decisionId: active\.id/);
  assert.match(engagementSource, /choiceId: choice/);
  assert.match(engagementSource, /occurrenceKey: active\.occurrenceKey/);
  assert.match(appSource, /const gmDecisionResult = await checkAndShowGmDecision/);
  assert.match(appSource, /gmDecisionResult\.status === "deferred"/);
  assert.match(appSource, /body\.gmDecisionChoice = gmDecisionResult\.choice/);
  assert.match(appSource, /response\.gmDecision\?\.applied/);
  assert.match(appSource, /key: "franchise-simulation"/);
  assert.match(appSource, /controls: \["advanceWeekBtn", "advance4WeeksBtn", "advanceSeasonBtn", "resumeSimBtn"\]/);
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
  assert.match(tutorialSource, /openModal\(overlay, \{ onClose: \(\) => closeTutorial\(onSkip\) \}\)/);
  assert.match(tutorialSource, /closeModal\(overlay\);\s*markTutorialSeen\(\);\s*overlay\.remove\(\);/s);
});
test("first-run tutorial styles are injected before mounting onboarding", () => {
  const appSource = read("../public/app.js");

  assert.match(appSource, /import \{ injectTutorialStyles, mountTutorial \} from "\.\/lib\/tutorialCampaign\.js"/);
  assert.match(appSource, /injectTutorialStyles\(\);\s*mountTutorial\(/s);
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
