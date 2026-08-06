const islandState = new Map();

export const UI_ISLAND_MANIFEST = Object.freeze({
  history: Object.freeze({
    tabs: Object.freeze(["calendarTab", "historyTab"]),
    source: "./tabHistory.js",
    budgetBytes: 72_000
  }),
  settings: Object.freeze({
    tabs: Object.freeze(["transactionsTab", "logTab", "statsTab", "settingsTab"]),
    source: "./tabSettings.js",
    budgetBytes: 96_000
  }),
  exports: Object.freeze({
    tabs: Object.freeze([]),
    source: "export actions",
    budgetBytes: 48_000
  })
});

function assertIsland(name) {
  if (!Object.hasOwn(UI_ISLAND_MANIFEST, name)) throw new Error(`Unknown UI island: ${name}`);
}

async function importIsland(name) {
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

export function resetUiIslandsForTest() {
  islandState.clear();
}
