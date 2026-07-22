import { injectTutorialStyles, mountTutorial } from "./lib/tutorialCampaign.js";
import { initThemeCustomizer } from "./lib/themeCustomizer.js";
import { encodeChallengeCode, loadRivalTarget } from "./lib/challengeCodes.js";
import { mountBetaFeedback } from "./lib/betaFeedback.js";
import { maybeShowReturnDigest } from "./lib/returnDigest.js";
import {
  initMobileLoop,
  isMobileModeEnabled,
  renderMobileOverlay,
  setMobileModeEnabled
} from "./lib/mobileLoop.js";
import {
  getSavedToken, saveToken, getSavedGistId, saveGistId,
  exportToGist, importFromGist, listGists
} from "./lib/gistSync.js";

import { state, api } from "./lib/appState.js";
import { clearClientDiagnostics, observeBackgroundTask, recordClientDiagnostic, retryClientDiagnostics } from "./lib/clientDiagnostics.js";

const SIMULATION_ACTION = {
  key: "franchise-simulation",
  controls: ["advanceWeekBtn", "advance4WeeksBtn", "advanceSeasonBtn", "resumeSimBtn"]
};

import {
  escapeHtml,
  fmtMoney,
  hashStringLocal,
  portraitChoice,
  playerBodyTypeLabel,
  buildPlayerPortraitSvg,
  buildProfileLatestSeasonSummary,
  renderPlayerProfileHero,
  setStatus,
  appendAvLast,
  toTitleCaseKey,
  shouldHideInternalColumn,
  readStatsHiddenColumns,
  saveStatsHiddenColumns,
  readTradeBlockIds,
  saveTradeBlockIds,
  formatHeight,
  normalizeSeasonType,
  selectedSeasonType,
  showToast,
  metricNumber,
  classifyTone,
  setElementTone,
  setMetricCardValue,
  formatActionError,
  presentActionError,
  renderPanelError,
  teamName,
  teamByCode,
  teamCode,
  teamDisplayFromId,
  teamDisplayLabel,
  hexToRgbTriplet,
  getActiveTeamTheme,
  applyShellTheme,
  setSimControl,
  buildProfileSeasonAvMap,
  passerRateFromStats,
  formatAwards,
  buildProfileSeasonRows,
  buildProfileCareerRow,
  buildProfileTeamSplits,
  rowJoinKey,
  shapeStatsRowsForDisplay,
  renderGuideContent,
  setTableSkeleton,
  valueAsNumber,
  createEmptyTradeAssets,
  tradeAssetKeys,
  uniqueIds,
  fmtDeltaMoney,
  formatTradeList,
  formatTransactionDetails,
  setTradeEvalText,
  renderTable,
  setSelectOptions,
  syncTeamSelects,
  updateTopMeta,
  renderPulseChips,
  setBoxScoreTab,
  decoratePlayerColumnFromRows,
  decoratePlayerColumnByIds,
  loadPlayerModal,
  closePlayerModal,
  bindMenuTabs,
  runAction
} from "./lib/appCore.js";

import {
  renderOverview,
  renderNarrativePanel,
  renderTradeDeadlineAlert,
  renderOverviewSpotlight,
  renderRosterNeeds,
  renderLeaders,
  renderSchedule,
  renderStandings,
  renderWeekResults,
  renderBoxScoreTicker,
  loadBoxScore,
  closeBoxScoreModal,
  openGuideModal,
  closeGuideModal,
  renderNewsTicker,
  renderGmLegacyScore,
  showPersonaTierToast,
  renderSeasonPreviewPanel,
  renderCapAlertBanner,
  renderFanSentimentCard,
  renderInjuryOverlayCard,
  renderStatLeadersStrip,
  renderOwnerUltimatum
} from "./lib/tabOverview.js";

import {
  renderRoster,
  renderFreeAgency,
  renderRetiredPool,
  depthManualShareMap,
  depthDefaultShares,
  formatDepthSharePercent,
  roundDepthShare,
  totalDepthShares,
  resolveDepthShareValues,
  updateDepthShare,
  renderDepthChart,
  moveIdWithinList,
  renderVeteranMentorshipPanel
} from "./lib/tabRoster.js";

import {
  renderExpiringContracts,
  lookupContractCandidate,
  getSelectedContractPlayer,
  setSelectedContractPlayer,
  getSelectedDesignationPlayer,
  setSelectedDesignationPlayer,
  getSelectedRetirementOverridePlayer,
  setSelectedRetirementOverridePlayer,
  updateContractPreview,
  renderContractsPage,
  renderContractsSpotlight,
  setContractActionText,
  toggleTradeBlockPlayer,
  getTradeTeamId,
  setTradeEvalCards,
  clearTradePackages,
  getTradePlayersForSide,
  getTradePicksForSide,
  setTradePackageText,
  toggleTradeAsset,
  queueTradePlayer,
  renderTradeRosterTable,
  renderTradeWorkspace,
  deriveContractToolsFromRoster,
  renderCapCasualtyPanel,
  renderCapProjectionPanel,
  openAgentModal,
  closeAgentModal,
  renderAgentModal,
  submitAgentOffer,
  signalCompetingOffer
} from "./lib/tabContracts.js";

import {
  renderDraft,
  renderScouting,
  renderScoutingSpotlight,
  renderCombineResults,
  pickAnalystLine,
  showDraftPickReveal
} from "./lib/tabDraft.js";

import {
  updateStatsControls,
  renderStatsBenchmarkHint,
  applyStatsSort,
  renderStatsColumnFilters,
  renderComparePlayers,
  renderCompareSearchResults,
  renderAnalyticsChart
} from "./lib/tabStats.js";

import {
  setHistoryView,
  formatAwardList,
  hallOfFameCareerLine,
  awardCountLine,
  hallOfFamePolicyLine,
  retiredNumberPolicyLine,
  setSelectedHistoryPlayerFromAwardEntry,
  renderAwardGallery,
  renderSeasonAwardsShowcase,
  timelineEntrySummary,
  renderPlayerHistoryArchive,
  renderHistorySpotlight,
  renderHallOfFameGallery,
  renderTeamHistorySpotlight,
  renderRecordsAndHistory,
  renderCalendar,
  setSelectedHistoryPlayer,
  renderPlayerTimelineSearchResults
} from "./lib/tabHistory.js";

import {
  renderTransactionLog,
  renderNews,
  renderPickAssets,
  renderNegotiationTargets,
  renderAnalytics,
  renderStaff,
  renderOwner,
  renderObservability,
  renderPersistence,
  renderPipeline,
  renderCalibrationJobs,
  renderSimJobs,
  renderCommandPalette,
  applySettingsControls,
  renderRealismVerification,
  renderRulesTab,
  renderSettingsSpotlight,
  renderOwnerSpotlight,
  loadRewindHistory,
  renderRewindTimeline,
  renderCoachingDnaCard,
  renderCommissionerLobby,
  openShortcutsModal,
  closeShortcutsModal,
  shareDynastyTimeline,
  renderGistSyncStatus,
  renderGistList,
  initGistSyncUI,
  applyBrandIdentity
} from "./lib/tabSettings.js";
import { generateFranchiseNewsletter } from "./lib/franchiseNewsletter.js";
import { buildLeagueStoryFromDashboard, downloadLeagueStory } from "./lib/leagueStoryExport.js";

import {
  applyDashboard,
  activateTab,
  loadState,
  loadScheduleWeek,
  loadCalendar,
  loadTransactionLog,
  loadNews,
  loadPickAssets,
  loadNegotiations,
  loadContractsTeam,
  loadAnalytics,
  loadSettings,
  loadStaff,
  loadOwner,
  loadObservability,
  loadPersistence,
  loadPipeline,
  loadCalibrationJobs,
  runRealismVerification,
  loadSimJobs,
  loadComparePlayers,
  searchComparePlayers,
  loadRoster,
  loadFreeAgency,
  loadRetiredPool,
  loadStats,
  exportSnapshot,
  importSnapshot,
  loadDraftState,
  loadScouting,
  loadDepthChart,
  loadSaves,
  loadQa,
  loadTeamHistory,
  loadPlayerTimeline,
  retireSelectedJersey,
  searchHistoryPlayers,
  syncBootFilters,
  loadCoreDashboard,
  loadSecondaryPanels,
  refreshEverything,
  queueStartupHydration,
  refreshPostSimulation,
  advanceWeeksSequential,
  advanceSeasonSequential,
  resumeSimulationFromCheckpoint,
  dismissSimulationCheckpoint,
  checkSeasonEndReview,
  showSeasonEndReview,
  closeSeasonReviewModal,
  showHalftimeAdjustModal
} from "./lib/gameFlow.js";

import {
  ingestNewsIntoInbox,
  renderInboxBadge,
  openInbox,
  closeInbox,
  checkAndShowFranchiseMoment,
  closeFranchiseMomentModal,
  checkAndShowGmDecision,
  dismissGmDecision,
  runSimWatch,
  skipSimWatch,
  closeSimWatch,
  renderSeasonArcs,
  renderCapWarRoom,
  renderTradeBreakdown,
  hideTradeBreakdown,
  renderDynastyRecordsBoard,
  loadTeamArchetypes,
  renderArchetypesTable,
  checkAndPruneRewindStorage
} from "./lib/engagementFeatures.js";


async function submitMobileGmDecisionChoice(choice) {
  if (!choice?.decisionId || !choice?.choiceId) return;
  await runAction(async () => {
    const response = await api("/api/advance-week", {
      method: "POST",
      body: { count: 1, gmDecisionChoice: choice }
    });
    applyDashboard(response.state);
    state.mobilePendingDecision = null;
    if (response.gmDecision?.applied) {
      const label = response.gmDecision.decision?.label || "GM decision";
      const effect = response.gmDecision.decision?.receipt?.summary || response.gmDecision.decision?.effect || "choice recorded";
      showToast(`${label}: ${effect}`);
    }
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
    syncMobileLoopOverlay();
  }, "Recording mobile GM decision...", SIMULATION_ACTION);
}

function mobileDecisionSnapshotKey() {
  const dashboard = state.dashboard || {};
  return [
    dashboard.phase || "",
    dashboard.currentYear || "",
    dashboard.currentWeek || "",
    dashboard.controlledTeamId || ""
  ].join(":");
}

function syncMobileLoopOverlay() {
  const overlay = document.getElementById("mobileLoopOverlay");
  if (!overlay) return;
  const active = isMobileModeEnabled();
  overlay.classList.toggle("hidden", !active);
  const toggle = document.getElementById("mobileLoopToggle");
  if (toggle) toggle.checked = active;
  const advanceFromMobile = () => document.getElementById("advanceWeekBtn")?.click();
  if (!overlay.dataset.mobileGmChoiceBound) {
    overlay.dataset.mobileGmChoiceBound = "1";
    overlay.addEventListener("vsfgm:mobile-decision", (event) => {
      if (event.detail?.action !== "choose-gm-decision") return;
      checkAndShowGmDecision()
        .then((result) => {
          if (result?.status === "chosen") return submitMobileGmDecisionChoice(result.choice);
          return null;
        })
        .catch(presentActionError);
    });
    overlay.addEventListener("vsfgm:mobile-gm-decision-choice", (event) => {
      submitMobileGmDecisionChoice(event.detail).catch(presentActionError);
    });
  }
  if (active) {
    const decisionSnapshotKey = mobileDecisionSnapshotKey();
    renderMobileOverlay(state, advanceFromMobile);
    if (state.dashboard?.phase === "regular-season") {
      observeBackgroundTask(
        () => api("/api/gm-decision"),
        {
          surface: "mobile-loop",
          operation: "pending-gm-decision",
          authorityKey: decisionSnapshotKey,
          onSuccess: (data) => {
            if (!isMobileModeEnabled() || decisionSnapshotKey !== mobileDecisionSnapshotKey()) return;
            state.mobilePendingDecision = data?.decisions?.[0] || null;
            renderMobileOverlay(state, advanceFromMobile);
          },
          onError: () => {
            if (decisionSnapshotKey !== mobileDecisionSnapshotKey()) return;
            state.mobilePendingDecision = null;
            if (isMobileModeEnabled()) renderMobileOverlay(state, advanceFromMobile);
          }
        }
      );
    } else {
      state.mobilePendingDecision = null;
    }
  }
}


function exposeLocalTestHooks() {
  const host = globalThis.location?.hostname || "";
  if (host !== "localhost" && host !== "127.0.0.1") return;
  globalThis.__VS_FA_APPLY_DASHBOARD__ = applyDashboard;
}

function bindEvents() {
  bindMenuTabs(activateTab);

  document.getElementById("backSetupBtn").addEventListener("click", () => {
    window.location.href = new URL("./", document.baseURI).toString();
  });

  document.getElementById("teamSelect").addEventListener("change", (event) =>
    runAction(async () => {
      const response = await api("/api/control-team", { method: "POST", body: { teamId: event.target.value } });
      applyDashboard(response.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadRetiredPool(),
        loadStats(),
        loadDepthChart(),
        loadDraftState(),
        loadScouting(),
        loadTeamHistory(),
        loadCalendar(),
        loadTransactionLog(),
        loadNews(),
        loadPickAssets(),
        loadNegotiations(),
        loadStaff(),
        loadOwner(),
        loadPipeline(),
        loadObservability()
      ]);
    }, "Switching team...")
  );

  document.getElementById("advanceWeekBtn").addEventListener("click", () =>
    runAction(async () => {
      // Show pre-game tactical modal during regular season
      const isRegularSeason = state.dashboard?.phase === "regular-season";
      const tactic = await new Promise((resolve) => {
        if (isRegularSeason) {
          showHalftimeAdjustModal(resolve);
        } else {
          resolve(null);
        }
      });
      const body = { count: 1 };
      if (tactic) body.weeklyTacticOverride = tactic;
      // Check GM Decision before advancing (Session 8)
      if (state.dashboard?.phase === "regular-season") {
        const gmDecisionResult = await checkAndShowGmDecision();
        if (gmDecisionResult.status === "deferred") {
          showToast("Decision deferred — the franchise has not advanced.");
          return { actionStatus: "deferred", statusText: "GM decision deferred" };
        }
        if (gmDecisionResult.status === "chosen") body.gmDecisionChoice = gmDecisionResult.choice;
      }
      const response = await api("/api/advance-week", { method: "POST", body });
      applyDashboard(response.state);
      if (response.gmDecision?.applied) {
        const label = response.gmDecision.decision?.label || "GM decision";
        const effect = response.gmDecision.decision?.receipt?.summary || response.gmDecision.decision?.effect || "choice recorded";
        showToast(`${label}: ${effect}`);
      }
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
      // Ingest news into Priority Inbox + show Franchise Moment (Session 8)
      const newsItems = state.dashboard?.newsLog || state.newsRows || [];
      ingestNewsIntoInbox(newsItems);
      renderInboxBadge();
      renderSeasonArcs().catch((error) => renderPanelError("seasonArcsContent", "Season arcs", error, {
        onRetry: () => renderSeasonArcs().catch((retryError) => renderPanelError("seasonArcsContent", "Season arcs", retryError))
      }));
      checkAndShowFranchiseMoment().catch(presentActionError);
      checkAndPruneRewindStorage();
      syncMobileLoopOverlay();
    }, "Advancing week...", SIMULATION_ACTION)
  );

  document.getElementById("advance4WeeksBtn").addEventListener("click", () =>
    runAction(
      () => advanceWeeksSequential(4, { resolveDecision: checkAndShowGmDecision }),
      "Advancing four weeks...",
      SIMULATION_ACTION
    ).then((result) => {
      if (result?.actionStatus === "failed") setSimControl({ active: false, pauseRequested: false, mode: null });
    })
  );

  document.getElementById("advanceSeasonBtn").addEventListener("click", () =>
    runAction(
      () => advanceSeasonSequential({ resolveDecision: checkAndShowGmDecision }),
      "Advancing season...",
      SIMULATION_ACTION
    ).then((result) => {
      if (result?.actionStatus === "failed") setSimControl({ active: false, pauseRequested: false, mode: null });
    })
  );

  document.getElementById("pauseSimBtn").addEventListener("click", () => {
    if (!state.simControl.active) return;
    setSimControl({ pauseRequested: true });
  });
  document.getElementById("resumeSimBtn").addEventListener("click", () => {
    runAction(
      () => resumeSimulationFromCheckpoint({ resolveDecision: checkAndShowGmDecision }),
      "Resuming simulation...",
      SIMULATION_ACTION
    ).then((result) => {
      if (result?.actionStatus === "failed") setSimControl({ active: false, pauseRequested: false, mode: null });
    });
  });
  document.getElementById("dismissSimCheckpointBtn").addEventListener("click", () => {
    dismissSimulationCheckpoint();
  });

  document.getElementById("refreshBtn").addEventListener("click", () => runAction(refreshEverything, "Refreshing..."));

  document.getElementById("loadRosterBtn").addEventListener("click", () => runAction(loadRoster, "Loading roster..."));
  document.getElementById("loadFaBtn").addEventListener("click", () => runAction(loadFreeAgency, "Loading pool..."));
  document.getElementById("loadStatsBtn").addEventListener("click", () => runAction(loadStats, "Loading stats..."));
  document.getElementById("rosterTeamSelect").addEventListener("change", () => runAction(loadRoster, "Loading roster..."));
  ["rosterPosFilter", "rosterMinOverallFilter", "rosterMinAgeFilter", "rosterMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadRoster, "Filtering roster..."));
  });
  ["faMinOverallFilter", "faMinAgeFilter", "faMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadFreeAgency, "Filtering pool..."));
  });
  document.getElementById("loadRetiredBtn").addEventListener("click", () =>
    runAction(loadRetiredPool, "Loading retired pool...")
  );
  ["retiredPosFilter", "retiredMinOverallFilter", "retiredMinAgeFilter", "retiredMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadRetiredPool, "Filtering retired pool..."));
  });

  document.getElementById("rosterTable").addEventListener("click", (event) => {
    const selectButton = event.target.closest("button[data-designation-select]");
    if (selectButton) {
      setSelectedDesignationPlayer(selectButton.dataset.designationSelect || "");
      renderRoster();
      return;
    }
    const button = event.target.closest("button[data-act]");
    if (!button) return;
    const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
    const playerId = button.dataset.id;
    const act = button.dataset.act;

    runAction(async () => {
      if (act === "release") await api("/api/release", { method: "POST", body: { teamId, playerId } });
      if (act === "ps") await api("/api/practice-squad", { method: "POST", body: { teamId, playerId, moveToPractice: true } });
      if (act === "active") await api("/api/practice-squad", { method: "POST", body: { teamId, playerId, moveToPractice: false } });
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadCalendar(), loadTransactionLog()]);
    }, "Applying roster move...");
  });

  document.getElementById("faTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    runAction(async () => {
      const teamId = state.dashboard?.controlledTeamId;
      const playerId = button.dataset.id;
      if (button.dataset.act === "sign") {
        await api("/api/sign", { method: "POST", body: { teamId, playerId } });
      } else if (button.dataset.act === "offer") {
        await api("/api/free-agency/offer", { method: "POST", body: { teamId, playerId, years: 2 } });
      } else {
        await api("/api/waiver-claim", { method: "POST", body: { teamId, playerId } });
      }
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadTransactionLog(), loadNews()]);
    }, "Processing transaction...");
  });

  document.getElementById("boxScoreTicker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-boxscore-id]");
    if (!button) return;
    runAction(() => loadBoxScore(button.dataset.boxscoreId), "Loading box score...");
  });

  document.getElementById("retiredTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-retired-override-id]");
    if (!button) return;
    setSelectedRetirementOverridePlayer(button.dataset.retiredOverrideId || "");
    renderRetiredPool();
  });

  document.getElementById("retirementOverrideBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedRetirementOverridePlayer();
      if (!player) throw new Error("Select a retired player first.");
      const teamId = (document.getElementById("retirementOverrideTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/retirement/override", {
        method: "POST",
        body: {
          playerId: player.id,
          teamId,
          minWinningPct: Number(document.getElementById("retirementOverrideWinPct").value || 0.55),
          forceSign: true
        }
      });
      await Promise.all([loadState(), loadRoster(), loadRetiredPool(), loadTransactionLog(), loadNews()]);
    }, "Applying retirement override...")
  );

  document.getElementById("applyDesignationBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedDesignationPlayer();
      if (!player) throw new Error("Select a roster player first.");
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: player.id,
          designation: document.getElementById("designationType").value,
          active: true
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Applying designation...")
  );

  document.getElementById("clearDesignationBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedDesignationPlayer();
      if (!player) throw new Error("Select a roster player first.");
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: player.id,
          designation: document.getElementById("designationType").value,
          active: false
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Clearing designation...")
  );

  const buildTradePayload = () => ({
    teamA: getTradeTeamId("A").toUpperCase(),
    teamB: getTradeTeamId("B").toUpperCase(),
    teamAPlayerIds: [...state.tradeAssets.teamAPlayerIds],
    teamBPlayerIds: [...state.tradeAssets.teamBPlayerIds],
    teamAPickIds: [...state.tradeAssets.teamAPickIds],
    teamBPickIds: [...state.tradeAssets.teamBPickIds]
  });

  document.getElementById("tradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = buildTradePayload();
      if (payload.teamA === payload.teamB) throw new Error("Select two different teams.");
      const result = await api("/api/trade", { method: "POST", body: payload });
      const a = result.valuation?.[payload.teamA] || {};
      const b = result.valuation?.[payload.teamB] || {};
      const fairness = Math.max(0, 100 - Math.abs((a.delta || 0) - (b.delta || 0)) * 4);
      setTradeEvalText(`Trade accepted. ${payload.teamA} value swing ${a.delta || 0}, ${payload.teamB} value swing ${b.delta || 0}`);
      setTradeEvalCards({ fairness, capDeltaA: a.capDelta || 0, capDeltaB: b.capDelta || 0 });
      clearTradePackages({ keepMessage: true });
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadFreeAgency(), loadDepthChart(), loadTransactionLog(), loadPickAssets()]);
    }, "Executing trade...")
  );

  document.getElementById("clearTradePackageBtn").addEventListener("click", () => {
    clearTradePackages();
  });

  ["tradeTeamA", "tradeTeamB"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () =>
      runAction(async () => {
        if (id === "tradeTeamA") {
          state.tradeAssets.teamAPlayerIds = [];
          state.tradeAssets.teamAPickIds = [];
        } else {
          state.tradeAssets.teamBPlayerIds = [];
          state.tradeAssets.teamBPickIds = [];
        }
        setTradeEvalText("Use evaluate to see cap/value impact.");
        setTradeEvalCards();
        await loadPickAssets();
      }, "Loading trade assets...")
    );
  });

  document.getElementById("evaluateTradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = buildTradePayload();
      if (payload.teamA === payload.teamB) throw new Error("Select two different teams.");
      const result = await api("/api/trade/evaluate", { method: "POST", body: payload });
      const a = result.valuation?.[payload.teamA] || {};
      const b = result.valuation?.[payload.teamB] || {};
      const fairness = Math.max(0, 100 - Math.abs((a.delta || 0) - (b.delta || 0)) * 4);
      setTradeEvalText(
        `${payload.teamA}: in ${a.incomingValue ?? 0} / out ${a.outgoingValue ?? 0} | ${payload.teamB}: in ${b.incomingValue ?? 0} / out ${b.outgoingValue ?? 0}`
      );
      setTradeEvalCards({ fairness, capDeltaA: a.capDelta || 0, capDeltaB: b.capDelta || 0 });
      // Show trade breakdown card (Session 8)
      renderTradeBreakdown({
        fairness,
        teamAPlayers: (state.tradeTeamARoster || []).filter((p) => (state.tradeAssets.teamAPlayerIds || []).includes(p.id)),
        teamBPlayers: (state.tradeTeamBRoster || []).filter((p) => (state.tradeAssets.teamBPlayerIds || []).includes(p.id)),
        teamAPicksValue: a.picksValue || 0,
        teamBPicksValue: b.picksValue || 0
      });
    }, "Evaluating trade...")
  );

  document.getElementById("tradeTeamARosterTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trade-player-id]");
    if (!button) return;
    toggleTradeAsset("A", "player", button.dataset.tradePlayerId || "");
  });

  document.getElementById("tradeTeamBRosterTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trade-player-id]");
    if (!button) return;
    toggleTradeAsset("B", "player", button.dataset.tradePlayerId || "");
  });

  document.getElementById("pickAssetsTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trade-pick-id]");
    if (!button) return;
    toggleTradeAsset(button.dataset.tradePickSide || "A", "pick", button.dataset.tradePickId || "");
  });

  document.getElementById("loadContractsBtn").addEventListener("click", () =>
    runAction(loadContractsTeam, "Loading contracts...")
  );
  document.getElementById("contractsTeamSelect").addEventListener("change", () =>
    runAction(loadContractsTeam, "Loading contracts...")
  );

  document.getElementById("contractsResignBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/resign", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id,
          years: Number(document.getElementById("contractYearsInput").value || 3)
        }
      });
      setContractActionText(`${player.name} re-signed successfully.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Re-signing...")
  );

  document.getElementById("contractsRestructureBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/restructure", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id
        }
      });
      setContractActionText(`${player.name} restructured the current deal.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Restructuring...")
  );

  document.getElementById("franchiseTagBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/franchise-tag", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id
        }
      });
      setContractActionText(`${player.name} was franchise tagged.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Applying franchise tag...")
  );

  document.getElementById("fifthOptionBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/fifth-year-option", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id
        }
      });
      setContractActionText(`${player.name}'s fifth-year option was exercised.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Applying fifth-year option...")
  );

  document.getElementById("contractsNegotiateBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      const response = await api("/api/contracts/negotiate", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id,
          years: Number(document.getElementById("contractYearsInput").value || 0) || null,
          salary: Number(document.getElementById("contractSalaryInput").value || 0) || null
        }
      });
      if (response.countered) {
        document.getElementById("contractYearsInput").value = response.counterOffer?.years || "";
        document.getElementById("contractSalaryInput").value = response.counterOffer?.salary || "";
        setContractActionText(
          `${player.name} countered at ${response.counterOffer?.years}y / ${fmtMoney(response.counterOffer?.salary || 0)}. Morale ${response.morale}, motivation ${response.motivation}.`
        );
      } else {
        setContractActionText(`${player.name} accepted the offer. Morale ${response.morale}, motivation ${response.motivation}.`);
      }
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog(), loadNegotiations(state.contractTeamId)]);
    }, "Negotiating contract...")
  );

  document.getElementById("negotiationTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-negotiate-id]");
    if (!button) return;
    setSelectedContractPlayer(button.dataset.negotiateId || "");
  });

  document.getElementById("tagEligibleTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-fill]");
    if (!button) return;
    const playerId = button.dataset.playerId || "";
    setSelectedContractPlayer(playerId);
    updateContractPreview();
  });

  document.getElementById("optionEligibleTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-fill]");
    if (!button) return;
    const playerId = button.dataset.playerId || "";
    setSelectedContractPlayer(playerId);
    updateContractPreview();
  });
  document.getElementById("expiringTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-select]");
    if (!button) return;
    setSelectedContractPlayer(button.dataset.contractSelect || "");
  });
  document.getElementById("contractsRosterTable").addEventListener("click", (event) => {
    const selectButton = event.target.closest("button[data-contract-select]");
    if (selectButton) {
      setSelectedContractPlayer(selectButton.dataset.contractSelect || "");
      return;
    }
    const actionButton = event.target.closest("button[data-contract-action]");
    if (!actionButton) return;
    const playerId = actionButton.dataset.playerId || "";
    setSelectedContractPlayer(playerId, { preserveInputs: true });
    if (actionButton.dataset.contractAction === "trade") {
      queueTradePlayer(playerId);
      return;
    }
    if (actionButton.dataset.contractAction === "block") {
      toggleTradeBlockPlayer(playerId);
      setContractActionText(state.tradeBlockIds.includes(playerId) ? "Added to trade block." : "Removed from trade block.");
    }
  });
  document.getElementById("tradeBlockTable").addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-contract-action]");
    if (!actionButton) return;
    const playerId = actionButton.dataset.playerId || "";
    if (actionButton.dataset.contractAction === "trade") {
      queueTradePlayer(playerId);
      return;
    }
    toggleTradeBlockPlayer(playerId);
    setContractActionText("Removed from trade block.");
  });
  document.getElementById("contractsTradeBtn").addEventListener("click", () => {
    const player = getSelectedContractPlayer();
    if (!player) return;
    queueTradePlayer(player.id);
  });
  document.getElementById("contractsTradeBlockBtn").addEventListener("click", () => {
    const player = getSelectedContractPlayer();
    if (!player) return;
    toggleTradeBlockPlayer(player.id);
    setContractActionText(state.tradeBlockIds.includes(player.id) ? `${player.name} added to the trade block.` : `${player.name} removed from the trade block.`);
  });

  document.getElementById("loadDepthBtn").addEventListener("click", () => runAction(loadDepthChart, "Loading depth chart..."));
  ["depthTeamSelect", "depthPositionSelect"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadDepthChart, "Loading depth chart..."));
  });
  document.getElementById("saveDepthBtn").addEventListener("click", () =>
    runAction(async () => {
      const position = document.getElementById("depthPositionSelect").value;
      await api("/api/depth-chart", {
        method: "POST",
        body: {
          teamId: document.getElementById("depthTeamSelect").value,
          position,
          playerIds: state.depthOrder,
          snapShares: state.depthOrder.reduce((acc, playerId) => {
            const manualShare = state.depthManualShares?.[position]?.[playerId];
            if (Number.isFinite(manualShare)) acc[playerId] = manualShare;
            return acc;
          }, {})
        }
      });
      await loadDepthChart();
    }, "Saving depth chart...")
  );
  document.getElementById("depthTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-depth-move]");
    if (button) {
      const playerId = button.dataset.depthPlayerId;
      const delta = button.dataset.depthMove === "up" ? -1 : 1;
      state.depthOrder = moveIdWithinList(state.depthOrder, playerId, delta);
      renderDepthChart();
      return;
    }
    const resetButton = event.target.closest("button[data-depth-share-reset]");
    if (!resetButton) return;
    const position = document.getElementById("depthPositionSelect").value;
    delete state.depthManualShares?.[position]?.[resetButton.dataset.depthShareReset];
    renderDepthChart();
  });
  document.getElementById("depthTable").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-depth-share-input]");
    if (!input) return;
    const position = document.getElementById("depthPositionSelect").value;
    updateDepthShare(position, input.dataset.depthShareInput, input.value);
    renderDepthChart();
  });

  document.getElementById("prepareDraftBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/prepare", { method: "POST", body: {} });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadCalendar()]);
    }, "Preparing draft...")
  );

  document.getElementById("cpuDraftBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 224, untilUserPick: true } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Running CPU draft...")
  );

  document.getElementById("cpuDraftAllBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 224, untilUserPick: false } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Finishing draft...")
  );

  document.getElementById("cpuDraftOneBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 1, untilUserPick: false } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Simulating one pick...")
  );

  document.getElementById("userPickBtn").addEventListener("click", () =>
    runAction(async () => {
      if (!state.selectedDraftProspectId) throw new Error("Select a prospect first.");
      await api("/api/draft/user-pick", {
        method: "POST",
        body: { playerId: state.selectedDraftProspectId }
      });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Submitting user pick...")
  );

  document.getElementById("draftAvailableTable").addEventListener("click", async (event) => {
    const selectButton = event.target.closest("button[data-draft-select-id]");
    if (selectButton) {
      state.selectedDraftProspectId = selectButton.dataset.draftSelectId || null;
      renderDraft();
      return;
    }
    const button = event.target.closest("button[data-draft-player-id]");
    if (!button) return;
    const prospectId = button.dataset.draftPlayerId || null;
    state.selectedDraftProspectId = prospectId;
    // Draft Day Broadcast Reveal
    const prospect = (state.draftState?.available || []).find((p) => p.id === prospectId);
    const teamName = state.dashboard?.controlledTeam?.name || state.dashboard?.controlledTeamId || "Your Team";
    await new Promise((resolve) => showDraftPickReveal(prospect, teamName, resolve));
    runAction(async () => {
      await api("/api/draft/user-pick", {
        method: "POST",
        body: { playerId: button.dataset.draftPlayerId }
      });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Drafting player...");
  });

  document.getElementById("loadScoutingBtn").addEventListener("click", () =>
    runAction(loadScouting, "Loading scouting board...")
  );

  document.getElementById("lockBoardBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/scouting/lock-board", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerIds: state.scoutingBoardDraft.slice(0, 20)
        }
      });
      await loadScouting();
    }, "Locking board...")
  );
  document.getElementById("scoutingTable").addEventListener("click", (event) => {
    const scoutButton = event.target.closest("button[data-scout-player-id]");
    if (scoutButton) {
      runAction(async () => {
        await api("/api/scouting/allocate", {
          method: "POST",
          body: {
            teamId: state.dashboard?.controlledTeamId,
            playerId: scoutButton.dataset.scoutPlayerId,
            points: Number(document.getElementById("scoutPointsInput").value || 10)
          }
        });
        await loadScouting();
      }, "Scouting prospect...");
      return;
    }

    const toggleButton = event.target.closest("button[data-board-toggle]");
    if (toggleButton) {
      const playerId = toggleButton.dataset.playerId;
      if (toggleButton.dataset.boardToggle === "add") {
        if (!state.scoutingBoardDraft.includes(playerId) && state.scoutingBoardDraft.length < 20) {
          state.scoutingBoardDraft = [...state.scoutingBoardDraft, playerId];
        }
      } else {
        state.scoutingBoardDraft = state.scoutingBoardDraft.filter((id) => id !== playerId);
      }
      renderScouting();
      return;
    }

    const moveButton = event.target.closest("button[data-board-move]");
    if (moveButton) {
      const delta = moveButton.dataset.boardMove === "up" ? -1 : 1;
      state.scoutingBoardDraft = moveIdWithinList(state.scoutingBoardDraft, moveButton.dataset.playerId, delta);
      renderScouting();
    }
  });

  document.getElementById("scopeFilter").addEventListener("change", () =>
    runAction(async () => {
      updateStatsControls();
      await loadStats();
    }, "Loading stats...")
  );
  ["categoryFilter", "positionFilter", "statsTeamFilter", "yearFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadStats, "Loading stats..."));
  });
  document.getElementById("statsSeasonTypeFilter").addEventListener("change", () => runAction(loadStats, "Loading stats..."));
  document.getElementById("playerSeasonTypeFilter").addEventListener("change", () => {
    if (!state.activePlayerId) return;
    runAction(() => loadPlayerModal(state.activePlayerId), "Loading player...");
  });
  document.getElementById("statsVirtualizedToggle").addEventListener("change", () => applyStatsSort());
  document.getElementById("statsColumnFilters").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-stats-column]");
    if (!input) return;
    const column = input.dataset.statsColumn;
    const next = new Set(state.statsHiddenColumns);
    if (input.checked) next.delete(column);
    else next.add(column);
    saveStatsHiddenColumns([...next]);
    applyStatsSort();
  });
  document.getElementById("comparePlayersBtn").addEventListener("click", () =>
    runAction(loadComparePlayers, "Comparing players...")
  );
  document.getElementById("searchComparePlayersBtn").addEventListener("click", () =>
    runAction(searchComparePlayers, "Searching players...")
  );
  document.getElementById("comparePlayerSearchTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-compare-player-toggle]");
    if (!button) return;
    const playerId = button.dataset.comparePlayerToggle || "";
    const current = state.comparePlayerIds.includes(playerId)
      ? state.comparePlayerIds.filter((id) => id !== playerId)
      : uniqueIds([...state.comparePlayerIds, playerId]).slice(0, 8);
    state.comparePlayerIds = current;
    renderCompareSearchResults();
    void loadComparePlayers();
  });

  document.getElementById("leadersCategory").addEventListener("change", () => {
    renderLeaders();
  });

  document.getElementById("prevScheduleWeekBtn").addEventListener("click", () =>
    runAction(() => loadScheduleWeek((state.scheduleWeek || state.dashboard?.currentWeek || 1) - 1), "Loading schedule...")
  );

  document.getElementById("nextScheduleWeekBtn").addEventListener("click", () =>
    runAction(() => loadScheduleWeek((state.scheduleWeek || state.dashboard?.currentWeek || 1) + 1), "Loading schedule...")
  );

  document.getElementById("loadCalendarBtn").addEventListener("click", () =>
    runAction(loadCalendar, "Loading calendar...")
  );

  document.getElementById("calendarYearFilter").addEventListener("change", () =>
    runAction(loadCalendar, "Loading calendar year...")
  );

  document.getElementById("calendarWeekFilter").addEventListener("change", () => {
    state.calendarWeek = Number(document.getElementById("calendarWeekFilter").value || 1);
    renderCalendar();
  });

  document.getElementById("loadTxBtn").addEventListener("click", () =>
    runAction(loadTransactionLog, "Loading transaction log...")
  );
  ["txTeamFilter", "txTypeFilter", "txYearFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadTransactionLog, "Loading transaction log..."));
  });

  document.getElementById("loadAnalyticsBtn").addEventListener("click", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );

  document.getElementById("analyticsYearFilter").addEventListener("change", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );
  document.getElementById("analyticsTeamFilter").addEventListener("change", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );

  document.getElementById("saveSettingsBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = await api("/api/settings", {
        method: "POST",
        body: {
          allowInjuries: document.getElementById("settingAllowInjuries").checked,
          autoProgressOffseason: document.getElementById("settingAutoOffseason").checked,
          enableOwnerMode: document.getElementById("settingEnableOwnerMode").checked,
          enableNarratives: document.getElementById("settingEnableNarratives").checked,
          enableCompPicks: document.getElementById("settingEnableCompPicks").checked,
          enableChemistry: document.getElementById("settingEnableChemistry").checked,
          retirementWinningRetention: document.getElementById("settingRetirementWinningRetention").checked,
          retiredNumberRequireRetiredPlayer: document.getElementById("settingRetiredNumberRequireRetiredPlayer").checked,
          retiredNumberRequireHallOfFame: document.getElementById("settingRetiredNumberRequireHallOfFame").checked,
          retirementOverrideMinWinningPct: Number(document.getElementById("settingRetirementMinWinPct").value || 0.55),
          hallOfFameInductionScoreMin: Number(document.getElementById("settingHallOfFameInductionScoreMin").value || 240),
          hallOfFameYearsRetiredMin: Number(document.getElementById("settingHallOfFameYearsRetiredMin").value || 0),
          retiredNumberCareerAvMin: Number(document.getElementById("settingRetiredNumberCareerAvMin").value || 0),
          eraProfile: document.getElementById("settingEraProfile").value,
          injuryRateMultiplier: Number(document.getElementById("settingInjuryRate").value || 1),
          capGrowthRate: Number(document.getElementById("settingCapGrowth").value || 0.045),
          cpuTradeAggression: Number(document.getElementById("settingTradeAggression").value || 0.5)
        }
      });
      state.leagueSettings = payload.settings || state.leagueSettings;
      applySettingsControls();
      applyDashboard(payload.state);
    }, "Saving settings...")
  );

  document.getElementById("ownerTeamSelect").addEventListener("change", () =>
    runAction(loadOwner, "Loading owner...")
  );
  document.getElementById("loadOwnerBtn").addEventListener("click", () =>
    runAction(loadOwner, "Loading owner...")
  );
  document.getElementById("saveOwnerBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/owner", {
        method: "POST",
        body: {
          teamId: document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId,
          ticketPrice: Number(document.getElementById("ownerTicketPriceInput").value || 0) || null,
          staffBudget: Number(document.getElementById("ownerStaffBudgetInput").value || 0) || null,
          training: Number(document.getElementById("ownerTrainingInput").value || 0) || null,
          rehab: Number(document.getElementById("ownerRehabInput").value || 0) || null,
          analytics: Number(document.getElementById("ownerAnalyticsInput").value || 0) || null
        }
      });
      await Promise.all([loadState(), loadOwner(), loadTransactionLog()]);
    }, "Saving owner settings...")
  );

  document.getElementById("loadObservabilityBtn").addEventListener("click", () =>
    runAction(loadObservability, "Loading metrics...")
  );
  document.getElementById("retryClientDiagnosticsBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const result = await retryClientDiagnostics();
      renderObservability();
      showToast(`${result.recovered} client surface${result.recovered === 1 ? "" : "s"} recovered.`);
    }, "Retrying degraded panels...")
  );
  document.getElementById("clearClientDiagnosticsBtn")?.addEventListener("click", () => {
    clearClientDiagnostics();
    renderObservability();
    showToast("Client degradation ledger cleared.");
  });
  document.getElementById("loadPersistenceBtn").addEventListener("click", () =>
    runAction(loadPersistence, "Loading persistence...")
  );
  document.getElementById("runCalibrationJobBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/calibration/jobs", {
        method: "POST",
        body: { year: state.dashboard?.currentYear, samples: 40, label: "ui-run" }
      });
      await loadCalibrationJobs();
    }, "Running calibration job...")
  );
  document.getElementById("runRealismVerifyBtn").addEventListener("click", () =>
    runAction(runRealismVerification, "Running 10-20 year realism verification...")
  );
  document.getElementById("loadPipelineBtn").addEventListener("click", () =>
    runAction(loadPipeline, "Loading pipeline...")
  );
  document.getElementById("advancePipelineBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/offseason/advance", { method: "POST", body: {} });
      await Promise.all([loadState(), loadPipeline(), loadRoster(), loadNews()]);
    }, "Advancing pipeline...")
  );

  document.getElementById("staffTeamSelect").addEventListener("change", () =>
    runAction(loadStaff, "Loading staff...")
  );

  document.getElementById("updateStaffBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = await api("/api/staff", {
        method: "POST",
        body: {
          teamId: document.getElementById("staffTeamSelect").value || state.dashboard?.controlledTeamId,
          role: document.getElementById("staffRoleSelect").value,
          name: document.getElementById("staffNameInput").value.trim() || null,
          playcalling: Number(document.getElementById("staffPlaycallingInput").value || 75),
          development: Number(document.getElementById("staffDevelopmentInput").value || 75),
          discipline: Number(document.getElementById("staffDisciplineInput").value || 75),
          yearsRemaining: Number(document.getElementById("staffYearsInput").value || 3)
        }
      });
      state.staffState = payload.team || state.staffState;
      renderStaff();
      applyDashboard(payload.state);
    }, "Updating staff...")
  );

  document.getElementById("startSimJobBtn").addEventListener("click", () =>
    runAction(async () => {
      const seasons = Number(document.getElementById("jobSeasonsInput").value || 10);
      await api("/api/jobs/simulate", { method: "POST", body: { seasons } });
      await loadSimJobs();
    }, "Starting simulation job...")
  );
  document.getElementById("refreshJobsBtn").addEventListener("click", () =>
    runAction(loadSimJobs, "Refreshing jobs...")
  );

  document.getElementById("prevStatsPageBtn").addEventListener("click", () => {
    state.statsPage = Math.max(1, state.statsPage - 1);
    applyStatsSort();
  });

  document.getElementById("nextStatsPageBtn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.statsRows.length / state.statsPageSize));
    state.statsPage = Math.min(totalPages, state.statsPage + 1);
    applyStatsSort();
  });

  document.getElementById("loadPlayerTimelineBtn").addEventListener("click", () =>
    runAction(loadPlayerTimeline, "Loading player history...")
  );
  document.querySelectorAll("[data-history-view]").forEach((button) => {
    button.addEventListener("click", () => {
      setHistoryView(button.dataset.historyView || "season-awards");
    });
  });
  document.getElementById("historyAwardYearSelect").addEventListener("change", () => {
    state.selectedAwardsYear = Number(document.getElementById("historyAwardYearSelect").value || 0) || null;
    renderRecordsAndHistory();
  });
  document.getElementById("searchPlayerTimelineBtn").addEventListener("click", () =>
    runAction(searchHistoryPlayers, "Searching player history...")
  );
  document.getElementById("playerTimelineSearchTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-history-player-select]");
    if (!button) return;
    const player =
      state.historyPlayerSearchResults.find((entry) => entry.id === (button.dataset.historyPlayerSelect || "")) || null;
    setSelectedHistoryPlayer(player);
    renderPlayerTimelineSearchResults();
  });
  document.getElementById("loadTeamHistoryBtn").addEventListener("click", () => runAction(loadTeamHistory, "Loading team history..."));
  document.getElementById("retireSelectedJerseyBtn").addEventListener("click", () =>
    runAction(retireSelectedJersey, "Retiring jersey number...")
  );

  document.getElementById("saveBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      await api("/api/saves/save", { method: "POST", body: { slot } });
      await loadSaves();
    }, "Saving league...")
  );

  document.getElementById("loadBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      const payload = await api("/api/saves/load", { method: "POST", body: { slot } });
      applyDashboard(payload.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadStats(),
        loadDraftState(),
        loadScouting(),
        loadDepthChart(),
        loadQa(),
        loadTeamHistory(),
        loadSaves(),
        loadCalendar(),
        loadTransactionLog(),
        loadOwner(),
        loadPipeline(),
        loadObservability(),
        loadCalibrationJobs(),
        loadSimJobs()
      ]);
    }, "Loading save...")
  );

  document.getElementById("deleteSaveBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      await api("/api/saves/delete", { method: "POST", body: { slot } });
      await loadSaves();
    }, "Deleting save...")
  );

  document.getElementById("exportSnapshotBtn").addEventListener("click", () =>
    runAction(exportSnapshot, "Exporting snapshot...")
  );
  document.getElementById("importSnapshotBtn").addEventListener("click", () =>
    document.getElementById("snapshotImportInput").click()
  );
  document.getElementById("snapshotImportInput").addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    runAction(async () => {
      await importSnapshot(file);
      event.target.value = "";
    }, "Importing snapshot...");
  });

  document.getElementById("loadQaBtn").addEventListener("click", () => runAction(loadQa, "Loading QA report..."));

  document.getElementById("rehabCommandCenter")?.addEventListener("click", (event) => {
    const button = event.target.closest(".rehab-plan-btn");
    if (!button) return;
    runAction(async () => {
      const payload = await api("/api/injuries/rehab-plan", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerId: button.dataset.playerId,
          plan: button.dataset.plan
        }
      });
      applyDashboard(payload.state);
      showToast(payload.receipt?.label + ": " + payload.receipt?.playerName);
    }, "Updating rehab plan...");
  });

  // ── GitHub Gist Cloud Sync ──────────────────────────────────────────────────
  document.getElementById("gistSyncSaveTokenBtn")?.addEventListener("click", () => {
    const input = document.getElementById("gistTokenInput");
    const tok = input?.value?.trim();
    const result = saveToken(tok);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    if (input) {
      input.value = "";
      input.placeholder = tok ? "Token available for this tab" : "Paste token for this tab";
    }
    const button = document.getElementById("gistSyncSaveTokenBtn");
    if (button) button.textContent = tok ? "Clear Token" : "Use Token This Tab";
    setStatus(tok ? "GitHub token available for this tab only." : "Token cleared.");
  });
  document.getElementById("gistExportBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const token = getSavedToken();
      if (!token) { setStatus("Set your GitHub token first."); return; }
      const snap = await api("/api/snapshot/export");
      const { gistId, url } = await exportToGist(snap, token);
      setStatus(`Saved to Gist: ${gistId}`);
      renderGistSyncStatus(`✅ Exported — <a href="${url}" target="_blank" rel="noopener">Open Gist</a>`);
      renderGistList();
    }, "Uploading to Gist…")
  );
  document.getElementById("gistImportBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const token = getSavedToken();
      const gistId = document.getElementById("gistIdInput")?.value?.trim() || getSavedGistId();
      if (!gistId) { setStatus("Enter a Gist ID to import."); return; }
      const { snapshot } = await importFromGist(gistId, token);
      await api("/api/snapshot/inspect", { method: "POST", body: { snapshot } });
      await api("/api/snapshot/import", { method: "POST", body: { snapshot } });
      await loadState();
      setStatus("Imported from Gist.");
      renderGistSyncStatus("✅ Imported successfully.");
    }, "Importing from Gist…")
  );
  document.getElementById("gistListBtn")?.addEventListener("click", renderGistList);

  document.getElementById("refreshRewindBtn")?.addEventListener("click", () =>
    observeBackgroundTask(loadRewindHistory, {
      surface: "action",
      operation: "refresh-rewind-history",
      authorityKey: state.dashboard?.leagueId || state.dashboard?.startYear || "",
      onError: presentActionError
    })
  );
  document.getElementById("manualRewindSnapshotBtn")?.addEventListener("click", async () => {
    await api("/api/rewind/snapshot", { method: "POST", body: { label: "Manual snapshot" } });
    await loadRewindHistory();
  });

  const openCommandPalette = () => {
    document.getElementById("commandPalette").classList.remove("hidden");
    document.getElementById("commandInput").focus();
    renderCommandPalette();
  };
  const closeCommandPalette = () => {
    document.getElementById("commandPalette").classList.add("hidden");
  };
  document.getElementById("closeCommandPaletteBtn")?.addEventListener("click", closeCommandPalette);
  document.getElementById("openGuideBtn")?.addEventListener("click", openGuideModal);
  document.getElementById("closeGuideModalBtn")?.addEventListener("click", closeGuideModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCommandPalette();
      closePlayerModal();
      closeBoxScoreModal();
      closeGuideModal();
      closeAgentModal();
      closeShortcutsModal();
      return;
    }
    const tag = document.activeElement?.tagName;
    const editable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (editable) return;
    if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      document.getElementById("refreshBtn").click();
      return;
    }
    if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
      openShortcutsModal();
      return;
    }
    if (event.key.toLowerCase() === "w" && !event.ctrlKey && !event.metaKey) {
      document.getElementById("advanceWeekBtn")?.click();
      return;
    }
    if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.metaKey) {
      const ticker = document.getElementById("newsTicker");
      if (ticker) ticker.hidden = !ticker.hidden;
      return;
    }
    // 1–9: jump to tab by index
    if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      const idx = parseInt(event.key, 10) - 1;
      const tabs = document.querySelectorAll(".menu-btn[data-tab]");
      if (tabs[idx]) { tabs[idx].click(); }
      return;
    }
  });

  // Mobile nav drawer (CANON-041)
  {
    const sideMenu = document.getElementById("sideMenu");
    const backdrop = document.getElementById("navBackdrop");
    const toggleBtn = document.getElementById("navToggleBtn");
    const closeBtn = document.getElementById("navDrawerCloseBtn");
    const mobileNavMq = window.matchMedia("(max-width: 980px)");

    function openNav() {
      if (sideMenu) sideMenu.inert = false;
      sideMenu?.classList.add("nav-open");
      backdrop?.classList.add("visible");
      toggleBtn?.setAttribute("aria-expanded", "true");
      closeBtn?.focus();
    }
    function closeNav() {
      sideMenu?.classList.remove("nav-open");
      backdrop?.classList.remove("visible");
      toggleBtn?.setAttribute("aria-expanded", "false");
      // Re-inert the drawer on mobile so off-screen nav buttons aren't keyboard-reachable
      if (mobileNavMq.matches && sideMenu) sideMenu.inert = true;
      toggleBtn?.focus();
    }

    // Initial state: make the drawer inert on mobile so closed nav is never keyboard-reachable
    if (mobileNavMq.matches && sideMenu) sideMenu.inert = true;

    // Resize guard: if the viewport exits the mobile breakpoint while the drawer is open,
    // clean up the backdrop/state so it doesn't stay stuck as a fullscreen scrim on desktop
    mobileNavMq.addEventListener("change", (e) => {
      if (!e.matches) {
        // Exited mobile — remove drawer state and unblock desktop nav
        sideMenu?.classList.remove("nav-open");
        backdrop?.classList.remove("visible");
        toggleBtn?.setAttribute("aria-expanded", "false");
        if (sideMenu) sideMenu.inert = false;
      } else {
        // Entered mobile — inert the nav if it's currently closed
        if (!sideMenu?.classList.contains("nav-open") && sideMenu) sideMenu.inert = true;
      }
    });

    toggleBtn?.addEventListener("click", () => {
      sideMenu?.classList.contains("nav-open") ? closeNav() : openNav();
    });
    closeBtn?.addEventListener("click", closeNav);
    backdrop?.addEventListener("click", closeNav);

    // Close drawer when a tab is activated (mobile only — no-op on desktop)
    sideMenu?.addEventListener("click", (e) => {
      if (e.target.closest(".menu-btn[data-tab]") && sideMenu.classList.contains("nav-open")) {
        closeNav();
      }
    });

    // Escape closes the drawer
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sideMenu?.classList.contains("nav-open")) {
        closeNav();
      }
    });
  }

  // Roving-tabindex arrow navigation for the ARIA tablist (S29).
  document.querySelector('.side-menu[role="tablist"]')?.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(document.querySelectorAll(".menu-btn[data-tab]"));
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    tabs[nextIndex].click();
    tabs[nextIndex].focus();
  });

  document.addEventListener("click", (event) => {
    const agentBtn = event.target.closest("button[data-agent-player-id]");
    if (agentBtn) {
      openAgentModal(agentBtn.dataset.agentPlayerId);
      return;
    }
    const agentModal = document.getElementById("agentNegotiationModal");
    if (event.target === agentModal) { closeAgentModal(); return; }
    const shortcutsModal = document.getElementById("shortcutsModal");
    if (event.target === shortcutsModal) { closeShortcutsModal(); return; }
    const playerButton = event.target.closest("button[data-player-id]");
    if (playerButton) {
      runAction(() => loadPlayerModal(playerButton.dataset.playerId), "Loading player...");
      return;
    }
    const boxScoreTabButton = event.target.closest("button[data-boxscore-tab]");
    if (boxScoreTabButton) {
      setBoxScoreTab(boxScoreTabButton.dataset.boxscoreTab);
      return;
    }
    const modal = document.getElementById("playerModal");
    if (event.target === modal) closePlayerModal();
    const boxScoreModal = document.getElementById("boxScoreModal");
    if (event.target === boxScoreModal) closeBoxScoreModal();
    const commandModal = document.getElementById("commandPalette");
    if (event.target === commandModal) closeCommandPalette();
    const guideModal = document.getElementById("guideModal");
    if (event.target === guideModal) closeGuideModal();
  });

  document.getElementById("closePlayerModalBtn").addEventListener("click", () => {
    closePlayerModal();
  });
  document.getElementById("closeBoxScoreModalBtn").addEventListener("click", () => {
    closeBoxScoreModal();
  });

  // ── New feature event listeners ────────────────────────────────────────────
  document.getElementById("closeNewsTickerBtn")?.addEventListener("click", () => {
    const ticker = document.getElementById("newsTicker");
    if (ticker) ticker.hidden = true;
  });

  document.getElementById("runCapCasualtyBtn")?.addEventListener("click", () =>
    runAction(async () => {
      await loadContractsTeam();
      renderCapCasualtyPanel();
    }, "Analyzing cap casualties...")
  );
  document.getElementById("runCapProjectionBtn")?.addEventListener("click", () => {
    renderCapProjectionPanel();
  });

  document.getElementById("runCombineBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const data = await api("/api/combine/run", { method: "POST", body: {} });
      if (data.results) {
        state.dashboard = { ...(state.dashboard || {}), combineResults: data.results };
        renderCombineResults();
      }
    }, "Running combine...")
  );
  document.getElementById("loadCombineResultsBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const data = await api("/api/combine/results");
      if (data.results) {
        state.dashboard = { ...(state.dashboard || {}), combineResults: data.results };
        renderCombineResults();
      }
    }, "Loading combine results...")
  );

  document.getElementById("createLobbyBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const commissionerId =
        document.getElementById("commissionerIdInput")?.value?.trim() ||
        state.dashboard?.controlledTeamId ||
        "commissioner";
      const leagueName = document.getElementById("commissionerLeagueNameInput")?.value?.trim() || "VaultSpark League";
      const maxPlayers = Number(document.getElementById("commissionerMaxPlayersSelect")?.value || 4);
      await api("/api/commissioner/create", {
        method: "POST",
        body: {
          commissionerId,
          leagueName,
          maxPlayers,
          controlledTeamId: state.dashboard?.controlledTeamId
        }
      });
      await renderCommissionerLobby();
    }, "Creating lobby...")
  );
  document.getElementById("joinLobbyBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const userId = document.getElementById("joinUserIdInput")?.value?.trim() || "guest-gm";
      const controlledTeamId =
        document.getElementById("joinTeamSelect")?.value ||
        state.dashboard?.controlledTeamId;
      if (!controlledTeamId) throw new Error("Choose a team before joining the lobby.");
      await api("/api/commissioner/join", {
        method: "POST",
        body: { userId, displayName: userId, controlledTeamId }
      });
      await renderCommissionerLobby();
    }, "Joining lobby...")
  );
  document.getElementById("markReadyBtn")?.addEventListener("click", () =>
    runAction(async () => {
      const userId =
        document.getElementById("joinUserIdInput")?.value?.trim() ||
        document.getElementById("commissionerIdInput")?.value?.trim() ||
        "commissioner";
      await api("/api/commissioner/ready", { method: "POST", body: { userId } });
      await renderCommissionerLobby();
    }, "Marking ready...")
  );
  document.getElementById("advanceLobbyBtn")?.addEventListener("click", () =>
    runAction(async () => {
      await api("/api/commissioner/advance", { method: "POST", body: {} });
      await Promise.all([loadState(), renderCommissionerLobby()]);
    }, "Advancing commissioner turn...")
  );
  document.getElementById("refreshLobbyBtn")?.addEventListener("click", () =>
    runAction(renderCommissionerLobby, "Refreshing lobby...")
  );
  document.getElementById("disbandLobbyBtn")?.addEventListener("click", () =>
    runAction(async () => {
      if (!confirm("Disband this lobby? All players will need to re-join.")) return;
      await api("/api/commissioner/lobby", { method: "DELETE" });
      await renderCommissionerLobby();
    }, "Disbanding lobby...")
  );

  document.getElementById("closeAgentModalBtn")?.addEventListener("click", closeAgentModal);

  document.getElementById("closeShortcutsModalBtn")?.addEventListener("click", closeShortcutsModal);

  document.getElementById("mobileLoopToggle")?.addEventListener("change", (e) => {
    setMobileModeEnabled(e.target.checked);
    syncMobileLoopOverlay();
  });

  document.getElementById("shareDynastyBtn")?.addEventListener("click", shareDynastyTimeline);
  document.getElementById("leagueStoryCardBtn")?.addEventListener("click", () => {
    const story = buildLeagueStoryFromDashboard(state.dashboard || {});
    downloadLeagueStory(story);
  });
  document.getElementById("franchiseNewsletterBtn")?.addEventListener("click", () => generateFranchiseNewsletter(state));

  // Season review modal close
  document.getElementById("closeSeasonReviewBtn")?.addEventListener("click", closeSeasonReviewModal);

  // Brand builder apply button
  document.getElementById("applyBrandBtn")?.addEventListener("click", () => {
    const name    = document.getElementById("brandNameInput")?.value?.trim();
    const city    = document.getElementById("brandCityInput")?.value?.trim();
    const abbrev  = document.getElementById("brandAbbrevInput")?.value?.trim();
    const primary = document.getElementById("brandPrimaryInput")?.value?.trim();
    const secondary = document.getElementById("brandSecondaryInput")?.value?.trim();
    const overrides = { teamId: state.dashboard?.controlledTeamId };
    if (name)    overrides.customName = name;
    if (city)    overrides.customCity = city;
    if (abbrev)  overrides.customAbbrev = abbrev;
    if (primary) overrides.primaryColor = primary;
    if (secondary) overrides.secondaryColor = secondary;
    applyBrandIdentity(overrides).catch(presentActionError);
  });

  // Mentorship panel load on Roster tab
  document.querySelectorAll(".menu-btn[data-tab='rosterTab']").forEach((btn) => {
    btn.addEventListener("click", () => {
      renderVeteranMentorshipPanel().catch((error) => renderPanelError("mentorshipPanel", "Mentorship panel", error));
    });
  });

  // ── Session 8: Engagement Features ─────────────────────────────────────
  // Priority Inbox
  document.getElementById("openInboxBtn")?.addEventListener("click", openInbox);
  document.getElementById("closeInboxBtn")?.addEventListener("click", closeInbox);

  // Franchise Moment card
  document.getElementById("fmCloseBtn")?.addEventListener("click", closeFranchiseMomentModal);

  // GM Decision modal
  document.getElementById("gmDecisionDismissBtn")?.addEventListener("click", dismissGmDecision);
  document.getElementById("gmDecisionModal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("gmDecisionModal")) dismissGmDecision();
  });

  // Sim-Watch
  document.getElementById("simWatchSkipBtn")?.addEventListener("click", skipSimWatch);
  document.getElementById("simWatchCloseBtn")?.addEventListener("click", closeSimWatch);

  // Box score ticker — wire sim-watch on click if play-by-play available
  document.getElementById("boxScoreTicker")?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-boxscore-id]");
    if (!btn) return;
    const gameId = btn.dataset.boxscoreId;
    // Run sim-watch if we haven't shown the box score yet
    if (state.activeBoxScoreId !== gameId && gameId) {
      runSimWatch(gameId).catch(presentActionError);
    }
  });

  // Cap War Room — load on Contracts tab activation
  document.querySelectorAll(".menu-btn[data-tab='contractsTab']").forEach((btn) => {
    btn.addEventListener("click", () => {
      renderCapWarRoom().catch((error) => renderPanelError("capWarRoomBars", "Cap War Room", error, {
        onRetry: () => renderCapWarRoom().catch((retryError) => renderPanelError("capWarRoomBars", "Cap War Room", retryError))
      }));
    });
  });

  // Dynasty Records Board
  document.getElementById("loadRecordsBoardBtn")?.addEventListener("click", () => {
    renderDynastyRecordsBoard().catch((error) => renderPanelError("dynastyRecordsBoard", "Dynasty Records Board", error));
  });

  // AI GM Archetypes
  document.getElementById("loadArchetypesBtn")?.addEventListener("click", () => {
    loadTeamArchetypes().then(() => renderArchetypesTable()).catch((error) => renderPanelError("teamArchetypesTable", "League GM Archetypes", error));
  });

  // Season Arcs — load on Overview activation
  document.querySelectorAll(".menu-btn[data-tab='overviewTab']").forEach((btn) => {
    btn.addEventListener("click", () => {
      renderSeasonArcs().catch((error) => renderPanelError("seasonArcsContent", "Season arcs", error, {
        onRetry: () => renderSeasonArcs().catch((retryError) => renderPanelError("seasonArcsContent", "Season arcs", retryError))
      }));
    });
  });
}

// ── Speedrun Challenge Mode ─────────────────────────────────────

function renderSpeedrunPanel() {
  const statusEl = document.getElementById("speedrunStatus");
  const actionsEl = document.getElementById("speedrunActions");
  const lbEl = document.getElementById("speedrunLeaderboard");
  if (!statusEl) return;

  const ch = state.speedrunChallenge;
  const rival = loadRivalTarget();
  const rivalHtml = rival?.rivalSeasons
    ? `<div class="speedrun-rival">🎯 Challenge target: beat <strong>${rival.rivalSeasons} season${rival.rivalSeasons === 1 ? "" : "s"}</strong>${rival.rivalName ? ` by ${escapeHtml(rival.rivalName)}` : ""}</div>`
    : "";
  if (ch && ch.active) {
    statusEl.innerHTML = `<div class="speedrun-status-card">
      <span class="speedrun-active-badge">ACTIVE</span>
      <div class="speedrun-stat"><strong>Team:</strong> ${escapeHtml(teamCode(ch.teamId))}</div>
      <div class="speedrun-stat"><strong>Seasons:</strong> ${ch.seasonsElapsed}</div>
    </div>${rivalHtml}`;
    actionsEl.innerHTML = `<button id="copyChallengeCodeBtn" class="btn btn-sm">Copy Challenge Code</button>
      <button id="abandonSpeedrunBtn" class="btn btn-sm btn-danger">Abandon Run</button>`;
    document.getElementById("abandonSpeedrunBtn")?.addEventListener("click", () =>
      runAction(abandonSpeedrunChallenge, "Abandoning run...")
    );
  } else {
    statusEl.innerHTML = `<p style="opacity:0.7">No active challenge. Start one to begin tracking.</p>${rivalHtml}`;
    actionsEl.innerHTML = `<button id="startSpeedrunBtn" class="btn btn-sm btn-accent">Start Challenge</button>
      ${state.speedrunLeagueMeta?.seed != null ? `<button id="copyChallengeCodeBtn" class="btn btn-sm">Copy Challenge Code</button>` : ""}`;
    document.getElementById("startSpeedrunBtn")?.addEventListener("click", () =>
      runAction(startSpeedrunChallenge, "Starting challenge...")
    );
  }
  document.getElementById("copyChallengeCodeBtn")?.addEventListener("click", copyChallengeCode);

  const lb = state.speedrunLeaderboard || [];
  if (lb.length) {
    const rows = lb.slice(0, 20).map((e, i) => `<tr${ch && e.playerName === "You" ? ' class="speedrun-highlight"' : ""}>
      <td>${i + 1}</td><td>${escapeHtml(e.playerName)}</td>
      <td>${escapeHtml(teamCode(e.teamId))}</td><td>${e.seasons}</td>
      <td>${e.date ? new Date(e.date).toLocaleDateString() : "-"}</td></tr>`).join("");
    lbEl.innerHTML = `<table class="speedrun-lb-table"><tr><th>#</th><th>Player</th><th>Team</th><th>Seasons</th><th>Date</th></tr>${rows}</table>`;
  } else {
    lbEl.innerHTML = `<p style="opacity:0.5;font-size:0.85rem">No leaderboard entries yet.</p>`;
  }
}

// Encode this league + your best result as a shareable "beat my run" code.
async function copyChallengeCode() {
  const meta = state.speedrunLeagueMeta;
  if (!meta || meta.seed == null) { showToast("No league seed available for a challenge code"); return; }
  const lb = state.speedrunLeaderboard || [];
  const bestYou = lb
    .filter((e) => e.playerName && e.seasons > 0)
    .sort((a, b) => a.seasons - b.seasons)[0] || null;
  const code = encodeChallengeCode({
    seed: meta.seed,
    startYear: meta.startYear,
    teamId: state.speedrunChallenge?.teamId || meta.controlledTeamId,
    rivalSeasons: bestYou?.seasons ?? null,
    rivalName: bestYou?.playerName ?? null
  });
  if (!code) { showToast("Could not build challenge code"); return; }
  try {
    await navigator.clipboard.writeText(code);
    showToast(bestYou
      ? `Challenge code copied — dare a friend to beat ${bestYou.seasons} seasons!`
      : "Challenge code copied — share your league seed!");
  } catch (error) {
    recordClientDiagnostic({
      surface: "action",
      operation: "copy-challenge-code",
      error,
      authorityKey: state.dashboard?.leagueId || state.dashboard?.startYear || "",
      severity: "error"
    });
    prompt("Copy your challenge code:", code);
  }
}

async function loadSpeedrunStatus() {
  try {
    const res = await api("/api/speedrun/status");
    state.speedrunChallenge = res.challenge || null;
    state.speedrunLeagueMeta = res.leagueMeta || null;
  } catch { state.speedrunChallenge = null; state.speedrunLeagueMeta = null; }
  try {
    const res = await api("/api/speedrun/leaderboard");
    state.speedrunLeaderboard = res.entries || [];
  } catch { state.speedrunLeaderboard = []; }
  renderSpeedrunPanel();
}

async function startSpeedrunChallenge() {
  const teamId = state.dashboard?.controlledTeamId;
  if (!teamId) { showToast("No team selected"); return; }
  await api("/api/speedrun/start", { method: "POST", body: { teamId } });
  await loadSpeedrunStatus();
  showToast("Speedrun challenge started!");
}

async function abandonSpeedrunChallenge() {
  await api("/api/speedrun/abandon", { method: "POST" });
  await loadSpeedrunStatus();
  showToast("Challenge abandoned");
}

async function checkSpeedrunCompletion() {
  if (!state.speedrunChallenge?.active) return;
  const res = await api("/api/speedrun/check", { method: "POST" });
  if (res.complete) {
    const name = prompt("You won the Super Bowl! Enter your name for the leaderboard:", "GM");
    if (name) {
      const sub = await api("/api/speedrun/submit", { method: "POST", body: { playerName: name } });
      showToast(`Ranked #${sub.rank} on the leaderboard!`);
    }
    await loadSpeedrunStatus();
  }
}

// Register speedrun hooks for gameFlow
globalThis._renderSpeedrunPanel = renderSpeedrunPanel;
globalThis._checkSpeedrunCompletion = checkSpeedrunCompletion;
globalThis._loadSpeedrunStatus = loadSpeedrunStatus;

async function init() {
  state.statsHiddenColumns = readStatsHiddenColumns();
  window.addEventListener("vsfgm:runtime-fallback", (event) => {
    const reason = event?.detail?.reason ? ` ${event.detail.reason}` : "";
    setStatus(`Server unreachable — switched to client-only mode.${reason}`);
  });
  exposeLocalTestHooks();
  bindEvents();
  applyShellTheme();
  renderTradeWorkspace();
  renderPickAssets();
  renderCompareSearchResults();
  renderComparePlayers();
  setSelectedHistoryPlayer(null);
  renderPlayerTimelineSearchResults();
  activateTab("overviewTab");
  await loadCoreDashboard();
  ingestNewsIntoInbox(state.dashboard?.newsLog || state.dashboard?.news || state.newsRows || []);
  renderInboxBadge();
  setStatus("Ready");
  queueStartupHydration();
  initGistSyncUI();
  injectTutorialStyles();
  mountTutorial({
    onComplete: async (request) => {
      const result = await api("/api/onboarding/start-scenario", {
        method: "POST",
        body: request
      });
      applyDashboard(result.state);
      showToast("Opening franchise contract applied.");
      return result.receipt;
    },
    onSkip: () => {}
  });
  mountBetaFeedback();
  observeBackgroundTask(
    () => maybeShowReturnDigest(state.dashboard, { onJumpToInbox: () => openInbox() }),
    {
      surface: "engagement",
      operation: "return-digest",
      authorityKey: state.dashboard?.leagueId || state.dashboard?.startYear || ""
    }
  );
  initMobileLoop(state, () => document.getElementById("advanceWeekBtn")?.click());
  syncMobileLoopOverlay();
  setInterval(() => {
    observeBackgroundTask(loadSimJobs, {
      surface: "jobs",
      operation: "poll-simulation-jobs",
      authorityKey: state.dashboard?.leagueId || state.dashboard?.startYear || ""
    });
  }, 8000);
}

init();

initThemeCustomizer("themeToggleBtn");
