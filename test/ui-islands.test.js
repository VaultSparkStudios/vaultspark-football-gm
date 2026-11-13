import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";

import { analyzeBrowserBoot } from "../scripts/check-browser-boot-budget.mjs";
import { TAB_HYDRATION_DOMAINS } from "../public/lib/tabHydration.js";
import {
  UI_ISLAND_MANIFEST,
  bindUiIslandPreloads,
  invokeLoadedUiIsland,
  preloadUiIslandForTab,
  queueIdleUiIslandPreloads,
  resetUiIslandsForTest,
  uiIslandForTab
} from "../public/lib/uiIslands.js";

test("every non-Overview tab has one primary code island", () => {
  for (const tabId of Object.keys(TAB_HYDRATION_DOMAINS)) {
    if (tabId === "overviewTab") assert.equal(uiIslandForTab(tabId), null);
    else assert.ok(uiIslandForTab(tabId), `${tabId} must resolve to a UI island`);
  }
  assert.deepEqual(Object.keys(UI_ISLAND_MANIFEST), ["roster", "injuryClaims", "contracts", "draft", "stats", "history", "settings", "exports"]);
  assert.deepEqual(UI_ISLAND_MANIFEST.injuryClaims.tabs, [], "claims must not take ownership of roster hydration");
});

test("pointer, focus, and idle hints emit modulepreload links without importing islands", () => {
  resetUiIslandsForTest();
  const links = [];
  const listeners = {};
  const button = {
    dataset: { tab: "rosterTab" },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const documentRef = {
    head: { append(link) { links.push(link); } },
    createElement() { return { dataset: {} }; },
    querySelectorAll() { return [button]; }
  };
  assert.equal(bindUiIslandPreloads({ documentRef }), 1);
  listeners.pointerenter();
  listeners.focus();
  assert.equal(links.length, 1, "repeated intent hints must coalesce");
  assert.equal(links[0].rel, "modulepreload");
  assert.equal(links[0].dataset.uiIslandPreload, "roster");
  let idleCallback = null;
  queueIdleUiIslandPreloads({ documentRef, requestIdle: (callback) => { idleCallback = callback; return 1; } });
  assert.equal(typeof idleCallback, "function");
  idleCallback();
  assert.deepEqual(new Set(links.map((link) => link.dataset.uiIslandPreload)), new Set(["roster", "contracts", "draft", "stats", "history", "settings"]));
  assert.equal(preloadUiIslandForTab("overviewTab", { documentRef }), false);
});

test("cold action invocation fails synchronously during the activation race", () => {
  resetUiIslandsForTest();
  assert.throws(
    () => invokeLoadedUiIsland("contracts", "getSelectedContractPlayer"),
    /contracts is not ready/
  );
});

test("global Escape never invokes a cold lazy island when no modal is open", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const escapeBranch = app.match(/if \(event\.key === "Escape"\) \{([\s\S]*?)\n\s*return;\n\s*\}/)?.[1] || "";
  assert.ok(escapeBranch, "global Escape branch must remain explicit");
  assert.doesNotMatch(escapeBranch, /closeAgentModal|closeShortcutsModal|callAppIsland|invokeLoadedUiIsland/);
});

test("boot graph excludes all tab islands and enforces target plus per-island headroom", async () => {
  const receipt = await analyzeBrowserBoot();
  assert.equal(receipt.ok, true, receipt.findings.join("; "));
  assert.ok(receipt.staticBytes <= 650_000);
  for (const root of ["tabRoster", "tabContracts", "tabDraft", "tabStats", "tabHistory", "tabSettings"]) {
    assert.equal(receipt.modules.some((file) => file.includes(root)), false, `${root} leaked into boot`);
  }
  for (const [name, island] of Object.entries(receipt.islands)) {
    assert.ok(island.headroomRatio >= 0.15, `${name} lacks declared headroom`);
  }
});

test("boot checker fails closed on island-budget and lazy-root drift", async () => {
  const source = JSON.parse(await readFile(new URL("../public/boot-manifest.json", import.meta.url), "utf8"));
  source.islandBudgets.roster.maxBytes = 1;
  source.lazyRoots = source.lazyRoots.filter((root) => root !== "lib/tabRoster.js");
  const dir = await mkdtemp(path.join(tmpdir(), "fa-island-budget-"));
  const manifestPath = path.join(dir, "boot-manifest.json");
  try {
    await writeFile(manifestPath, JSON.stringify(source));
    const receipt = await analyzeBrowserBoot({ manifestPath });
    assert.equal(receipt.ok, false);
    assert.ok(receipt.findings.some((finding) => finding.includes("roster island bytes")));
    assert.ok(receipt.findings.some((finding) => finding.includes("roster roots missing from lazyRoots")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tab intent owns import, hydration, busy state, and retry", async () => {
  const flow = await readFile(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  assert.match(flow, /const islandName = uiIslandForTab\(tabId\)/);
  assert.match(flow, /panel\.inert = true/);
  assert.match(flow, /if \(islandName\) await loadUiIsland\(islandName\)/);
  assert.match(flow, /const receipt = await hydrateTab\(tabId, \{ force \}\)/);
  assert.match(flow, /retry: \(\) => loadAndHydrate\(\{ force: true \}\)/);
  assert.match(flow, /panel\.inert = false/);
});

test("hydrated tabs retain interactive recovery after data failure while cold-code failures remain inert", async () => {
  const source = await readFile(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  const start = source.indexOf("export function activateTab(tabId) {");
  const end = source.indexOf("\nexport async function loadState", start);
  assert.ok(start >= 0 && end > start, "exercise the actual exported activation function");
  const activation = source.slice(start, end).replace("export function", "function");
  for (const coldFailure of [false, true]) {
    const attributes = new Map(), errors = [];
    let hydrateCalls = 0;
    const panel = { id: "rosterTab", inert: false, classList: { toggle() {} },
      setAttribute(key, value) { attributes.set(key, value); }, removeAttribute(key) { attributes.delete(key); } };
    const context = {
      state: { activeTab: "overviewTab", dashboard: {} },
      document: { querySelectorAll(selector) { return selector === ".tab-panel" ? [panel] : []; }, getElementById() { return panel; } },
      applyShellTheme() {}, uiIslandForTab, preloadUiIslandForTab() {},
      loadUiIsland: async () => { if (coldFailure) throw new Error("Fixture: code island unavailable"); },
      hydrateTab: async () => { hydrateCalls += 1; return { failures: [{ name: "roster" }] }; },
      dashboardAuthorityKey: () => "fixture-authority",
      observeBackgroundTask: async task => { try { return await task(); } catch (error) { errors.push(error.message); } }
    };
    vm.runInNewContext(`${activation}\nthis.activate = activateTab;`, context);
    await context.activate("rosterTab");
    assert.equal(errors.length, 1, "the failure must remain observed, never turned into success");
    assert.equal(hydrateCalls, coldFailure ? 0 : 1);
    assert.equal(panel.inert, coldFailure, "Retry becomes usable only once the code island is available");
    assert.equal(attributes.has("aria-busy"), coldFailure);
    assert.match(errors[0], coldFailure ? /code island unavailable/ : /hydration failed: roster/);
  }
});
