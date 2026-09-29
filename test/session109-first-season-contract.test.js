import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLLAPSE_AFTER_WEEK,
  OBJECTIVES,
  contractSummary,
  contractVisibility,
  dismissContract,
  evaluateObjectives,
  finalizeFirstSeasonContract,
  isDeliberateTradeEvaluation,
  markObjective,
  readContractState,
  renderContractCloseout,
  renderContractRows,
  renderFirstSeasonContract
} from "../public/lib/firstSeasonContract.js";

// S109 — the tutorial is three modal steps and then fourteen tabs. The First
// Season Contract turns the owner mandate the tutorial introduces into five
// objectives on the Desk, marked from the player's actions and the dashboard.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map
  };
}

function dashboard(overrides = {}) {
  return {
    franchiseId: "fa-20260306-BUF",
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", name: "Bills", owner: { expectation: { targetWins: 9, mandate: "Win now" } } },
    currentYear: 2026,
    currentWeek: 3,
    phase: "regular-season",
    seasonsSimulated: 0,
    cap: { capSpace: 4_000_000 },
    latestStandings: [{ teamId: "BUF", wins: 2, losses: 1 }, { teamId: "MIA", wins: 1, losses: 2 }],
    ...overrides
  };
}

test("five objectives, three from actions and two from the dashboard", () => {
  assert.equal(OBJECTIVES.length, 5);
  assert.deepEqual(OBJECTIVES.map((o) => o.source), ["action", "action", "action", "dashboard", "dashboard"]);
  const rows = evaluateObjectives(dashboard(), { marks: {} });
  assert.ok(rows.every((row) => row.done === false));
  assert.equal(rows.find((r) => r.id === "owner-floor").progress, "2 of 9 wins");
});

test("actions mark objectives once, franchise-scoped, and never invent a fifth", () => {
  const storage = memoryStorage();
  const d = dashboard();
  markObjective(d, "sign-starter", storage);
  markObjective(d, "sign-starter", storage);
  markObjective(d, "made-up", storage);
  const state = readContractState(d, storage);
  assert.deepEqual(state.marks, { "sign-starter": true });
  assert.equal(state.startYear, 2026, "the first mark records the season it belongs to");
  const other = readContractState(dashboard({ franchiseId: "fa-2027-MIA", controlledTeamId: "MIA" }), storage);
  assert.deepEqual(other.marks, {}, "another franchise starts clean");
});

test("dashboard objectives pass only at the season's end, never early", () => {
  const midseasonGood = evaluateObjectives(dashboard({ latestStandings: [{ teamId: "BUF", wins: 10, losses: 1 }] }), { marks: {} });
  assert.equal(midseasonGood.find((r) => r.id === "owner-floor").done, false, "ten wins in week three is not a finished season");
  const closedGood = evaluateObjectives(dashboard({ phase: "offseason", latestStandings: [{ teamId: "BUF", wins: 10, losses: 7 }] }), { marks: {} });
  assert.equal(closedGood.find((r) => r.id === "owner-floor").done, true);
  assert.equal(closedGood.find((r) => r.id === "cap-compliant").done, true);
  const closedBad = evaluateObjectives(dashboard({ phase: "offseason", cap: { capSpace: -1 }, latestStandings: [{ teamId: "BUF", wins: 6, losses: 11 }] }), { marks: {} });
  assert.equal(closedBad.find((r) => r.id === "owner-floor").done, false);
  assert.equal(closedBad.find((r) => r.id === "cap-compliant").done, false);
  assert.equal(closedBad.find((r) => r.id === "cap-compliant").progress, "over the cap");
});

test("the contract completes when every objective is done, and the summary says so", () => {
  const marks = { "sign-starter": true, "depth-chart": true, "answer-the-phone": true };
  const summary = contractSummary(dashboard({ phase: "offseason", latestStandings: [{ teamId: "BUF", wins: 9, losses: 8 }] }), { marks });
  assert.equal(summary.done, 5);
  assert.equal(summary.complete, true);
  const partial = contractSummary(dashboard(), { marks });
  assert.equal(partial.done, 3);
  assert.equal(partial.complete, false);
});

test("a deliberate trade evaluation offers an attainable alternative to a random inbound call", () => {
  const packageUnderReview = {
    controlledTeamId: "BUF", teamA: "BUF", teamB: "MIA",
    teamAPlayerIds: ["player-1"], teamBPlayerIds: [], teamAPickIds: [], teamBPickIds: []
  };
  assert.equal(isDeliberateTradeEvaluation(packageUnderReview), true);
  assert.equal(isDeliberateTradeEvaluation({ ...packageUnderReview, teamAPlayerIds: [] }), false);
  assert.equal(isDeliberateTradeEvaluation({ ...packageUnderReview, controlledTeamId: "NYJ" }), false);
  assert.equal(isDeliberateTradeEvaluation({ ...packageUnderReview, teamB: "BUF" }), false);
  assert.match(OBJECTIVES.find((row) => row.id === "answer-the-phone").detail, /evaluate a real package/);
});

test("the first-season closeout preserves partial results and never recomputes from next-year state", () => {
  const storage = memoryStorage();
  const first = dashboard({
    phase: "season-awards", currentWeek: 18,
    seasonAwardsStage: { year: 2026 },
    latestStandings: [{ teamId: "BUF", wins: 7, losses: 10 }]
  });
  markObjective(first, "sign-starter", storage);
  markObjective(first, "answer-the-phone", storage);
  const closeout = finalizeFirstSeasonContract(first, storage);
  assert.equal(closeout.year, 2026);
  assert.equal(closeout.done, 3, "two GM calls and a legal cap were evidenced");
  assert.equal(closeout.rows.find((row) => row.id === "owner-floor").status, "not-met");
  assert.match(renderContractCloseout(closeout), /3 of 5 first-season objectives met/);
  assert.equal(contractVisibility(first, readContractState(first, storage)), "closed");
  const nextYear = dashboard({ currentYear: 2027, seasonsSimulated: 1, latestStandings: [{ teamId: "BUF", wins: 12, losses: 5 }] });
  assert.deepEqual(finalizeFirstSeasonContract(nextYear, storage), closeout);
  assert.equal(contractVisibility(nextYear, readContractState(nextYear, storage)), "closed");
  dismissContract(nextYear, storage);
  assert.equal(contractVisibility(nextYear, readContractState(nextYear, storage)), "closed",
    "shelving the active strip cannot erase the recorded season result");
  const panel = { hidden: true, dataset: {} };
  const list = { innerHTML: "" };
  const progress = { textContent: "" };
  const elements = { firstSeasonContract: panel, firstSeasonContractList: list, firstSeasonContractProgress: progress };
  renderFirstSeasonContract({ dashboard: nextYear, storage, documentRef: { getElementById: (id) => elements[id] } });
  assert.equal(panel.hidden, false, "the persisted closeout remains on the Desk after a later-year reload");
  assert.equal(panel.dataset.visibility, "closed");
  assert.match(progress.textContent, /Season 2026: 3 of 5 met/);
  assert.match(list.innerHTML, /data-objective="owner-floor" data-done="false"/);
  assert.equal(readContractState(dashboard({ franchiseId: "another" }), storage).finalized, null);
  assert.equal(finalizeFirstSeasonContract(dashboard({ franchiseId: "new-uncaptured", currentYear: 2027, seasonsSimulated: 1 }), storage), null,
    "a missing local contract cannot be invented in the second season");
});

test("a complete contract keeps the five source-derived marks in its final receipt", () => {
  const storage = memoryStorage();
  const closed = dashboard({ phase: "season-awards", latestStandings: [{ teamId: "BUF", wins: 9, losses: 8 }] });
  for (const id of ["sign-starter", "depth-chart", "answer-the-phone"]) markObjective(closed, id, storage);
  const closeout = finalizeFirstSeasonContract(closed, storage);
  assert.equal(closeout.done, 5);
  assert.ok(closeout.rows.every((row) => row.status === "met"));
  assert.match(closeout.verdict, /All five/);
});

test("closeout keeps missing season authorities unverified instead of granting objectives", () => {
  const storage = memoryStorage();
  const incomplete = dashboard({ phase: "season-awards", latestStandings: [], cap: null });
  const closeout = finalizeFirstSeasonContract(incomplete, storage);
  assert.equal(closeout.rows.find((row) => row.id === "owner-floor").status, "unverified");
  assert.equal(closeout.rows.find((row) => row.id === "cap-compliant").status, "unverified");
  assert.match(closeout.verdict, /2 could not be verified/);
  assert.match(renderContractCloseout(closeout), /unverified/);
});

test("visibility: open in the first weeks, compact after week six, hidden when dismissed, completed, or in a later season", () => {
  assert.equal(contractVisibility(dashboard({ currentWeek: 2 }), { marks: {} }), "open");
  assert.equal(contractVisibility(dashboard({ currentWeek: COLLAPSE_AFTER_WEEK + 1 }), { marks: {} }), "compact");
  assert.equal(contractVisibility(dashboard(), { marks: {}, dismissed: true }), "hidden");
  assert.equal(contractVisibility(dashboard(), { marks: {}, completedAt: "2026-09-14" }), "hidden");
  assert.equal(contractVisibility(dashboard({ seasonsSimulated: 2, currentYear: 2028 }), { marks: {}, startYear: 2026 }), "hidden");
  assert.equal(contractVisibility(dashboard({ seasonsSimulated: 0, currentYear: 2026 }), { marks: {}, startYear: 2026 }), "open");
  const storage = memoryStorage();
  dismissContract(dashboard(), storage);
  assert.equal(readContractState(dashboard(), storage).dismissed, true);
});

test("rows render escaped, with done state on the element, not only in the glyph", () => {
  const summary = contractSummary(dashboard(), { marks: { "sign-starter": true } });
  const html = renderContractRows(summary);
  assert.match(html, /data-objective="sign-starter" data-done="true"/);
  assert.match(html, /data-objective="depth-chart" data-done="false"/);
  assert.doesNotMatch(html, /<script/);
});

test("the strip and the achievement are wired: markup on the Desk, an achievement that listens for the event, no static import in app.js", () => {
  const game = fs.readFileSync(path.join(rootDir, "public", "game.html"), "utf8");
  assert.match(game, /id="firstSeasonContract"/);
  assert.match(game, /id="firstSeasonContractDismissBtn"/);
  const achievements = fs.readFileSync(path.join(rootDir, "public", "lib", "achievements.js"), "utf8");
  assert.match(achievements, /id: "first-season-contract"/);
  assert.match(achievements, /c\.event\.type === "first-season-contract"/);
  const app = fs.readFileSync(path.join(rootDir, "public", "app.js"), "utf8");
  assert.doesNotMatch(app, /from "\.\/lib\/(firstSeasonContract|deskIslands)\.js"/, "the Desk islands are lazy");
  assert.match(app, /import\("\.\/lib\/deskIslands\.js"\)/);
  const desk = fs.readFileSync(path.join(rootDir, "public", "lib", "deskIslands.js"), "utf8");
  assert.match(desk, /import\("\.\/firstSeasonContract\.js"\)/);
  assert.match(desk, /import\("\.\/frontOfficeAdvisor\.js"\)/);
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "boot-manifest.json"), "utf8"));
  for (const root of ["lib/firstSeasonContract.js", "lib/deskIslands.js", "lib/frontOfficeAdvisor.js"]) {
    assert.ok(manifest.lazyRoots.includes(root), `${root} is a declared lazy root`);
  }
});
