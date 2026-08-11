import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { analyzeBrowserBoot } from "../scripts/check-browser-boot-budget.mjs";

test("first decision stays inside the declared static boot budget", async () => {
  const receipt = await analyzeBrowserBoot();
  assert.equal(receipt.ok, true, receipt.findings.join("; "));
  assert.deepEqual(receipt.lazyLeaks, []);
  assert.ok(receipt.modules.includes("lib/uiIslands.js"));
  assert.ok(receipt.staticBytes > 0);
});

test("all tab/export islands are literal dynamic imports with central hydration owners", async () => {
  const islands = await readFile(new URL("../public/lib/uiIslands.js", import.meta.url), "utf8");
  const flow = await readFile(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  assert.match(islands, /import\("\.\/tabHistory\.js"\)/);
  assert.match(islands, /import\("\.\/tabSettings\.js"\)/);
  assert.match(islands, /import\("\.\/tabRoster\.js"\)/);
  assert.match(islands, /import\("\.\/tabContracts\.js"\)/);
  assert.match(islands, /import\("\.\/tabDraft\.js"\)/);
  assert.match(islands, /import\("\.\/tabStats\.js"\)/);
  assert.match(islands, /import\("\.\/gistSync\.js"\)/);
  assert.match(flow, /"history-island": loadHistoryIsland/);
  assert.match(flow, /"settings-island": loadSettingsIsland/);
  assert.doesNotMatch(flow, /from "\.\/tab(?:Roster|Contracts|Draft|Stats|History|Settings)\.js"/);
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /from "\.\/lib\/tab(?:Roster|Contracts|Draft|Stats|History|Settings)\.js"/);
});
