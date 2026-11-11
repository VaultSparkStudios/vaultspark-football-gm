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

// The depth chart lives in its own module, loaded the first time it is shown,
// so the roster screen stays inside its size budget.
export function renderDepthChart() {
  return import("./depthBoard.js")
    .then((board) => board.renderDepthBoard())
    .catch((error) => {
      const status = document.getElementById("depthStatusText");
      if (status) status.textContent = "The depth chart could not load. Reload the page to try again.";
      throw error;
    });
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
