// The depth chart: rows you drag, the numbers you need on every row, and saving
// as you go. Loaded on first use (see renderDepthChart in tabRoster.js).
import { state, api } from "./appState.js";
import { escapeHtml, fmtMoney, formatActionError, formatHeight } from "./appCore.js";
import { loadDepthChart } from "./gameFlow.js";
import { bindDepthReorder } from "./depthReorder.js";

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

const DEPTH_CATEGORY_COLUMNS = [["athleticism", "ATH", "Athleticism"], ["technique", "TEC", "Technique"], ["footballIq", "IQ", "Football IQ"], ["instincts", "INS", "Instincts"]];

function depthRatingTier(value) {
  return value >= 85 ? "elite" : value >= 75 ? "good" : value >= 65 ? "fair" : "low";
}

function depthRatingCell(value, label) {
  if (!Number.isFinite(value)) return `<td class="depth-num">–</td>`;
  return `<td class="depth-num" data-label="${label}"><span class="depth-rating depth-rating--${depthRatingTier(value)}">${value}</span></td>`;
}

function depthStatus(player, row) {
  if (player?.injury?.weeksRemaining > 0) {
    const weeks = player.injury.weeksRemaining;
    return { out: true, text: `Injured · ${weeks} wk${weeks === 1 ? "" : "s"}` };
  }
  if (player?.suspensionWeeks > 0) return { out: true, text: `Suspended · ${player.suspensionWeeks} wk` };
  const designation = player?.designations || {};
  if (designation.ir) return { out: true, text: "Injured reserve" };
  if (designation.pup) return { out: true, text: "PUP list" };
  if (designation.nfi) return { out: true, text: "NFI list" };
  if (designation.gameDayInactive) return { out: true, text: "Inactive" };
  if (player?.rosterSlot === "practice") return { out: true, text: "Practice squad" };
  return row?.available === false ? { out: true, text: "Out" } : { out: false, text: "Ready" };
}

function depthPlayerMeta(player) {
  if (!player) return "";
  const years = Number(player.experience) || 0;
  return [
    Number.isFinite(player.age) ? `Age ${player.age}` : "",
    years ? `Yr ${years + 1}` : "Rookie",
    player.heightInches ? formatHeight(player.heightInches) : "",
    player.weightLbs ? `${player.weightLbs} lb` : ""
  ].filter(Boolean).join(" · ");
}

export function renderDepthBoard() {
  const position = document.getElementById("depthPositionSelect")?.value;
  const exclusiveRole = ["QB", "K", "P"].includes(position);
  const ids = state.depthOrder?.length ? state.depthOrder : state.depthChart?.[position] || [];
  const shareRows = state.depthSnapShare?.[position] || [];
  const shareRowById = new Map(shareRows.map((row) => [row.playerId, row]));
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
  bindDepthBoard(table);
  const headers = ["", "#", "Player", "OVR", "POT", ...DEPTH_CATEGORY_COLUMNS.map(([, short, label]) => `<abbr title="${label}">${short}</abbr>`), "Best at", "Status", "Contract", "Snap share"];
  table.classList.add("depth-board");
  table.innerHTML = `
  <tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr>
  ${ids
  .map((playerId, index) => {
  const player = rosterById.get(playerId);
  const shareRow = shareRowById.get(playerId) || shareRows[index];
  const name = player?.name || shareRow?.player || "Unknown";
  const defaultShare = defaults[index] ?? shareRows[index]?.defaultSnapShare ?? shareRows[index]?.snapShare ?? 0.02;
  const manualShare = manualShares[playerId];
  const effectiveShare = resolvedShares[index] ?? shareRows[index]?.snapShare ?? defaultShare;
  const categories = player?.attributes?.categories || {};
  const abilities = player?.attributes?.topAbilities || [];
  const status = depthStatus(player, shareRow);
  const contract = player?.contract;
  const id = escapeHtml(playerId);
  return `
  <tr data-depth-row="${id}" class="${status.out ? "depth-row--out" : ""}">
  <td class="depth-grip-cell">
  <div class="depth-action-group">
  <button type="button" class="depth-grip" data-depth-grip="${id}" aria-label="Move ${escapeHtml(name)}. Drag, or press the up and down arrow keys." title="Drag to reorder">⠿</button>
  <span class="depth-steps">
  <button type="button" class="depth-step" data-depth-move="up" data-depth-player-id="${id}" aria-label="Move ${escapeHtml(name)} up" ${index === 0 ? "disabled" : ""}>▲</button>
  <button type="button" class="depth-step" data-depth-move="down" data-depth-player-id="${id}" aria-label="Move ${escapeHtml(name)} down" ${index === ids.length - 1 ? "disabled" : ""}>▼</button>
  </span>
  </div>
  </td>
  <td class="depth-num" data-label="Rank"><strong>${index + 1}</strong><span class="depth-role">${escapeHtml(shareRows[index]?.role || `${position}${index + 1}`)}</span></td>
  <td class="depth-player-cell" data-depth-player-name>
  <button class="link-btn" data-player-id="${id}">${escapeHtml(name)}</button>
  <span class="depth-meta">${escapeHtml(depthPlayerMeta(player))}</span>
  </td>
  ${depthRatingCell(player?.overall, "OVR")}
  ${depthRatingCell(player?.potential ?? shareRow?.potential, "POT")}
  ${DEPTH_CATEGORY_COLUMNS.map(([key, short]) => depthRatingCell(categories[key], short)).join("")}
  <td class="depth-abilities" data-label="Best at">${abilities.map((ability) => `<span class="depth-ability" title="${escapeHtml(ability.label)} ${ability.value}">${escapeHtml(ability.label)} <b>${ability.value}</b></span>`).join("") || "–"}</td>
  <td data-label="Status"><span class="depth-status ${status.out ? "depth-status--out" : ""}">${escapeHtml(status.text)}</span></td>
  <td data-label="Contract">${contract?.yearsRemaining ? `${contract.yearsRemaining} yr · ${escapeHtml(fmtMoney(contract.capHit || contract.salary || 0))}` : "–"}</td>
  <td data-label="Snap share">
  <div class="depth-share-cell">
  <input class="depth-share-input" type="number" min="0" max="100" step="1" aria-label="Snap share for ${escapeHtml(name)}"
  value="${escapeHtml(Math.round(effectiveShare * 100))}" data-depth-share-input="${id}" ${exclusiveRole ? "disabled" : ""} />
  <span class="small">%</span>
  <button data-depth-share-reset="${id}" title="Use the automatic share (${escapeHtml(formatDepthSharePercent(defaultShare))})" ${exclusiveRole || !Number.isFinite(manualShare) ? "disabled" : ""}>Auto</button>
  </div>
  </td>
  </tr>`;
  })
  .join("")}
  `;
  // A reload after saving re-renders on a later tick (the chart is loaded on
  // demand), so the save confirmation is handed to the render that follows it.
  document.getElementById("depthStatusText").textContent = statusAfterReload || (exclusiveRole
    ? `The healthy ${position}1 plays every snap. The next ready player steps in if he is hurt.`
    : `Drag a row to reorder. Snap shares set themselves from the order unless you type one.`);
  statusAfterReload = null;
}

let statusAfterReload = null;

function depthSelection() {
  return {
    teamId: document.getElementById("depthTeamSelect").value,
    position: document.getElementById("depthPositionSelect").value
  };
}

function setDepthStatus(text) {
  const status = document.getElementById("depthStatusText");
  if (status) status.textContent = text;
}

// Snap shares typed since the last save started. A reload replaces the chart
// from the saved league, so anything typed while one is in flight is put back
// afterwards instead of being lost.
const pendingShares = new Map();

function restorePendingShares() {
  if (!pendingShares.size) return false;
  const { position } = depthSelection();
  for (const [playerId, value] of pendingShares) updateDepthShare(position, playerId, value);
  renderDepthBoard();
  queueDepthAutosave();
  return true;
}

function postDepthChart({ teamId, position }) {
  // Everything typed so far is in this payload.
  pendingShares.clear();
  return api("/api/depth-chart", {
    method: "POST",
    body: {
      teamId,
      position,
      playerIds: state.depthOrder,
      snapShares: state.depthOrder.reduce((acc, playerId) => {
        const manualShare = state.depthManualShares?.[position]?.[playerId];
        if (Number.isFinite(manualShare)) acc[playerId] = manualShare;
        return acc;
      }, {})
    }
  });
}

let autosaveTimer = null;
let autosaveRun = 0;

function notifySaved() {
  document.getElementById("depthTable")?.dispatchEvent(new CustomEvent("depth-saved"));
}

/** The explicit Save button: works for any club the player may edit. */
export async function saveDepthBoard() {
  clearTimeout(autosaveTimer);
  queuedSelection = null;
  autosaveRun += 1;
  await postDepthChart(depthSelection());
  await loadDepthChart();
  restorePendingShares();
  notifySaved();
}

// Only the club you run saves on its own. Looking at a rival's chart never
// writes anything; the Save button stays the explicit path everywhere.
// The club and position a queued save belongs to, or null when none is queued.
let queuedSelection = null;

// Leaving the chart (another position, another club, a manual reload) must not
// drop a change that is still waiting to save. Send it now, for the group it
// was made in, and let the navigation carry on.
function flushDepthAutosave() {
  if (!queuedSelection) return;
  const selection = queuedSelection;
  queuedSelection = null;
  clearTimeout(autosaveTimer);
  autosaveRun += 1;
  postDepthChart(selection)
    .then(notifySaved)
    .catch((error) => setDepthStatus(`Depth chart not saved: ${formatActionError(error)}`));
}

function queueDepthAutosave() {
  const selection = depthSelection();
  if (selection.teamId !== state.dashboard?.controlledTeamId) return;
  clearTimeout(autosaveTimer);
  const run = ++autosaveRun;
  queuedSelection = selection;
  autosaveTimer = setTimeout(async () => {
    queuedSelection = null;
    try {
      await postDepthChart(selection);
      if (run !== autosaveRun) return;
      const current = depthSelection();
      if (current.teamId !== selection.teamId || current.position !== selection.position) return;
      if (document.activeElement?.matches?.("input[data-depth-share-input]")) {
        setDepthStatus("Depth chart saved.");
        notifySaved();
        return;
      }
      statusAfterReload = "Depth chart saved.";
      await loadDepthChart();
      restorePendingShares();
      notifySaved();
    } catch (error) {
      setDepthStatus(`Depth chart not saved: ${formatActionError(error)}`);
    }
  }, 700);
}

function moveWithinList(ids, id, delta) {
  const next = [...ids];
  const from = next.indexOf(id);
  if (from < 0) return next;
  const to = Math.max(0, Math.min(next.length - 1, from + delta));
  if (to === from) return next;
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

function applyDepthOrder(ids, { focusId = null, announce = null } = {}) {
  const table = document.getElementById("depthTable");
  const undo = document.getElementById("depthUndoBtn");
  if (ids.join("|") === state.depthOrder.join("|")) {
    renderDepthBoard();
    return;
  }
  state.depthUndoOrder = [...state.depthOrder];
  state.depthOrder = ids;
  renderDepthBoard();
  if (undo) undo.hidden = false;
  if (focusId) table?.querySelector(`[data-depth-grip="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
  if (announce) setDepthStatus(announce);
  queueDepthAutosave();
}

function announceMove(playerId) {
  const { position } = depthSelection();
  const name = state.depthRoster.find((player) => player.id === playerId)?.name || "Player";
  setDepthStatus(`${name} is now ${position}${state.depthOrder.indexOf(playerId) + 1}.`);
}

function stepDepthPlayer(playerId, delta) {
  applyDepthOrder(moveWithinList(state.depthOrder, playerId, delta), { focusId: playerId });
  announceMove(playerId);
}

function bindDepthBoard(table) {
  if (table.dataset.depthBoard) return;
  table.dataset.depthBoard = "ready";
  // Capture phase, so the pending save is sent before the handlers that load
  // the next chart run. The selects have already changed value by then, which
  // is why the queued save remembers its own club and position.
  for (const [id, type] of [["depthTeamSelect", "change"], ["depthPositionSelect", "change"], ["loadDepthBtn", "click"]]) {
    document.getElementById(id)?.addEventListener(type, flushDepthAutosave, true);
  }
  bindDepthReorder(table, {
    onReorder: (ids, movedId) => {
      applyDepthOrder(ids, { focusId: movedId });
      announceMove(movedId);
    },
    onStep: stepDepthPlayer
  });
  table.addEventListener("click", (event) => {
    const move = event.target.closest("button[data-depth-move]");
    if (move) {
      stepDepthPlayer(move.dataset.depthPlayerId, move.dataset.depthMove === "up" ? -1 : 1);
      return;
    }
    const reset = event.target.closest("button[data-depth-share-reset]");
    if (!reset) return;
    delete state.depthManualShares?.[depthSelection().position]?.[reset.dataset.depthShareReset];
    renderDepthBoard();
    queueDepthAutosave();
  });
  table.addEventListener("input", (event) => {
    const input = event.target.closest("input[data-depth-share-input]");
    if (!input) return;
    // Typing is an edit in progress. Cancel the pending save and its reload so
    // neither replaces the box under the cursor; leaving the box saves it all.
    // The order change it was waiting to save is still unsaved, so the queued
    // save stays remembered for flushing; only its timer and reload are held.
    clearTimeout(autosaveTimer);
    autosaveRun += 1;
    pendingShares.set(input.dataset.depthShareInput, input.value);
    updateDepthShare(depthSelection().position, input.dataset.depthShareInput, input.value);
  });
  table.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-depth-share-input]");
    if (!input) return;
    updateDepthShare(depthSelection().position, input.dataset.depthShareInput, input.value);
    renderDepthBoard();
    queueDepthAutosave();
  });
  document.getElementById("depthBestLineupBtn")?.addEventListener("click", () => {
    const rows = new Map((state.depthSnapShare?.[depthSelection().position] || []).map((row) => [row.playerId, row]));
    const score = (playerId) => {
      const row = rows.get(playerId);
      return (row?.available === false ? -1000 : 0) + Number(row?.meritScore || 0);
    };
    // A stable sort keeps your order between players the staff grade equally.
    applyDepthOrder([...state.depthOrder].sort((a, b) => score(b) - score(a)), {
      announce: "Best lineup set: healthy players ordered by the staff's grade."
    });
  });
  document.getElementById("depthUndoBtn")?.addEventListener("click", (event) => {
    if (!state.depthUndoOrder) return;
    applyDepthOrder(state.depthUndoOrder, { announce: "Last change undone." });
    state.depthUndoOrder = null;
    event.currentTarget.hidden = true;
  });
}
