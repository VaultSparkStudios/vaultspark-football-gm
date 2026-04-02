import { state, api } from "./appState.js";
import { decoratePlayerColumnFromRows, escapeHtml, formatHeight, renderPulseChips, renderTable, setElementTone, setMetricCardValue, teamByCode, teamName } from "./appCore.js";

export function renderDraft() {
  const draft = state.draftState;
  if (!draft) {
    state.selectedDraftProspectId = null;
    document.getElementById("draftStatusText").textContent = "No active draft";
    document.getElementById("draftStageText").textContent = "-";
    document.getElementById("draftOnClockText").textContent = "-";
    document.getElementById("draftUserWindowText").textContent = "-";
    document.getElementById("draftSelectedText").textContent = "Selected Prospect: None";
    renderTable("draftTable", []);
    renderTable("draftAvailableTable", []);
    return;
  }

  const currentTeam = draft.order?.[(draft.currentPick - 1) % 32] || "-";
  const isUserPick = currentTeam === state.dashboard?.controlledTeamId;
  const availableProspects = (draft.available || []).slice(0, 60);
  if (state.selectedDraftProspectId && !availableProspects.some((prospect) => prospect.id === state.selectedDraftProspectId)) {
    state.selectedDraftProspectId = null;
  }
  document.getElementById("draftStatusText").textContent = draft.completed
    ? "Draft Complete"
    : `Pick ${draft.currentPick} / ${draft.totalPicks}`;
  document.getElementById("draftStageText").textContent = draft.completed ? "Completed" : "Draft In Progress";
  document.getElementById("draftOnClockText").textContent = currentTeam;
  document.getElementById("draftUserWindowText").textContent = isUserPick ? "User On Clock" : "CPU On Clock";

  const latestSelections = (draft.selections || []).slice(-50).reverse();
  const rows = latestSelections.length
    ? latestSelections.map((selection) => ({
        pick: selection.pick,
        round: selection.round,
        team: selection.teamId,
        player: selection.player,
        pos: selection.pos
      }))
    : (draft.mockDraft || []).map((selection) => ({
        pick: selection.pick,
        round: Math.floor((selection.pick - 1) / 32) + 1,
        team: selection.teamId,
        player: selection.player,
        pos: selection.pos
      }));

  renderTable("draftTable", rows);

  const availableRows = availableProspects.map((prospect, index) => ({
    id: prospect.id,
    rank: prospect.scouting?.rank || index + 1,
    player: prospect.name,
    pos: prospect.position,
    age: prospect.age,
    height: formatHeight(prospect.heightInches),
    weight: prospect.weightLbs || "-",
    ovr: prospect.overall,
    projRnd: prospect.scouting?.projectedRound || "-",
    board: state.scoutingBoardDraft.indexOf(prospect.id) >= 0 ? state.scoutingBoardDraft.indexOf(prospect.id) + 1 : "-",
    action: isUserPick && !draft.completed ? "Select / Draft" : ""
  }));
  renderTable("draftAvailableTable", availableRows);
  decoratePlayerColumnFromRows("draftAvailableTable", availableRows, { idKeys: ["id"] });
  const selectedProspect = availableProspects.find((prospect) => prospect.id === state.selectedDraftProspectId) || null;
  document.getElementById("draftSelectedText").textContent = selectedProspect
    ? `Selected Prospect: ${selectedProspect.name} (${selectedProspect.position})`
    : "Selected Prospect: None";
  document.getElementById("draftAvailableTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const prospect = availableRows[index - 1];
    const cell = tr.lastElementChild;
    if (!prospect || !cell) return;
    cell.innerHTML = isUserPick && !draft.completed
      ? `<button data-draft-select-id="${escapeHtml(prospect.id)}">Select</button> <button data-draft-player-id="${escapeHtml(prospect.id)}">Draft</button>`
      : "";
  });
}

export function renderScouting() {
  const scouting = state.scouting;
  if (!scouting) {
    state.scoutingBoardDraft = [];
    document.getElementById("scoutingPointsText").textContent = "Points: 0";
    document.getElementById("scoutingLockText").textContent = "Board: Unlocked";
    document.getElementById("scoutingBoardText").textContent = "Board: 0 / 20";
    setElementTone("scoutingPointsText", null);
    setElementTone("scoutingLockText", null);
    setElementTone("scoutingBoardText", null);
    setMetricCardValue("scoutingPointsCard", "-", "accent");
    setMetricCardValue("scoutingBoardCard", "-", "accent");
    setMetricCardValue("scoutingLockCard", "-", "warning");
    setMetricCardValue("scoutingTopProspectCard", "-", "accent");
    const scoutingSpotlight = document.getElementById("scoutingSpotlight");
    if (scoutingSpotlight) {
      scoutingSpotlight.innerHTML = `<div class="small">Load the board to surface confidence, scheme fit, and board pressure.</div>`;
    }
    renderPulseChips("scoutingPulseBar", [], "Scouting signals will appear here");
    const insight = document.getElementById("scoutingInsightText");
    if (insight) insight.textContent = "Load the board to surface fit, confidence, and weekly scouting guidance.";
    renderTable("scoutingTable", []);
    renderTable("scoutingReportTable", []);
    return;
  }

  const availableSet = new Set((scouting.prospects || []).map((prospect) => prospect.playerId));
  state.scoutingBoardDraft = (scouting.locked ? scouting.board || [] : state.scoutingBoardDraft || [])
    .filter((playerId) => availableSet.has(playerId))
    .slice(0, 20);
  if (!scouting.locked && !state.scoutingBoardDraft.length && Array.isArray(scouting.board) && scouting.board.length) {
    state.scoutingBoardDraft = scouting.board.filter((playerId) => availableSet.has(playerId)).slice(0, 20);
  }

  document.getElementById("scoutingPointsText").textContent = `Points: ${scouting.points || 0}`;
  document.getElementById("scoutingLockText").textContent = scouting.locked ? "Board: Locked" : "Board: Unlocked";
  document.getElementById("scoutingBoardText").textContent = `Board: ${state.scoutingBoardDraft.length} / 20`;
  setElementTone("scoutingPointsText", (scouting.points || 0) > 0 ? "positive" : "warning");
  setElementTone("scoutingLockText", scouting.locked ? "warning" : "positive");
  setElementTone("scoutingBoardText", state.scoutingBoardDraft.length >= 20 ? "warning" : "accent");
  const rows = (scouting.prospects || []).slice(0, 140).map((prospect) => ({
    id: prospect.playerId,
    playerId: prospect.playerId,
    player: prospect.player,
    pos: prospect.pos,
    age: prospect.age,
    rank: prospect.rank,
    projRnd: prospect.projectedRound,
    forty: prospect.combine40,
    scoutOvr: prospect.scoutedOverall ?? "-",
    baseline: prospect.baselineScout ?? "-",
    fit: prospect.fitLabel ? `${prospect.fitLabel} (${prospect.schemeFit ?? "-"})` : prospect.schemeFit ?? "-",
    confidence: `${prospect.confidence ?? 0}%`,
    board: state.scoutingBoardDraft.indexOf(prospect.playerId) >= 0 ? state.scoutingBoardDraft.indexOf(prospect.playerId) + 1 : "-",
    action: scouting.locked ? "Locked" : "Scout / Board"
  }));
  renderTable("scoutingTable", rows);
  decoratePlayerColumnFromRows("scoutingTable", rows, { idKeys: ["playerId"] });
  document.getElementById("scoutingTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const prospect = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!prospect || !cell) return;
    const onBoard = state.scoutingBoardDraft.includes(prospect.playerId);
    if (scouting.locked) {
      cell.textContent = "Locked";
      return;
    }
    const boardButtons = onBoard
      ? [
          `<button data-board-move="up" data-player-id="${escapeHtml(prospect.playerId)}">Up</button>`,
          `<button data-board-move="down" data-player-id="${escapeHtml(prospect.playerId)}">Down</button>`,
          `<button data-board-toggle="remove" data-player-id="${escapeHtml(prospect.playerId)}">Remove</button>`
        ]
      : [`<button data-board-toggle="add" data-player-id="${escapeHtml(prospect.playerId)}">Add To Board</button>`];
    cell.innerHTML = [
      `<button data-scout-player-id="${escapeHtml(prospect.playerId)}">Scout</button>`,
      ...boardButtons
    ].join(" ");
  });

  const reportRows = (scouting.weeklyReports || [])
    .slice(0, 20)
    .flatMap((report) =>
      (report.evaluations || []).map((evaluation) => ({
        year: report.year,
        week: report.week,
        playerId: evaluation.playerId,
        player: evaluation.player,
        pos: evaluation.pos,
        revealed: evaluation.revealed,
        delta: evaluation.delta,
        confidence: `${evaluation.confidence ?? 0}%`,
        points: evaluation.pointsSpent
      }))
    )
    .slice(0, 120);
  renderTable("scoutingReportTable", reportRows);
  decoratePlayerColumnFromRows("scoutingReportTable", reportRows, { idKeys: ["playerId"] });
  const insight = document.getElementById("scoutingInsightText");
  if (insight) {
    const featuredId = state.scoutingBoardDraft[0];
    const featured = (scouting.prospects || []).find((prospect) => prospect.playerId === featuredId) || scouting.prospects?.[0] || null;
    const latestReport = scouting.weeklyReports?.[0]?.evaluations?.[0] || null;
    const lines = [];
    if (featured) {
      lines.push(
        `Top board fit: ${featured.player} (${featured.pos}) is ${featured.fitLabel || "neutral"} for this scheme at ${featured.schemeFit ?? "-"} with ${featured.confidence ?? 0}% confidence.`
      );
    }
    if (latestReport) {
      lines.push(
        `Latest report: ${latestReport.player} changed by ${latestReport.delta >= 0 ? "+" : ""}${latestReport.delta || 0} OVR with ${latestReport.confidence ?? 0}% confidence.`
      );
    }
    lines.push(scouting.locked ? "Board is locked; scouting now only updates the live report." : `Board room remaining: ${Math.max(0, 20 - state.scoutingBoardDraft.length)} slots.`);
    insight.textContent = lines.join(" ");
    setMetricCardValue("scoutingPointsCard", String(scouting.points || 0), (scouting.points || 0) > 0 ? "positive" : "warning");
    setMetricCardValue("scoutingBoardCard", `${state.scoutingBoardDraft.length} / 20`, state.scoutingBoardDraft.length >= 20 ? "warning" : "accent");
    setMetricCardValue("scoutingLockCard", scouting.locked ? "Locked" : "Open", scouting.locked ? "warning" : "positive");
    setMetricCardValue("scoutingTopProspectCard", featured ? featured.player : "-", featured ? "accent" : null);
    renderScoutingSpotlight(featured, latestReport);
  }
}

export function renderScoutingSpotlight(featured = null, latestReport = null) {
  const spotlight = document.getElementById("scoutingSpotlight");
  if (!spotlight) return;
  const teamId = state.dashboard?.controlledTeamId || null;
  const team = teamByCode(teamId) || null;
  const scouting = state.scouting || {};
  const fitText = featured?.fitLabel ? `${featured.fitLabel} (${featured.schemeFit ?? "-"})` : "No fit read yet";
  const reportText = latestReport
    ? `${latestReport.player} ${latestReport.delta >= 0 ? "+" : ""}${latestReport.delta || 0} OVR | ${latestReport.confidence ?? 0}% confidence`
    : "No weekly report yet";

  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">${escapeHtml(team?.name || teamId || "Scouting")}</div>
      <div class="overview-team-meta">
        ${escapeHtml(team?.abbrev || teamId || "-")} | ${escapeHtml(scouting.locked ? "Board locked for draft prep" : "Board open for weekly allocation")}
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Top Board Target</strong>
        <div>${escapeHtml(featured ? `${featured.player} (${featured.pos})` : "No target selected")}</div>
        <div class="small">${escapeHtml(featured ? `Projected Round ${featured.projectedRound || "-"} | ${fitText}` : "Build a board to surface your best team-fit targets.")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Weekly Read</strong>
        <div>${escapeHtml(reportText)}</div>
        <div class="small">${escapeHtml(featured ? `Combine ${featured.combine40 || "-"} | Scout OVR ${featured.scoutedOverall ?? "-"}` : "Scouting reports update after spending points or advancing weeks.")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Room Pressure</strong>
        <div>${escapeHtml(`${Math.max(0, 20 - state.scoutingBoardDraft.length)} slots left`)}</div>
        <div class="small">${escapeHtml(`${scouting.points || 0} weekly points | ${scouting.locked ? "Locked board" : "Board can still move"}`)}</div>
      </div>
    </div>
  `;

  renderPulseChips(
    "scoutingPulseBar",
    [
      featured?.fitLabel ? `Fit ${featured.fitLabel}` : null,
      featured?.confidence != null ? `Confidence ${featured.confidence}%` : null,
      latestReport ? `Latest delta ${latestReport.delta >= 0 ? "+" : ""}${latestReport.delta || 0}` : null,
      scouting.locked ? "Board locked" : "Board open",
      `${Math.max(0, 20 - state.scoutingBoardDraft.length)} slots left`
    ],
    "Scouting signals will appear here"
  );
}

export function renderCombineResults() {
  const table = document.getElementById("combineResultsTable");
  if (!table) return;
  const results = state.dashboard?.combineResults || [];
  if (!results.length) {
    table.innerHTML = `<div class="narrative-empty">No combine data. Run the combine above.</div>`;
    return;
  }
  const sorted = [...results].sort((a, b) => (b.grade || 0) - (a.grade || 0));
  table.innerHTML = `<table class="data-table"><thead><tr>
    <th>Name</th><th>Pos</th><th>OVR</th><th>Grade</th><th>Tier</th>
  </tr></thead><tbody>` +
  sorted.map((p) => {
    const g = p.grade ?? 0;
    const cls = g >= 78 ? "combine-grade-elite" : g >= 65 ? "combine-grade-good" : g >= 50 ? "combine-grade-avg" : "combine-grade-poor";
    const tier = g >= 78 ? "Elite" : g >= 65 ? "Good" : g >= 50 ? "Average" : "Poor";
    return `<tr>
      <td>${escapeHtml(p.name || p.id || "")}</td>
      <td>${escapeHtml(p.pos || "")}</td>
      <td>${escapeHtml(String(p.overall ?? "—"))}</td>
      <td class="${cls}">${escapeHtml(String(p.grade ?? "—"))}</td>
      <td class="${cls}">${tier}</td>
    </tr>`;
  }).join("") + `</tbody></table>`;
}

export function pickAnalystLine(seed) {
  const idx = Math.abs(seed || Date.now()) % DRAFT_ANALYST_LINES.length;
  return DRAFT_ANALYST_LINES[idx];
}

export function showDraftPickReveal(prospect, teamName, onConfirm) {
  const modal = document.getElementById("draftPickRevealModal");
  if (!modal) { onConfirm(); return; }
  const body = modal.querySelector(".draft-reveal-body");
  if (body) {
    const analyst = pickAnalystLine(
      (prospect?.name?.charCodeAt(0) || 0) + (prospect?.overall || 0)
    );
    body.innerHTML = `
      <div class="draft-reveal-clock">⏱ On the clock: <strong>${escapeHtml(teamName || "Your Team")}</strong></div>
      <div class="draft-reveal-pick">
        <div class="dr-pos-badge">${escapeHtml(prospect?.position || prospect?.pos || "?")}</div>
        <div class="dr-name">${escapeHtml(prospect?.name || "Unknown")}</div>
        <div class="dr-ovr">OVR ${prospect?.overall ?? "—"}</div>
      </div>
      <div class="draft-reveal-analyst">"${escapeHtml(analyst)}"</div>
      <button class="dr-confirm-btn btn-primary">Confirm Pick</button>
    `;
    body.querySelector(".dr-confirm-btn")?.addEventListener("click", () => {
      modal.hidden = true;
      modal.classList.remove("active");
      onConfirm();
    }, { once: true });
  }
  modal.hidden = false;
  modal.classList.add("active");
}
