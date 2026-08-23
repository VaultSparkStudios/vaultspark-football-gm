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

// ── S94: preload hints must be derived from the boot graph, not declared twice ──

test("modulepreload hints cover the whole static graph and never touch a lazy root", async () => {
  const { staticGraphFor } = await import("../scripts/check-browser-boot-budget.mjs");
  const manifest = JSON.parse(
    await readFile(new URL("../public/boot-manifest.json", import.meta.url), "utf8")
  );
  const lazyRoots = new Set(manifest.lazyRoots || []);

  for (const [page, entry] of [["game.html", "app.js"], ["index.html", "setup.js"]]) {
    const graph = await staticGraphFor(entry);
    assert.ok(graph.length > 0, `${entry} must have a static graph`);
    assert.ok(!graph.includes(entry), "the entry is discovered by the parser and must not be preloaded");

    // The specific regression this guards: an island silently re-entering the
    // boot graph would get preloaded, pulling it onto the critical path while
    // the byte budget — which only measures the static graph — stayed green.
    const leaked = graph.filter((module) => lazyRoots.has(module));
    assert.deepEqual(leaked, [], `${page} preloads must be disjoint from declared lazyRoots`);

    let built;
    try {
      built = await readFile(new URL(`../static/${page}`, import.meta.url), "utf8");
    } catch {
      continue; // static/ is build output; skip when the bundle has not been built
    }
    const preloaded = [...built.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)" \/>/g)].map((m) => m[1]);
    assert.deepEqual(
      preloaded.sort(),
      graph.slice().sort(),
      `${page} preload list must equal its derived static graph exactly`
    );
  }
});
