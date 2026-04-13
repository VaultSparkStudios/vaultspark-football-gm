import { state, api, STATS_BENCHMARK_HINTS } from "./appState.js";
import { classifyTone, decoratePlayerColumnByIds, decoratePlayerColumnFromRows, escapeHtml, fmtMoney, renderTable, setBoxScoreTab, setMetricCardValue, showToast, teamCode, teamName } from "./appCore.js";

export function renderOverview() {
  const d = state.dashboard;
  if (!d) return;
  setMetricCardValue("phaseCard", d.phase, "info");
  setMetricCardValue("yearCard", `${d.currentYear} / W${d.currentWeek}`, "accent");
  setMetricCardValue("seasonsCard", String(d.seasonsSimulated || 0), "accent");
  setMetricCardValue("capCard", fmtMoney(d.cap?.capSpace || 0), (d.cap?.capSpace || 0) >= 0 ? "positive" : "negative");
  setMetricCardValue("deadCapCard", fmtMoney(d.cap?.deadCap || 0), (d.cap?.deadCap || 0) > 40_000_000 ? "negative" : "warning");
  setMetricCardValue(
    "ovrCard",
    d.controlledTeam?.overallRating ?? "-",
    classifyTone("ovr", d.controlledTeam?.overallRating ?? null) || "accent"
  );
  const weeklyPlan = d.controlledTeam?.weeklyPlan || {};
  const expectation = d.controlledTeam?.owner?.expectation || {};
  const culture = d.controlledTeam?.cultureProfile || {};
  const box = document.getElementById("weeklyPlanSummaryText");
  if (box) {
    const lines = [];
    if (weeklyPlan.summary) lines.push(`Weekly plan: ${weeklyPlan.summary}.`);
    if (weeklyPlan.exploit) lines.push(`Exploit: ${weeklyPlan.exploit}.`);
    if (weeklyPlan.warning) lines.push(`Watch: ${weeklyPlan.warning}.`);
    if (culture.identity) lines.push(`Culture: ${culture.identity}.`);
    if (expectation.mandate) {
      lines.push(`Owner mandate: ${expectation.mandate} (${expectation.trend || "watch"}, heat ${expectation.heat ?? "-"}).`);
    }
    box.textContent = lines.join(" ") || "Weekly plan, locker-room pressure, and owner mandate updates will appear here.";
  }
  renderOverviewSpotlight();
  renderNarrativePanel();
  renderTradeDeadlineAlert();
}

export function renderNarrativePanel() {
  const feed = document.getElementById("narrativeEventsFeed");
  if (!feed) return;
  const events = state.dashboard?.narrativeLog || [];
  if (!events.length) {
    feed.innerHTML = `<div class="narrative-empty">Simulate weeks to generate franchise story events.</div>`;
    return;
  }
  const iconMap = {
    TRADE_REQUEST: "🔀", BREAKOUT_FLAG: "⚡", INJURY_SCARE: "🩹",
    MVP_RACE: "🏆", CULTURE_SHIFT: "🎭", SALARY_DISPUTE: "💰",
    DRAFT_STEAL: "💎", RIVAL_SURGE: "🔥", default: "📰"
  };
  const toneMap = {
    BREAKOUT_FLAG: "positive", DRAFT_STEAL: "positive", MVP_RACE: "positive",
    TRADE_REQUEST: "warning", SALARY_DISPUTE: "warning", RIVAL_SURGE: "warning",
    INJURY_SCARE: "negative",
    CULTURE_SHIFT: "info", default: "info"
  };
  const recent = events.slice(0, 8);
  feed.innerHTML = recent.map((ev) => {
    const icon = iconMap[ev.type] || iconMap.default;
    const tone = toneMap[ev.type] || toneMap.default;
    return `
      <div class="narrative-event tone-border-${escapeHtml(tone)}">
        <span class="narrative-event-icon">${icon}</span>
        <div class="narrative-event-body">
          <div class="narrative-event-headline">${escapeHtml(ev.headline || ev.type || "League Event")}</div>
          ${ev.detail ? `<div class="narrative-event-detail">${escapeHtml(ev.detail)}</div>` : ""}
          ${ev.impact ? `<div class="narrative-event-impact">${escapeHtml(ev.impact)}</div>` : ""}
          <div class="narrative-event-time">Week ${ev.week ?? "?"} · ${ev.year ?? ""}</div>
        </div>
      </div>`;
  }).join("");
}

export function renderTradeDeadlineAlert() {
  const panel = document.getElementById("tradeDeadlinePanel");
  if (!panel) return;
  const d = state.dashboard;
  if (!d) { panel.hidden = true; return; }
  const week = d.currentWeek || 0;
  const phase = d.phase || "";
  const isDeadline = phase === "regular-season" && week >= 9 && week <= 11;
  panel.hidden = !isDeadline;
  if (!isDeadline) return;
  const statusEl = document.getElementById("tradeDeadlineStatus");
  const roleEl = document.getElementById("tradeDeadlineBuyerSeller");
  const standings = d.latestStandings || [];
  const team = d.controlledTeam || {};
  const myRow = standings.find((r) => r.team === (team.abbrev || team.teamId));
  const winPct = myRow ? (myRow.wins || 0) / Math.max(1, (myRow.wins || 0) + (myRow.losses || 0)) : 0.5;
  const weeksLeft = 18 - week;
  const role = winPct >= 0.55 ? "BUYER" : winPct <= 0.4 ? "SELLER" : "NEUTRAL";
  const roleColors = { BUYER: "var(--success)", SELLER: "#ff8f8f", NEUTRAL: "var(--info)" };
  if (statusEl) statusEl.textContent = `Week ${week} of 18 — ${weeksLeft} weeks remain. Deadline closes end of Week 11.`;
  if (roleEl) {
    roleEl.textContent = role;
    roleEl.style.color = roleColors[role];
  }
}

export function renderOverviewSpotlight() {
  const d = state.dashboard;
  if (!d) return;
  const controlledTeam = d.controlledTeam || {};
  const expectation = controlledTeam.owner?.expectation || {};
  const weeklyPlan = controlledTeam.weeklyPlan || {};
  const culture = controlledTeam.cultureProfile || {};
  const scheme = controlledTeam.schemeIdentity || {};
  const standingsRow =
    (d.latestStandings || []).find(
      (row) =>
        row.team === controlledTeam.abbrev ||
        row.team === controlledTeam.id ||
        row.teamName === controlledTeam.name
    ) || null;
  const topNeed = (d.rosterNeeds || [])
    .slice()
    .sort((a, b) => a.delta - b.delta || a.position.localeCompare(b.position))[0];
  const recordLabel = standingsRow
    ? `${standingsRow.wins}-${standingsRow.losses}${standingsRow.ties ? `-${standingsRow.ties}` : ""}`
    : "0-0";
  const teamLabel = [controlledTeam.city, controlledTeam.nickname].filter(Boolean).join(" ") || controlledTeam.name || controlledTeam.id || "-";
  const schemeLabel = [scheme.offense, scheme.defense].filter(Boolean).join(" / ") || controlledTeam.scheme || "Balanced";
  const spotlight = document.getElementById("overviewTeamSpotlight");
  if (spotlight) {
    spotlight.innerHTML = `
      <div class="overview-team-mark">
        <div class="overview-team-label">${escapeHtml(teamLabel)}</div>
        <div class="overview-team-meta">
          ${escapeHtml(controlledTeam.abbrev || controlledTeam.id || "-")} | ${escapeHtml(standingsRow?.conference || controlledTeam.conference || "-")} ${escapeHtml(standingsRow?.division || controlledTeam.division || "")} | Record ${escapeHtml(recordLabel)}
        </div>
      </div>
      <div class="overview-team-grid">
        <div class="overview-team-card">
          <strong>Competitive Window</strong>
          <div>${escapeHtml(expectation.mandate || "Build sustainably")}</div>
          <div class="small">Projected wins ${escapeHtml(expectation.projectedWins ?? "-")} | Target ${escapeHtml(expectation.targetWins ?? "-")}</div>
        </div>
        <div class="overview-team-card">
          <strong>Identity</strong>
          <div>${escapeHtml(culture.identity || "Balanced culture")}</div>
          <div class="small">${escapeHtml(schemeLabel)} | Chemistry ${escapeHtml(controlledTeam.chemistry ?? "-")}</div>
        </div>
      <div class="overview-team-card">
        <strong>Primary Need</strong>
        <div>${escapeHtml(topNeed ? `${topNeed.position} room` : "No urgent weakness")}</div>
        <div class="small">${escapeHtml(topNeed ? `${Math.abs(topNeed.delta)} players short of the target ${topNeed.target}` : "Roster shape is on target")}</div>
      </div>
        <div class="overview-team-card">
          <strong>Game Plan</strong>
          <div>${escapeHtml(weeklyPlan.focus || weeklyPlan.summary || "Balanced script")}</div>
          <div class="small">${escapeHtml(weeklyPlan.exploit || weeklyPlan.warning || "No weekly exploit flagged yet")}</div>
        </div>
      </div>
    `;
  }
  const pulse = document.getElementById("overviewPulseBar");
  if (pulse) {
    const chips = [
      expectation.trend ? `Heat ${expectation.heat ?? "-"} | ${expectation.trend}` : null,
      culture.pressure ? `Culture pressure ${culture.pressure}` : null,
      weeklyPlan.exploit ? `Exploit ${weeklyPlan.exploit}` : null,
      weeklyPlan.warning ? `Watch ${weeklyPlan.warning}` : null,
      scheme.offense ? `Offense ${scheme.offense}` : null,
      scheme.defense ? `Defense ${scheme.defense}` : null
    ].filter(Boolean);
    pulse.innerHTML = chips.length
      ? chips.map((chip) => `<span class="overview-pulse-chip">${escapeHtml(chip)}</span>`).join("")
      : `<span class="overview-pulse-chip">Refresh to load franchise signals</span>`;
  }
}

export function renderRosterNeeds() {
  const needs = (state.dashboard?.rosterNeeds || [])
    .slice()
    .sort((a, b) => a.delta - b.delta || a.position.localeCompare(b.position))
    .map((entry) => ({
      pos: entry.position,
      target: entry.target,
      current: entry.current,
      gap: entry.delta,
      status: entry.delta < 0 ? `Need ${Math.abs(entry.delta)}` : entry.delta === 0 ? "On target" : `+${entry.delta}`
    }));
  renderTable("needsTable", needs);
}

export function renderLeaders() {
  const category = document.getElementById("leadersCategory")?.value || "passing";
  const source = state.dashboard?.leaders?.[category] || [];
  const rows = source.slice(0, 20).map((row, index) => {
    if (category === "passing") {
      return {
        rk: index + 1,
        player: row.player,
        tm: teamCode(row.tm),
        pos: row.pos,
        yds: row.yds,
        td: row.td,
        int: row.int,
        ypa: row.ypa,
        rate: row.rate
      };
    }
    if (category === "rushing") {
      return {
        rk: index + 1,
        player: row.player,
        tm: teamCode(row.tm),
        pos: row.pos,
        yds: row.yds,
        td: row.td,
        att: row.att,
        ypa: row.ypa,
        lng: row.lng
      };
    }
    return {
      rk: index + 1,
      player: row.player,
      tm: teamCode(row.tm),
      pos: row.pos,
      yds: row.yds,
      td: row.td,
      rec: row.rec,
      tgt: row.tgt,
      ypr: row.ypr
    };
  });
  renderTable("leadersTable", rows);
  decoratePlayerColumnByIds(
    "leadersTable",
    source.map((row) => row.playerId),
    1
  );
}

export function renderSchedule() {
  const week = state.scheduleWeek || state.dashboard?.currentWeek || 1;
  const schedule = state.scheduleCache[week] || null;
  const weekText = document.getElementById("scheduleWeekText");
  if (!schedule) {
    weekText.textContent = `Week ${week}`;
    renderTable("scheduleTable", []);
    return;
  }
  const controlledTeamId = state.dashboard?.controlledTeamId || null;
  const controlledOnBye = controlledTeamId && (schedule.byeTeams || []).includes(controlledTeamId);
  weekText.textContent = `Week ${schedule.week} (${schedule.played ? "Played" : "Upcoming"})${controlledOnBye ? ` | ${controlledTeamId} bye week` : ""}`;
  const rows = (schedule.games || []).map((game) => ({
    away: teamCode(game.awayTeamId),
    home: teamCode(game.homeTeamId),
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : teamCode(game.winnerId) || "") : "TBD"
  }));
  for (const teamId of schedule.byeTeams || []) {
    rows.push({
      away: teamCode(teamId),
      home: "BYE",
      score: "-",
      winner: "REST"
    });
  }
  renderTable("scheduleTable", rows);
}

export function renderStandings() {
  const rows = (state.dashboard?.latestStandings || []).map((row) => ({
    tm: row.team,
    team: row.teamName,
    w: row.wins,
    l: row.losses,
    t: row.ties,
    pct: row.winPct,
    pf: row.pf,
    pa: row.pa,
    conf: row.conference,
    div: row.division
  }));
  renderTable("standingsTable", rows);
}

export function renderWeekResults() {
  const week = state.dashboard?.latestWeekResults;
  const games = (week?.games || []).map((game) => ({
    week: week.week,
    away: teamCode(game.awayTeamId),
    home: teamCode(game.homeTeamId),
    score: `${game.awayScore}-${game.homeScore}`,
    winner: teamCode(game.winnerId) || "TIE"
  }));
  renderTable("weekTable", games);

  const injuries = (state.dashboard?.injuryReport || []).map((entry) => ({
    player: entry.player,
    team: teamCode(entry.teamId),
    pos: entry.pos,
    status: entry.injury?.type || "",
    weeks: entry.injury?.weeksRemaining || 0
  }));

  const suspensions = (state.dashboard?.suspensionReport || []).map((entry) => ({
    player: entry.player,
    team: teamCode(entry.teamId),
    pos: entry.pos,
    status: "Suspension",
    weeks: entry.suspensionWeeks
  }));

  renderTable("injuryTable", [...injuries, ...suspensions].slice(0, 100));
}

export function renderBoxScoreTicker() {
  const ticker = document.getElementById("boxScoreTicker");
  if (!ticker) return;
  if (!state.recentBoxScores.length) {
    ticker.innerHTML = `<span class="small">No user-team games played yet.</span>`;
    return;
  }
  ticker.innerHTML = state.recentBoxScores
    .map(
      (game) => `
        <button class="ticker-item" data-boxscore-id="${escapeHtml(game.gameId)}">
          <span>W${escapeHtml(game.week)} ${escapeHtml(game.seasonType === "playoffs" ? "PO" : "REG")}</span>
          <span>${escapeHtml(teamCode(game.awayTeamId))} ${escapeHtml(game.awayScore)}</span>
          <strong>@</strong>
          <span>${escapeHtml(teamCode(game.homeTeamId))} ${escapeHtml(game.homeScore)}</span>
        </button>`
    )
    .join("");
}

export async function loadBoxScore(gameId) {
  state.activeBoxScoreId = gameId;
  const payload = await api(`/api/boxscore?gameId=${encodeURIComponent(gameId)}`);
  const boxScore = payload.boxScore;
  document.getElementById("boxScoreModalTitle").textContent =
    `${boxScore.awayTeamName} at ${boxScore.homeTeamName}`;
  document.getElementById("boxScoreModalMeta").textContent =
    `${boxScore.year} | Week ${boxScore.week || "-"} | ${boxScore.seasonType}`;
  document.getElementById("boxScoreAwayTitle").textContent = `${boxScore.awayTeamName} Player Stats`;
  document.getElementById("boxScoreHomeTitle").textContent = `${boxScore.homeTeamName} Player Stats`;

  renderTable("boxScoreTeamStatsTable", [
    {
      team: boxScore.awayTeamName,
      score: boxScore.awayTeam.score,
      yds: boxScore.awayTeam.totalYards,
      passYds: boxScore.awayTeam.passingYards,
      rushYds: boxScore.awayTeam.rushingYards,
      firstDowns: boxScore.awayTeam.firstDowns,
      turnovers: boxScore.awayTeam.turnovers
    },
    {
      team: boxScore.homeTeamName,
      score: boxScore.homeTeam.score,
      yds: boxScore.homeTeam.totalYards,
      passYds: boxScore.homeTeam.passingYards,
      rushYds: boxScore.homeTeam.rushingYards,
      firstDowns: boxScore.homeTeam.firstDowns,
      turnovers: boxScore.homeTeam.turnovers
    }
  ]);

  renderTable(
    "boxScoreScoringTable",
    (boxScore.scoringSummary || []).map((entry) => ({
      qtr: entry.quarterLabel,
      clock: entry.clock,
      team: entry.teamId,
      type: entry.type,
      summary: entry.description
    }))
  );

  renderTable(
    "boxScorePlayTable",
    (boxScore.playByPlay || []).map((entry) => ({
      qtr: entry.quarterLabel,
      clock: entry.clock,
      offense: entry.offenseTeamId,
      play: entry.description
    }))
  );

  const renderSide = (prefix, groups = {}) => {
    renderTable(`${prefix}PassingTable`, groups.passing || []);
    renderTable(`${prefix}RushingTable`, groups.rushing || []);
    renderTable(`${prefix}ReceivingTable`, groups.receiving || []);
    renderTable(`${prefix}DefenseTable`, groups.defense || []);
    renderTable(`${prefix}KickingTable`, groups.kicking || []);
    ["Passing", "Rushing", "Receiving", "Defense", "Kicking"].forEach((suffix) => {
      decoratePlayerColumnFromRows(`${prefix}${suffix}Table`, groups[suffix.toLowerCase()] || [], { idKeys: ["playerId"] });
    });
  };
  renderSide("boxScoreAway", boxScore.playerStats?.away);
  renderSide("boxScoreHome", boxScore.playerStats?.home);
  setBoxScoreTab("boxScoreStatsPanel");
  document.getElementById("boxScoreModal").classList.remove("hidden");
}

export function closeBoxScoreModal() {
  state.activeBoxScoreId = null;
  document.getElementById("boxScoreModal").classList.add("hidden");
}

export function openGuideModal() {
  document.getElementById("guideModal")?.classList.remove("hidden");
}

export function closeGuideModal() {
  document.getElementById("guideModal")?.classList.add("hidden");
}

export function renderNewsTicker() {
  const ticker = document.getElementById("newsTicker");
  if (!ticker) return;
  // Prefer live newsLog from dashboard (populated by beatReporter + press conference)
  const rows = state.dashboard?.newsLog?.length
    ? state.dashboard.newsLog
    : (state.newsRows || []);
  if (!rows.length) { ticker.hidden = true; return; }
  ticker.hidden = false;
  const track = ticker.querySelector(".news-ticker-track");
  if (!track) return;
  const TYPE_ICONS = {
    injury: "🚑", trade: "🔄", blowout: "💥", upset: "⚡", milestone: "🌟",
    streak: "🔥", standings: "📊", retirement: "👋", signing: "✍️",
    "press-conference": "🎤", championship: "🏆"
  };
  const items = rows.slice(0, 15).map((r) => {
    const icon = TYPE_ICONS[r.type] || "📰";
    const text = r.type === "press-conference" && r.quote
      ? `${r.quote.slice(0, 80)}${r.quote.length > 80 ? "…" : ""}`
      : (r.headline || String(r));
    return `<span class="news-ticker-item">${icon} ${escapeHtml(text)}</span>`;
  }).join('<span class="news-ticker-sep"> · </span>');
  track.innerHTML = items + '<span class="news-ticker-sep"> · </span>' + items;
}

export async function renderGmLegacyScore() {
  const card = document.getElementById("gmLegacyCard");
  if (!card) return;
  try {
    const data = await api("/api/gm-legacy");
    const s = data.legacy;
    if (!s) { card.hidden = true; return; }
    card.hidden = false;
    const scoreEl = document.getElementById("gmLegacyScoreVal");
    const gradeEl = document.getElementById("gmLegacyGradeVal");
    const labelEl = document.getElementById("gmLegacyLabel");
    if (scoreEl) scoreEl.textContent = s.score ?? "—";
    if (gradeEl) gradeEl.textContent = s.grade ?? "—";
    if (labelEl) labelEl.textContent = s.label ?? "";

    // Persona tier arc
    const personaEl = document.getElementById("gmPersonaTier");
    const persona = s.persona;
    if (personaEl && persona) {
      const tierDots = [1,2,3,4,5,6].map((t) =>
        `<span class="gm-tier-dot ${t <= persona.current.tier ? "active" : ""}" title="Tier ${t}"></span>`
      ).join("");
      const progressPct = persona.next && persona.next.gapToNext != null
        ? Math.max(0, Math.min(100, Math.round(100 - (persona.next.gapToNext / Math.max(1, persona.next.threshold || 100)) * 100)))
        : persona.next ? 0 : 100;
      personaEl.innerHTML = `
        <div class="gm-persona-name">${escapeHtml(persona.current.name)}</div>
        <div class="gm-tier-track">${tierDots}</div>
        <div class="gm-persona-progress-wrap">
          <div class="gm-persona-progress-track">
            <div class="gm-persona-progress-fill" style="width:${progressPct}%"></div>
          </div>
          <span class="gm-persona-progress-pct">${progressPct}%</span>
        </div>
        <div class="gm-persona-desc">${escapeHtml(persona.current.description)}</div>
        ${persona.next ? `<div class="gm-persona-next">Next: <strong>${escapeHtml(persona.next.name)}</strong> · ${persona.next.gapToNext > 0 ? `+${persona.next.gapToNext} pts needed` : "Ready to advance"}</div>` : `<div class="gm-persona-next">🏆 Peak tier reached</div>`}
      `;

      // Persona tier unlock toast
      const currentTier = persona.current.tier;
      if (state.prevGmLegacyTier !== null && currentTier > state.prevGmLegacyTier) {
        showPersonaTierToast(persona.current.name, currentTier);
      }
      state.prevGmLegacyTier = currentTier;
    }
  } catch {
    // non-critical
  }
}

export function showPersonaTierToast(tierName, tier) {
  // Confetti burst effect
  const confetti = document.createElement("div");
  confetti.className = "persona-tier-up-confetti";
  confetti.textContent = "🏆";
  document.body.appendChild(confetti);
  setTimeout(() => confetti.remove(), 1100);

  const overlay = document.getElementById("personaTierToast");
  if (!overlay) {
    showToast(`GM Arc Unlocked: ${tierName} (Tier ${tier})`);
    return;
  }
  const nameEl = overlay.querySelector(".persona-toast-name");
  const tierEl = overlay.querySelector(".persona-toast-tier");
  if (nameEl) nameEl.textContent = tierName;
  if (tierEl) tierEl.textContent = `Tier ${tier} of 6`;
  overlay.hidden = false;
  overlay.classList.add("active");
  setTimeout(() => {
    overlay.classList.remove("active");
    setTimeout(() => { overlay.hidden = true; }, 500);
  }, 3500);
}

export function renderSeasonPreviewPanel() {
  const panel = document.getElementById("seasonPreviewPanel");
  if (!panel) return;
  const d = state.dashboard;
  if (!d) { panel.hidden = true; return; }
  const phase = d.phase || "";
  const show = phase === "preseason" || phase === "offseason" || phase === "draft";
  panel.hidden = !show;
  if (!show) return;
  const grid = panel.querySelector(".season-preview-grid");
  if (!grid) return;
  const team = d.controlledTeam || {};
  const standings = d.latestStandings || [];
  const myRow = standings.find((r) => r.team === (team.abbrev || team.teamId)) || {};
  const lastRecord = myRow.wins != null ? `${myRow.wins}–${myRow.losses}` : "—";
  const ovr = team.overallRating ?? "—";
  const cap = d.cap?.capSpace != null ? fmtMoney(d.cap.capSpace) : "—";
  const scheme = team.schemeIdentity || {};
  grid.innerHTML = `
    <div class="season-preview-tile"><div class="sp-tile-label">Last Record</div><div class="sp-tile-val">${escapeHtml(lastRecord)}</div></div>
    <div class="season-preview-tile"><div class="sp-tile-label">Team OVR</div><div class="sp-tile-val">${escapeHtml(String(ovr))}</div></div>
    <div class="season-preview-tile"><div class="sp-tile-label">Cap Space</div><div class="sp-tile-val">${escapeHtml(cap)}</div></div>
    <div class="season-preview-tile"><div class="sp-tile-label">Scheme</div><div class="sp-tile-val">${escapeHtml(scheme.offense || "—")} / ${escapeHtml(scheme.defense || "—")}</div></div>
  `;
}

export function renderCapAlertBanner() {
  const el = document.getElementById("capAlertBanner");
  if (!el) return;
  const alerts = state.dashboard?.capAlerts || [];
  if (!alerts.length) { el.innerHTML = ""; el.classList.add("hidden"); return; }

  const icons = { critical: "🔴", warning: "🟡", info: "🔵" };
  const top = alerts[0];
  el.innerHTML = `
    <div class="cap-alert cap-alert-${top.severity}">
      <span class="cap-alert-icon">${icons[top.severity] || "⚠"}</span>
      <div class="cap-alert-body">
        <strong>${escapeHtml(top.headline)}</strong>
        <span class="cap-alert-detail">${escapeHtml(top.detail)}</span>
      </div>
      ${alerts.length > 1 ? `<span class="cap-alert-count">+${alerts.length - 1} more</span>` : ""}
    </div>`;
  el.classList.remove("hidden");
}

export function renderFanSentimentCard() {
  const el = document.getElementById("fanSentimentCard");
  if (!el) return;
  const fs = state.dashboard?.fanSentiment;
  if (!fs) { el.hidden = true; return; }
  el.hidden = false;
  const trendIcons = { rising: "📈", falling: "📉", stable: "→" };
  const barPct = fs.approval || 0;
  const tone = barPct >= 75 ? "positive" : barPct >= 50 ? "warning" : "negative";
  el.innerHTML = `
    <div class="fan-sentiment-header">
      <span class="fan-sentiment-label">Fan Pulse</span>
      <span class="fan-sentiment-trend">${trendIcons[fs.trend] || "→"} ${escapeHtml(fs.trend || "stable")}</span>
    </div>
    <div class="fan-sentiment-approval">
      <div class="fs-bar-track"><div class="fs-bar-fill tone-bg-${escapeHtml(tone)}" style="width:${barPct}%"></div></div>
      <span class="fs-approval-num tone-${escapeHtml(tone)}">${barPct}</span>
    </div>
    <div class="fan-sentiment-label-name">${escapeHtml(fs.label || "Steady")}</div>
    ${fs.reasons?.length ? `<div class="fan-sentiment-reason">${escapeHtml(fs.reasons[0])}</div>` : ""}
  `;
}

export function renderInjuryOverlayCard() {
  const el = document.getElementById("injuryOverlayCard");
  if (!el) return;
  const injured = state.dashboard?.activeInjuries || [];
  if (!injured.length) { el.hidden = true; return; }
  el.hidden = false;
  const items = injured.slice(0, 6).map((p) => {
    const wkColor = p.weeksRemaining <= 1 ? "positive" : p.weeksRemaining <= 3 ? "warning" : "negative";
    return `
      <div class="injury-overlay-row">
        <span class="inj-pos-chip">${escapeHtml(p.pos || "?")}</span>
        <span class="inj-name">${escapeHtml(p.name || p.playerId)}</span>
        <span class="inj-status tone-${escapeHtml(p.severity === "severe" ? "negative" : "warning")}">${escapeHtml(p.status || "IR")}</span>
        <span class="inj-weeks tone-${wkColor}">${p.weeksRemaining}w</span>
      </div>`;
  }).join("");
  el.innerHTML = `
    <div class="injury-overlay-title">Active Injuries <span class="inj-count-chip">${injured.length}</span></div>
    <div class="injury-overlay-list">${items}</div>
    ${injured.length > 6 ? `<div class="inj-overflow small muted">+${injured.length - 6} more</div>` : ""}
  `;
}

export async function renderStatLeadersStrip() {
  const el = document.getElementById("statLeadersStrip");
  if (!el) return;
  try {
    const data = await api("/api/stat-leaders");
    if (!data?.leaders) return;
    const { passing, rushing, defense } = data.leaders;
    const fmt = (rows, label, key, fmt2) => {
      if (!rows?.length) return "";
      const top = rows[0];
      const val = fmt2 ? fmt2(top[key]) : (top[key] || 0);
      return `<div class="stat-leader-cell">
        <span class="sl-cat">${label}</span>
        <span class="sl-name">${escapeHtml(top.player || top.name || "—")}</span>
        <span class="sl-val">${typeof val === "number" ? val.toLocaleString() : val}</span>
      </div>`;
    };
    el.innerHTML = `
      <div class="stat-leaders-inner">
        ${fmt(passing, "Pass Yds", "yds")}
        ${fmt(rushing, "Rush Yds", "yds")}
        ${fmt(defense, "Def Stars", "sacks", (v) => `${(defense[0]?.sacks || 0)} sck / ${(defense[0]?.int || 0)} int`)}
      </div>`;
    el.hidden = !passing?.length && !rushing?.length && !defense?.length;
  } catch {
    // non-critical
  }
}

export function renderOwnerUltimatum() {
  const el = document.getElementById("ownerUltimatumBanner");
  if (!el) return;
  const ult = state.dashboard?.controlledTeam?.owner?.expectation?.ultimatum;
  if (!ult?.active) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <div class="ultimatum-banner">
      <span class="ultimatum-icon">⚠️</span>
      <div class="ultimatum-body">
        <strong>Owner Ultimatum</strong>
        <span>${escapeHtml(ult.message)}</span>
        <span class="ultimatum-detail">${ult.weeksLeft} week${ult.weeksLeft !== 1 ? "s" : ""} remaining · Consequence: ${escapeHtml(ult.consequence || "major changes")}</span>
      </div>
    </div>`;
}
