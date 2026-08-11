export const TAB_HYDRATION_DOMAINS = Object.freeze({
  overviewTab: [],
  rosterTab: ["roster-island", "roster", "retired-pool"],
  faTab: ["roster-island", "free-agency"],
  depthTab: ["roster-island", "depth-chart"],
  contractsTab: ["contracts-island", "contracts", "negotiations"],
  transactionsTab: ["contracts-island", "transactions", "pick-assets", "trade-offers"],
  scoutingTab: ["draft-island", "scouting"],
  draftTab: ["draft-island", "draft", "scouting"],
  statsTab: ["stats-island", "stats", "analytics"],
  calendarTab: ["history-island", "calendar"],
  logTab: ["settings-island", "transactions", "news"],
  historyTab: ["history-island", "team-history"],
  rulesTab: ["settings-island"],
  settingsTab: [
    "settings-island", "saves", "qa", "settings", "staff", "owner", "observability",
    "persistence", "pipeline", "calibration-jobs", "simulation-jobs"
  ]
});

export function validateHydrationTopology({ loaders = {}, domainsByTab = TAB_HYDRATION_DOMAINS } = {}) {
  const tabs = Object.keys(domainsByTab);
  const loaderNames = Object.keys(loaders).sort();
  const referenced = new Set();
  const findings = [];

  for (const tabId of tabs) {
    const domains = domainsByTab[tabId];
    if (!tabId || !Array.isArray(domains)) {
      findings.push(`${tabId || "<empty>"}: domains must be an array`);
      continue;
    }
    const duplicates = domains.filter((name, index) => domains.indexOf(name) !== index);
    if (duplicates.length) findings.push(`${tabId}: duplicate domains ${[...new Set(duplicates)].join(", ")}`);
    for (const name of domains) {
      referenced.add(name);
      if (typeof loaders[name] !== "function") findings.push(`${tabId}: missing loader ${name}`);
    }
  }

  const orphanedLoaders = loaderNames.filter((name) => !referenced.has(name));
  if (orphanedLoaders.length) findings.push(`orphaned loaders: ${orphanedLoaders.join(", ")}`);
  const receipt = Object.freeze({
    schemaVersion: "1.0",
    kind: "tab-hydration-topology-receipt",
    valid: findings.length === 0,
    tabCount: tabs.length,
    domainCount: referenced.size,
    loaderCount: loaderNames.length,
    findings
  });
  if (!receipt.valid) throw new Error(`Invalid hydration topology: ${findings.join("; ")}`);
  return receipt;
}

export function createTabHydrationAuthority({
  loaders = {},
  getAuthority = () => "unknown",
  domainsByTab = TAB_HYDRATION_DOMAINS,
  batchSize = 4,
  onFailure = () => {},
  onSuccess = () => {}
} = {}) {
  const topology = validateHydrationTopology({ loaders, domainsByTab });
  const loadedAuthority = new Map();
  const inFlight = new Map();

  function domainsForTab(tabId) {
    if (!Object.hasOwn(domainsByTab, tabId)) throw new Error(`Unknown hydration tab: ${tabId}`);
    return [...domainsByTab[tabId]];
  }

  async function hydrateDomain(name, { force = false } = {}) {
    const load = loaders[name];
    if (typeof load !== "function") throw new Error(`Unknown hydration domain: ${name}`);
    const authority = String(getAuthority() || "unknown");
    if (!force && loadedAuthority.get(name) === authority) return { name, status: "cached", authority };
    const key = `${name}\u0000${authority}`;
    if (inFlight.has(key)) {
      await inFlight.get(key);
      return { name, status: "coalesced", authority };
    }
    const task = Promise.resolve().then(load);
    inFlight.set(key, task);
    try {
      await task;
      if (String(getAuthority() || "unknown") === authority) loadedAuthority.set(name, authority);
      onSuccess({ name, authority });
      return { name, status: "loaded", authority };
    } catch (error) {
      onFailure({ name, authority, error });
      throw error;
    } finally {
      inFlight.delete(key);
    }
  }

  async function hydrateDomains(names = [], options = {}) {
    const requested = [...new Set(names)];
    const results = [];
    const size = Math.max(1, Number(batchSize) || 4);
    for (let index = 0; index < requested.length; index += size) {
      const batch = requested.slice(index, index + size);
      const settled = await Promise.allSettled(batch.map((name) => hydrateDomain(name, options)));
      settled.forEach((result, offset) => {
        results.push(result.status === "fulfilled"
          ? result.value
          : { name: batch[offset], status: "failed", authority: String(getAuthority() || "unknown"), error: result.reason });
      });
    }
    return results;
  }

  async function hydrateTab(tabId, options = {}) {
    const authority = String(getAuthority() || "unknown");
    const requested = domainsForTab(tabId);
    const results = await hydrateDomains(requested, options);
    return {
      schemaVersion: "1.0",
      kind: "tab-hydration-receipt",
      tabId,
      authority,
      requested,
      loaded: results.filter((row) => row.status === "loaded").map((row) => row.name),
      cached: results.filter((row) => row.status === "cached").map((row) => row.name),
      coalesced: results.filter((row) => row.status === "coalesced").map((row) => row.name),
      failures: results.filter((row) => row.status === "failed").map((row) => ({
        name: row.name,
        message: String(row.error?.message || row.error || "Hydration failed.").slice(0, 160)
      }))
    };
  }

  function invalidate(names = null) {
    const targets = names == null ? [...loadedAuthority.keys()] : names;
    for (const name of targets) loadedAuthority.delete(name);
  }

  function snapshot() {
    return {
      topology,
      loaded: Object.fromEntries(loadedAuthority),
      inFlight: [...inFlight.keys()]
    };
  }

  return { topology, domainsForTab, hydrateDomain, hydrateDomains, hydrateTab, invalidate, snapshot };
}
