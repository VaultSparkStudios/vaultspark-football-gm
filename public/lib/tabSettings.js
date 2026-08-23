import { state, api } from "./appState.js";
import { decoratePlayerColumnFromRows, escapeHtml, fmtMoney, formatTransactionDetails, presentActionError, renderGuideContent, renderPulseChips, renderTable, showToast, teamCode } from "./appCore.js";
import { openGuideModal } from "./tabOverview.js";
import { hallOfFamePolicyLine, retiredNumberPolicyLine } from "./historyFormatting.js";
import { activateTab, applyDashboard } from "./gameFlow.js";
import {
  getSavedToken, getSavedGistId, saveGistId,
  exportToGist, importFromGist, listGists
} from "./gistSync.js";
import { closeModal, openModal } from "./modalManager.js";
import { getClientDiagnosticsSnapshot, observeBackgroundTask } from "./clientDiagnostics.js";
import { buildTimelineData, injectStyles as injectDynastyTimelineStyles, mount as mountDynastyTimeline } from "./dynastyTimeline.js";
import { derivePositionRoomWatch } from "./progressionWatch.js";

export function resolvePublicDomainReadiness(status = {}) {
  status = status || {};
  const checkedAt = status.checkedAt ? ` Checked ${status.checkedAt}.` : "";
  if (status.ok === true || status.status === "ready") {
    return {
      status: "Ready",
      detail: status.detail || `Public game URL is reachable.${checkedAt}`.trim()
    };
  }
  if (status.status === "needs-check") {
    return {
      status: "Needs check",
      detail: status.detail || `Run the public URL smoke after DNS or Pages changes.${checkedAt}`.trim()
    };
  }
  return {
    status: "Blocked",
    detail: status.detail || "playfranchisearchitect.com needs current origin/routing evidence before launch readiness can flip green"
  };
}

export function resolveContactEmailReadiness(status = {}) {
  status = status || {};
  const checkedAt = status.checkedAt ? ` Checked ${status.checkedAt}.` : "";
  if (status.ok === true || status.status === "verified") {
    return {
      status: "Verified",
      detail: status.detail || `football@playfranchisearchitect.com forwarding/copying is verified.${checkedAt}`.trim()
    };
  }
  if (status.status === "needs-check") {
    return {
      status: "Needs check",
      detail: status.detail || `Send a real message to football@playfranchisearchitect.com and confirm receipt by Studio operations.${checkedAt}`.trim()
    };
  }
  return {
    status: "Unverified",
    detail: status.detail || "Need a real received-message receipt proving football@playfranchisearchitect.com forwards/copies to Studio operations"
  };
}

export function buildLaunchReadinessRows({
  dashboard = null,
  saves = [],
  persistence = {},
  observability = {},
  speedrunChallenge = null,
  publicDomainStatus = {},
  contactEmailStatus = {}
} = {}) {
  const safePersistence = persistence || {};
  const safeObservability = observability || {};
  const runtimeKind = safePersistence.kind || (dashboard ? "browser/server" : "not loaded");
  const serverRequests = safeObservability.server?.requests ?? 0;
  const phase = dashboard?.phase || "no league loaded";
  const publicDomain = resolvePublicDomainReadiness(publicDomainStatus);
  const contactEmail = resolveContactEmailReadiness(contactEmailStatus);
  return [
    {
      area: "Runtime",
      status: dashboard ? "Ready" : "Load league",
      detail: `${runtimeKind} | ${phase} | ${serverRequests} server requests`
    },
    {
      area: "Save Health",
      status: saves.length ? "Ready" : "No saves",
      detail: saves.length ? `${saves.length} local slots available` : "Create a save before inviting long beta runs"
    },
    {
      area: "Feedback",
      status: "Ready",
      detail: "Tell the Commissioner opens a prefilled public GitHub feedback path"
    },
    {
      area: "Challenge Codes",
      status: speedrunChallenge ? "Active" : "Ready",
      detail: "VSFC1 seeded challenge codes support zero-backend beat-my-run duels"
    },
    {
      area: "Public Domain",
      status: publicDomain.status,
      detail: publicDomain.detail
    },
    {
      area: "Contact Email",
      status: contactEmail.status,
      detail: contactEmail.detail
    }
  ];
}

export function renderNews() {
  const rows = (state.newsRows || []).map((entry) => ({
    year: entry.year,
    week: entry.week,
    phase: entry.phase,
    headline: entry.headline
  }));
  renderTable("newsTable", rows);
}

export function renderTransactionLog() {
  const rows = state.txRows.map((entry) => ({
    seq: entry.seq,
    year: entry.year,
    week: entry.week,
    phase: entry.phase,
    type: entry.type,
    team: entry.teamId ? teamCode(entry.teamId) : `${teamCode(entry.teamA || "")}${entry.teamB ? `/${teamCode(entry.teamB)}` : ""}`,
    player: entry.playerName || entry.playerId || "",
    details: formatTransactionDetails(entry)
  }));
  renderTable("txTable", rows);
}

export function renderStaff() {
  const s = state.staffState;
  if (!s?.staff) {
    renderTable("staffTable", []);
    return;
  }
  const culture = s.cultureProfile || {};
  const scheme = s.schemeIdentity || {};
  const weeklyPlan = s.weeklyPlan || {};
  const rows = Object.entries(s.staff).map(([role, staff]) => ({
    role,
    name: staff.name,
    playcalling: staff.playcalling,
    development: staff.development,
    discipline: staff.discipline,
    years: staff.yearsRemaining,
    specialty: staff.specialty?.area || "",
    scheme: role === "headCoach" ? `${scheme.offense || "-"} / ${scheme.defense || "-"}` : "",
    culture: role === "headCoach" ? culture.identity || "-" : "",
    weeklyFocus: role === "headCoach" ? weeklyPlan.summary || "-" : ""
  }));
  renderTable("staffTable", rows);
  renderCoachingDnaCard();
}

export function renderOwner() {
  const owner = state.ownerState?.owner;
  if (!owner) {
    renderTable("ownerTable", []);
    renderOwnerSpotlight();
    return;
  }
  const culture = state.ownerState?.cultureProfile || {};
  const scheme = state.ownerState?.schemeIdentity || {};
  const weeklyPlan = state.ownerState?.weeklyPlan || {};
  const expectation = owner.expectation || {};
  renderTable("ownerTable", [
    {
      market: owner.marketSize,
      fanInterest: owner.fanInterest,
      ticketPrice: owner.ticketPrice,
      staffBudget: fmtMoney(owner.staffBudget),
      cash: fmtMoney(owner.cash),
      personality: owner.personality || "-",
      patience: owner.patience ?? "-",
      hotSeat: owner.hotSeat ? "Yes" : "No",
      revenueYtd: fmtMoney(owner.finances?.revenueYtd || 0),
      expensesYtd: fmtMoney(owner.finances?.expensesYtd || 0),
      training: owner.facilities?.training,
      rehab: owner.facilities?.rehab,
      analytics: owner.facilities?.analytics,
      championships: owner.priorities?.championships ?? "-",
      profit: owner.priorities?.profit ?? "-",
      loyalty: owner.priorities?.loyalty ?? "-",
      culture: culture.identity || "-",
      pressure: culture.pressure ?? "-",
      scheme: `${scheme.offense || "-"} / ${scheme.defense || "-"}`,
      mandate: expectation.mandate || "-",
      targetWins: expectation.targetWins ?? "-",
      projectedWins: expectation.projectedWins ?? "-",
      heat: expectation.heat ?? "-",
      trend: expectation.trend || "-",
      reasons: (expectation.reasons || []).join("; ") || "-",
      weeklyPlan: weeklyPlan.summary || "-",
      exploit: weeklyPlan.exploit || "-",
      warning: weeklyPlan.warning || "-"
    }
  ]);
  renderOwnerSpotlight();
  renderFacilitiesMarket();
}

/**
 * The facilities market (S93).
 *
 * The markup lives in ./facilitiesPanel.js and is pulled in on demand: the
 * settings island holds a 15% boot-budget headroom floor, and a panel only the
 * Owner tab shows has no business inside every player's boot payload.
 */
// Owner-tab markup lives in ./facilitiesPanel.js and is mounted on demand — the
// settings island holds a 15% boot-budget headroom floor. Failures go to the
// diagnostics ledger, never to a bare .catch (see that module's doc comment).
function mountOwnerPanel(hostId, exportName, label) {
  const host = document.getElementById(hostId);
  if (!host) return;
  observeBackgroundTask(
    async () => (await import("./facilitiesPanel.js"))[exportName](host, state),
    {
      surface: "ui-island",
      operation: `settings:${exportName}`,
      onError: () => {
        host.innerHTML = `<div class="small">${label} unavailable — retry from the System Health panel.</div>`;
      }
    }
  );
}

export function renderFacilitiesMarket() {
  mountOwnerPanel("facilitiesMarket", "renderFacilitiesMarketPanel", "Facilities market");
}

export function renderObservability() {
  const obs = state.observability;
  const client = getClientDiagnosticsSnapshot();
  const rows = [
    { metric: "clientHealth", value: client.status },
    { metric: "clientDegradations", value: client.unresolved },
    { metric: "clientRetryable", value: client.retryable },
    { metric: "serverRequests", value: obs?.server?.requests ?? 0 },
    { metric: "apiRequests", value: obs?.server?.apiRequests ?? 0 },
    { metric: "uptimeSeconds", value: obs?.server?.uptimeSeconds ?? 0 },
    { metric: "runtimeCounters", value: Object.keys(obs?.runtime?.counters || {}).length },
    { metric: "hydrationAuthorityEpoch", value: state.hydrationAuthority?.epoch ?? 0 },
    { metric: "staleResponsesDiscarded", value: state.hydrationAuthority?.staleResponsesDiscarded ?? 0 },
    ...client.entries.map((entry) => ({
      metric: `${entry.surface}/${entry.operation}`,
      value: `${entry.message} · ${entry.count}x${entry.retryable ? " · retryable" : ""}`
    }))
  ];
  renderTable("observabilityTable", rows);
  renderSettingsSpotlight();
}

export function renderPersistence() {
  const p = state.persistence;
  if (!p) {
    renderTable("persistenceTable", []);
    renderSettingsSpotlight();
    return;
  }
  renderTable("persistenceTable", [
    {
      kind: p.kind,
      available: p.available,
      capacity: p.highCapacity ? "high (IndexedDB)" : p.kind === "browser" || p.kind === "browser-hybrid" ? "standard (localStorage)" : "—",
      notes: p.notes
    }
  ]);
  // Storage meter (S70): live browser estimate so quota truth is visible where
  // saves are managed. Best-effort — the API is absent in some browsers.
  if (navigator?.storage?.estimate) {
    navigator.storage.estimate().then(({ usage, quota }) => {
      const table = document.getElementById("persistenceTable");
      if (!table || !Number.isFinite(usage) || !Number.isFinite(quota) || !quota) return;
      let meter = document.getElementById("storageMeterRow");
      if (!meter) {
        meter = document.createElement("div");
        meter.id = "storageMeterRow";
        meter.className = "small muted";
        table.insertAdjacentElement("afterend", meter);
      }
      const usedMb = (usage / 1_048_576).toFixed(1);
      const quotaMb = Math.round(quota / 1_048_576);
      meter.textContent = `Browser storage: ${usedMb} MB used of ~${quotaMb} MB available (${Math.round((usage / quota) * 100)}%).`;
      // observability-allow-silent: a missing estimate simply leaves no meter.
    }).catch(() => {});
  }
  renderSettingsSpotlight();
}

export function renderPipeline() {
  const pipeline = state.pipeline || state.dashboard?.offseasonPipeline;
  if (!pipeline) {
    renderTable("pipelineTable", []);
    return;
  }
  const rows = (pipeline.history || []).slice().reverse().slice(0, 12).map((entry) => ({
    stage: entry.stage,
    year: entry.year,
    week: entry.week,
    message: entry.result?.message || "-"
  }));
  if (!rows.length) {
    rows.push({
      stage: pipeline.stage,
      year: pipeline.year,
      week: state.dashboard?.currentWeek || 0,
      message: pipeline.completed ? "Completed" : "Waiting"
    });
  }
  renderTable("pipelineTable", rows);
}

export function renderCalibrationJobs() {
  renderTable(
    "calibrationJobsTable",
    (state.calibrationJobs || []).map((job) => ({
      id: job.id,
      year: job.year,
      era: job.eraProfile,
      samples: job.samples,
      label: job.label,
      created: new Date(job.createdAt).toLocaleString()
    }))
  );
}

export function renderSimJobs() {
  renderTable(
    "simJobsTable",
    (state.simJobs || []).map((job) => ({
      id: job.id,
      status: job.status,
      completed: `${job.completedSeasons}/${job.totalSeasons}`,
      progress: `${job.progress}%`,
      updated: new Date(job.updatedAt).toLocaleTimeString()
    }))
  );
}

export function renderCommandPalette() {
  const commands = [
    { id: "overview", label: "Open Overview", run: () => activateTab("overviewTab") },
    { id: "roster", label: "Open Roster", run: () => activateTab("rosterTab") },
    { id: "transactions", label: "Open Transactions", run: () => activateTab("transactionsTab") },
    { id: "stats", label: "Open Stats", run: () => activateTab("statsTab") },
    // S94: the Rules tab merged into the guide as one of its three views, so the
    // rules affordance survives the merge instead of becoming a second row with
    // the same label that lands in the same place.
    { id: "rules", label: "Open Rules", run: () => openGuideModal("guideRulesPanel") },
    { id: "guide", label: "Open Game Guide", run: () => openGuideModal() },
    { id: "settings", label: "Open Settings", run: () => activateTab("settingsTab") },
    { id: "advance-week", label: "Advance Week", run: () => document.getElementById("advanceWeekBtn").click() },
    { id: "refresh", label: "Refresh All", run: () => document.getElementById("refreshBtn").click() },
    // Recovery path for a deferred opening mandate — only offered while undeclared.
    ...(state.dashboard?.startScenarioReceipt
      ? []
      : [{
          id: "opening-contract",
          label: "Run Opening Contract",
          run: () => document.dispatchEvent(new CustomEvent("vsfgm:run-opening-contract"))
        }])
  ];
  const input = document.getElementById("commandInput");
  if (input && input.dataset.filterBound !== "true") {
    input.dataset.filterBound = "true";
    input.addEventListener("input", () => {
      state.commandFilter = input.value || "";
      renderCommandPalette();
    });
  }
  const needle = (state.commandFilter || "").trim().toLowerCase();
  const visible = commands.filter(
    (cmd) => (!needle ? true : cmd.label.toLowerCase().includes(needle) || cmd.id.includes(needle))
  );
  const rows = visible.map((cmd) => ({ id: cmd.id, command: cmd.label, run: "Run" }));
  renderTable("commandTable", rows);
  const table = document.getElementById("commandTable");
  table?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const command = visible[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !command) return;
    const button = document.createElement("button");
    button.dataset.commandId = command.id;
    button.textContent = "Run";
    button.addEventListener("click", () => {
      document.getElementById("commandPalette")?.classList.add("hidden");
      command.run();
    });
    cell.replaceChildren(button);
  });
}

export function applySettingsControls() {
  const settings = state.leagueSettings || state.dashboard?.settings;
  if (!settings) return;
  const allowInjuries = document.getElementById("settingAllowInjuries");
  const autoOffseason = document.getElementById("settingAutoOffseason");
  const ownerMode = document.getElementById("settingEnableOwnerMode");
  const narratives = document.getElementById("settingEnableNarratives");
  const compPicks = document.getElementById("settingEnableCompPicks");
  const chemistry = document.getElementById("settingEnableChemistry");
  const retirementRetention = document.getElementById("settingRetirementWinningRetention");
  const retiredOnly = document.getElementById("settingRetiredNumberRequireRetiredPlayer");
  const hallRequired = document.getElementById("settingRetiredNumberRequireHallOfFame");
  const era = document.getElementById("settingEraProfile");
  if (allowInjuries) allowInjuries.checked = settings.allowInjuries !== false;
  if (autoOffseason) autoOffseason.checked = settings.autoProgressOffseason === true;
  if (ownerMode) ownerMode.checked = settings.enableOwnerMode !== false;
  if (narratives) narratives.checked = settings.enableNarratives !== false;
  if (compPicks) compPicks.checked = settings.enableCompPicks !== false;
  if (chemistry) chemistry.checked = settings.enableChemistry !== false;
  if (retirementRetention) retirementRetention.checked = settings.retirementWinningRetention !== false;
  if (retiredOnly) retiredOnly.checked = settings.retiredNumberRequireRetiredPlayer !== false;
  if (hallRequired) hallRequired.checked = settings.retiredNumberRequireHallOfFame === true;
  if (era) era.value = settings.eraProfile || "modern";
  const difficulty = document.getElementById("settingDifficultyPreset");
  if (difficulty) difficulty.value = settings.difficultyPreset || "standard";
  const adaptive = document.getElementById("settingAdaptiveDifficulty");
  if (adaptive) adaptive.checked = settings.adaptiveDifficulty === true;
  document.getElementById("settingInjuryRate").value = settings.injuryRateMultiplier ?? 1;
  document.getElementById("settingCapGrowth").value = settings.capGrowthRate ?? 0.045;
  document.getElementById("settingTradeAggression").value = settings.cpuTradeAggression ?? 0.5;
  document.getElementById("settingRetirementMinWinPct").value = settings.retirementOverrideMinWinningPct ?? 0.55;
  document.getElementById("settingHallOfFameInductionScoreMin").value = settings.hallOfFameInductionScoreMin ?? 450;
  document.getElementById("settingHallOfFameMaxClassSize").value = settings.hallOfFameMaxClassSize ?? 6;
  document.getElementById("settingHallOfFameYearsRetiredMin").value = settings.hallOfFameYearsRetiredMin ?? 0;
  document.getElementById("settingRetiredNumberCareerAvMin").value = settings.retiredNumberCareerAvMin ?? 0;
  const onboardingPanel = document.getElementById("onboardingPanel");
  if (onboardingPanel) onboardingPanel.hidden = Boolean(state.dashboard?.startScenarioReceipt);
  renderSettingsSpotlight();
}

export function renderRealismVerification() {
  const report = state.realismVerification;
  if (!report) {
    const watchEl = document.getElementById("realismRoomWatch");
    if (watchEl) {
      watchEl.hidden = true;
      watchEl.innerHTML = "";
    }
    renderTable("realismVerifySummaryTable", []);
    renderTable("realismVerifyProgressionTable", []);
    renderTable("realismVerifyRoomTable", []);
    renderTable("realismVerifyHistoryTable", []);
    renderTable("realismVerifyIntegrityTable", []);
    renderTable("realismVerifySeasonTable", []);
    renderTable("realismVerifyCareerTable", []);
    return;
  }

  renderTable("realismVerifySummaryTable", [
    {
      years: (report.simulatedYears || []).join(", "),
      seasonOnTarget: report.statusSummary?.season?.onTarget || 0,
      seasonWatch: report.statusSummary?.season?.watch || 0,
      seasonOut: report.statusSummary?.season?.outOfRange || 0,
      careerOnTarget: report.statusSummary?.career?.onTarget || 0,
      careerWatch: report.statusSummary?.career?.watch || 0,
      careerOut: report.statusSummary?.career?.outOfRange || 0
    }
  ]);

  const progression = report.progression || {};
  renderTable("realismVerifyProgressionTable", progression.start && progression.end ? [
    {
      status: progression.status,
      seasons: progression.observedSeasons,
      seed: progression.seed,
      startMean: progression.start.meanOverall,
      endMean: progression.end.meanOverall,
      annualDrift: progression.annualMeanOverallDrift,
      target: `±${progression.target?.onTargetMaxAbs ?? 0.15}/yr`,
      startMedian: progression.start.medianOverall,
      endMedian: progression.end.medianOverall,
      elite90: `${progression.start.elite90Plus} → ${progression.end.elite90Plus}`,
      ageMix: `≤25 ${progression.start.cohorts?.developing25AndUnder?.sharePct || 0}% | 26–29 ${progression.start.cohorts?.prime26To29?.sharePct || 0}% | 30+ ${progression.start.cohorts?.veteran30Plus?.sharePct || 0}%`
    }
  ] : []);

  const watch = derivePositionRoomWatch(report);
  const watchEl = document.getElementById("realismRoomWatch");
  if (watchEl) {
    watchEl.hidden = false;
    watchEl.className = `room-watch room-watch--${watch.status}`;
    watchEl.innerHTML = `
      <div class="room-watch-head"><strong>Position-Room Watch</strong><span>${escapeHtml(watch.status)}</span></div>
      <p>${escapeHtml(watch.summary)}</p>
      ${watch.alerts.length ? `<div class="room-watch-grid">${watch.alerts.map((alert) => `
        <article class="room-watch-alert">
          <div><strong>${escapeHtml(alert.room)}</strong><span>${escapeHtml(alert.status)} · ${escapeHtml(alert.persistence)}</span></div>
          <p>${escapeHtml(alert.annualMeanOverallDrift == null ? "Sample incomplete" : `${alert.annualMeanOverallDrift}/yr mean drift`)}</p>
          <small>${escapeHtml(alert.action)}</small>
        </article>`).join("")}</div>` : ""}
    `;
  }

  renderTable("realismVerifyRoomTable", (progression.rooms || []).map((room) => ({
    room: room.room,
    positions: room.positions,
    status: room.status,
    sample: `${room.start?.count || 0} → ${room.end?.count || 0}`,
    mean: `${room.start?.meanOverall ?? "—"} → ${room.end?.meanOverall ?? "—"}`,
    annualDrift: room.annualMeanOverallDrift == null ? "incomplete" : `${room.annualMeanOverallDrift}/yr`,
    medianDrift: room.annualMedianOverallDrift == null ? "incomplete" : `${room.annualMedianOverallDrift}/yr`,
    elite90: room.elite90PlusChange == null ? "—" : `${room.elite90PlusChange >= 0 ? "+" : ""}${room.elite90PlusChange}`
  })));

  renderTable("realismVerifyHistoryTable", (report.progressionHistory || []).slice().reverse().map((entry) => ({
    seed: entry.seed,
    seasons: entry.observedSeasons,
    verdict: entry.status,
    global: entry.globalStatus,
    annualDrift: `${entry.annualMeanOverallDrift}/yr`,
    roomFlags: (entry.rooms || [])
      .filter((room) => room.status !== "on-target")
      .map((room) => `${room.room}: ${room.status}${room.annualMeanOverallDrift == null ? "" : ` (${room.annualMeanOverallDrift}/yr)`}`)
      .join(" · ") || "all seven on target"
  })));

  const integrity = report.numericIntegrity || {};
  renderTable("realismVerifyIntegrityTable", ["source", "simulated"].map((phase) => ({
    phase,
    status: integrity[phase]?.status || "missing",
    numbers: integrity[phase]?.inspectedNumbers || 0,
    issues: integrity[phase]?.issueCount || 0,
    truncated: integrity[phase]?.truncated === true ? "yes" : "no",
    sample: (integrity[phase]?.issues || []).map((issue) => `${issue.path}:${issue.kind}`).join(", ") || "none"
  })));

  const flattenBlock = (block) =>
    Object.entries(block || {}).flatMap(([position, details]) =>
      Object.entries(details.metrics || {}).map(([metric, data]) => ({
        pos: position,
        metric,
        target: data.target,
        actual: data.actual,
        driftPct: `${data.driftPct}%`,
        status: data.status
      }))
    );

  renderTable("realismVerifySeasonTable", flattenBlock(report.seasonByPosition));
  renderTable("realismVerifyCareerTable", flattenBlock(report.careerByPosition));
}

export function renderRulesTab() {
  const coreRows = [
    { area: "League Structure", rule: "32 teams, 18-week regular season calendar with 17 games and one bye per team, plus NFL playoff format and division/conference standings." },
    { area: "Simulation Engine", rule: "Drive/possession simulation with rating, coaching, chemistry, and scheme effects." },
    { area: "Team Identity", rule: "Every new league draws one real U.S. city plus one nickname per team for a single randomized team identity." },
    { area: "Depth Chart Usage", rule: "Each depth slot has position-specific snap-share targets; game snaps and touches are role-weighted." },
    { area: "Stats Model", rule: "PFR-inspired season/career tables, player profiles, playoffs filters, and archived controlled-team box scores." },
    { area: "Contracts & Cap", rule: "Cap hits, dead cap, restructures, tags, options, waivers, and rollover modeled in team cap ledger." },
    { area: "Career & Retirement", rule: "Position max ages (QB 45, RB 40, etc), age curve progression/decline, and override comeback logic." },
    { area: "Retirement Override", rule: "You can bring retired players back while age-eligible; winning teams can suppress retirement chance." },
    { area: "Realism Verification", rule: "Runs 10-20 year verification against season and career PFR-based position targets with drift flags." },
    { area: "Persistence", rule: "Save/load slots and rolling backups preserve full league state, history, and transaction timeline." }
  ];
  renderTable("rulesCoreTable", coreRows);

  const actionRows = [
    { tab: "Overview", feature: "Advance Week/Season", behavior: "Simulates schedule, updates standings, stats, transactions, and events. Multi-week sims can be paused." },
    { tab: "Overview", feature: "Header Box Scores", behavior: "Tracks the controlled team’s recent games with clickable scoring summary, play-by-play, team stats, and player stats." },
    { tab: "Roster & FA", feature: "Release / PS / Active", behavior: "Moves players between active/practice/waiver/free-agent pools with eligibility checks." },
    { tab: "Depth Chart", feature: "Order + Snap Share", behavior: "Reorders role priority and lets you set manual snap-share targets per player; saved values feed the live game rotation." },
    { tab: "Transactions", feature: "Trade + Evaluate", behavior: "Validates package fairness/cap before executing asset swaps." },
    { tab: "Contracts", feature: "Extensions + Negotiation", behavior: "Shows cap context, expiring deals, negotiation targets, restructures, tag/option tools, quick trade, and trade block actions." },
    { tab: "Transactions", feature: "Retirement Overrides", behavior: "Loads retired pool and applies comeback override with team + win threshold." },
    { tab: "Draft", feature: "Scouting + Draft", behavior: "Allocates scouting points, locks board, runs user/CPU picks, and tracks selections." },
    { tab: "Statistics", feature: "Player/Team Filters", behavior: "PFR-style filtered tables by scope, year, team, position, and category." },
    { tab: "Calendar", feature: "Year/Week Browser", behavior: "Displays regular season schedule + playoff bracket snapshots." },
    { tab: "League Log", feature: "Transaction Filters", behavior: "Filters transaction events by team, type, year, and limit." },
    { tab: "History", feature: "Records + Timelines", behavior: "Shows records, awards, champions, Hall of Fame resumes, retired numbers, player timelines, and team history." },
    { tab: "Settings", feature: "Realism Verify", behavior: "Runs multi-year season/career drift check against target profiles." },
    { tab: "Settings", feature: "League Settings", behavior: "Controls injuries, offseason automation, comp picks, chemistry, retirement retention, Hall of Fame induction policy, and retired-number guardrails." },
    { tab: "Footer", feature: "Game Guide Button", behavior: "Opens the guide in a modal submenu instead of keeping the full help text permanently visible." }
  ];
  renderTable("rulesActionsTable", actionRows);
  renderGuideContent();
}

export function renderSettingsSpotlight() {
  const spotlight = document.getElementById("settingsSpotlight");
  if (!spotlight) return;
  const settings = state.leagueSettings || state.dashboard?.settings || {};
  const latestSave = state.saves?.[0] || null;
  const persistence = state.persistence || {};
  const runtimeCounters = Object.keys(state.observability?.runtime?.counters || {}).length;
  const serverRequests = state.observability?.server?.requests ?? 0;
  const hallPolicy = hallOfFamePolicyLine(settings);
  const retiredPolicy = retiredNumberPolicyLine(settings);

  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">League Control Room</div>
      <div class="overview-team-meta">
        ${escapeHtml(state.dashboard ? `${state.dashboard.currentYear} | ${state.dashboard.phase}` : "Waiting on league state")} | ${escapeHtml(settings.eraProfile || "modern")} era profile
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Saves</strong>
        <div>${escapeHtml(`${state.saves?.length || 0} slots detected`)}</div>
        <div class="small">${escapeHtml(latestSave ? `Latest ${latestSave.slot} @ ${new Date(latestSave.updatedAt).toLocaleString()}` : "No saved leagues found yet")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Commissioner Policy</strong>
        <div>${escapeHtml(settings.enableOwnerMode !== false ? "Owner mode active" : "Commissioner-only mode")}</div>
        <div class="small">${escapeHtml(`Injuries ${settings.allowInjuries !== false ? "on" : "off"} | Comp picks ${settings.enableCompPicks !== false ? "on" : "off"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Legacy Policy</strong>
        <div>${escapeHtml(hallPolicy)}</div>
        <div class="small">${escapeHtml(`Retired numbers: ${retiredPolicy}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Persistence</strong>
        <div>${escapeHtml(persistence.kind || "Unknown storage")}</div>
        <div class="small">${escapeHtml(persistence.notes || "Load persistence info for adapter details")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Runtime Health</strong>
        <div>${escapeHtml(`${serverRequests} server req | ${runtimeCounters} runtime counters`)}</div>
        <div class="small">${escapeHtml(state.observability ? "Observability loaded" : "Load metrics to inspect runtime health")}</div>
      </div>
    </div>
  `;

  renderPulseChips(
    "settingsPulseBar",
    [
      `Era ${settings.eraProfile || "modern"}`,
      `Injuries ${settings.allowInjuries !== false ? "on" : "off"}`,
      `Narratives ${settings.enableNarratives !== false ? "on" : "off"}`,
      `Owner mode ${settings.enableOwnerMode !== false ? "on" : "off"}`,
      `Chemistry ${settings.enableChemistry !== false ? "on" : "off"}`,
      `Trade aggression ${settings.cpuTradeAggression ?? 0.5}`,
      `HOF ${hallPolicy}`
    ],
    "Settings will appear here after the league config loads"
  );
  renderLaunchReadinessPanel();
  renderDynastyTimeline();
}

export function renderDynastyTimeline() {
  const container = document.getElementById("dynastyTimelineContainer");
  if (!container) return;
  const teamId = state.dashboard?.controlledTeamId || "";
  const seasons = buildTimelineData(state.teamHistory?.seasons || [], teamId);
  injectDynastyTimelineStyles();
  mountDynastyTimeline(container, { seasons, teamId, teamColor: "var(--accent, #4a8fb5)" });
}

export function renderLaunchReadinessPanel() {
  const table = document.getElementById("launchReadinessTable");
  if (!table) return;
  const rows = buildLaunchReadinessRows({
    dashboard: state.dashboard,
    saves: state.saves,
    persistence: state.persistence,
    observability: state.observability,
    speedrunChallenge: state.speedrunChallenge,
    publicDomainStatus: state.launchReadiness?.publicDomainStatus,
    contactEmailStatus: state.launchReadiness?.contactEmailStatus || state.launchReadiness?.emailForwarding
  });
  renderTable("launchReadinessTable", rows);
}

/**
 * The Owner spotlight (S93 — moved out of the boot payload).
 *
 * Owner-tab-only markup, pulled in with the facilities panel it sits beside.
 */
export function renderOwnerSpotlight() {
  mountOwnerPanel("ownerSpotlight", "renderOwnerSpotlightPanel", "Owner spotlight");
}

export async function loadRewindHistory() {
  const data = await api("/api/rewind");
  state.rewindSnapshots = data.snapshots || [];
  renderRewindTimeline();
}

export function renderRewindTimeline() {
  const list = document.getElementById("rewindTimelineList");
  if (!list) return;
  const snaps = state.rewindSnapshots;
  if (!snaps.length) {
    list.innerHTML = `<div class="narrative-empty">No snapshots yet. Snapshots are auto-created before key decisions.</div>`;
    return;
  }
  const triggerIcons = {
    "pre-trade": "🔀", "pre-deadline": "⏰", "season-start": "🏈",
    "pre-draft": "📋", "pre-restore": "↩️", "manual": "📸", default: "💾"
  };
  list.innerHTML = snaps.map((snap) => {
    const icon = triggerIcons[snap.trigger] || triggerIcons.default;
    const date = snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "";
    return `
      <div class="rewind-entry" data-id="${escapeHtml(snap.id)}">
        <span class="rewind-entry-icon">${icon}</span>
        <div class="rewind-entry-body">
          <div class="rewind-entry-label">${escapeHtml(snap.label || snap.trigger)}</div>
          <div class="rewind-entry-meta">Y${snap.year} W${snap.week} · ${escapeHtml(date)}</div>
        </div>
        <div class="rewind-entry-actions">
          <button class="small-btn rewind-restore-btn" data-id="${escapeHtml(snap.id)}">Restore</button>
          <button class="small-btn warn rewind-delete-btn" data-id="${escapeHtml(snap.id)}">✕</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".rewind-restore-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Restore to: ${btn.dataset.id}?\n\nYour current state will be auto-snapshotted first.`)) return;
      const data = await api("/api/rewind/restore", { method: "POST", body: { id: btn.dataset.id } });
      if (data.state) applyDashboard(data);
      await loadRewindHistory();
    });
  });

  list.querySelectorAll(".rewind-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const data = await api("/api/rewind/delete", { method: "POST", body: { id: btn.dataset.id } });
      state.rewindSnapshots = data.snapshots || [];
      renderRewindTimeline();
    });
  });
}

export function renderCoachingDnaCard() {
  const card = document.getElementById("coachingDnaCard");
  if (!card) return;
  const s = state.staffState;
  const view = s?.coachingLineage || state.dashboard?.coachingLineage;
  if (!view) { card.hidden = true; return; }
  card.hidden = false;
  const body = card.querySelector(".coaching-dna-body");
  if (!body) return;
  const staff = view.currentStaff || [];
  if (!staff.length) {
    body.innerHTML = `<div class="narrative-empty">No coaching lineage tracked yet.</div>`;
    return;
  }
  const lineage = (view.lineage || []).slice(1);
  body.innerHTML = `
    <div class="coaching-dna-summary">
      ${escapeHtml(String(view.familySize || 0))} active lineage member${view.familySize === 1 ? "" : "s"} · source: ${escapeHtml(view.source || "league coaching ledger")}
    </div>
    ${staff.slice(0, 3).map((entry) => `
    <div class="coaching-dna-row">
      <span class="coaching-dna-name">${escapeHtml(entry.name || "Unknown")}</span>
      <span class="coaching-dna-role">${escapeHtml(entry.role || "")}</span>
      <span class="coaching-dna-scheme">${escapeHtml(entry.scheme || "")} · ${escapeHtml(entry.tempo || "")}</span>
      ${entry.mentor ? `<span class="coaching-dna-mentor">from ${escapeHtml(entry.mentor)}</span>` : ""}
    </div>`).join("")}
    ${lineage.length ? `<div class="coaching-dna-mentor">Head-coach lineage: ${lineage.map((entry) => escapeHtml(entry.name)).join(" → ")}</div>` : ""}
    <div class="coaching-dna-mentor">${escapeHtml(view.disclaimer || "")}</div>`;
}

export async function renderCommissionerLobby() {
  const status = document.getElementById("commissionerLobbyStatus");
  if (!status) return;
  const markReadyBtn = document.getElementById("markReadyBtn");
  const advanceLobbyBtn = document.getElementById("advanceLobbyBtn");
  try {
    const data = await api("/api/commissioner/lobby");
    const lobby = data.lobby;
    if (!lobby) {
      status.innerHTML = `<div class="narrative-empty">No active lobby. Create one above or join with a Lobby ID.</div>`;
      if (markReadyBtn) markReadyBtn.disabled = true;
      if (advanceLobbyBtn) advanceLobbyBtn.disabled = true;
      return;
    }
    const rows = (lobby.players || []).map((p) => {
      const ready = p.status === "ready";
      return `
      <div class="lobby-player-row">
        <span class="lobby-ready-dot ${ready ? "ready" : ""}"></span>
        <span>${escapeHtml(p.displayName || p.userId || "GM")}</span>
        <span class="lobby-team">${escapeHtml(p.teamId || "-")}</span>
        <span class="lobby-status-text">${ready ? "Ready" : "Waiting"}</span>
      </div>`;
    }).join("");
    status.innerHTML = `
      <div class="commissioner-lobby-header">Lobby: <strong>${escapeHtml(lobby.leagueId || lobby.id || "active")}</strong> · Gate: ${escapeHtml(lobby.gateStatus || "open")} · ${escapeHtml(String(lobby.readyPlayers ?? 0))}/${escapeHtml(String(lobby.totalPlayers ?? 0))} ready</div>
      <div class="lobby-players">${rows || "<em>No players yet.</em>"}</div>`;
    if (markReadyBtn) markReadyBtn.disabled = !lobby.players?.length;
    if (advanceLobbyBtn) advanceLobbyBtn.disabled = !lobby.players?.length;
  } catch {
    status.innerHTML = `<div class="narrative-empty">Unable to load lobby status.</div>`;
    if (markReadyBtn) markReadyBtn.disabled = true;
    if (advanceLobbyBtn) advanceLobbyBtn.disabled = true;
  }
}

export function openShortcutsModal() {
  const modal = document.getElementById("shortcutsModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  openModal(modal, { onClose: closeShortcutsModal });
}

export function closeShortcutsModal() {
  const modal = document.getElementById("shortcutsModal");
  if (!modal) return;
  closeModal(modal);
  modal.classList.add("hidden");
}

export function shareDynastyTimeline() {
  const btn = document.getElementById("shareDynastyBtn");
  if (btn) btn.textContent = "Generating…";
  try {
    const el = document.getElementById("dynastyTimelineContainer");
    if (!el) { if (btn) btn.textContent = "Share Dynasty"; return; }
    const w = window.open("", "_blank", "width=900,height=420");
    if (w) {
      w.document.write(`<html><head><title>Dynasty Timeline — VaultSpark</title><style>body{background:#0a0d12;color:#e0e8f0;padding:24px;font-family:sans-serif}svg{max-width:100%}</style></head><body>${el.innerHTML}</body></html>`);
      w.document.close();
    }
  } catch {
    // ignore
  }
  if (btn) btn.textContent = "Share Dynasty";
}

export function renderGistSyncStatus(html) {
  const el = document.getElementById("gistSyncStatus");
  if (el) el.innerHTML = html;
}

export async function renderGistList() {
  const el = document.getElementById("gistSaveList");
  if (!el) return;
  try {
    const token = getSavedToken();
    if (!token) { el.innerHTML = `<div class="small muted">Set a GitHub token to see your cloud saves.</div>`; return; }
    el.innerHTML = `<div class="small muted">Loading…</div>`;
    const gists = await listGists(token);
    if (!gists.length) { el.innerHTML = `<div class="small muted">No VaultSpark saves found in your Gists.</div>`; return; }
    el.innerHTML = gists.map((g) =>
      `<div class="gist-save-row">
        <span class="gist-save-desc">${escapeHtml(g.description || g.id)}</span>
        <span class="gist-save-date">${escapeHtml(g.updatedAt?.slice(0, 10) || "")}</span>
        <button class="btn-sm gist-load-btn" data-gist-id="${escapeHtml(g.id)}">Load</button>
        <a class="btn-sm" href="${escapeHtml(g.url)}" target="_blank" rel="noopener">View</a>
      </div>`
    ).join("");
    el.querySelectorAll(".gist-load-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.gistId;
        if (id) document.getElementById("gistIdInput").value = id;
        document.getElementById("gistImportBtn")?.click();
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="small muted">Error: ${escapeHtml(e.message)}</div>`;
  }
}

export function initGistSyncUI() {
  const tok = getSavedToken();
  const el = document.getElementById("gistTokenInput");
  if (el) {
    el.value = "";
    el.placeholder = tok ? "Token available for this tab" : "Paste token for this tab";
  }
  const button = document.getElementById("gistSyncSaveTokenBtn");
  if (button) button.textContent = tok ? "Clear Token" : "Use Token This Tab";
  const gistEl = document.getElementById("gistIdInput");
  const savedId = getSavedGistId();
  if (gistEl && savedId) gistEl.value = savedId;
}

export async function applyBrandIdentity(overrides) {
  if (!overrides || !Object.keys(overrides).length) return;
  try {
    const result = await api("/api/brand-identity", { method: "POST", body: overrides });
    if (result.ok) {
      state.brandOverride = result.brandOverride;
      applyDashboard(result.state);
      showToast("Franchise identity updated!");
    }
  } catch (e) {
    presentActionError(e);
  }
}
