import { state, api, STATS_BENCHMARK_HINTS } from "./appState.js";
import { classifyTone, decoratePlayerColumnByIds, decoratePlayerColumnFromRows, escapeHtml, fmtMoney, renderTable, setBoxScoreTab, setMetricCardValue, showToast, teamCode, teamName } from "./appCore.js";
import { buildRivalCoachIntel } from "./rivalCoachIntel.js";
import { renderTradeDeadlineFrenzy } from "./tradeDeadlineFrenzy.js";
import { buildBoxScoreImpactLeaders, buildQuarterScoreboard } from "./boxScorePresentation.js";
import { observeBackgroundTask, recordClientDiagnostic } from "./clientDiagnostics.js";
import { buildFranchiseCommandStack } from "./franchiseCommandCenter.js";
import { buildTacticalIdentityLedger } from "./tacticalFilmRoom.js";
import { architectLedgerRows, buildArchitectureSignal, buildThreeHorizonBlueprint } from "./franchiseArchitecture.js";

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
  renderFranchiseCommandCenter();
  renderFranchiseArchitecture();
  renderOpeningContract();
  renderRehabCommandCenter();
  renderGmCommitmentBoard();
  renderTacticalFilmRoom();
  renderNarrativePanel();
  renderTradeDeadlineAlert();
}

export function renderFranchiseCommandCenter() {
  const panel = document.getElementById("franchiseCommandCenter");
  if (!panel) return;
  const cards = buildFranchiseCommandStack({
    dashboard: state.dashboard || {},
    newsRows: state.newsRows || [],
    pendingDecision: state.mobilePendingDecision || state.dashboard?.gmDecisionQueue?.[0] || null,
    pendingChoice: state.mobilePendingDecisionChoice || null
  });
  panel.innerHTML = `
    <div class="franchise-command-head">
      <div><span class="brand-kicker">Live Franchise Authority</span><h3>What needs your call?</h3></div>
      <span class="small">Ranked from current league state</span>
    </div>
    <div class="franchise-command-grid">
      ${cards.map((card, index) => `
        <button type="button" class="franchise-command-card ${escapeHtml(card.tone)}" data-command-index="${index}" data-command-action="${escapeHtml(card.action)}" data-target-tab="${escapeHtml(card.targetTab || "")}" ${card.disabled ? "disabled aria-disabled=\"true\"" : ""}>
          <span class="franchise-command-lane">${escapeHtml(card.lane)}</span>
          <span class="franchise-command-kicker">${escapeHtml(card.kicker)}</span>
          <strong>${escapeHtml(card.title)}</strong>
          <small>${escapeHtml(card.detail)}</small>
          <span class="franchise-command-reason">#${card.rank} · ${escapeHtml(card.reason)}</span>
        </button>
      `).join("")}
    </div>
  `;
}
export function renderFranchiseArchitecture() {
  const content = document.getElementById("franchiseArchitectureContent");
  if (!content) return;
  const commands = buildFranchiseCommandStack({
    dashboard: state.dashboard || {},
    newsRows: state.newsRows || [],
    pendingDecision: state.mobilePendingDecision || state.dashboard?.gmDecisionQueue?.[0] || null,
    pendingChoice: state.mobilePendingDecisionChoice || null
  });
  const rawLedger = state.dashboard?.architectLedger || [];
  const horizons = buildThreeHorizonBlueprint({
    dashboard: state.dashboard || {},
    commands,
    gmLegacy: state.gmLegacy || state.dashboard?.gmLegacy || null,
    architectLedger: rawLedger,
  });
  const ledger = architectLedgerRows(rawLedger);
  const signal = buildArchitectureSignal(rawLedger);
  content.innerHTML = `
    <div class="franchise-horizon-grid">
      ${horizons.map((lane) => `
        <button type="button" class="franchise-horizon-card ${escapeHtml(lane.tone)}" data-blueprint-target-tab="${escapeHtml(lane.targetTab)}" data-blueprint-target-id="${escapeHtml(lane.targetId)}">
          <span class="franchise-horizon-label">${escapeHtml(lane.label)}</span>
          <small>${escapeHtml(lane.authority)}</small>
          <strong>${escapeHtml(lane.title)}</strong>
          <span>${escapeHtml(lane.detail)}</span>
          <em>${escapeHtml(lane.milestone)}</em>
        </button>
      `).join("")}
    </div>
    <div class="architect-signal ${signal.ready ? "ready" : "awaiting"}">
      <span class="franchise-horizon-label">Decision-memory signal · ${escapeHtml(signal.sampleSize)} receipt${signal.sampleSize === 1 ? "" : "s"}</span>
      <strong>${escapeHtml(signal.title)}</strong>
      <span>${escapeHtml(signal.detail)}</span>
      <small>${escapeHtml(signal.disclaimer)}</small>
    </div>
    <div class="architect-ledger">
      <div class="architect-ledger-head">
        <strong>Architect's Ledger</strong>
        <span class="small">Intent → execution → observed result → next adaptation</span>
      </div>
      ${ledger.length ? `
        <ol class="architect-ledger-list">
          ${ledger.map((row) => `
            <li class="architect-ledger-row">
              <span class="architect-ledger-authority">${escapeHtml(row.authority)}</span>
              <strong>${escapeHtml(row.intent)}</strong>
              <span>${escapeHtml(row.outcome || "No result recorded")}</span>
              <small>Next: ${escapeHtml(row.adaptation)}</small>
            </li>
          `).join("")}
        </ol>
        <p class="architect-ledger-disclaimer">${escapeHtml(ledger[0].disclaimer || "The ledger reports sequence and alignment, not causation.")}</p>
      ` : '<p class="architect-ledger-empty">Advance a week to record the first committed intent and its observed outcome. No result is invented before play.</p>'}
    </div>
  `;
}
export function renderOpeningContract() {
  const card = document.getElementById("openingContractCard");
  if (!card) return;
  const receipt = state.dashboard?.startScenarioReceipt;
  const progress = state.dashboard?.openingContractProgress;
  if (!receipt?.effects || !progress) {
    card.hidden = true;
    card.replaceChildren();
    return;
  }
  const heading = document.createElement("div");
  heading.className = "opening-contract-heading";
  const kicker = document.createElement("span");
  kicker.className = "brand-kicker";
  kicker.textContent = progress.status === "completed" ? "Opening Contract · Receipt Earned" : "Opening Contract · Live Prologue";
  const receiptId = document.createElement("span");
  receiptId.className = "small";
  receiptId.textContent = receipt.receiptId || "";
  heading.append(kicker, receiptId);

  const timeline = document.createElement("ol");
  timeline.className = "opening-contract-timeline";
  for (const step of progress.steps || []) {
    const item = document.createElement("li");
    item.className = `opening-contract-step ${step.complete ? "complete" : "pending"}`;
    const marker = document.createElement("span");
    marker.className = "opening-contract-marker";
    marker.textContent = step.complete ? "✓" : "→";
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = step.label;
    const detail = document.createElement("small");
    detail.textContent = step.detail;
    copy.append(label, detail);
    item.append(marker, copy);
    timeline.appendChild(item);
  }

  const evidence = document.createElement("div");
  evidence.className = "opening-contract-evidence";
  if (progress.result) {
    const result = progress.result;
    const owner = progress.ownerPressure;
    evidence.textContent = `${result.verdict} ${result.teamScore}–${result.opponentScore} vs ${result.opponentId}`
      + (result.tactic ? ` · ${result.tactic}` : "")
      + (owner ? ` · Owner heat ${owner.heat ?? "–"} (${owner.trend})` : "");
    if (result.tacticalVerdict) {
      const film = document.createElement("small");
      film.textContent = result.tacticalVerdict;
      evidence.appendChild(film);
    }
  } else {
    evidence.textContent = progress.nextAction;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "primary opening-contract-action";
    action.dataset.openingPrologueAction = "advance-week";
    action.textContent = "Choose Tactic & Play Week 1";
    evidence.appendChild(action);
  }
const scoutingTruth = document.createElement("small");
  scoutingTruth.className = "opening-contract-scouting-truth";
  const scouting = receipt.effects.scouting;
  scoutingTruth.textContent = scouting?.status === "pending-draft-class"
    ? "Pending a real draft class — no prospect has been fabricated."
    : scouting?.status === "declined"
      ? "No opening prospect was pinned and no scouting points were spent."
      : `First-call evidence applied to ${scouting?.prospect || scouting?.prospectId || "the live scouting board"}.`;
  card.replaceChildren(heading, timeline, evidence, scoutingTruth);
  card.hidden = false;
}
export function renderRehabCommandCenter() {
  const panel = document.getElementById("rehabCommandCenter");
  if (!panel) return;
  const dashboard = state.dashboard || {};
  const teamId = dashboard.controlledTeamId;
  const injuries = (dashboard.injuryReport || []).filter((entry) => entry.teamId === teamId);
  const receipt = dashboard.latestRehabReceipt?.teamId === teamId ? dashboard.latestRehabReceipt : null;
  if (!injuries.length && !receipt) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const plans = [
    ["protect", "Protect", "Lower risk"],
    ["standard", "Standard", "Staff pace"],
    ["accelerate", "Accelerate", "Faster · riskier"]
  ];
  const cards = injuries.map((entry) => {
    const risk = Math.round(Number(entry.reinjuryRisk || 0) * 100);
    const actions = plans.map(([id, label, detail]) => `
      <button class="rehab-plan-btn ${entry.rehabPlan === id ? "active" : ""}"
        data-player-id="${escapeHtml(entry.playerId)}"
        data-plan="${id}"
        aria-pressed="${entry.rehabPlan === id}">
        <strong>${label}</strong><span>${detail}</span>
      </button>`).join("");
    return `
      <article class="rehab-player-card">
        <div class="rehab-player-head">
          <div><strong>${escapeHtml(entry.player)}</strong><span>${escapeHtml(entry.pos)} · ${escapeHtml(entry.injuryType)}</span></div>
          <div class="rehab-eta">${escapeHtml(String(entry.estimatedAdvances))} advance${entry.estimatedAdvances === 1 ? "" : "s"}</div>
        </div>
        <div class="rehab-truth-row">
          <span>${escapeHtml(String(entry.weeksRemaining))} modeled week${entry.weeksRemaining === 1 ? "" : "s"} remaining</span>
          <span>${escapeHtml(String(entry.weeklyRecovery))} week${entry.weeklyRecovery === 1 ? "" : "s"} recovered per advance</span>
          <span>${risk}% re-injury risk</span>
        </div>
        <div class="rehab-plan-grid" role="group" aria-label="Rehab plan for ${escapeHtml(entry.player)}">${actions}</div>
        <p class="rehab-plan-summary">${escapeHtml(entry.rehabSummary)}</p>
      </article>`;
  }).join("");
  panel.hidden = false;
  panel.innerHTML = `
    <div class="rehab-command-head">
      <div><span class="brand-kicker">Medical Strategy · Modeled, not clinical</span><h3>Rehab Command Center</h3></div>
      <span class="rehab-count">${injuries.length} active</span>
    </div>
    ${receipt ? `<div class="rehab-receipt"><strong>${escapeHtml(receipt.player)} cleared</strong><span>${escapeHtml(receipt.planLabel)} · risk now ${Math.round(Number(receipt.reinjuryRisk || 0) * 100)}%</span></div>` : ""}
    <div class="rehab-player-list">${cards || '<p class="small muted">No active injuries. The latest clearance receipt remains above.</p>'}</div>
  `;
}

export function renderGmCommitmentBoard() {
  const card = document.getElementById("gmCommitmentBoard");
  if (!card) return;
  const commitments = stateDashboardCommitments();
  const active = commitments.active || [];
  const receipt = commitments.latestReceipt;
  if (!active.length && !receipt) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = `
    <div class="gm-commitment-kicker">Decision Consequence Ledger</div>
    ${active.map((entry) => `<div class="gm-commitment-row"><div><strong>${escapeHtml(entry.label)}</strong><div>${escapeHtml(entry.promise)}</div></div><span>Due Y${escapeHtml(String(entry.deadlineYear))} W${escapeHtml(String(entry.deadlineWeek))}</span></div>`).join("")}
    ${receipt ? `<div class="gm-commitment-receipt ${receipt.status === "succeeded" ? "receipt-success" : "receipt-failure"}"><strong>${escapeHtml(receipt.label)} · ${escapeHtml(receipt.status)}</strong><div>${escapeHtml(receipt.evidence)}</div></div>` : ""}
  `;
}

function stateDashboardCommitments() {
  return state.dashboard?.gmCommitments || { active: [], latestReceipt: null };
}

export function renderTacticalFilmRoom() {
  const card = document.getElementById("tacticalFilmRoom");
  const receipt = state.dashboard?.latestTacticalFilm;
  const identity = buildTacticalIdentityLedger(state.dashboard?.tacticalFilmLedger || []);
  if (!card) return;
  if (!receipt) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  card.className = `panel tactical-film-room ${receipt.aligned ? "film-aligned" : "film-mixed"}`;
  card.innerHTML = `
    <div class="film-kicker">Postgame Film Receipt · Week ${escapeHtml(String(receipt.week ?? "?"))}</div>
    <div class="film-headline"><strong>${escapeHtml(receipt.label)}</strong><span>${escapeHtml(receipt.result.toUpperCase())} ${escapeHtml(receipt.score)} vs ${escapeHtml(receipt.opponentId)}</span></div>
    <div class="film-verdict">${receipt.aligned ? "Intent aligned with the observed signal" : "Observed signal was mixed against the chosen intent"}</div>
    <div class="film-observed">${escapeHtml(receipt.observed)}</div>
    ${identity ? `<div class="film-identity" aria-label="Tactical identity ledger"><strong>${escapeHtml(identity.summary)}</strong><span>${escapeHtml(String(identity.alignedRepetitions))} aligned repetitions · ${escapeHtml(String(identity.variety))} tactics in the ledger</span></div>` : ""}
    <div class="film-disclaimer">${escapeHtml(identity?.disclaimer || receipt.disclaimer)}</div>
  `;
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
  renderTradeDeadlineFrenzy("tradeDeadlineFrenzy", d);
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
  const schemeFallback = typeof controlledTeam.scheme === "string" ? controlledTeam.scheme : "";
  const schemeLabel = [scheme.offense, scheme.defense].filter(Boolean).join(" / ") || schemeFallback || "Balanced";
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
  observeBackgroundTask(() => renderRivalryStrip(schedule, controlledTeamId), {
    surface: "overview",
    operation: "rivalry-strip",
    authorityKey: [
      state.dashboard?.currentYear || "",
      state.dashboard?.currentWeek || "",
      controlledTeamId || ""
    ].join(":")
  });
}

// ── Rivalry DNA strip (engine: src/engine/rivalryDNA.js via /api/rivalry) ────
async function renderRivalryStrip(schedule, controlledTeamId) {
  const strip = document.getElementById("rivalryStrip");
  if (!strip) return;
  const game = controlledTeamId
    ? (schedule.games || []).find(
        (g) => g.awayTeamId === controlledTeamId || g.homeTeamId === controlledTeamId
      )
    : null;
  if (!game) {
    strip.hidden = true;
    const ic = document.getElementById("rivalCoachIntelContainer");
    if (ic) ic.hidden = true;
    return;
  }
  const opponentId = game.awayTeamId === controlledTeamId ? game.homeTeamId : game.awayTeamId;
  let ctx = null;
  try {
    const res = await api(
      `/api/rivalry?teamA=${encodeURIComponent(controlledTeamId)}&teamB=${encodeURIComponent(opponentId)}`
    );
    ctx = res?.rivalry || null;
  } catch (error) {
    ctx = null;
    strip.hidden = true;
    const intelContainer = document.getElementById("rivalCoachIntelContainer");
    if (intelContainer) intelContainer.hidden = true;
    throw error;
  }
  if (!ctx || !ctx.totalMeetings) {
    strip.hidden = true;
    const ic2 = document.getElementById("rivalCoachIntelContainer");
    if (ic2) ic2.hidden = true;
    return;
  }
  const heat = Math.max(0, Math.min(100, ctx.heat || 0));
  const heatTone = heat >= 80 ? "rs-bitter" : heat >= 60 ? "rs-heated" : heat >= 40 ? "rs-competitive" : "rs-mild";
  const streakText = ctx.streak?.count > 1
    ? `${teamCode(ctx.streak.team)} has won ${ctx.streak.count} straight`
    : "";
  strip.hidden = false;
  strip.innerHTML = `
    <div class="rivalry-strip ${heatTone}">
      ${heat >= 60 ? `<span class="rivalry-week-badge">RIVALRY WEEK</span>` : ""}
      <span class="rivalry-label">${escapeHtml(ctx.heatLabel || "Series")}</span>
      <span class="rivalry-matchup">${escapeHtml(teamCode(controlledTeamId))} vs ${escapeHtml(teamCode(opponentId))}</span>
      <span class="rivalry-series">Series ${ctx.teamAWins}-${ctx.teamBWins} (${ctx.totalMeetings} meetings)</span>
      ${streakText ? `<span class="rivalry-streak">${escapeHtml(streakText)}</span>` : ""}
      <span class="rivalry-heat-meter" title="Rivalry heat ${heat}/100"><span class="rivalry-heat-fill" style="width:${heat}%"></span></span>
    </div>`;

  // Rival coach intel card
  try {
    const res = await api(`/api/team-archetypes`);
    const rival = (res?.archetypes || []).find((a) => a.teamId === opponentId);
    const intel = buildRivalCoachIntel(rival?.archetype?.label, heat, rival?.ovr);
    const intelContainer = document.getElementById("rivalCoachIntelContainer");
    if (intelContainer) {
      intelContainer.hidden = false;
      intelContainer.innerHTML = `
        <div class="rival-coach-intel">
          <div class="rci-header">${intel.icon} Coach Intel: ${escapeHtml(rival?.name || teamCode(opponentId))} <span class="rci-archetype">[${escapeHtml(intel.archetype)}]</span></div>
          <ul class="rci-tendencies">
            ${intel.tendencies.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
          </ul>
          ${intel.heatNote ? `<div class="rci-alert rci-alert-${intel.alertLevel}">${escapeHtml(intel.heatNote)}</div>` : ""}
          ${intel.ovrNote ? `<div class="rci-alert rci-alert-high">${escapeHtml(intel.ovrNote)}</div>` : ""}
        </div>`;
    }
  } catch (error) {
    const intelContainer = document.getElementById("rivalCoachIntelContainer");
    if (intelContainer) intelContainer.hidden = true;
    recordClientDiagnostic({
      surface: "overview",
      operation: "rival-coach-intel",
      error,
      authorityKey: [
        state.dashboard?.currentYear || "",
        state.dashboard?.currentWeek || "",
        controlledTeamId || ""
      ].join(":")
    });
  }
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

  const scoreboard = buildQuarterScoreboard(boxScore);
  document.getElementById("boxScoreBroadcastStrip").innerHTML = `
    <div class="broadcast-score-grid" style="--quarter-count: ${scoreboard.labels.length}">
      <div class="broadcast-score-head">Team</div>
      ${scoreboard.labels.map((label) => `<div class="broadcast-score-head">${escapeHtml(label)}</div>`).join("")}
      <div class="broadcast-score-head">Final</div>
      ${scoreboard.rows.map((row) => `
        <div class="broadcast-team-name">${escapeHtml(row.team)}</div>
        ${row.quarters.map((score) => `<div>${escapeHtml(score)}</div>`).join("")}
        <div class="broadcast-final">${escapeHtml(row.total)}</div>
      `).join("")}
    </div>`;

  const impactLeaders = buildBoxScoreImpactLeaders(boxScore);
  document.getElementById("boxScoreImpactStrip").innerHTML = impactLeaders.length
    ? impactLeaders.map((leader, index) => `
        <article class="game-impact-card ${index === 0 ? "game-impact-card--game-ball" : ""}">
          <div class="brand-kicker">${index === 0 ? "Game Ball" : `Impact #${index + 1}`}</div>
          <button class="link-btn" data-player-id="${escapeHtml(leader.playerId)}">${escapeHtml(leader.player)}</button>
          <div>${escapeHtml(leader.team)} · ${escapeHtml(leader.pos)} · ${escapeHtml(leader.category)}</div>
          <p>${escapeHtml(leader.summary)}</p>
          <span>Impact Index ${escapeHtml(leader.score)}</span>
        </article>
      `).join("")
    : `<div class="narrative-empty">No individual impact leaders were recorded.</div>`;

  const formatPossession = (seconds) => {
    const safe = Math.max(0, Math.round(Number(seconds || 0)));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };
  const teamRow = (name, team) => ({
    team: name,
    score: team.score,
    yds: team.totalYards,
    plays: team.plays,
    ypp: team.yardsPerPlay,
    passYds: team.passingYards,
    rushYds: team.rushingYards,
    compAtt: `${team.completions || 0}/${team.passAttempts || 0}`,
    cmpPct: team.completionPct,
    sacks: team.sacks,
    firstDowns: team.firstDowns,
    pass1D: team.passingFirstDowns,
    rush1D: team.rushingFirstDowns,
    thirdDown: `${team.thirdDownConversions || 0}/${team.thirdDowns || 0}`,
    fourthDown: `${team.fourthDownConversions || 0}/${team.fourthDowns || 0}`,
    redZone: team.redZoneTrips,
    turnovers: team.turnovers,
    drives: team.drives,
    top: formatPossession(team.possessionSeconds)
  });

  renderTable("boxScoreTeamStatsTable", [
    teamRow(boxScore.awayTeamName, boxScore.awayTeam),
    teamRow(boxScore.homeTeamName, boxScore.homeTeam)
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
      down: entry.down,
      toGo: entry.distance,
      yardLine: entry.fieldPosition,
      play: entry.description
    }))
  );

  const renderSide = (prefix, groups = {}) => {
    renderTable(`${prefix}PassingTable`, groups.passing || []);
    renderTable(`${prefix}RushingTable`, groups.rushing || []);
    renderTable(`${prefix}ReceivingTable`, groups.receiving || []);
    renderTable(`${prefix}DefenseTable`, groups.defense || []);
    renderTable(`${prefix}KickingTable`, groups.kicking || []);
    renderTable(`${prefix}PuntingTable`, groups.punting || []);
    renderTable(`${prefix}BlockingTable`, groups.blocking || []);
    renderTable(`${prefix}SnapsTable`, groups.snaps || []);
    ["Passing", "Rushing", "Receiving", "Defense", "Kicking", "Punting", "Blocking", "Snaps"].forEach((suffix) => {
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
  const content = document.getElementById("newsTickerContent") || ticker.querySelector(".news-ticker-content");
  if (!content) return;
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
  content.innerHTML = items;
}

export async function renderGmLegacyScore() {
  const card = document.getElementById("gmLegacyCard");
  if (!card) return;
  try {
    const data = await api("/api/gm-legacy");
    const s = data.legacy;
    state.gmLegacy = s;
    renderFranchiseArchitecture();
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
      const progressPct = Math.max(0, Math.min(100, Number(persona.progressPct ?? (persona.next ? 0 : 100))));
      const badge = persona.benefits?.badge
        ? `<span class="gm-persona-badge gm-persona-badge-${escapeHtml(persona.benefits.badge)}">${persona.benefits.badge === "immortal" ? "✦ IMMORTAL" : "★ LEGEND"}</span>`
        : "";
      const entitlements = (persona.current.entitlements || []).map((entry) =>
        `<li><strong>${escapeHtml(entry.label)}</strong> · ${escapeHtml(entry.description)}</li>`
      ).join("");
      personaEl.innerHTML = `
        <div class="gm-persona-name">${escapeHtml(persona.current.name)} ${badge}</div>
        <div class="gm-tier-track">${tierDots}</div>
        <div class="gm-persona-progress-wrap">
          <div class="gm-persona-progress-track">
            <div class="gm-persona-progress-fill" style="width:${progressPct}%"></div>
          </div>
          <span class="gm-persona-progress-pct">${progressPct}%</span>
        </div>
        <div class="gm-persona-desc">${escapeHtml(persona.current.description)}</div>
        ${entitlements ? `<ul class="gm-persona-entitlements">${entitlements}</ul>` : ""}
        ${persona.next ? `<div class="gm-persona-next">Next: <strong>${escapeHtml(persona.next.name)}</strong> · ${persona.next.gapToNext > 0 ? `+${persona.next.gapToNext} pts needed` : "Ready to advance"}</div>` : `<div class="gm-persona-next">🏆 Peak tier reached</div>`}
      `;

      // Persona tier unlock toast
      const currentTier = persona.current.tier;
      if (state.prevGmLegacyTier !== null && currentTier > state.prevGmLegacyTier) {
        showPersonaTierToast(persona.current.name, currentTier);
      }
      state.prevGmLegacyTier = currentTier;
    }

    // GM Reputation: market perception label
    const repEl = document.getElementById("gmReputationLabel");
    const rep = s.reputation;
    if (repEl && rep && rep.labels && rep.labels[0] !== "Unestablished") {
      repEl.textContent = `Market knows you as: ${rep.labels.join(" · ")}`;
      repEl.hidden = false;
    } else if (repEl) {
      repEl.hidden = true;
    }
  } catch (error) {
    card.hidden = true;
    throw error;
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
  } catch (error) {
    el.hidden = true;
    throw error;
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


