import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("browser authority and save-sensitive ledgers cannot regress to global identity", () => {
  const app = read("../public/app.js");
  const flow = read("../public/lib/gameFlow.js");
  const tutorial = read("../public/lib/tutorialCampaign.js");
  const digest = read("../public/lib/returnDigest.js");
  const core = read("../public/lib/appCore.js");

  assert.doesNotMatch(app, /dashboard\?\.leagueId \|\| state\.dashboard\?\.startYear/);
  assert.match(app, /dashboardAuthorityKey\(state\.dashboard\)/);
  assert.match(flow, /import \{ dashboardAuthorityKey \} from "\.\/franchiseScope\.js"/);
  assert.match(tutorial, /franchiseStorageKey\(TUTORIAL_SEEN_PREFIX, scope\)/);
  assert.match(digest, /franchiseStorageKey\(STORAGE_PREFIX, dashboard\)/);
  assert.match(core, /franchiseStorageKey\(TRADE_BLOCK_STORAGE_PREFIX, scope\)/);
  assert.doesNotMatch(core, /setItem\("vsfgm:trade-block"/);
});
