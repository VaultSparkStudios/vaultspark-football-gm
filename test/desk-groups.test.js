import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { state } from "../public/lib/appState.js";
import { deskGroupOpen, renderSchedule, renderStatLeadersStrip, wireDeskGroups } from "../public/lib/tabOverview.js";
import { navigateToExactSurface } from "../public/lib/exactSurfaceNavigation.js";

/**
 * The Desk is four groups: "This week" (always open) and three collapsed
 * <details> — "Your club", "The league", "Your career". A collapsed group skips
 * its heavier renderers until opened, and the open/closed choice is remembered.
 */

const gameHtml = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
const desk = gameHtml.slice(gameHtml.indexOf('<section id="overviewTab"'), gameHtml.indexOf('<section id="rosterTab"'));

function groupMarkup(id) {
  const start = desk.indexOf(`id="${id}"`);
  assert.ok(start > 0, `${id} exists on the Desk`);
  const next = ["deskGroupWeek", "deskGroupClub", "deskGroupLeague", "deskGroupCareer"]
    .map((other) => desk.indexOf(`id="${other}"`))
    .filter((index) => index > start)
    .sort((a, b) => a - b)[0];
  return desk.slice(start, next ?? desk.length);
}

test("the Desk has four headed groups in order, and only the first starts open", () => {
  const headings = [...desk.matchAll(/class="desk-group-title">([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(headings, ["This week", "Your club", "The league", "Your career"]);
  assert.match(desk, /<section id="deskGroupWeek" class="desk-group"/);
  for (const [id, name] of [["deskGroupClub", "club"], ["deskGroupLeague", "league"], ["deskGroupCareer", "career"]]) {
    const tag = desk.match(new RegExp(`<details id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `${id} is a <details>`);
    assert.match(tag, new RegExp(`data-desk-group="${name}"`));
    assert.doesNotMatch(tag, /\sopen\b/, `${id} starts collapsed`);
  }
});

test("every Desk panel that existed before the regrouping is still on the Desk", () => {
  const ids = [
    "overviewTeamSpotlight", "weeklyPlanSummaryText", "situationalCallsCard", "openingContractCard", "pressRoomCard",
    "teamSelect", "refreshBtn", "phaseCard", "yearCard", "seasonsCard", "capCard", "deadCapCard", "ovrCard",
    "gmLegacyCardWrap", "gmLegacyGradeVal", "gmLegacyCard", "gmLegacyLabel", "gmMasteryPortfolio", "gmPersonaTier",
    "gmReputationLabel", "overviewPulseBar", "franchiseCommandCenter", "frontOfficeAdvisorPanel",
    "frontOfficeAdvisorContent", "firstSeasonContract", "firstSeasonContractList", "trophyRoadPanel",
    "trophyRoadContent", "franchiseArchitecture", "franchiseArchitectureContent", "tacticalFilmRoom",
    "gmCommitmentBoard", "seasonPreviewPanel", "prevScheduleWeekBtn", "nextScheduleWeekBtn", "scheduleWeekText",
    "rivalryStrip", "rivalCoachIntelContainer", "scheduleTable", "weeklyPredictionsPanel", "needsTable",
    "injuryOverlayCard", "injuryTable", "rehabCommandCenter", "narrativePanel", "narrativeEventsFeed",
    "ownerUltimatumBanner", "fanSentimentCard", "statLeadersStrip", "tradeDeadlinePanel", "tradeDeadlineFrenzy",
    "coGmBriefPanel", "coGmBriefContent", "coGmCopyBtn", "coGmDownloadBtn"
  ];
  for (const id of ids) {
    assert.equal(desk.split(`id="${id}"`).length - 1, 1, `#${id} appears exactly once on the Desk`);
  }
});

test("each group holds the panels its heading promises", () => {
  const placement = {
    deskGroupWeek: ["franchiseCommandCenter", "frontOfficeAdvisorPanel", "weeklyPlanSummaryText", "openingContractCard", "situationalCallsCard", "tradeDeadlinePanel", "firstSeasonContract", "tacticalFilmRoom", "coGmBriefPanel"],
    deskGroupClub: ["needsTable", "capCard", "deadCapCard", "ownerUltimatumBanner", "fanSentimentCard", "injuryTable", "narrativePanel", "gmCommitmentBoard"],
    deskGroupLeague: ["scheduleTable", "statLeadersStrip", "seasonPreviewPanel", "weeklyPredictionsPanel"],
    deskGroupCareer: ["gmLegacyCardWrap", "trophyRoadPanel", "franchiseArchitecture"]
  };
  for (const [group, ids] of Object.entries(placement)) {
    const markup = groupMarkup(group);
    for (const id of ids) assert.ok(markup.includes(`id="${id}"`), `#${id} belongs to ${group}`);
  }
  assert.match(groupMarkup("deskGroupCareer"), /data-desk-tab-link="gmProfileTab" hidden/, "the GM Profile link is hidden until the tab is found at runtime");
  assert.match(groupMarkup("deskGroupLeague"), /data-desk-tab-link="calendarTab" hidden/);
});

test("no Desk panel waits behind a manual Load button", () => {
  assert.doesNotMatch(desk, /<button[^>]*>\s*Load\b/);
});

function fakeGroup(name, open = false) {
  const listeners = [];
  return {
    tagName: "DETAILS",
    dataset: { deskGroup: name },
    open,
    addEventListener(type, handler) { if (type === "toggle") listeners.push(handler); },
    toggle(next) { this.open = next; for (const handler of listeners) handler(); }
  };
}

async function withDesk({ storage, groups, links = [], tabs = {} }, run) {
  const previous = { document: globalThis.document, storage: Object.getOwnPropertyDescriptor(globalThis, "localStorage"), dashboard: state.dashboard };
  const elements = new Map();
  const byId = { club: "deskGroupClub", league: "deskGroupLeague", career: "deskGroupCareer" };
  for (const group of groups) elements.set(byId[group.dataset.deskGroup], group);
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { id, hidden: false, textContent: "", innerHTML: "", untouched: true });
      return elements.get(id);
    },
    querySelector: (selector) => tabs[selector] || null,
    querySelectorAll: (selector) => (selector === "details[data-desk-group]" ? groups : selector === "[data-desk-tab-link]" ? links : [])
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  try {
    return await run(elements);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.storage) Object.defineProperty(globalThis, "localStorage", previous.storage); else delete globalThis.localStorage;
    state.dashboard = previous.dashboard;
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), values };
}

test("the open/closed choice is restored and remembered per browser", async () => {
  const storage = memoryStorage({ "franchise-architect-desk-groups:v1": JSON.stringify({ league: true }) });
  const groups = [fakeGroup("club"), fakeGroup("league"), fakeGroup("career")];
  await withDesk({ storage, groups }, () => {
    state.dashboard = null;
    wireDeskGroups();
    assert.deepEqual(groups.map((group) => group.open), [false, true, false], "only the remembered group reopens");
    assert.equal(deskGroupOpen("club"), false);
    assert.equal(deskGroupOpen("league"), true);
    groups[0].toggle(true);
    groups[1].toggle(false);
    assert.deepEqual(JSON.parse(storage.values.get("franchise-architect-desk-groups:v1")), { league: false, club: true });
    wireDeskGroups();
    groups[2].toggle(true);
    assert.equal(JSON.parse(storage.values.get("franchise-architect-desk-groups:v1")).career, true, "wiring twice does not double-bind or reset");
  });
});

test("blocked storage leaves every group collapsed and still lets them open", async () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const groups = [fakeGroup("club"), fakeGroup("league"), fakeGroup("career")];
  await withDesk({ storage, groups }, () => {
    state.dashboard = null;
    assert.doesNotThrow(() => wireDeskGroups());
    assert.deepEqual(groups.map((group) => group.open), [false, false, false]);
    assert.doesNotThrow(() => groups[2].toggle(true));
    assert.equal(deskGroupOpen("career"), true);
  });
});

test("a link to another tab shows only when that tab exists", async () => {
  let clicks = 0;
  const profile = { dataset: { deskTabLink: "gmProfileTab" }, hidden: true, addEventListener(type, handler) { this.click = handler; } };
  const missing = { dataset: { deskTabLink: "noSuchTab" }, hidden: true, addEventListener() { throw new Error("must not bind a dead link"); } };
  const tabs = { '.menu-btn[data-tab="gmProfileTab"]': { click() { clicks += 1; } } };
  await withDesk({ storage: memoryStorage(), groups: [fakeGroup("career")], links: [profile, missing], tabs }, () => {
    wireDeskGroups();
    assert.equal(profile.hidden, false);
    assert.equal(missing.hidden, true, "a link whose tab is absent stays hidden");
    profile.click();
    assert.equal(clicks, 1);
  });
});

test("a collapsed league group skips the schedule and stat-leader work", async () => {
  const groups = [fakeGroup("league", false)];
  await withDesk({ storage: memoryStorage(), groups }, async (elements) => {
    state.dashboard = { currentWeek: 3, controlledTeamId: "BUF" };
    renderSchedule();
    assert.equal(elements.has("scheduleWeekText"), false, "a collapsed group does not touch the schedule");
    await renderStatLeadersStrip();
    assert.equal(elements.get("statLeadersStrip").untouched, true, "and makes no stat-leaders request");
    assert.equal(elements.get("statLeadersStrip").innerHTML, "");
  });
});

test("a missing group counts as open, so older markup and test documents still render", async () => {
  await withDesk({ storage: memoryStorage(), groups: [] }, () => {
    assert.equal(deskGroupOpen("club"), true);
    assert.equal(deskGroupOpen("league"), true);
    assert.equal(deskGroupOpen("career"), true);
  });
});

test("navigating to a panel inside a collapsed group opens the group first", async () => {
  const tabPanel = { id: "overviewTab", classList: { contains: (name) => name === "tab-panel" }, parentElement: null };
  const group = { tagName: "DETAILS", open: false, parentElement: tabPanel };
  let focused = false;
  const target = { id: "trophyRoadPanel", parentElement: group, setAttribute() {}, hasAttribute: () => false, focus() { focused = true; } };
  const result = await navigateToExactSurface({ targetTab: "overviewTab", targetId: "trophyRoadPanel" }, {
    activateTab: () => {},
    documentRef: { getElementById: (id) => (id === "trophyRoadPanel" ? target : null) },
    windowRef: {}
  });
  assert.equal(group.open, true);
  assert.equal(focused, true);
  assert.equal(result.focused, true);
});
