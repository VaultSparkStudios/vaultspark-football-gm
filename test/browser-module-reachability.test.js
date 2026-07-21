import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeBrowserModuleReachability } from "../scripts/check-browser-module-reachability.mjs";

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fa-browser-graph-"));
  await Promise.all(Object.entries(files).map(async ([relative, source]) => {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, source, "utf8");
  }));
  return root;
}

test("reachability follows HTML entries and static module imports", async () => {
  const publicDir = await fixture({
    "index.html": '<script type="module" src="./app.js"></script>',
    "app.js": 'import "./lib/live.js";',
    "lib/live.js": "export const live = true;"
  });
  const report = await analyzeBrowserModuleReachability({ publicDir });
  assert.equal(report.ok, true);
  assert.deepEqual(report.reachable, ["app.js", "lib/live.js"]);
});

test("reachability reports browser JavaScript with no route from HTML", async () => {
  const publicDir = await fixture({
    "index.html": '<script type="module" src="./app.js"></script>',
    "app.js": "export const app = true;",
    "lib/orphan.js": "export const forgotten = true;"
  });
  const report = await analyzeBrowserModuleReachability({ publicDir });
  assert.equal(report.ok, false);
  assert.deepEqual(report.orphaned, ["lib/orphan.js"]);
});
