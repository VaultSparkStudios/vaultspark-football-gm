import { state, api } from "./appState.js";
import { applyShellTheme, escapeHtml, fmtMoney, presentActionError, renderPanelError, renderTable, selectedSeasonType, setSimControl, setStatus, shapeStatsRowsForDisplay, showToast, syncTeamSelects, teamCode, updateTopMeta } from "./appCore.js";
import { renderBoxScoreTicker, renderCapAlertBanner, renderFanSentimentCard, renderGmLegacyScore, renderInjuryOverlayCard, renderLeaders, renderNewsTicker, renderOverview, renderOwnerUltimatum, renderRosterNeeds, renderSchedule, renderSeasonPreviewPanel, renderStandings, renderStatLeadersStrip, renderWeekResults } from "./tabOverview.js";
import { depthDefaultShares, renderDepthChart, renderFreeAgency, renderRetiredPool, renderRoster } from "./tabRoster.js";
import { deriveContractToolsFromRoster, getTradeTeamId, renderContractsPage, renderExpiringContracts, renderTradeWorkspace, setSelectedDesignationPlayer, setSelectedRetirementOverridePlayer } from "./tabContracts.js";
import { renderDraft, renderScouting } from "./tabDraft.js";
import { applyStatsSort, renderAnalyticsChart, renderComparePlayers, renderCompareSearchResults, updateStatsControls } from "./tabStats.js";
import { renderCalendar, renderPlayerHistoryArchive, renderPlayerTimelineSearchResults, renderRecordsAndHistory, renderTeamHistorySpotlight, setSelectedHistoryPlayer } from "./tabHistory.js";
import { appendSeasonEpilogue } from "./seasonEpilogue.js";
import { applySettingsControls, loadRewindHistory, renderAnalytics, renderCalibrationJobs, renderCommandPalette, renderNegotiationTargets, renderNews, renderObservability, renderOwner, renderPersistence, renderPickAssets, renderPipeline, renderRealismVerification, renderRulesTab, renderSettingsSpotlight, renderSimJobs, renderStaff, renderTransactionLog } from "./tabSettings.js";
import { closeModal, openModal } from "./modalManager.js";
import { buildTacticalMatchupBrief, previewTacticalIdentity } from "./tacticalFilmRoom.js";
import { ingestNewsIntoInbox, renderInboxBadge } from "./engagementFeatures.js";
import { appendSimulationDigest, classifySimulationCheckpoint, formatSimulationDigest, hasPendingSimulationDecision } from "./simulationCheckpoints.js";
import { createAuthorityEpochTracker } from "./authorityEpoch.js";
import { observeBackgroundTask, recordClientDiagnostic, resolveClientDiagnostic } from "./clientDiagnostics.js";
import { maybeMountContextualFeedback } from "./contextualFeedback.js";

const hydrationAuthority = createAuthorityEpochTracker();

function dashboardAuthorityKey(dashboard = {}) {
  return [dashboard.leagueId || dashboard.startYear || "league", dashboard.controlledTeamId || "none", dashboard.currentYear, dashboard.currentWeek, dashboard.phase].join(":");
}

function beginHydration(scope, key = "") {
  return hydrationAuthority.begin(scope, key);
}

function commitHydration(token, key, callback) {
  const committed = hydrationAuthority.commit(token, key, callback);
  state.hydrationAuthority = hydrationAuthority.snapshot();
  return committed;
}

export function applyDashboard(newState) {
  const previous = state.dashboard;
  hydrationAuthority.replaceAuthority(dashboardAuthorityKey(newState));
  state.hydrationAuthority = hydrationAuthority.snapshot();
  state.dashboard = newState;
  state.leagueSettings = newState.settings || state.leagueSettings;
  state.contractTools = {
    expiring: newState.contractTools?.expiring || [],
    tagEligible: newState.contractTools?.tagEligible || [],
    optionEligible: newState.contractTools?.optionEligible || []
  };
  state.pipeline = newState.offseasonPipeline || state.pipeline;
  state.calibrationJobs = newState.calibrationJobs || state.calibrationJobs;
  state.observability = newState.observability ? { ...(state.observability || {}), runtime: newState.observability } : state.observability;
  state.depthSnapShare = newState.depthChartSnapShare || state.depthSnapShare;
  state.realismVerification = newState.lastRealismVerificationReport || state.realismVerification;
  state.recentBoxScores = newState.recentBoxScores || state.recentBoxScores;
  state.whatIfReplay = newState.whatIfReplay || state.whatIfReplay;

  if (!previous || previous.currentYear !== newState.currentYear) {
    state.scheduleYear = newState.currentYear;
    state.scheduleWeek = newState.currentWeek;
    state.scheduleCache = {};
  } else if (previous.currentWeek !== newState.currentWeek) {
    state.scheduleCache = {};
    if (state.scheduleWeek === previous.currentWeek || !Number.isFinite(state.scheduleWeek)) {
      state.scheduleWeek = newState.currentWeek;
    }
  }

  if (newState.currentWeekSchedule) {
    state.scheduleCache[newState.currentWeekSchedule.week] = newState.currentWeekSchedule;
  }
  if (newState.nextWeekSchedule) {
    state.scheduleCache[newState.nextWeekSchedule.week] = newState.nextWeekSchedule;
  }
  if (!Number.isFinite(state.scheduleWeek)) {
    state.scheduleWeek = newState.currentWeek;
  }

  updateTopMeta();
  syncTeamSelects();
  renderOverview();
  renderRosterNeeds();
  renderLeaders();
  renderSchedule();
  renderStandings();
  renderWeekResults();
  renderBoxScoreTicker();
  renderFreeAgency();
  renderExpiringContracts();
  state.newsRows = newState.news || state.newsRows;
  state.picks = newState.draftPickAssets || state.picks;
  renderNews();
  renderPickAssets();
  renderPipeline();
  renderCalibrationJobs();
  renderRealismVerification();
  renderRulesTab();
  applySettingsControls();
  renderRecordsAndHistory();
  renderNewsTicker();
  renderSeasonPreviewPanel();
  observeBackgroundTask(renderGmLegacyScore, {
    surface: "overview",
    operation: "gm-legacy",
    authorityKey: dashboardAuthorityKey(newState)
  });
  renderCapAlertBanner();
  renderFanSentimentCard();
  renderInjuryOverlayCard();
  observeBackgroundTask(renderStatLeadersStrip, {
    surface: "overview",
    operation: "stat-leaders",
    authorityKey: dashboardAuthorityKey(newState)
  });
  renderOwnerUltimatum();
  checkSeasonEndReview(previous);
  if (typeof globalThis._renderSpeedrunPanel === "function") globalThis._renderSpeedrunPanel();

  // Check speedrun completion on postseason → offseason transition
  if (previous && (previous.phase === "postseason" || previous.phase === "regular-season")
    && (newState.phase === "offseason" || newState.phase === "season-awards")) {
    if (typeof globalThis._checkSpeedrunCompletion === "function") {
      observeBackgroundTask(() => globalThis._checkSpeedrunCompletion(), {
        surface: "challenge",
        operation: "speedrun-completion",
        authorityKey: dashboardAuthorityKey(newState)
      });
    }
  }

  const yearInput = document.getElementById("yearFilter");
  if (yearInput && (!yearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    yearInput.value = String(state.dashboard.currentYear);
  }
  const txYearInput = document.getElementById("txYearFilter");
  if (txYearInput && (!txYearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    txYearInput.value = String(state.dashboard.currentYear);
  }
  const analyticsYearInput = document.getElementById("analyticsYearFilter");
  if (analyticsYearInput && (!analyticsYearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    analyticsYearInput.value = String(state.dashboard.currentYear);
  }  maybeMountContextualFeedback(newState, { onSaved: () => showToast("Private playtest receipt saved locally.") });

}

function closeMobileNav() {
  const menu = document.getElementById("sideMenu");
  const toggle = document.getElementById("mobileNavToggle");
  if (!menu) return;
  menu.classList.remove("nav-open");
  document.body.classList.remove("mobile-nav-open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

export function initMobileNavDrawer() {
  const toggle = document.getElementById("mobileNavToggle");
  const backdrop = document.getElementById("sideMenuBackdrop");
  const menu = document.getElementById("sideMenu");
  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.contains("nav-open");
    if (isOpen) {
      closeMobileNav();
    } else {
      menu.classList.add("nav-open");
      document.body.classList.add("mobile-nav-open");
      toggle.setAttribute("aria-expanded", "true");
      menu.focus();
    }
  });

  if (backdrop) {
    backdrop.addEventListener("click", closeMobileNav);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("mobile-nav-open")) {
      closeMobileNav();
      toggle.focus();
    }
  });
}

export function activateTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle("active", isActive);
    // ARIA tab state must track the active tab (S29) — a screen reader
    // otherwise announces whichever tab loaded first as selected forever.
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.setAttribute("tabindex", isActive ? "0" : "-1");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  closeMobileNav();
  applyShellTheme();
  if (tabId === "contractsTab") {
    loadContractsTeam().catch((error) => {
      presentActionError(error);
    });
  }
  if (tabId === "settingsTab") {
    observeBackgroundTask(loadRewindHistory, {
      surface: "settings",
      operation: "rewind-history",
      authorityKey: dashboardAuthorityKey(state.dashboard)
    });
    if (typeof globalThis._loadSpeedrunStatus === "function") {
      observeBackgroundTask(() => globalThis._loadSpeedrunStatus(), {
        surface: "settings",
        operation: "speedrun-status",
        authorityKey: dashboardAuthorityKey(state.dashboard)
      });
    }
  }
}

export async function loadState({ timeoutMs } = {}) {
  const data = await api("/api/state", timeoutMs ? { timeoutMs } : {});
  applyDashboard(data);
}

export async function loadScheduleWeek(week) {
  const safeWeek = Math.max(1, Number(week) || state.dashboard?.currentWeek || 1);
  state.scheduleWeek = safeWeek;
  if (!state.scheduleCache[safeWeek]) {
    const payload = await api(`/api/schedule?week=${safeWeek}`);
    state.scheduleCache[safeWeek] = payload.schedule || null;
  }
  renderSchedule();
}

export async function loadCalendar() {
  const selectedYear = Number(document.getElementById("calendarYearFilter").value || state.dashboard?.currentYear);
  const token = beginHydration("calendar", selectedYear);
  const payload = await api(`/api/calendar?year=${selectedYear}`);
  commitHydration(token, Number(document.getElementById("calendarYearFilter").value || state.dashboard?.currentYear), () => {
    state.calendar = payload.calendar || null;
    state.calendarWeek = Number(document.getElementById("calendarWeekFilter").value || state.dashboard?.currentWeek || 1);
    renderCalendar();
  });
}

export async function loadTransactionLog() {
  const team = document.getElementById("txTeamFilter").value;
  const type = document.getElementById("txTypeFilter").value;
  const year = document.getElementById("txYearFilter").value;
  const limit = Number(document.getElementById("txLimitFilter").value || 300);

  const query = new URLSearchParams();
  if (team) query.set("team", team);
  if (type) query.set("type", type);
  if (year) query.set("year", year);
  query.set("limit", String(limit));

  const payload = await api(`/api/transactions?${query.toString()}`);
  state.txRows = payload.transactions || [];
  renderTransactionLog();
}

export async function loadNews() {
  const payload = await api("/api/news?limit=120");
  state.newsRows = payload.news || [];
  renderNews();
}

export async function loadPickAssets() {
  const teamA = getTradeTeamId("A").toUpperCase();
  const teamB = getTradeTeamId("B").toUpperCase();
  const [teamARoster, teamBRoster, teamAPicks, teamBPicks] = await Promise.all([
    api(`/api/roster?team=${encodeURIComponent(teamA)}`),
    api(`/api/roster?team=${encodeURIComponent(teamB)}`),
    api(`/api/picks?team=${encodeURIComponent(teamA)}`),
    api(`/api/picks?team=${encodeURIComponent(teamB)}`)
  ]);
  state.tradeTeamARoster = teamARoster.roster || [];
  state.tradeTeamBRoster = teamBRoster.roster || [];
  state.tradeTeamAPicks = teamAPicks.picks || [];
  state.tradeTeamBPicks = teamBPicks.picks || [];
  const teamARosterIds = new Set(state.tradeTeamARoster.map((player) => player.id));
  const teamBRosterIds = new Set(state.tradeTeamBRoster.map((player) => player.id));
  const teamAPickIds = new Set(state.tradeTeamAPicks.map((pick) => pick.id));
  const teamBPickIds = new Set(state.tradeTeamBPicks.map((pick) => pick.id));
  state.tradeAssets.teamAPlayerIds = state.tradeAssets.teamAPlayerIds.filter((id) => teamARosterIds.has(id));
  state.tradeAssets.teamBPlayerIds = state.tradeAssets.teamBPlayerIds.filter((id) => teamBRosterIds.has(id));
  state.tradeAssets.teamAPickIds = state.tradeAssets.teamAPickIds.filter((id) => teamAPickIds.has(id));
  state.tradeAssets.teamBPickIds = state.tradeAssets.teamBPickIds.filter((id) => teamBPickIds.has(id));
  renderTradeWorkspace();
  renderPickAssets();
}

export async function loadNegotiations(teamId = null) {
  const safeTeamId = teamId || state.contractTeamId || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/contracts/negotiations?team=${encodeURIComponent(safeTeamId)}`);
  renderNegotiationTargets(payload.targets || []);
}

export async function loadContractsTeam() {
  const teamId = (document.getElementById("contractsTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const token = beginHydration("contracts", teamId);
  const [rosterPayload, expiringPayload] = await Promise.all([
    api(`/api/roster?team=${encodeURIComponent(teamId)}`),
    api(`/api/contracts/expiring?team=${encodeURIComponent(teamId)}`)
  ]);
  const currentTeamId = (document.getElementById("contractsTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  if (!commitHydration(token, currentTeamId, () => {
  state.contractTeamId = teamId;
  state.contractRoster = rosterPayload.roster || [];
  state.contractCap = rosterPayload.cap || null;
  const derived = deriveContractToolsFromRoster(state.contractRoster, expiringPayload.players || []);
  state.contractTools = {
    expiring: expiringPayload.players || derived.expiring,
    tagEligible: derived.tagEligible,
    optionEligible: derived.optionEligible
  };
  if (state.selectedContractPlayerId && !state.contractRoster.some((player) => player.id === state.selectedContractPlayerId)) {
    state.selectedContractPlayerId = null;
  }
  renderExpiringContracts();
  renderContractsPage();
  })) return;
  await loadNegotiations(teamId);
}

export async function loadAnalytics() {
  const year = document.getElementById("analyticsYearFilter").value || state.dashboard?.currentYear;
  const teamId = document.getElementById("analyticsTeamFilter").value;
  const query = new URLSearchParams({ year: String(year) });
  if (teamId) query.set("team", teamId);
  const payload = await api(`/api/analytics?${query.toString()}`);
  state.analytics = payload.analytics || null;
  renderAnalytics();
  renderAnalyticsChart();
}

export async function loadSettings() {
  const token = beginHydration("settings", "league");
  const payload = await api("/api/settings");
  commitHydration(token, "league", () => {
    state.leagueSettings = payload.settings || null;
    applySettingsControls();
  });
}

export async function loadStaff() {
  const teamId = document.getElementById("staffTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/staff?team=${encodeURIComponent(teamId)}`);
  state.staffState = payload.staff || null;
  renderStaff();
}

export async function loadOwner() {
  const teamId = document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const token = beginHydration("owner", teamId);
  const payload = await api(`/api/owner?team=${encodeURIComponent(teamId)}`);
  const currentTeamId = document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  commitHydration(token, currentTeamId, () => {
  state.ownerState = payload.owner || null;
  const owner = state.ownerState?.owner;
  if (owner) {
    document.getElementById("ownerTicketPriceInput").value = owner.ticketPrice ?? "";
    document.getElementById("ownerStaffBudgetInput").value = owner.staffBudget ?? "";
    document.getElementById("ownerTrainingInput").value = owner.facilities?.training ?? "";
    document.getElementById("ownerRehabInput").value = owner.facilities?.rehab ?? "";
    document.getElementById("ownerAnalyticsInput").value = owner.facilities?.analytics ?? "";
  }
  renderOwner();
  });
}

export async function loadObservability() {
  const token = beginHydration("observability", "runtime");
  const payload = await api("/api/observability");
  commitHydration(token, "runtime", () => {
    state.observability = payload || null;
    renderObservability();
  });
}

export async function loadPersistence() {
  const payload = await api("/api/system/persistence");
  state.persistence = payload.persistence || null;
  renderPersistence();
}

export async function loadPipeline() {
  const payload = await api("/api/offseason/pipeline");
  state.pipeline = payload.pipeline || null;
  renderPipeline();
}

export async function loadCalibrationJobs() {
  const payload = await api("/api/calibration/jobs?limit=60");
  state.calibrationJobs = payload.jobs || [];
  renderCalibrationJobs();
}

export async function runRealismVerification() {
  const years = Number(document.getElementById("realismVerifyYearsInput").value || 12);
  const safeYears = Math.max(1, Math.min(30, Math.floor(years)));
  const payload = await api(`/api/realism/verify?seasons=${encodeURIComponent(safeYears)}`);
  state.realismVerification = payload.report || null;
  renderRealismVerification();
}

export async function loadSimJobs() {
  const payload = await api("/api/jobs/simulate");
  state.simJobs = payload.jobs || [];
  renderSimJobs();
}

export async function loadComparePlayers() {
  const ids = state.comparePlayerIds.slice(0, 8);
  if (!ids.length) {
    state.comparePlayers = [];
    renderComparePlayers();
    return;
  }
  const payload = await api(`/api/compare/players?ids=${encodeURIComponent(ids.join(","))}`);
  state.comparePlayers = payload.players || [];
  renderComparePlayers();
}

export async function searchComparePlayers() {
  const query = document.getElementById("comparePlayerSearchInput").value.trim();
  if (!query) {
    state.compareSearchResults = [];
    renderCompareSearchResults();
    return;
  }
  const payload = await api(`/api/players/search?q=${encodeURIComponent(query)}&limit=12&includeRetired=1`);
  state.compareSearchResults = payload.players || [];
  renderCompareSearchResults();
}

export async function loadRoster() {
  const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const query = new URLSearchParams({ team: teamId });
  const pos = document.getElementById("rosterPosFilter").value;
  const minOverall = document.getElementById("rosterMinOverallFilter").value;
  const minAge = document.getElementById("rosterMinAgeFilter").value;
  const maxAge = document.getElementById("rosterMaxAgeFilter").value;
  if (pos) query.set("position", pos);
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const requestKey = query.toString();
  const token = beginHydration("roster", requestKey);
  const data = await api(`/api/roster?${query.toString()}`);
  const currentTeamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const currentKey = new URLSearchParams({ team: currentTeamId });
  const currentPos = document.getElementById("rosterPosFilter").value;
  const currentMinOverall = document.getElementById("rosterMinOverallFilter").value;
  const currentMinAge = document.getElementById("rosterMinAgeFilter").value;
  const currentMaxAge = document.getElementById("rosterMaxAgeFilter").value;
  if (currentPos) currentKey.set("position", currentPos);
  if (currentMinOverall) currentKey.set("minOverall", currentMinOverall);
  if (currentMinAge) currentKey.set("minAge", currentMinAge);
  if (currentMaxAge) currentKey.set("maxAge", currentMaxAge);
  if (!commitHydration(token, currentKey.toString(), () => {
  state.roster = data.roster || [];
  setSelectedDesignationPlayer(state.selectedDesignationPlayerId);
  renderRoster();
  if (!state.contractTeamId || state.contractTeamId === teamId) {
    state.contractTeamId = teamId;
    state.contractRoster = data.roster || [];
    state.contractCap = data.cap || null;
  }
  })) return;
}

export async function loadFreeAgency() {
  const position = document.getElementById("faPositionFilter").value;
  const query = new URLSearchParams({ limit: "220" });
  if (position) query.set("position", position);
  const minOverall = document.getElementById("faMinOverallFilter").value;
  const minAge = document.getElementById("faMinAgeFilter").value;
  const maxAge = document.getElementById("faMaxAgeFilter").value;
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const data = await api(`/api/free-agents?${query.toString()}`);
  state.freeAgents = data.freeAgents || [];
  renderFreeAgency();
}

export async function loadRetiredPool() {
  const query = new URLSearchParams({ limit: "300" });
  const position = document.getElementById("retiredPosFilter").value;
  const minOverall = document.getElementById("retiredMinOverallFilter").value;
  const minAge = document.getElementById("retiredMinAgeFilter").value;
  const maxAge = document.getElementById("retiredMaxAgeFilter").value;
  if (position) query.set("position", position);
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const payload = await api(`/api/retired?${query.toString()}`);
  state.retiredPool = payload.retired || [];
  setSelectedRetirementOverridePlayer(state.selectedRetirementOverridePlayerId);
  renderRetiredPool();
}

export async function loadStats() {
  const scope = document.getElementById("scopeFilter").value;
  const category = document.getElementById("categoryFilter").value;
  const position = document.getElementById("positionFilter").value;
  const teamFilter = document.getElementById("statsTeamFilter").value;
  const seasonType = selectedSeasonType();
  let year = document.getElementById("yearFilter").value;

  if (scope !== "career" && !year) {
    year = String(state.dashboard?.currentYear || new Date().getFullYear());
    document.getElementById("yearFilter").value = year;
  }

  let payload;
  state.statsCompanionRows = {};
  if (scope === "season") {
    const query = new URLSearchParams({ category });
    if (year) query.set("year", year);
    if (position) query.set("position", position);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    query.set("seasonType", seasonType);
    payload = await api(`/api/tables/player-season?${query.toString()}`);
    if (category === "rushing" || category === "receiving") {
      const companionQuery = new URLSearchParams(query);
      companionQuery.set("category", category === "rushing" ? "receiving" : "rushing");
      const companion = await api(`/api/tables/player-season?${companionQuery.toString()}`);
      state.statsCompanionRows[category === "rushing" ? "receiving" : "rushing"] = companion.rows || [];
    }
  } else if (scope === "career") {
    const query = new URLSearchParams({ category });
    if (position) query.set("position", position);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    query.set("seasonType", seasonType);
    payload = await api(`/api/tables/player-career?${query.toString()}`);
    if (category === "rushing" || category === "receiving") {
      const companionQuery = new URLSearchParams(query);
      companionQuery.set("category", category === "rushing" ? "receiving" : "rushing");
      const companion = await api(`/api/tables/player-career?${companionQuery.toString()}`);
      state.statsCompanionRows[category === "rushing" ? "receiving" : "rushing"] = companion.rows || [];
    }
  } else {
    const query = new URLSearchParams();
    if (year) query.set("year", year);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    payload = await api(`/api/tables/team-season?${query.toString()}`);
  }

  state.statsRows = shapeStatsRowsForDisplay(payload.rows || [], { scope, category });
  state.statsPage = 1;
  if (state.statsRows[0] && (!state.statsSortKey || !(state.statsSortKey in state.statsRows[0]))) {
    const preferred = ["yds", "td", "tkl", "sacks", "offSn", "defSn", "fgm", "pf", "wins"];
    state.statsSortKey = preferred.find((col) => col in state.statsRows[0]) || Object.keys(state.statsRows[0])[0];
  }
  applyStatsSort();
}

export async function exportSnapshot() {
  const payload = await api("/api/snapshot/export");
  const blob = new Blob([`${JSON.stringify(payload.snapshot, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.fileName || "vsfgm-snapshot.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function importSnapshot(file) {
  if (!file) throw new Error("Choose a snapshot file first.");
  let snapshot = null;
  try {
    snapshot = JSON.parse(await file.text());
  } catch {
    throw new Error("Invalid snapshot JSON.");
  }
  await api("/api/snapshot/inspect", { method: "POST", body: { snapshot } });
  const payload = await api("/api/snapshot/import", { method: "POST", body: { snapshot } });
  applyDashboard(payload.state);
  await refreshEverything();
}

export async function loadDraftState() {
  const data = await api("/api/draft");
  state.draftState = data.draft || null;
  renderDraft();
}

export async function loadScouting() {
  const teamId = state.dashboard?.controlledTeamId || "BUF";
  const token = beginHydration("scouting", teamId);
  const payload = await api(`/api/scouting?team=${encodeURIComponent(teamId)}&limit=140`);
  commitHydration(token, state.dashboard?.controlledTeamId || "BUF", () => {
    state.scouting = payload.scouting || null;
    renderScouting();
  });
}

export async function loadDepthChart() {
  const teamId = (document.getElementById("depthTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const position = document.getElementById("depthPositionSelect").value;
  const token = beginHydration("depth-chart", `${teamId}:${position}`);
  const [payload, rosterPayload] = await Promise.all([
    api(`/api/depth-chart?team=${encodeURIComponent(teamId)}`),
    api(`/api/roster?team=${encodeURIComponent(teamId)}`)
  ]);
  const currentTeamId = (document.getElementById("depthTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const currentPosition = document.getElementById("depthPositionSelect").value;
  commitHydration(token, `${currentTeamId}:${currentPosition}`, () => {
  state.depthChart = payload.depthChart || null;
  state.depthSnapShare = payload.snapShare || null;
  state.depthDefaultShares = Object.fromEntries(
    Object.entries(payload.snapShare || {}).map(([sharePosition, rows]) => [
      sharePosition,
      (rows || []).map((row) => Number(row.defaultSnapShare ?? row.snapShare ?? 0.02))
    ])
  );
  state.depthManualShares = Object.fromEntries(
    Object.entries(payload.snapShare || {}).map(([sharePosition, rows]) => [
      sharePosition,
      Object.fromEntries(
        (rows || [])
          .filter((row) => row.manual)
          .map((row) => [row.playerId, Number(row.snapShare ?? 0)])
      )
    ])
  );
  state.depthRoster = rosterPayload.roster || [];
  state.depthOrder = [...(state.depthChart?.[position] || [])];
  renderDepthChart();
  });
}

export async function loadSaves() {
  const payload = await api("/api/saves");
  state.saves = payload.slots || [];
  const text = state.saves.length
    ? state.saves.map((slot) => `${slot.slot} (${new Date(slot.updatedAt).toLocaleString()})`).join(" | ")
    : "No save slots yet.";
  document.getElementById("saveListText").textContent = text;
  renderSettingsSpotlight();
}

export async function loadQa() {
  const year = state.dashboard?.currentYear || new Date().getFullYear();
  const payload = await api(`/api/qa/season?year=${year}`);
  const rows = Object.entries(payload.report.actual || {}).map(([metric, actual]) => ({
    metric,
    target: payload.report.target?.[metric],
    actual,
    delta: payload.report.deltas?.[metric]
  }));
  renderTable("qaTable", rows);
}

export async function loadTeamHistory() {
  const teamId = document.getElementById("teamHistorySelect").value || state.dashboard?.controlledTeamId;
  const token = beginHydration("team-history", teamId);
  const payload = await api(`/api/history/team?team=${encodeURIComponent(teamId)}`);
  const currentTeamId = document.getElementById("teamHistorySelect").value || state.dashboard?.controlledTeamId;
  if (!commitHydration(token, currentTeamId, () => {
  state.teamHistory = payload.history || null;
  renderTeamHistorySpotlight(payload.history || null);
  renderTable(
    "teamHistoryTable",
    (payload.history?.seasons || []).map((season) => ({
      year: season.year,
      w: season.wins,
      l: season.losses,
      t: season.ties,
      pf: season.pf,
      pa: season.pa
    }))
  );
  })) return;
}

export async function loadPlayerTimeline() {
  const playerId = state.selectedHistoryPlayerId;
  if (!playerId) return;
  const payload = await api(`/api/history/player?playerId=${encodeURIComponent(playerId)}`);
  state.historyTimeline = payload.timeline || null;
  let rows = (payload.timeline?.timeline || []).map((entry) => ({
    year: entry.year,
    tm: teamCode(entry.teamId),
    champion: entry.champion ? "Yes" : "",
    awards: (entry.awards || []).join(", "),
    passYds: entry.stats?.passing?.yards || 0,
    passTd: entry.stats?.passing?.td || 0,
    rushYds: entry.stats?.rushing?.yards || 0,
    rushTd: entry.stats?.rushing?.td || 0,
    recYds: entry.stats?.receiving?.yards || 0,
    recTd: entry.stats?.receiving?.td || 0,
    tackles: entry.stats?.defense?.tackles || 0,
    sacks: entry.stats?.defense?.sacks || 0,
    ints: entry.stats?.defense?.int || 0
  }));
  if (!rows.length && payload.timeline) {
    const selected = (state.historyPlayerSearchResults || []).find((player) => player.id === playerId) || null;
    rows = [{
      year: state.dashboard?.currentYear || "-",
      tm: teamCode(selected?.teamId || ""),
      champion: "",
      awards: "No logged seasons for this filter",
      passYds: 0,
      passTd: 0,
      rushYds: 0,
      rushTd: 0,
      recYds: 0,
      recTd: 0,
      tackles: 0,
      sacks: 0,
      ints: 0
    }];
  }
  renderPlayerHistoryArchive(payload.timeline || null);
  renderTable("playerTimelineTable", rows);
}

export async function retireSelectedJersey() {
  const teamId = document.getElementById("teamHistorySelect").value || state.dashboard?.controlledTeamId;
  if (!teamId || !state.selectedHistoryPlayerId) return;
  await api("/api/history/retire-jersey", {
    method: "POST",
    body: {
      teamId,
      playerId: state.selectedHistoryPlayerId
    }
  });
  await Promise.all([loadState(), loadTeamHistory()]);
}

export async function searchHistoryPlayers() {
  const query = document.getElementById("playerTimelineSearchInput").value.trim();
  if (!query) {
    state.historyPlayerSearchResults = [];
    renderPlayerTimelineSearchResults();
    setSelectedHistoryPlayer(null);
    return;
  }
  const payload = await api(`/api/players/search?q=${encodeURIComponent(query)}&limit=12&includeRetired=1`);
  state.historyPlayerSearchResults = payload.players || [];
  const nextSelection = state.historyPlayerSearchResults.find((player) => player.id === state.selectedHistoryPlayerId) || null;
  setSelectedHistoryPlayer(nextSelection);
  renderPlayerTimelineSearchResults();
}

export function syncBootFilters() {
  document.getElementById("analyticsYearFilter").value = String(state.dashboard?.currentYear || new Date().getFullYear());
}

export async function loadCoreDashboard() {
  await loadState({ timeoutMs: 4000 });
  updateStatsControls();
  syncBootFilters();
  renderCommandPalette();
  renderRulesTab();
  renderAnalyticsChart();
  renderRealismVerification();
}

async function runLoaderBatch(loaders = []) {
  const results = await Promise.allSettled(loaders.map((loader) => loader.load()));
  return results
    .map((result, index) => {
      const loader = loaders[index];
      if (result.status === "fulfilled") {
        resolveClientDiagnostic({ surface: "hydration", operation: loader.name });
        return null;
      }
      const message = result.reason?.message || `${loader.name} failed.`;
      recordClientDiagnostic({
        surface: "hydration",
        operation: loader.name,
        error: message,
        authorityKey: state.hydrationAuthority?.identity,
        retry: loader.load
      });
      return message;
    })
    .filter(Boolean);
}

export async function loadSecondaryPanels({ background = false } = {}) {
  const loaderFns = [
    ["roster", loadRoster], ["contracts", loadContractsTeam], ["free-agency", loadFreeAgency],
    ["retired-pool", loadRetiredPool], ["stats", loadStats], ["draft", loadDraftState],
    ["scouting", loadScouting], ["depth-chart", loadDepthChart], ["saves", loadSaves],
    ["qa", loadQa], ["team-history", loadTeamHistory], ["calendar", loadCalendar],
    ["transactions", loadTransactionLog], ["news", loadNews], ["pick-assets", loadPickAssets],
    ["negotiations", loadNegotiations], ["analytics", loadAnalytics], ["settings", loadSettings],
    ["staff", loadStaff], ["owner", loadOwner], ["observability", loadObservability],
    ["persistence", loadPersistence], ["pipeline", loadPipeline],
    ["calibration-jobs", loadCalibrationJobs], ["simulation-jobs", loadSimJobs]
  ].map(([name, load]) => ({ name, load }));
  const batches = [];
  for (let index = 0; index < loaderFns.length; index += 4) {
    batches.push(loaderFns.slice(index, index + 4));
  }

  if (!background) {
    for (const batch of batches) {
      const failures = await runLoaderBatch(batch);
      if (failures.length) {
        throw new Error(failures[0]);
      }
    }
    return [];
  }

  const failures = [];
  for (const batch of batches) {
    failures.push(...(await runLoaderBatch(batch)));
  }
  if (failures.length) {
    console.error("Background panel hydration failed:", failures.join(" | "));
  }
  return failures;
}

export async function refreshEverything() {
  await loadCoreDashboard();
  await loadSecondaryPanels();
}

export function queueStartupHydration() {
  void loadSecondaryPanels({ background: true });
}

export async function refreshPostSimulation() {
  await Promise.all([
    loadRoster(),
    loadFreeAgency(),
    loadRetiredPool(),
    loadStats(),
    loadDraftState(),
    loadScouting(),
    loadQa(),
    loadTeamHistory(),
    loadCalendar(),
    loadTransactionLog(),
    loadNews(),
    loadOwner(),
    loadPipeline(),
    loadSimJobs()
  ]);
}

let pendingSimulationResume = null;

function renderSimulationCheckpoint(checkpoint, digest, continuation = null) {
  const panel = document.getElementById("simCheckpointPanel");
  const title = document.getElementById("simCheckpointTitle");
  const reason = document.getElementById("simCheckpointReason");
  const list = document.getElementById("simCheckpointDigest");
  const resume = document.getElementById("resumeSimBtn");
  if (!panel) return;
  pendingSimulationResume = continuation;
  if (title) title.textContent = continuation ? "Simulation paused at a decision checkpoint" : "Simulation checkpoint reached";
  if (reason) reason.textContent = checkpoint?.primary?.label || "A material franchise moment was reached.";
  if (list) list.innerHTML = formatSimulationDigest(digest).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  if (resume) {
    resume.hidden = !continuation;
    resume.textContent = continuation?.mode === "season" ? "Resolve & Resume Season" : "Resolve & Resume";
  }
  panel.hidden = false;
}

export function dismissSimulationCheckpoint() {
  const panel = document.getElementById("simCheckpointPanel");
  if (panel) panel.hidden = true;
}

export async function resumeSimulationFromCheckpoint({ resolveDecision = null } = {}) {
  const continuation = pendingSimulationResume;
  if (!continuation) return { resumed: false };
  pendingSimulationResume = null;
  dismissSimulationCheckpoint();
  if (continuation.mode === "weeks") {
    await advanceWeeksSequential(continuation.remaining, { digest: continuation.digest, resolveDecision });
  } else {
    await advanceSeasonSequential({
      startYear: continuation.startYear,
      steps: continuation.steps,
      digest: continuation.digest,
      resolveDecision
    });
  }
  return { resumed: true };
}

async function fastSimRequestBody(resolveDecision) {
  const body = { count: 1 };
  if (!hasPendingSimulationDecision(state.dashboard || {})) return body;
  const result = typeof resolveDecision === "function" ? await resolveDecision() : null;
  if (result?.status !== "chosen") return null;
  body.gmDecisionChoice = result.choice;
  return body;
}

function decisionCheckpointFromState() {
  const decision = state.dashboard?.gmDecisionQueue?.[0];
  return {
    shouldPause: true,
    primary: { id: "gm-decision", label: decision?.prompt || "A General Manager decision requires attention" },
    reasons: []
  };
}

function ingestFastSimNews(dashboard) {
  ingestNewsIntoInbox(dashboard?.newsLog || dashboard?.news || []);
  renderInboxBadge();
}

export async function advanceWeeksSequential(totalWeeks, { digest: initialDigest = [], resolveDecision = null } = {}) {
  const safeWeeks = Math.max(1, Number(totalWeeks) || 1);
  setSimControl({ active: true, pauseRequested: false, mode: "weeks" });
  let completed = 0;
  let digest = initialDigest;
  let checkpointed = false;
  try {
    while (completed < safeWeeks) {
      if (state.simControl.pauseRequested) break;
      setStatus(`Simulating week ${completed + 1}/${safeWeeks}...`);
      const body = await fastSimRequestBody(resolveDecision);
      if (!body) {
        renderSimulationCheckpoint(decisionCheckpointFromState(), digest, {
          mode: "weeks", remaining: safeWeeks - completed, digest
        });
        checkpointed = true;
        break;
      }
      const previous = state.dashboard;
      const response = await api("/api/advance-week", { method: "POST", body });
      applyDashboard(response.state);
      ingestFastSimNews(response.state);
      completed += 1;
      const checkpoint = classifySimulationCheckpoint({ previous, next: response.state });
      digest = appendSimulationDigest(digest, { previous, next: response.state, checkpoint });
      if (checkpoint.shouldPause) {
        const remaining = safeWeeks - completed;
        renderSimulationCheckpoint(checkpoint, digest, remaining > 0 && !checkpoint.blocking ? { mode: "weeks", remaining, digest } : null);
        checkpointed = true;
        break;
      }
    }
    await refreshPostSimulation();
    showToast(checkpointed ? `Checkpoint reached after ${completed} week(s)` : state.simControl.pauseRequested ? `Paused after ${completed} week(s)` : "Done");
  } finally {
    setSimControl({ active: false, pauseRequested: false, mode: null });
    setStatus("Ready");
  }
}

export async function advanceSeasonSequential({ startYear: requestedStartYear = null, steps: initialSteps = 0, digest: initialDigest = [], resolveDecision = null } = {}) {
  const startYear = requestedStartYear || state.dashboard?.currentYear || new Date().getFullYear();
  setSimControl({ active: true, pauseRequested: false, mode: "season" });
  let steps = initialSteps;
  let digest = initialDigest;
  let checkpointed = false;
  try {
    while (steps < 64) {
      if (state.simControl.pauseRequested) break;
      const done =
        state.dashboard &&
        state.dashboard.currentYear > startYear &&
        state.dashboard.phase === "regular-season" &&
        state.dashboard.currentWeek === 1;
      if (done) break;
      setStatus(`Advancing season step ${steps + 1}...`);
      const body = await fastSimRequestBody(resolveDecision);
      if (!body) {
        renderSimulationCheckpoint(decisionCheckpointFromState(), digest, {
          mode: "season", startYear, steps, digest
        });
        checkpointed = true;
        break;
      }
      const previous = state.dashboard;
      const response = await api("/api/advance-week", { method: "POST", body });
      applyDashboard(response.state);
      ingestFastSimNews(response.state);
      steps += 1;
      const checkpoint = classifySimulationCheckpoint({ previous, next: response.state });
      digest = appendSimulationDigest(digest, { previous, next: response.state, checkpoint });
      const completedSeason =
        response.state.currentYear > startYear &&
        response.state.phase === "regular-season" &&
        response.state.currentWeek === 1;
      if (checkpoint.shouldPause) {
        renderSimulationCheckpoint(checkpoint, digest, completedSeason || checkpoint.blocking ? null : {
          mode: "season", startYear, steps, digest
        });
        checkpointed = true;
        break;
      }
    }
    await refreshPostSimulation();
    showToast(checkpointed ? `Season checkpoint reached after ${steps} step(s)` : state.simControl.pauseRequested ? `Season sim paused after ${steps} step(s)` : "Done");
  } finally {
    setSimControl({ active: false, pauseRequested: false, mode: null });
    setStatus("Ready");
  }
}

export function checkSeasonEndReview(previous) {
  const curr = state.dashboard;
  if (!curr || !previous) return;
  // Trigger when transitioning from postseason → offseason
  const justEndedSeason =
    (previous.phase === "postseason" || previous.phase === "regular-season") &&
    (curr.phase === "offseason" || curr.phase === "season-awards");
  if (!justEndedSeason) return;
  // Don't fire on initial load
  if (state.prevDashboardPhase === null) { state.prevDashboardPhase = curr.phase; return; }
  state.prevDashboardPhase = curr.phase;
  showSeasonEndReview();
}

export function showSeasonEndReview() {
  const d = state.dashboard;
  if (!d) return;
  const team = d.controlledTeam || {};
  const standings = d.latestStandings || [];
  const myRow = standings.find((r) => r.team === (team.abbrev || team.teamId)) || {};
  const record = myRow.wins != null ? `${myRow.wins}–${myRow.losses}` : "—";
  const rank = standings.findIndex((r) => r.team === (team.abbrev || team.teamId)) + 1;
  const legacy = d.gmLegacy;
  const heat = team.owner?.expectation?.heat ?? "—";
  const verdict = heat >= 75 ? "On the Hot Seat" : heat >= 55 ? "Owner Watching" : "Owner Satisfied";
  const verdictTone = heat >= 75 ? "negative" : heat >= 55 ? "warning" : "positive";

  const modal = document.getElementById("seasonReviewModal");
  if (!modal) return;
  const body = modal.querySelector(".season-review-body");
  if (!body) return;
  body.innerHTML = `
    <div class="sr-headline">Season ${d.currentYear - 1} Complete</div>
    <div class="sr-grid">
      <div class="sr-tile"><div class="sr-tile-label">Record</div><div class="sr-tile-val">${escapeHtml(record)}</div></div>
      <div class="sr-tile"><div class="sr-tile-label">League Rank</div><div class="sr-tile-val">${rank > 0 ? `#${rank}` : "—"}</div></div>
      <div class="sr-tile"><div class="sr-tile-label">Team OVR</div><div class="sr-tile-val">${team.overallRating ?? "—"}</div></div>
      <div class="sr-tile"><div class="sr-tile-label">Cap Space</div><div class="sr-tile-val">${fmtMoney(d.cap?.capSpace || 0)}</div></div>
    </div>
    <div class="sr-verdict tone-border-${verdictTone}">
      <strong>Owner Verdict:</strong> <span class="tone-${verdictTone}">${escapeHtml(verdict)}</span>
      ${team.owner?.expectation?.reasons?.length ? `<div class="sr-reasons">${escapeHtml(team.owner.expectation.reasons.join(" · "))}</div>` : ""}
    </div>
    ${legacy ? `<div class="sr-legacy">
      <strong>GM Legacy:</strong> ${escapeHtml(legacy.label || "")} — Score ${legacy.score ?? "—"} · Grade ${escapeHtml(legacy.grade || "—")}
    </div>` : ""}
    <div class="sr-call-to-action">A new season awaits. What will your legacy be?</div>
  `;
  appendWhatIfReplay(body);
  observeBackgroundTask(() => appendSeasonEpilogue(body, d), {
    surface: "season-review",
    operation: "season-epilogue",
    authorityKey: dashboardAuthorityKey(d)
  });
  modal.hidden = false;
  modal.classList.add("active");
  openModal(modal, { onClose: closeSeasonReviewModal });
}

export function closeSeasonReviewModal() {
  const modal = document.getElementById("seasonReviewModal");
  if (!modal) return;
  closeModal(modal);
  modal.hidden = true;
  modal.classList.remove("active");
}


function appendWhatIfReplay(body) {
  const replay = state.whatIfReplay;
  if (!replay?.available) return;
  const card = document.createElement("div");
  card.className = `sr-what-if ${replay.replay?.flipped ? "sr-what-if-win" : "sr-what-if-loss"}`;
  card.innerHTML = `
    <div class="sr-what-if-kicker">Monday Morning QB · Non-canon</div>
    <strong>${escapeHtml(replay.headline || "Alternate timeline available.")}</strong>
    <div class="sr-what-if-line">Week ${escapeHtml(String(replay.week))} vs ${escapeHtml(replay.opponentName || replay.opponentTeamId || "Opponent")}: ${escapeHtml(String(replay.original?.teamScore ?? "-"))}-${escapeHtml(String(replay.original?.opponentScore ?? "-"))} became ${escapeHtml(String(replay.replay?.teamScore ?? "-"))}-${escapeHtml(String(replay.replay?.opponentScore ?? "-"))} after one lever: ${escapeHtml(replay.lever?.label || "change the plan")}.</div>
    <div class="sr-what-if-note">${escapeHtml(replay.note || "No live state changed.")}</div>
  `;
  body.appendChild(card);
}
export function showHalftimeAdjustModal(onChoice) {
  const modal = document.getElementById("halftimeAdjustModal");
  if (!modal) { onChoice(null); return; }
  const finish = (choice) => {
    closeModal(modal);
    modal.hidden = true;
    modal.classList.remove("active");
    onChoice(choice);
  };
  // reset
  const brief = buildTacticalMatchupBrief(state.dashboard || {});
  const briefEl = document.getElementById("tacticalMatchupBrief");
  if (briefEl) {
    briefEl.innerHTML = `<strong>${escapeHtml(brief.headline)}</strong><span>${escapeHtml(brief.read)}</span>`;
  }
  const optionById = new Map(brief.options.map((option) => [option.id, option]));
  modal.querySelectorAll(".tactic-option").forEach((btn) => btn.classList.remove("selected"));
  const confirmBtn = modal.querySelector(".tactic-confirm-btn");
  let choice = null;
  modal.querySelectorAll(".tactic-option").forEach((btn) => {
    const option = optionById.get(btn.dataset.tactic);
    const desc = btn.querySelector(".to-desc");
    if (desc && option) {
      const identityPreview = previewTacticalIdentity(state.dashboard?.tacticalFilmLedger || [], option.id);
      desc.textContent = `${option.matchup} Tradeoff: ${option.tradeoff} Identity preview: ${identityPreview.copy} ${identityPreview.disclaimer}`;
    }
    btn.onclick = () => {
      modal.querySelectorAll(".tactic-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      choice = btn.dataset.tactic;
    };
  });
  if (confirmBtn) {
    confirmBtn.onclick = () => finish(choice);
  }
  const skipBtn = modal.querySelector(".tactic-skip-btn");
  if (skipBtn) {
    skipBtn.onclick = () => finish(null);
  }
  modal.hidden = false;
  modal.classList.add("active");
  openModal(modal, { onClose: () => finish(null) });
}
