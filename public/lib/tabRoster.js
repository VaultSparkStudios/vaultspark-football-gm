import { state, api } from "./appState.js";
import { decoratePlayerColumnFromRows, escapeHtml, fmtMoney, renderTable } from "./appCore.js";

const elevationGameLabel = game => game.seasonType === 'regular' ? `${game.year} Week ${game.week}` : `${game.year} ${game.round.replaceAll('-', ' ')}`;

export function clearStandardElevationPreview() {
  state.elevationPreview = null;
  document.getElementById('standardElevationCard')?.setAttribute('hidden', '');
}

export function getSelectedDesignationPlayer() {
  return state.roster.find((player) => player.id === state.selectedDesignationPlayerId) || null;
}

export function setSelectedDesignationPlayer(playerId) {
  const previousId = state.selectedDesignationPlayerId;
  if (previousId !== playerId) clearStandardElevationPreview();
  state.selectedDesignationPlayerId = playerId || null;
  const player = getSelectedDesignationPlayer();
  if (!player) state.selectedDesignationPlayerId = null;
  const label = document.getElementById("designationSelectedPlayerText");
  if (label) label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  const applyBtn = document.getElementById("applyDesignationBtn");
  const reserve = player?.reserveStatus;
  if (applyBtn) applyBtn.disabled = !player || player.rosterSlot === 'reserve';
  const clearBtn = document.getElementById("clearDesignationBtn");
  if (clearBtn) {
    clearBtn.textContent = reserve?.kind === 'ps-injured' ? 'Return to Practice Squad' : reserve ? 'Activate from Reserve' : 'Clear Designation';
    clearBtn.disabled = !player || (player.rosterSlot === 'reserve' && !reserve?.activation.ok);
  }
  const practiceBtn = document.getElementById('beginReservePracticeBtn');
  if (practiceBtn) practiceBtn.disabled = !reserve?.practice.ok || reserve.practiceStartedWeek !== null;
  const type = document.getElementById('designationType');
  if (type) {
    type.disabled = player?.rosterSlot === 'reserve';
    if (reserve) type.value = reserve.kind;
    else if (previousId !== playerId) {
      if (player?.rosterSlot === 'practice') type.value = 'ps-injured';
      else if (type.value === 'ps-injured') type.value = 'ir';
    }
    for (const option of type.options) option.disabled = !reserve && (option.value === 'ps-injured'
      ? player?.rosterSlot !== 'practice' : player?.rosterSlot === 'practice' && ['ir','pup','nfi'].includes(option.value));
  }
  const returnOption = document.getElementById('reserveReturnEligible');
  if (returnOption) {
    returnOption.disabled = !player || player.rosterSlot === 'reserve';
    if (reserve) returnOption.checked = reserve.returnEligible;
    else if (previousId !== playerId) returnOption.checked = true;
    returnOption.closest('label').hidden = type?.value === 'gameDayInactive';
  }
  const guidance = document.getElementById('reserveDesignationGuidance');
  if (!guidance) return;
  const copy = guidance.dataset;
  const practiceReserve = reserve?.kind === 'ps-injured';
  const reasons = reserve ? [...new Set([reserve.activation.ok ? practiceReserve
    ? copy.practiceReady : copy.activeReady : reserve.activation.error,
    reserve.practiceStartedWeek === null && !reserve.practice.ok ? reserve.practice.error : null].filter(Boolean))].join(' ') : '';
  if (guidance) guidance.textContent = reserve
    ? `${practiceReserve ? 'Practice Squad/Injured' : reserve.kind.toUpperCase()}: ${reserve.gamesMissed} of 4 team games missed for return. ${reserve.returnEligible ? 'Eligible for a return.' : 'Season-ending placement.'} ${reserve.practiceStartedWeek === null ? 'Return practice has not begun.' : `Practice window: week ${reserve.practiceStartedWeek} through ${reserve.practiceWindowEndWeek}.`} ${reasons} ${practiceReserve ? copy.practicePay : 'Salary remains charged.'}`
    : player?.rosterSlot === 'reserve' ? copy.legacy
      : player?.rosterSlot === 'practice'
        ? copy.practicePlacement : copy.activePlacement;
}

export function renderRoster() {
  const rows = state.roster.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    pot: player.potential,
    dev: player.devTrait ?? "-",
    fit: player.schemeFit ?? "-",
    morale: player.morale,
    slot: player.standardElevation?.pending ? `practice · Elevated for ${elevationGameLabel(player.standardElevation.pending.game)}` : player.reserveStatus?.kind === 'ps-injured' ? 'practice/injured' : player.rosterSlot,
    designations: Object.entries(player.designations || {})
      .filter(([, value]) => value === true)
      .map(([name]) => name)
      .join(","),
    injury: player.injury ? `${player.injury.type} (${player.injury.weeksRemaining})` : "",
    suspension: player.suspensionWeeks || 0,
    capHit: fmtMoney(player.contract?.capHit || 0),
    action: ""
  }));

  renderTable("rosterTable", rows);

  const table = document.getElementById("rosterTable");
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const player = rows[i - 1];
    const source = state.roster[i - 1], pending = Boolean(source.standardElevation?.pending);
    const isSelected = player.id === state.selectedDesignationPlayerId;
    const id = escapeHtml(player.id);
    const move = (act, label) => `<button data-act="${act}" data-id="${id}" ${pending ? 'disabled' : ''} ${act === 'release' ? 'class="warn"' : ''}>${label}</button>`;
    const actions = [`<button data-designation-select="${id}">${isSelected ? 'Selected' : 'Select'}</button>`, move('release', 'Release')];
    if (source.rosterSlot === 'practice') actions.push(move('active', 'To Active'), move('elevate', pending ? 'Elevation pending' : 'Elevate for Game'));
    tr[i].lastElementChild.innerHTML = actions.join(" ");
  }
  decoratePlayerColumnFromRows("rosterTable", rows, { idKeys: ["id"] });

  renderTable("rosterWindowTable", (state.rosterWindow?.groups || []).map((group) => ({
    room: group.room,
    window: group.window,
    ovr: group.meanOverall,
    pot: group.meanPotential,
    age: group.meanAge,
    nextYear: `${group.projectedDelta >= 0 ? "+" : ""}${group.projectedDelta}`,
    ageMix: `${group.developing}D / ${group.prime}P / ${group.veteran}V`,
    expiring: group.expiring,
    standardBearer: group.standardBearer,
    priority: group.priority
  })));
  const windowSummary = document.getElementById("rosterWindowSummary");
  if (windowSummary) {
    const ascending = state.rosterWindow?.ascendingRooms || [];
    const aging = state.rosterWindow?.agingRooms || [];
    windowSummary.textContent = `Rising: ${ascending.join(", ") || "none"} · Succession watch: ${aging.join(", ") || "none"}`;
  }
}

export function depthManualShareMap(position) {
  return state.depthManualShares?.[position] || {};
}

export function depthDefaultShares(position) {
  return state.depthDefaultShares?.[position] || [];
}

export function formatDepthSharePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${Math.round(numeric * 100)}%`;
}

export function roundDepthShare(value) {
  return Number(Math.max(0, Math.min(1, value || 0)).toFixed(3));
}

export function totalDepthShares(values = []) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function resolveDepthShareValues(ids, defaults, manualShares) {
  const baseShares = ids.map((_, index) => roundDepthShare(defaults[index] ?? 0.02));
  const targetTotal = Number(totalDepthShares(baseShares).toFixed(3));
  const manualIndexes = [];
  const shares = baseShares.slice();

  for (const [index, playerId] of ids.entries()) {
    const manualShare = Number(manualShares?.[playerId]);
    if (!Number.isFinite(manualShare)) continue;
    manualIndexes.push(index);
    shares[index] = roundDepthShare(manualShare);
  }

  if (!manualIndexes.length) return baseShares;

  let manualTotal = totalDepthShares(manualIndexes.map((index) => shares[index]));
  if (manualTotal > targetTotal && manualTotal > 0) {
    const scale = targetTotal / manualTotal;
    for (const index of manualIndexes) shares[index] = roundDepthShare(shares[index] * scale);
    manualTotal = totalDepthShares(manualIndexes.map((index) => shares[index]));
  }

  const autoIndexes = ids.map((_, index) => index).filter((index) => !manualIndexes.includes(index));
  const autoTarget = Math.max(0, Number((targetTotal - manualTotal).toFixed(3)));
  if (autoIndexes.length) {
    const autoBaseTotal = totalDepthShares(autoIndexes.map((index) => baseShares[index]));
    const autoFallback = autoIndexes.length ? autoTarget / autoIndexes.length : 0;
    for (const index of autoIndexes) {
      shares[index] =
        autoBaseTotal > 0
          ? roundDepthShare(baseShares[index] * (autoTarget / autoBaseTotal))
          : roundDepthShare(autoFallback);
    }
  }

  if (totalDepthShares(shares) <= 0.001) return baseShares;

  const rounded = shares.map((value) => roundDepthShare(value));
  const delta = Number((targetTotal - totalDepthShares(rounded)).toFixed(3));
  if (Math.abs(delta) >= 0.001) {
    const adjustmentIndex = [...autoIndexes, ...manualIndexes].reverse().find((index) => rounded[index] + delta >= 0);
    if (Number.isInteger(adjustmentIndex)) rounded[adjustmentIndex] = roundDepthShare(rounded[adjustmentIndex] + delta);
  }
  return rounded;
}

export function updateDepthShare(position, playerId, rawValue) {
  if (!state.depthManualShares[position]) state.depthManualShares[position] = {};
  const defaultShare = depthDefaultShares(position)[state.depthOrder.indexOf(playerId)] ?? 0.02;
  if (rawValue == null || rawValue === "") {
    delete state.depthManualShares[position][playerId];
    return;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return;
  const normalized = Math.max(0, Math.min(100, parsed)) / 100;
  if (Math.abs(normalized - defaultShare) < 0.001) {
    delete state.depthManualShares[position][playerId];
    return;
  }
  state.depthManualShares[position][playerId] = Number(normalized.toFixed(3));
}

export function renderDepthChart() {
  const position = document.getElementById("depthPositionSelect")?.value;
  const exclusiveRole = ["QB", "K", "P"].includes(position);
  const ids = state.depthOrder?.length ? state.depthOrder : state.depthChart?.[position] || [];
  const shareRows = state.depthSnapShare?.[position] || [];
  const rosterById = new Map(state.depthRoster.map((player) => [player.id, player]));
  const defaults = depthDefaultShares(position);
  const manualShares = depthManualShareMap(position);
  const resolvedShares = resolveDepthShareValues(ids, defaults, manualShares);
  const table = document.getElementById("depthTable");
  if (!table) return;
  if (!ids.length) {
    table.innerHTML = "<tr><td>No players loaded for this position</td></tr>";
    document.getElementById("depthStatusText").textContent = "No players loaded for this position";
    return;
  }
  table.innerHTML = `
  <tr>${['Rank', 'Role', 'Player', 'Pos', 'OVR', 'POT', 'Merit', 'Available', 'Mode', 'Snap Share', 'Default', 'Move'].map(label => `<th>${label}</th>`).join('')}</tr>
  ${ids
  .map((playerId, index) => {
  const player = rosterById.get(playerId);
  const defaultShare = defaults[index] ?? shareRows[index]?.defaultSnapShare ?? shareRows[index]?.snapShare ?? 0.02;
  const manualShare = manualShares[playerId];
  const effectiveShare = resolvedShares[index] ?? shareRows[index]?.snapShare ?? defaultShare;
  return `
  <tr>
  <td>${index + 1}</td>
  <td>${escapeHtml(shareRows[index]?.role || `${position}${index + 1}`)}</td>
  <td><button class="link-btn" data-player-id="${escapeHtml(playerId)}">${escapeHtml(player?.name || "Unknown")}</button></td>
  <td>${escapeHtml(player?.pos || position)}</td>
  <td>${escapeHtml(player?.overall ?? "")}</td>
  <td>${escapeHtml(player?.potential ?? shareRows[index]?.potential ?? "")}</td>
  <td>${escapeHtml(shareRows[index]?.meritScore ?? "-")}</td>
  <td>${shareRows[index]?.available === false ? "Out" : "Ready"}</td>
  <td>${exclusiveRole ? "Auto locked" : Number.isFinite(manualShare) ? "Manual" : "Auto"}</td>
  <td>
  <div class="depth-share-cell">
  <input class="depth-share-input" type="number" min="0" max="100" step="1"
  value="${escapeHtml(Math.round(effectiveShare * 100))}" data-depth-share-input="${escapeHtml(playerId)}" ${exclusiveRole ? "disabled" : ""} />
  <span class="small">%</span>
  <button data-depth-share-reset="${escapeHtml(playerId)}" ${exclusiveRole ? "disabled" : ""}>Auto</button>
  </div>
  </td>
  <td>${escapeHtml(formatDepthSharePercent(defaultShare))}</td>
  <td>
  <div class="depth-action-group">
  <button data-depth-move="up" data-depth-player-id="${escapeHtml(playerId)}" ${index === 0 ? "disabled" : ""}>Up</button>
  <button data-depth-move="down" data-depth-player-id="${escapeHtml(playerId)}" ${index === ids.length - 1 ? "disabled" : ""}>Down</button>
  </div>
  </td>
  </tr>`;
  })
  .join("")}
  `;
  document.getElementById("depthStatusText").textContent = ids.length
    ? exclusiveRole
      ? `${position} is availability-locked: the healthy ${position}1 receives 100%, and the next ready player inherits the role during injury.`
      : `Adjusting ${position} for ${document.getElementById("depthTeamSelect")?.value || state.dashboard?.controlledTeamId || "BUF"} · auto shares blend OVR, POT, fit, and morale.`
    : "No players loaded for this position";
}

export async function renderVeteranMentorshipPanel() {
  const mentorship = await import("./mentorshipPanel.js");
  return mentorship.renderVeteranMentorshipPanel();
}

export async function assignMentorshipFromPanel() {
  const mentorship = await import("./mentorshipPanel.js");
  return mentorship.assignMentorshipFromPanel();
}

export async function clearMentorshipFromPanel(assignmentId) {
  const mentorship = await import("./mentorshipPanel.js");
  return mentorship.clearMentorshipFromPanel(assignmentId);
}
