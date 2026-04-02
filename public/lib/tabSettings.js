import { state, api } from "./appState.js";
import { decoratePlayerColumnFromRows, escapeHtml, fmtMoney, formatTransactionDetails, presentActionError, renderGuideContent, renderPulseChips, renderTable, showToast, teamByCode, teamCode } from "./appCore.js";
import { openGuideModal } from "./tabOverview.js";
import { renderContractsPage } from "./tabContracts.js";
import { renderAnalyticsChart } from "./tabStats.js";
import { hallOfFamePolicyLine, retiredNumberPolicyLine } from "./tabHistory.js";
import { activateTab, applyDashboard } from "./gameFlow.js";
import {
  getSavedToken, saveToken, getSavedGistId, saveGistId,
  exportToGist, importFromGist, listGists
} from "./gistSync.js";

export function renderTransactionLog() {
  const rows = state.txRows.map((entry) => ({
    seq: entry.seq,
    year: entry.year,
    week: entry.week,
    phase: entry.phase,
    type: entry.type,
    team: entry.teamId
      ? teamCode(entry.teamId)
      : `${teamCode(entry.teamA || "")}${entry.teamB ? `/${teamCode(entry.teamB)}` : ""}`,
    player: entry.playerName || entry.playerId || "",
    details: formatTransactionDetails(entry)
  }));
  renderTable("txTable", rows);
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

export function renderPickAssets() {
  const rows = [
    ...(state.tradeTeamAPicks || []).map((pick) => ({ ...pick, packageSide: "A" })),
    ...(state.tradeTeamBPicks || []).map((pick) => ({ ...pick, packageSide: "B" }))
  ].map((pick) => ({
    side: `Team ${pick.packageSide}`,
    id: pick.id,
    yr: pick.year,
    rnd: pick.round,
    orig: teamCode(pick.originalTeamId),
    owner: teamCode(pick.ownerTeamId),
    value: pick.value,
    action: ""
  }));
  renderTable("pickAssetsTable", rows);
  document.getElementById("pickAssetsTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected =
      row.side === "Team A"
        ? state.tradeAssets.teamAPickIds.includes(row.id)
        : state.tradeAssets.teamBPickIds.includes(row.id);
    cell.innerHTML = `<button data-trade-pick-side="${row.side === "Team A" ? "A" : "B"}" data-trade-pick-id="${escapeHtml(row.id)}">${isSelected ? "Remove" : "Add"}</button>`;
  });
}

export function renderNegotiationTargets(rows) {
  state.negotiationTargets = rows || [];
  const tableRows = (rows || []).map((entry) => ({
    id: entry.id,
    player: entry.name,
    pos: entry.pos,
    ovr: entry.overall,
    askYears: entry.demand?.years || "-",
    askSalary: fmtMoney(entry.demand?.salary || 0),
    askCap: fmtMoney(entry.demand?.askCapHit || 0),
    use: ""
  }));
  renderTable("negotiationTable", tableRows);
  const table = document.getElementById("negotiationTable");
  table?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = tableRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-negotiate-id="${escapeHtml(row.id)}">Select</button>`;
  });
  decoratePlayerColumnFromRows("negotiationTable", tableRows, { idKeys: ["id"] });
  renderContractsPage();
}

export function renderAnalytics() {
  const analytics = state.analytics;
  if (!analytics) {
    renderTable("analyticsSummaryTable", []);
    renderTable("analyticsPlaymakersTable", []);
    return;
  }
  renderTable("analyticsSummaryTable", [
    {
      year: analytics.year,
      team: analytics.teamId ? teamCode(analytics.teamId) : "ALL",
      ppg: analytics.teamAverages?.pointsPerGame || 0,
      ppgAllowed: analytics.teamAverages?.pointsAllowedPerGame || 0,
      sackRate: analytics.efficiency?.sackRate || 0,
      intRate: analytics.efficiency?.interceptionRate || 0,
      rushYpa: analytics.efficiency?.rushYardsPerAttempt || 0,
      avgTicket: analytics.ownerEconomy?.avgTicketPrice || 0,
      fanInterest: analytics.ownerEconomy?.avgFanInterest || 0
    }
  ]);
  const playmakers = (analytics.defensivePlaymakers || []).map((row) => ({
    playerId: row.playerId,
    player: row.player,
    tm: row.tm,
    pos: row.pos,
    sacks: row.sacks || 0,
    int: row.int || 0,
    tkl: row.tkl || 0
  }));
  renderTable("analyticsPlaymakersTable", playmakers);
  decoratePlayerColumnFromRows("analyticsPlaymakersTable", playmakers, { idKeys: ["playerId"] });
  renderAnalyticsChart();
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
}

export function renderObservability() {
  const obs = state.observability;
  if (!obs) {
    renderTable("observabilityTable", []);
    renderSettingsSpotlight();
    return;
  }
  const rows = [
    { metric: "serverRequests", value: obs.server?.requests ?? 0 },
    { metric: "apiRequests", value: obs.server?.apiRequests ?? 0 },
    { metric: "uptimeSeconds", value: obs.server?.uptimeSeconds ?? 0 },
    { metric: "runtimeCounters", value: Object.keys(obs.runtime?.counters || {}).length }
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
      notes: p.notes
    }
  ]);
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
    { id: "rules", label: "Open Rules", run: () => activateTab("rulesTab") },
    { id: "guide", label: "Open Game Guide", run: () => openGuideModal() },
    { id: "settings", label: "Open Settings", run: () => activateTab("settingsTab") },
    { id: "advance-week", label: "Advance Week", run: () => document.getElementById("advanceWeekBtn").click() },
    { id: "refresh", label: "Refresh All", run: () => document.getElementById("refreshBtn").click() }
  ];
  const needle = (state.commandFilter || "").trim().toLowerCase();
  const rows = commands
    .filter((cmd) => (!needle ? true : cmd.label.toLowerCase().includes(needle) || cmd.id.includes(needle)))
    .map((cmd) => ({ id: cmd.id, command: cmd.label, run: "Run" }));
  renderTable("commandTable", rows);
  const table = document.getElementById("commandTable");
  table?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-command-id="${escapeHtml(row.id)}">Run</button>`;
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
  document.getElementById("settingInjuryRate").value = settings.injuryRateMultiplier ?? 1;
  document.getElementById("settingCapGrowth").value = settings.capGrowthRate ?? 0.045;
  document.getElementById("settingTradeAggression").value = settings.cpuTradeAggression ?? 0.5;
  document.getElementById("settingRetirementMinWinPct").value = settings.retirementOverrideMinWinningPct ?? 0.55;
  document.getElementById("settingHallOfFameInductionScoreMin").value = settings.hallOfFameInductionScoreMin ?? 240;
  document.getElementById("settingHallOfFameYearsRetiredMin").value = settings.hallOfFameYearsRetiredMin ?? 0;
  document.getElementById("settingRetiredNumberCareerAvMin").value = settings.retiredNumberCareerAvMin ?? 0;
  renderSettingsSpotlight();
}

export function renderRealismVerification() {
  const report = state.realismVerification;
  if (!report) {
    renderTable("realismVerifySummaryTable", []);
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
}

export function renderOwnerSpotlight() {
  const spotlight = document.getElementById("ownerSpotlight");
  if (!spotlight) return;
  const owner = state.ownerState?.owner;
  if (!owner) {
    spotlight.innerHTML = `<div class="small">Load an owner profile to review mandate, market pressure, and budget posture.</div>`;
    return;
  }
  const culture = state.ownerState?.cultureProfile || {};
  const scheme = state.ownerState?.schemeIdentity || {};
  const weeklyPlan = state.ownerState?.weeklyPlan || {};
  const expectation = owner.expectation || {};
  const teamId = document.getElementById("ownerTeamSelect")?.value || state.dashboard?.controlledTeamId || "";
  const team = teamByCode(teamId) || null;
  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">${escapeHtml(team?.name || teamId || "Owner")}</div>
      <div class="overview-team-meta">
        ${escapeHtml(owner.personality || "owner")} | market ${escapeHtml(owner.marketSize || "-")} | fan interest ${escapeHtml(owner.fanInterest ?? "-")}
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Mandate</strong>
        <div>${escapeHtml(expectation.mandate || "Stabilize the club")}</div>
        <div class="small">${escapeHtml(`Target ${expectation.targetWins ?? "-"} wins | Projected ${expectation.projectedWins ?? "-"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Economics</strong>
        <div>${escapeHtml(`${fmtMoney(owner.cash || 0)} cash | ${fmtMoney(owner.staffBudget || 0)} staff budget`)}</div>
        <div class="small">${escapeHtml(`Ticket ${owner.ticketPrice ?? "-"} | Revenue YTD ${fmtMoney(owner.finances?.revenueYtd || 0)}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Facilities</strong>
        <div>${escapeHtml(`Training ${owner.facilities?.training ?? "-"} | Rehab ${owner.facilities?.rehab ?? "-"} | Analytics ${owner.facilities?.analytics ?? "-"}`)}</div>
        <div class="small">${escapeHtml(`${culture.identity || "Balanced"} culture | ${scheme.offense || "-"} / ${scheme.defense || "-"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Weekly Pressure</strong>
        <div>${escapeHtml(weeklyPlan.summary || "No weekly plan summary loaded")}</div>
        <div class="small">${escapeHtml((expectation.reasons || []).join("; ") || "No pressure reasons flagged")}</div>
      </div>
    </div>
  `;
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
  const tree = s?.coachingTree || state.dashboard?.coachingTree;
  if (!tree) { card.hidden = true; return; }
  card.hidden = false;
  const body = card.querySelector(".coaching-dna-body");
  if (!body) return;
  const lineage = tree.lineage || tree.coaches || Object.values(tree).filter((v) => v && v.coachName);
  if (!lineage.length) {
    body.innerHTML = `<div class="narrative-empty">No coaching lineage tracked yet.</div>`;
    return;
  }
  body.innerHTML = lineage.slice(0, 6).map((entry) => `
    <div class="coaching-dna-row">
      <span class="coaching-dna-name">${escapeHtml(entry.coachName || entry.name || "Unknown")}</span>
      <span class="coaching-dna-role">${escapeHtml(entry.role || "")}</span>
      <span class="coaching-dna-scheme">${escapeHtml(entry.scheme || entry.schemeDrift || "")}</span>
      ${entry.mentor ? `<span class="coaching-dna-mentor">from ${escapeHtml(entry.mentor)}</span>` : ""}
    </div>`).join("");
}

export async function renderCommissionerLobby() {
  const status = document.getElementById("commissionerLobbyStatus");
  if (!status) return;
  try {
    const data = await api("/api/commissioner/lobby");
    const lobby = data.lobby;
    if (!lobby) {
      status.innerHTML = `<div class="narrative-empty">No active lobby. Create one above or join with a Lobby ID.</div>`;
      return;
    }
    const rows = (lobby.players || []).map((p) => `
      <div class="lobby-player-row">
        <span class="lobby-ready-dot ${p.ready ? "ready" : ""}"></span>
        <span>${escapeHtml(p.displayName || p.gmId)}</span>
        <span class="lobby-team">${escapeHtml(p.teamId || "—")}</span>
        <span class="lobby-status-text">${p.ready ? "Ready" : "Waiting"}</span>
      </div>`).join("");
    status.innerHTML = `
      <div class="commissioner-lobby-header">Lobby: <strong>${escapeHtml(lobby.id)}</strong> · Gate: ${lobby.gateOpen ? "Open" : "Locked"}</div>
      <div class="lobby-players">${rows || "<em>No players yet.</em>"}</div>`;
  } catch {
    status.innerHTML = `<div class="narrative-empty">Unable to load lobby status.</div>`;
  }
}

export function openShortcutsModal() {
  document.getElementById("shortcutsModal")?.classList.remove("hidden");
}

export function closeShortcutsModal() {
  document.getElementById("shortcutsModal")?.classList.add("hidden");
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
  if (el && tok) el.value = "••••••••••••••••" + tok.slice(-4);
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
