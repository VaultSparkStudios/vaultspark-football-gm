/**
 * VaultSpark Football GM — Privacy-First Engagement Analytics
 *
 * Collects anonymous usage signals: no PII, no network requests, localStorage only.
 * Players opt in via the Settings tab. Studio exports the aggregate via the console
 * or the exportSummary() call for offline review.
 */

const STORAGE_KEY = "vsfgm_analytics";
const OPT_IN_KEY = "vsfgm_analytics_optin";
const SCHEMA_VERSION = 1;

function _blank() {
  return {
    schemaVersion: SCHEMA_VERSION,
    installDate: new Date().toISOString().slice(0, 10),
    sessions: 0,
    totalPlayMinutes: 0,
    leaguesCreated: 0,
    leaguesLoaded: 0,
    yearsSimmed: 0,
    weeksAdvanced: 0,
    draftsCompleted: 0,
    tradesCompleted: 0,
    contractsRestructured: 0,
    tabVisits: {},
    lastSession: null,
    sessionStartTs: null
  };
}

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return _blank();
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== SCHEMA_VERSION) return _blank();
    return parsed;
  } catch {
    return _blank();
  }
}

function _save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota errors are silently ignored
  }
}

export function isOptedIn() {
  return localStorage.getItem(OPT_IN_KEY) === "yes";
}

export function setOptIn(value) {
  if (value) {
    localStorage.setItem(OPT_IN_KEY, "yes");
  } else {
    localStorage.removeItem(OPT_IN_KEY);
    localStorage.removeItem(STORAGE_KEY);
  }
}

function withData(fn) {
  if (!isOptedIn()) return;
  const data = _load();
  fn(data);
  _save(data);
}

export function trackSessionStart() {
  withData((d) => {
    d.sessions += 1;
    d.sessionStartTs = Date.now();
    d.lastSession = new Date().toISOString().slice(0, 10);
  });
}

export function trackSessionEnd() {
  withData((d) => {
    if (d.sessionStartTs) {
      const minutes = Math.round((Date.now() - d.sessionStartTs) / 60000);
      d.totalPlayMinutes += Math.min(minutes, 480); // cap single-session at 8h
      d.sessionStartTs = null;
    }
  });
}

export function trackLeagueCreated() {
  withData((d) => { d.leaguesCreated += 1; });
}

export function trackLeagueLoaded() {
  withData((d) => { d.leaguesLoaded += 1; });
}

export function trackYearSimmed() {
  withData((d) => { d.yearsSimmed += 1; });
}

export function trackWeekAdvanced() {
  withData((d) => { d.weeksAdvanced += 1; });
}

export function trackDraftCompleted() {
  withData((d) => { d.draftsCompleted += 1; });
}

export function trackTradeCompleted() {
  withData((d) => { d.tradesCompleted += 1; });
}

export function trackContractRestructured() {
  withData((d) => { d.contractsRestructured += 1; });
}

export function trackTabVisit(tabName) {
  withData((d) => {
    d.tabVisits[tabName] = (d.tabVisits[tabName] || 0) + 1;
  });
}

export function exportSummary() {
  if (!isOptedIn()) return null;
  const data = _load();
  const avgSessionMinutes = data.sessions > 0
    ? Math.round(data.totalPlayMinutes / data.sessions)
    : 0;
  const topTabs = Object.entries(data.tabVisits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tab, count]) => `${tab}(${count})`);
  return {
    ...data,
    avgSessionMinutes,
    topTabs: topTabs.join(", ") || "—"
  };
}
