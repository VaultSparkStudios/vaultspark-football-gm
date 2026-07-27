export const FRANCHISE_SCOPE_SCHEMA_VERSION = "1.0";

export function normalizeFranchiseScope(value, fallback = "unassigned") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 96);
  return normalized || fallback;
}

export function franchiseScopeFromDashboard(dashboard = {}) {
  dashboard = dashboard && typeof dashboard === "object" ? dashboard : {};
  const exact = dashboard.franchiseId || dashboard.franchiseKey;
  if (exact) return normalizeFranchiseScope(exact);
  const team = dashboard.controlledTeamId || dashboard.controlledTeam?.id || dashboard.controlledTeam?.teamId || "unassigned";
  const start = dashboard.startYear || dashboard.currentYear || "unknown";
  return normalizeFranchiseScope(`legacy-${team}-${start}`);
}

export function dashboardAuthorityKey(dashboard = {}) {
  dashboard = dashboard && typeof dashboard === "object" ? dashboard : {};
  return [
    franchiseScopeFromDashboard(dashboard),
    dashboard.controlledTeamId || dashboard.controlledTeam?.id || "none",
    dashboard.currentYear ?? dashboard.startYear ?? "unknown",
    dashboard.currentWeek ?? "unknown",
    dashboard.phase || "unknown"
  ].join(":");
}

export function franchiseStorageKey(prefix, dashboardOrScope = {}) {
  const scope = typeof dashboardOrScope === "string"
    ? normalizeFranchiseScope(dashboardOrScope)
    : franchiseScopeFromDashboard(dashboardOrScope);
  return `${String(prefix || "franchise").replace(/:+$/g, "")}:${scope}`;
}
