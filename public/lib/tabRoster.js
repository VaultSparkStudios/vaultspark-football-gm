import { state, api } from "./appState.js";
import { decoratePlayerColumnFromRows, escapeHtml, fmtMoney, renderTable } from "./appCore.js";

export function renderRoster() {
  const rows = state.roster.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    morale: player.morale,
    slot: player.rosterSlot,
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
    const isSelected = player.id === state.selectedDesignationPlayerId;
    const actions = [
      `<button data-designation-select="${escapeHtml(player.id)}">${isSelected ? "Selected" : "Select"}</button>`,
      `<button data-act="release" data-id="${escapeHtml(player.id)}" class="warn">Release</button>`
    ];
    if (player.slot === "active") actions.push(`<button data-act="ps" data-id="${escapeHtml(player.id)}">To PS</button>`);
    if (player.slot === "practice") actions.push(`<button data-act="active" data-id="${escapeHtml(player.id)}">To Active</button>`);
    tr[i].lastElementChild.innerHTML = actions.join(" ");
  }
  decoratePlayerColumnFromRows("rosterTable", rows, { idKeys: ["id"] });
}

export function renderFreeAgency() {
  const rows = state.freeAgents.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    dev: player.devTrait,
    source: player.source,
    action: ""
  }));
  renderTable("faTable", rows);

  const table = document.getElementById("faTable");
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const row = rows[i - 1];
    tr[i].lastElementChild.innerHTML =
      row.source === "waiver"
        ? `<button data-act="claim" data-id="${escapeHtml(row.id)}">Claim</button>`
        : `<button data-act="sign" data-id="${escapeHtml(row.id)}">Sign</button> <button data-act="offer" data-id="${escapeHtml(row.id)}">Offer</button>`;
  }

  const waiverRows = (state.dashboard?.waiverWire || []).map((entry) => ({
    playerId: entry.playerId,
    releasedBy: entry.releasedBy,
    week: entry.week,
    expires: entry.expiresWeek
  }));
  renderTable("waiverTable", waiverRows);
  decoratePlayerColumnFromRows("faTable", rows, { idKeys: ["id"] });
}

export function renderRetiredPool() {
  const rows = (state.retiredPool || []).map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    retiredYear: player.retiredYear,
    maxAge: player.maxAge,
    seasons: player.seasonsPlayed,
    eligible: player.canOverride ? "Yes" : "No",
    action: ""
  }));
  renderTable("retiredTable", rows);
  const table = document.getElementById("retiredTable");
  table?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    if (!row) return;
    const cell = tr.lastElementChild;
    if (!cell) return;
    const isSelected = row.id === state.selectedRetirementOverridePlayerId;
    cell.innerHTML = row.eligible === "Yes"
      ? `<button data-retired-override-id="${escapeHtml(row.id)}">${isSelected ? "Selected" : "Select"}</button>`
      : "";
  });
  decoratePlayerColumnFromRows("retiredTable", rows, { idKeys: ["id"] });
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
    <tr>
      <th>Rank</th>
      <th>Role</th>
      <th>Player</th>
      <th>Pos</th>
      <th>OVR</th>
      <th>Mode</th>
      <th>Snap Share</th>
      <th>Default</th>
      <th>Move</th>
    </tr>
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
            <td>${Number.isFinite(manualShare) ? "Manual" : "Auto"}</td>
            <td>
              <div class="depth-share-cell">
                <input
                  class="depth-share-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value="${escapeHtml(Math.round(effectiveShare * 100))}"
                  data-depth-share-input="${escapeHtml(playerId)}"
                />
                <span class="small">%</span>
                <button data-depth-share-reset="${escapeHtml(playerId)}">Auto</button>
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
    ? `Adjusting ${position} for ${document.getElementById("depthTeamSelect")?.value || state.dashboard?.controlledTeamId || "BUF"}`
    : "No players loaded for this position";
}

export function moveIdWithinList(list, playerId, delta) {
  const index = list.indexOf(playerId);
  if (index < 0) return list;
  const nextIndex = Math.max(0, Math.min(list.length - 1, index + delta));
  if (nextIndex === index) return list;
  const next = [...list];
  const [row] = next.splice(index, 1);
  next.splice(nextIndex, 0, row);
  return next;
}

export async function renderVeteranMentorshipPanel() {
  const el = document.getElementById("mentorshipPanel");
  if (!el) return;
  try {
    const data = await api("/api/mentorship");
    const pairs = data.pairs || [];
    if (!pairs.length) {
      el.innerHTML = `<div class="narrative-empty">No active mentorship pairings on this roster. Veteran players (5+ seasons, OVR 75+) will mentor eligible young players during the offseason.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="mentorship-list">
        ${pairs.map((p) => `
          <div class="mentorship-pair">
            <div class="mp-mentor">
              <span class="mp-pos-chip">${escapeHtml(p.position || "?")}</span>
              <span class="mp-name">${escapeHtml(p.mentorName)}</span>
              <span class="mp-ovr muted">OVR ${p.mentorOvr}</span>
            </div>
            <div class="mp-arrow">→</div>
            <div class="mp-mentee">
              <span class="mp-name">${escapeHtml(p.menteeName)}</span>
              <span class="mp-age muted">Age ${p.menteeAge}</span>
            </div>
            <div class="mp-bonus">+${p.projectedBonus} OVR next offseason</div>
          </div>`).join("")}
      </div>
      <div class="mentorship-note small muted">Mentorship bonuses apply during training camp each offseason.</div>
    `;
  } catch {
    // non-critical
  }
}
