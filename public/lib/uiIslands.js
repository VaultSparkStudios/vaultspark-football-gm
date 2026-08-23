const islandState = new Map();
const preloadedIslands = new Set();

export const UI_ISLAND_MANIFEST = Object.freeze({
  roster: Object.freeze({
    tabs: Object.freeze(["rosterTab", "faTab", "depthTab"]),
    source: "./tabRoster.js",
    preload: Object.freeze(["./tabRoster.js"]),
    budgetBytes: 22_000
  }),
  contracts: Object.freeze({
    tabs: Object.freeze(["contractsTab", "transactionsTab"]),
    source: "./tabContracts.js",
    preload: Object.freeze(["./tabContracts.js"]),
    budgetBytes: 46_000
  }),
  draft: Object.freeze({
    tabs: Object.freeze(["scoutingTab", "draftTab"]),
    source: "./tabDraft.js",
    preload: Object.freeze(["./tabDraft.js"]),
    budgetBytes: 34_000
  }),
  stats: Object.freeze({
    tabs: Object.freeze(["statsTab"]),
    source: "./tabStats.js",
    preload: Object.freeze(["./tabStats.js"]),
    budgetBytes: 12_000
  }),
  history: Object.freeze({
    tabs: Object.freeze(["calendarTab", "historyTab"]),
    source: "./tabHistory.js",
    preload: Object.freeze(["./tabHistory.js"]),
    budgetBytes: 72_000
  }),
  settings: Object.freeze({
    // S94: boardroomTab carries the owner economy out of Settings; it is the
    // same module, so it belongs to the same island rather than duplicating one.
    tabs: Object.freeze(["logTab", "settingsTab", "boardroomTab"]),
    source: "./tabSettings.js",
    preload: Object.freeze(["./tabSettings.js"]),
    budgetBytes: 74_000
  }),
  exports: Object.freeze({
    tabs: Object.freeze([]),
    source: "export actions",
    preload: Object.freeze(["./gistSync.js", "./franchiseNewsletter.js", "./leagueStoryExport.js"]),
    budgetBytes: 36_000
  })
});

const ISLAND_BY_TAB = (() => {
  const rows = new Map();
  for (const [name, island] of Object.entries(UI_ISLAND_MANIFEST)) {
    for (const tabId of island.tabs) {
      if (rows.has(tabId)) throw new Error(`UI tab ${tabId} is owned by multiple islands`);
      rows.set(tabId, name);
    }
  }
  return rows;
})();

function assertIsland(name) {
  if (!Object.hasOwn(UI_ISLAND_MANIFEST, name)) throw new Error(`Unknown UI island: ${name}`);
}

async function importIsland(name) {
  if (name === "roster") return import("./tabRoster.js");
  if (name === "contracts") return import("./tabContracts.js");
  if (name === "draft") return import("./tabDraft.js");
  if (name === "stats") return import("./tabStats.js");
  if (name === "history") return import("./tabHistory.js");
  if (name === "settings") return import("./tabSettings.js");
  if (name === "exports") {
    const [gist, newsletter, story] = await Promise.all([
      import("./gistSync.js"),
      import("./franchiseNewsletter.js"),
      import("./leagueStoryExport.js")
    ]);
    return Object.freeze({ gist, newsletter, story });
  }
  throw new Error(`Unknown UI island: ${name}`);
}

export function getLoadedUiIsland(name) {
  assertIsland(name);
  return islandState.get(name)?.module || null;
}

export function uiIslandSnapshot() {
  return Object.fromEntries(Object.keys(UI_ISLAND_MANIFEST).map((name) => {
    const row = islandState.get(name);
    return [name, row?.module ? "loaded" : row?.promise ? "pending" : row?.error ? "failed" : "cold"];
  }));
}

export function uiIslandForTab(tabId) {
  return ISLAND_BY_TAB.get(tabId) || null;
}

export function preloadUiIsland(name, { documentRef = globalThis.document } = {}) {
  assertIsland(name);
  if (preloadedIslands.has(name) || getLoadedUiIsland(name)) return false;
  const head = documentRef?.head;
  if (!head || typeof documentRef.createElement !== "function") return false;
  for (const source of UI_ISLAND_MANIFEST[name].preload || []) {
    const link = documentRef.createElement("link");
    link.rel = "modulepreload";
    link.href = new URL(source, import.meta.url).href;
    link.dataset.uiIslandPreload = name;
    head.append(link);
  }
  preloadedIslands.add(name);
  return true;
}

export function preloadUiIslandForTab(tabId, options) {
  const name = uiIslandForTab(tabId);
  return name ? preloadUiIsland(name, options) : false;
}

export function bindUiIslandPreloads({ documentRef = globalThis.document } = {}) {
  const buttons = documentRef?.querySelectorAll?.(".menu-btn[data-tab]") || [];
  for (const button of buttons) {
    const preload = () => preloadUiIslandForTab(button.dataset.tab, { documentRef });
    button.addEventListener("pointerenter", preload, { passive: true });
    button.addEventListener("focus", preload);
  }
  return buttons.length;
}

export function queueIdleUiIslandPreloads({
  documentRef = globalThis.document,
  requestIdle = globalThis.requestIdleCallback,
  setTimer = globalThis.setTimeout
} = {}) {
  const preload = () => {
    for (const name of Object.keys(UI_ISLAND_MANIFEST)) {
      if (name !== "exports") preloadUiIsland(name, { documentRef });
    }
  };
  if (typeof requestIdle === "function") return requestIdle(preload, { timeout: 5_000 });
  if (typeof setTimer === "function") return setTimer(preload, 5_000);
  return null;
}

export async function loadUiIsland(name) {
  assertIsland(name);
  const current = islandState.get(name);
  if (current?.module) return current.module;
  if (current?.promise) return current.promise;
  const row = { module: null, promise: null, error: null };
  row.promise = importIsland(name)
    .then((module) => {
      row.module = module;
      row.error = null;
      return module;
    })
    .catch((error) => {
      row.error = error;
      throw error;
    })
    .finally(() => { row.promise = null; });
  islandState.set(name, row);
  return row.promise;
}

export async function invokeUiIsland(name, exportName, ...args) {
  const module = await loadUiIsland(name);
  const handler = module?.[exportName];
  if (typeof handler !== "function") throw new Error(`UI island ${name} does not export ${exportName}`);
  return handler(...args);
}

export function invokeLoadedUiIsland(name, exportName, ...args) {
  assertIsland(name);
  const handler = getLoadedUiIsland(name)?.[exportName];
  if (typeof handler !== "function") throw new Error(`UI island ${name} is not ready for ${exportName}`);
  return handler(...args);
}

export function resetUiIslandsForTest() {
  islandState.clear();
  preloadedIslands.clear();
}
