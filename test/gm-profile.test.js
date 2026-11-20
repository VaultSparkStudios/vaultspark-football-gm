import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildGmProfile } from "../public/lib/gmProfileModel.js";
import { TAB_HYDRATION_DOMAINS } from "../public/lib/tabHydration.js";
import { UI_ISLAND_MANIFEST, uiIslandForTab } from "../public/lib/uiIslands.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const game = read("../public/game.html");

// Slice to the next TAB panel, not the next <section>: panels nest sections.
function section(id) {
  const start = game.indexOf(`<section id="${id}"`);
  assert.notEqual(start, -1, `${id} exists`);
  const next = game.slice(start + 10).search(/<section id="[a-zA-Z]+Tab"/);
  return next === -1 ? game.slice(start, game.indexOf("</main>", start)) : game.slice(start, start + 10 + next);
}

const TEAMS = [
  { id: "BUF", name: "Buffalo Bills", city: "Buffalo", nickname: "Bills" },
  { id: "NYJ", name: "New York Jets", city: null, nickname: null },
  { id: "MIA", name: "Miami Dolphins" }
];

function legacy(overrides = {}) {
  return {
    score: 58, grade: "B-", label: "Competitive GM",
    wins: 52, losses: 32, ties: 1, record: "52-32-1",
    playoffs: 3, superBowls: 1, seasons: 5,
    persona: {
      current: { tier: 4, name: "Dynasty Architect", description: "You are building something special." },
      next: {
        tier: 5, name: "Legend",
        advancementPaths: [
          { label: "Legacy score", current: 58, target: 80, remaining: 22, satisfied: false },
          { label: "Championships", current: 1, target: 3, remaining: 2, satisfied: false }
        ]
      }
    },
    ...overrides
  };
}

// dashboard.gmCareer.history arrives newest first.
function gmCareer(overrides = {}) {
  return {
    status: "employed",
    dismissed: false,
    tenure: { teamId: "BUF", startYear: 2030, seasons: 1, warnings: 0 },
    standing: { score: 58, grade: "B-", record: "52-32-1", seasons: 5 },
    history: [
      { teamId: "MIA", teamName: "Miami Dolphins", startYear: 2028, endYear: 2029, seasons: 2, wins: 14, losses: 20, ties: 0, record: "14-20", playoffAppearances: 0, titles: 0, reason: "patience-exhausted", reasonLabel: "Relieved of duties — the owner ran out of patience" },
      { teamId: "NYJ", teamName: "New York Jets", startYear: 2026, endYear: 2027, seasons: 2, wins: 27, losses: 6, ties: 1, record: "27-6-1", playoffAppearances: 2, titles: 1, reason: "resigned", reasonLabel: "Resigned" }
    ],
    ...overrides
  };
}

test("career record reads seasons, record, playoff berths and titles from the career summary", () => {
  const { career } = buildGmProfile({ legacy: legacy(), gmCareer: gmCareer(), teams: TEAMS });
  assert.equal(career.seasons, 5);
  assert.equal(career.record, "52-32-1");
  assert.equal(career.playoffBerths, 3);
  assert.equal(career.titles, 1);
  assert.equal(career.grade, "B-");
  assert.equal(career.status, "employed");
  assert.equal(career.statusText, "General manager of the Buffalo Bills.");
});

test("clubs are listed oldest first and end with the current club", () => {
  const { career } = buildGmProfile({ legacy: legacy(), gmCareer: gmCareer(), teams: TEAMS });
  assert.deepEqual(career.clubs.map((club) => club.teamId), ["NYJ", "MIA", "BUF"]);
  assert.deepEqual(career.clubs.map((club) => club.current), [false, false, true]);
  assert.equal(career.clubs[0].years, "2026 to 2027");
  assert.equal(career.clubs[0].howItEnded, "Resigned");
  assert.equal(career.clubs[0].titles, 1);
  assert.equal(career.clubs[1].fired, true);
  assert.equal(career.clubs[2].years, "2030 to now");
  assert.equal(career.clubs[2].name, "Buffalo Bills");
  assert.equal(career.clubCount, 3);
  assert.equal(career.dismissals, 1, "a resignation is not a dismissal");
});

test("the current club's record is the career total less every closed tenure", () => {
  const { career } = buildGmProfile({ legacy: legacy(), gmCareer: gmCareer(), teams: TEAMS });
  // 52-32-1 overall, less 27-6-1 and 14-20.
  assert.equal(career.clubs.at(-1).record, "11-6");
});

test("a record that cannot be derived is left out, never guessed", () => {
  // Closed tenures claim more wins than the career total: the numbers disagree.
  const inconsistent = buildGmProfile({ legacy: legacy({ wins: 10 }), gmCareer: gmCareer(), teams: TEAMS });
  assert.equal(inconsistent.career.clubs.at(-1).record, null);

  // Ten tenures on the page means the server may have dropped an older one.
  const history = Array.from({ length: 10 }, (_, index) => ({
    teamId: "NYJ", teamName: "New York Jets", startYear: 2009 - index, endYear: 2009 - index,
    seasons: 1, wins: 1, losses: 1, ties: 0, reason: "moved", reasonLabel: "Moved on"
  }));
  const truncated = buildGmProfile({ legacy: legacy(), gmCareer: gmCareer({ history }), teams: TEAMS });
  assert.equal(truncated.career.clubs.at(-1).record, null);
  assert.equal(truncated.career.clubCount, 2, "the same club twice is one club managed");
  assert.equal(truncated.career.clubs[0].years, "2000");
});

test("a dismissed general manager has no current club", () => {
  const { career } = buildGmProfile({
    legacy: legacy(),
    gmCareer: gmCareer({ status: "dismissed", dismissed: true }),
    teams: TEAMS
  });
  assert.equal(career.status, "between-clubs");
  assert.match(career.statusText, /between clubs/);
  assert.equal(career.clubs.some((club) => club.current), false);
  assert.equal(career.clubs.length, 2);
});

test("a first-week career shows zeros and no grade instead of invented numbers", () => {
  const { career } = buildGmProfile({
    legacy: { score: 0, grade: "—", label: "No seasons logged", seasons: 0, persona: { current: { tier: 1, name: "Young Gun", description: "" }, next: { tier: 2, name: "Contender Builder", advancementPaths: [{ label: "Seasons served", current: 0, target: 3, remaining: 3, satisfied: false }] } } },
    gmCareer: gmCareer({ history: [], tenure: { teamId: "BUF", startYear: 2026, seasons: 0, warnings: 0 }, standing: { score: 0, record: "0-0", seasons: 0 } }),
    teams: TEAMS
  });
  assert.equal(career.seasons, 0);
  assert.equal(career.record, "0-0");
  assert.equal(career.playoffBerths, 0);
  assert.equal(career.titles, 0);
  assert.equal(career.score, null);
  assert.equal(career.grade, "");
  assert.equal(career.clubs.length, 1);
  assert.equal(career.clubs[0].record, null);
  assert.equal(career.nextTier.rule, "Reach this to move up.");
});

test("missing inputs produce an empty profile rather than throwing or NaN", () => {
  for (const input of [undefined, {}, { legacy: null, gmCareer: null }, { legacy: { wins: "x", losses: null, seasons: NaN }, gmCareer: { history: "bad", tenure: null } }]) {
    const { career, trophies } = buildGmProfile(input);
    assert.equal(career.seasons, 0);
    assert.equal(career.record, "0-0");
    assert.deepEqual(career.clubs, []);
    assert.equal(career.tier, null);
    assert.equal(career.nextTier, null);
    assert.deepEqual(trophies, { earnedCount: 0, total: 0, rows: [] });
    assert.doesNotMatch(JSON.stringify(career), /NaN|undefined/);
  }
});

test("legacy tier shows what the next tier needs, and the top tier needs nothing", () => {
  const { career } = buildGmProfile({ legacy: legacy(), gmCareer: gmCareer(), teams: TEAMS });
  assert.deepEqual(career.tier, { number: 4, name: "Dynasty Architect", description: "You are building something special." });
  assert.equal(career.nextTier.name, "Legend");
  assert.equal(career.nextTier.rule, "Reach any one of these to move up.");
  assert.deepEqual(career.nextTier.paths.map((path) => path.text), ["Legacy score: 58 of 80", "Championships: 1 of 3"]);
  assert.deepEqual(career.nextTier.paths.map((path) => path.remaining), [22, 2]);

  const done = buildGmProfile({ legacy: legacy({ persona: { current: { tier: 5, name: "Legend" }, next: { tier: 6, name: "Immortal", advancementPaths: [{ label: "Championships", current: 5, target: 5, satisfied: true }] } } }) });
  assert.equal(done.career.nextTier.paths[0].done, true);
  assert.equal(done.career.nextTier.paths[0].text, "Championships: 5 reached");

  const top = buildGmProfile({ legacy: legacy({ persona: { current: { tier: 6, name: "Immortal" }, next: null } }) });
  assert.equal(top.career.tier.number, 6);
  assert.equal(top.career.nextTier, null);
});

test("Trophy Case lists every achievement, earned and locked, with progress where it can be measured", () => {
  const achievements = [
    { id: "first-win", name: "First W", icon: "🏈", tier: "bronze", desc: "Win your first game." },
    { id: "decade-gm", name: "Decade of Power", icon: "⏳", tier: "gold", desc: "Serve 10 seasons." },
    { id: "first-trade", name: "Deal Maker", icon: "🤝", tier: "bronze", desc: "Complete your first trade." }
  ];
  const { trophies } = buildGmProfile({
    achievements,
    earned: { "first-win": { earnedAt: "2026-01-02T00:00:00.000Z", franchise: "BUF 2026" } },
    locked: [
      { id: "decade-gm", kind: "measurable", current: 4, target: 10, unit: "seasons" },
      { id: "first-trade", kind: "event", progressPct: null }
    ]
  });
  assert.equal(trophies.total, 3);
  assert.equal(trophies.earnedCount, 1);
  assert.deepEqual(trophies.rows.map((row) => row.id), ["first-win", "decade-gm", "first-trade"], "registry order is kept");
  assert.equal(trophies.rows[0].earned, true);
  assert.equal(trophies.rows[0].franchise, "BUF 2026");
  assert.equal(trophies.rows[0].progress, null, "an earned trophy has no progress bar");
  assert.deepEqual(trophies.rows[1].progress, { current: 4, target: 10, pct: 40, text: "4 of 10 seasons" });
  assert.equal(trophies.rows[2].earned, false);
  assert.equal(trophies.rows[2].progress, null, "a one-time moment gets no invented percentage");
});

test("trophy progress never reads past its target", () => {
  const { trophies } = buildGmProfile({
    achievements: [{ id: "streak-3", name: "Heating Up" }],
    locked: [{ id: "streak-3", kind: "measurable", current: 7, target: 3, unit: "straight wins" }]
  });
  assert.equal(trophies.rows[0].progress.pct, 100);
  assert.equal(trophies.rows[0].progress.text, "3 of 3 straight wins");
});

// ── Where things live ────────────────────────────────────────────────────────

const SAVE_AND_SHARE_IDS = [
  "saveSlotInput", "saveBtn", "loadBtn", "deleteSaveBtn", "exportSnapshotBtn", "importSnapshotBtn",
  "snapshotImportInput", "saveListText", "gistTokenInput", "gistExportBtn", "gistImportBtn", "gistListBtn",
  "rewindTimelineList", "refreshRewindBtn", "manualRewindSnapshotBtn",
  "shareDynastyBtn", "leagueStoryCardBtn", "franchiseNewsletterBtn", "dynastyTimelineContainer",
  "trophyCasePanel", "trophyCaseContent"
];

test("the GM Profile holds the career record, Trophy Case, share buttons and saves, in that order", () => {
  const profile = section("gmProfileTab");
  for (const id of SAVE_AND_SHARE_IDS) {
    assert.ok(profile.includes(`id="${id}"`), `GM Profile owns #${id}`);
    assert.equal((game.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `#${id} exists exactly once`);
  }
  const order = ["gmProfileCareerPanel", "trophyCasePanel", "gmProfileSharePanel", "gmProfileSavesPanel"].map((id) => profile.indexOf(`id="${id}"`));
  assert.ok(order.every((index) => index >= 0), "all four parts exist");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "career, trophies, share, saves");
});

test("Settings no longer holds saves, backups, exports or trophies", () => {
  const settings = section("settingsTab");
  for (const id of SAVE_AND_SHARE_IDS) {
    assert.ok(!settings.includes(`id="${id}"`), `#${id} left Settings`);
  }
  for (const heading of ["Saves", "Trophy Case", "Cloud Save Sync", "Rewind Timeline"]) {
    assert.ok(!settings.includes(`>${heading}`), `Settings has no ${heading} heading`);
  }
  // Preferences stay.
  for (const id of ["mobileLoopToggle", "soundEnabledInput", "hapticsEnabledInput", "saveSettingsBtn", "runOpeningContractBtn"]) {
    assert.ok(settings.includes(`id="${id}"`), `Settings keeps #${id}`);
  }
});

test("the GM Profile is a tab on the rail with its own hydration, sharing the settings island", () => {
  assert.match(game, /id="tab-gm-profile" class="menu-btn" data-tab="gmProfileTab" data-testid="tab-gm-profile" role="tab"/);
  assert.match(game, /<section id="gmProfileTab" class="tab-panel" role="tabpanel" aria-labelledby="tab-gm-profile"/);
  assert.deepEqual(TAB_HYDRATION_DOMAINS.gmProfileTab, ["settings-island", "saves", "gm-profile"]);
  assert.equal(uiIslandForTab("gmProfileTab"), "settings");
  assert.ok(UI_ISLAND_MANIFEST.settings.tabs.includes("gmProfileTab"));
});

test("the page module is loaded on demand and never joins the boot payload", () => {
  const flow = read("../public/lib/gameFlow.js");
  const app = read("../public/app.js");
  const settingsIsland = read("../public/lib/tabSettings.js");
  const manifest = JSON.parse(read("../public/boot-manifest.json"));
  assert.match(flow, /"gm-profile": async \(\) => \(await import\("\.\/gmProfile\.js"\)\)\.renderGmProfile\(\)/);
  for (const [name, source] of [["app.js", app], ["gameFlow.js", flow], ["tabSettings.js", settingsIsland]]) {
    assert.doesNotMatch(source, /^\s*import[^\n]*from "\.\/(?:lib\/)?gmProfile(?:Model)?\.js"/m, `${name} must not import the GM Profile statically`);
  }
  assert.ok(manifest.lazyRoots.includes("lib/gmProfile.js"), "the boot budget watches for a leak");
});

test("share buttons moved with their handlers, through the lazy export modules", () => {
  const profile = read("../public/lib/gmProfile.js");
  const app = read("../public/app.js");
  for (const id of ["shareDynastyBtn", "leagueStoryCardBtn", "franchiseNewsletterBtn"]) {
    assert.ok(profile.includes(`getElementById("${id}")`), `gmProfile.js binds #${id}`);
    assert.ok(!app.includes(`getElementById("${id}")`), `app.js no longer binds #${id} (it would fire twice)`);
  }
  assert.match(profile, /invokeUiIsland\("settings", "shareDynastyTimeline"\)/);
  assert.match(profile, /exportsIsland\.story\.downloadLeagueStory\(story\)/);
  assert.match(profile, /exportsIsland\.newsletter\.generateFranchiseNewsletter\(state\)/);
  assert.doesNotMatch(profile, /from "\.\/(franchiseNewsletter|leagueStoryExport|tabSettings)\.js"/);
});

test("the Desk links straight to the GM Profile", () => {
  // The Desk's tab links are shown only when the tab they name is on the rail.
  assert.match(section("overviewTab"), /data-desk-tab-link="gmProfileTab"/);
  assert.match(game, /class="menu-btn" data-tab="gmProfileTab"/);
});

test("the page's own words stay in plain football language", () => {
  const banned = /\b(receipt|shard|canon|founder|allowlist|thesis|ledger)s?\b|\bS\d{2,3}\b/i;
  const profileMarkup = section("gmProfileTab").replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(profileMarkup, banned);
  const strings = [...read("../public/lib/gmProfile.js").matchAll(/`([^`]*)`|"([^"\n]*)"/g)].map((match) => match[1] ?? match[2]);
  const model = buildGmProfile({ legacy: legacy(), gmCareer: gmCareer(), teams: TEAMS });
  for (const value of [...strings, JSON.stringify(model.career)]) assert.doesNotMatch(value, banned);
});
