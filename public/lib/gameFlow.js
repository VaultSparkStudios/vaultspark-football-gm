import { state, api } from "./appState.js";
import { applyShellTheme, escapeHtml, fmtMoney, presentActionError, renderTable, selectedSeasonType, setSimControl, setStatus, shapeStatsRowsForDisplay, showToast, syncTeamSelects, teamCode, updateTopMeta } from "./appCore.js";
import { renderBoxScoreTicker, renderCapAlertBanner, renderFanSentimentCard, renderGmLegacyScore, renderInjuryOverlayCard, renderLeaders, renderNewsTicker, renderOverview, renderOwnerUltimatum, renderRosterNeeds, renderSchedule, renderSeasonPreviewPanel, renderStandings, renderStatLeadersStrip, renderWeekResults } from "./tabOverview.js";
import { depthDefaultShares, renderDepthChart, renderFreeAgency, renderRetiredPool, renderRoster } from "./tabRoster.js";
import { deriveContractToolsFromRoster, getTradeTeamId, renderContractsPage, renderExpiringContracts, renderTradeWorkspace, setSelectedDesignationPlayer, setSelectedRetirementOverridePlayer } from "./tabContracts.js";
import { renderDraft, renderScouting } from "./tabDraft.js";
import { applyStatsSort, renderAnalyticsChart, renderComparePlayers, renderCompareSearchResults, updateStatsControls } from "./tabStats.js";
import { renderCalendar, renderPlayerHistoryArchive, renderPlayerTimelineSearchResults, renderRecordsAndHistory, renderTeamHistorySpotlight, setSelectedHistoryPlayer } from "./tabHistory.js";
import { applySettingsControls, loadRewindHistory, renderAnalytics, renderCalibrationJobs, renderCommandPalette, renderNegotiationTargets, renderNews, renderObservability, renderOwner, renderPersistence, renderPickAssets, renderPipeline, renderRealismVerification, renderRulesTab, renderSettingsSpotlight, renderSimJobs, renderStaff, renderTransactionLog } from "./tabSettings.js";

export function applyDashboard(newState) {
  const previous = state.dashboard;
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
  renderGmLegacyScore().catch(() => {});
  renderCapAlertBanner();
  renderFanSentimentCard();
  renderInjuryOverlayCard();
  renderStatLeadersStrip().catch(() => {});
  renderOwnerUltimatum();
  checkSeasonEndReview(previous);
  if (typeof globalThis._renderSpeedrunPanel === "function") globalThis._renderSpeedrunPanel();

  // Check speedrun completion on postseason → offseason transition
  if (previous && (previous.phase === "postseason" || previous.phase === "regular-season")
    && (newState.phase === "offseason" || newState.phase === "season-awards")) {
    if (typeof globalThis._checkSpeedrunCompletion === "function") globalThis._checkSpeedrunCompletion().catch(() => {});
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
  }
}

export function activateTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  applyShellTheme();
  if (tabId === "contractsTab") {
    loadContractsTeam().catch((error) => {
      presentActionError(error);
    });
  }
  if (tabId === "settingsTab") {
    loadRewindHistory().catch(() => {});
    if (typeof globalThis._loadSpeedrunStatus === "function") globalThis._loadSpeedrunStatus().catch(() => {});
  }
}

export async function loadState() {
  const data = await api("/api/state");
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
  const payload = await api(`/api/calendar?year=${selectedYear}`);
  state.calendar = payload.calendar || null;
  const selectedWeek = Number(document.getElementById("calendarWeekFilter").value || state.dashboard?.currentWeek || 1);
  state.calendarWeek = selectedWeek;
  renderCalendar();
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
  const [rosterPayload, expiringPayload] = await Promise.all([
    api(`/api/roster?team=${encodeURIComponent(teamId)}`),
    api(`/api/contracts/expiring?team=${encodeURIComponent(teamId)}`)
  ]);
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
  await loadNegotiations(teamId);
  renderContractsPage();
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
  const payload = await api("/api/settings");
  state.leagueSettings = payload.settings || null;
  applySettingsControls();
}

export async function loadStaff() {
  const teamId = document.getElementById("staffTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/staff?team=${encodeURIComponent(teamId)}`);
  state.staffState = payload.staff || null;
  renderStaff();
}

export async function loadOwner() {
  const teamId = document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/owner?team=${encodeURIComponent(teamId)}`);
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
}

export async function loadObservability() {
  const payload = await api("/api/observability");
  state.observability = payload || null;
  renderObservability();
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
  const data = await api(`/api/roster?${query.toString()}`);
  state.roster = data.roster || [];
  setSelectedDesignationPlayer(state.selectedDesignationPlayerId);
  renderRoster();
  if (!state.contractTeamId || state.contractTeamId === teamId) {
    state.contractTeamId = teamId;
    state.contractRoster = data.roster || [];
    state.contractCap = data.cap || null;
  }
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
  const payload = await api(`/api/scouting?team=${encodeURIComponent(teamId)}&limit=140`);
  state.scouting = payload.scouting || null;
  renderScouting();
}

export async function loadDepthChart() {
  const teamId = (document.getElementById("depthTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const position = document.getElementById("depthPositionSelect").value;
  const [payload, rosterPayload] = await Promise.all([
    api(`/api/depth-chart?team=${encodeURIComponent(teamId)}`),
    api(`/api/roster?team=${encodeURIComponent(teamId)}`)
  ]);
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
  const payload = await api(`/api/history/team?team=${encodeURIComponent(teamId)}`);
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
}

export async function loadPlayerTimeline() {
  const playerId = state.selectedHistoryPlayerId;
  if (!playerId) return;
  const payload = await api(`/api/history/player?playerId=${encodeURIComponent(playerId)}`);
  state.historyTimeline = payload.timeline || null;
  const rows = (payload.timeline?.timeline || []).map((entry) => ({
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
  await loadState();
  updateStatsControls();
  syncBootFilters();
  renderCommandPalette();
  renderRulesTab();
  renderAnalyticsChart();
  renderRealismVerification();
}

export async function loadSecondaryPanels({ background = false } = {}) {

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

export async function advanceWeeksSequential(totalWeeks) {
  const safeWeeks = Math.max(1, Number(totalWeeks) || 1);
  setSimControl({ active: true, pauseRequested: false, mode: "weeks" });
  let completed = 0;
  try {
    while (completed < safeWeeks) {
      if (state.simControl.pauseRequested) break;
      setStatus(`Simulating week ${completed + 1}/${safeWeeks}...`);
      const response = await api("/api/advance-week", { method: "POST", body: { count: 1 } });
      applyDashboard(response.state);
      completed += 1;
    }
    await refreshPostSimulation();
    showToast(state.simControl.pauseRequested ? `Paused after ${completed} week(s)` : "Done");
  } finally {
    setSimControl({ active: false, pauseRequested: false, mode: null });
    setStatus("Ready");
  }
}

export async function advanceSeasonSequential() {
  const startYear = state.dashboard?.currentYear || new Date().getFullYear();
  setSimControl({ active: true, pauseRequested: false, mode: "season" });
  let steps = 0;
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
      const response = await api("/api/advance-week", { method: "POST", body: { count: 1 } });
      applyDashboard(response.state);
      steps += 1;
    }
    await refreshPostSimulation();
    showToast(state.simControl.pauseRequested ? `Season sim paused after ${steps} step(s)` : "Done");
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
  modal.hidden = false;
  modal.classList.add("active");
}

export function showHalftimeAdjustModal(onChoice) {
  const modal = document.getElementById("halftimeAdjustModal");
  if (!modal) { onChoice(null); return; }
  // reset
  modal.querySelectorAll(".tactic-option").forEach((btn) => btn.classList.remove("selected"));
  const confirmBtn = modal.querySelector(".tactic-confirm-btn");
  let choice = null;
  modal.querySelectorAll(".tactic-option").forEach((btn) => {
    btn.onclick = () => {
      modal.querySelectorAll(".tactic-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      choice = btn.dataset.tactic;
    };
  });
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      modal.hidden = true;
      modal.classList.remove("active");
      onChoice(choice);
    };
  }
  const skipBtn = modal.querySelector(".tactic-skip-btn");
  if (skipBtn) {
    skipBtn.onclick = () => {
      modal.hidden = true;
      modal.classList.remove("active");
      onChoice(null);
    };
  }
  modal.hidden = false;
  modal.classList.add("active");
}
