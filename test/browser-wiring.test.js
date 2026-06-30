import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("app shell wires newsletter and contract tools to imported functions", () => {
  const appSource = read("../public/app.js");

  assert.match(appSource, /import \{ generateFranchiseNewsletter \} from "\.\/lib\/franchiseNewsletter\.js"/);
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