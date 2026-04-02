import { state, api } from "./appState.js";
import { createEmptyTradeAssets, decoratePlayerColumnFromRows, escapeHtml, fmtDeltaMoney, fmtMoney, renderPulseChips, renderTable, saveTradeBlockIds, setMetricCardValue, setTradeEvalText, teamByCode, teamCode, tradeAssetKeys, uniqueIds } from "./appCore.js";
import { activateTab, loadPickAssets } from "./gameFlow.js";

export function renderExpiringContracts() {
  const expiring = state.contractTools?.expiring || [];
  const tagEligible = state.contractTools?.tagEligible || [];
  const optionEligible = state.contractTools?.optionEligible || [];

  const expiringRows = expiring.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    ovr: player.overall,
    yearsLeft: player.contract?.yearsRemaining,
    capHit: fmtMoney(player.contract?.capHit || 0),
    action: ""
  }));
  renderTable("expiringTable", expiringRows);
  document.getElementById("expiringTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = expiringRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-select="${escapeHtml(row.id)}">Select</button>`;
  });

  const tagRows = tagEligible.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    ovr: player.overall,
    currCap: fmtMoney(player.contract?.capHit || 0),
    tagCap: fmtMoney(player.projectedCapHit || 0),
    delta: fmtDeltaMoney(player.capDelta || 0),
    choose: ""
  }));
  renderTable("tagEligibleTable", tagRows);

  const tagTable = document.getElementById("tagEligibleTable");
  tagTable?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = tagRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-fill="tag" data-player-id="${escapeHtml(row.id)}">Select</button>`;
  });

  const optionRows = optionEligible.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    exp: player.experience,
    ovr: player.overall,
    currCap: fmtMoney(player.contract?.capHit || 0),
    optionCap: fmtMoney(player.projectedCapHit || 0),
    delta: fmtDeltaMoney(player.capDelta || 0),
    choose: ""
  }));
  renderTable("optionEligibleTable", optionRows);

  const optionTable = document.getElementById("optionEligibleTable");
  optionTable?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = optionRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-fill="option" data-player-id="${escapeHtml(row.id)}">Select</button>`;
  });

  decoratePlayerColumnFromRows("expiringTable", expiringRows, { idKeys: ["id"] });
  decoratePlayerColumnFromRows("tagEligibleTable", tagRows, { idKeys: ["id"] });
  decoratePlayerColumnFromRows("optionEligibleTable", optionRows, { idKeys: ["id"] });
  updateContractPreview();
}

export function lookupContractCandidate(kind, playerId = state.selectedContractPlayerId) {
  if (!playerId) return null;
  if (kind === "tag") return (state.contractTools?.tagEligible || []).find((row) => row.id === playerId) || null;
  if (kind === "option") return (state.contractTools?.optionEligible || []).find((row) => row.id === playerId) || null;
  return null;
}

export function getSelectedContractPlayer() {
  return state.contractRoster.find((player) => player.id === state.selectedContractPlayerId) || null;
}

export function setSelectedContractPlayer(playerId, { preserveInputs = false } = {}) {
  state.selectedContractPlayerId = playerId || null;
  const player = getSelectedContractPlayer();
  const label = document.getElementById("contractsSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  if (!preserveInputs) {
    const demand = state.negotiationTargets.find((entry) => entry.id === playerId)?.demand || null;
    const yearsInput = document.getElementById("contractYearsInput");
    const salaryInput = document.getElementById("contractSalaryInput");
    if (yearsInput) yearsInput.value = String(demand?.years || player?.contract?.yearsRemaining || 3);
    if (salaryInput) salaryInput.value = demand?.salary || "";
  }
  updateContractPreview();
}

export function getSelectedDesignationPlayer() {
  return state.roster.find((player) => player.id === state.selectedDesignationPlayerId) || null;
}

export function setSelectedDesignationPlayer(playerId) {
  state.selectedDesignationPlayerId = playerId || null;
  const player = getSelectedDesignationPlayer();
  if (!player) state.selectedDesignationPlayerId = null;
  const label = document.getElementById("designationSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  const applyBtn = document.getElementById("applyDesignationBtn");
  if (applyBtn) applyBtn.disabled = !player;
  const clearBtn = document.getElementById("clearDesignationBtn");
  if (clearBtn) clearBtn.disabled = !player;
}

export function getSelectedRetirementOverridePlayer() {
  return (state.retiredPool || []).find((player) => player.id === state.selectedRetirementOverridePlayerId) || null;
}

export function setSelectedRetirementOverridePlayer(playerId) {
  state.selectedRetirementOverridePlayerId = playerId || null;
  const player = getSelectedRetirementOverridePlayer();
  if (!player) state.selectedRetirementOverridePlayerId = null;
  const label = document.getElementById("retirementOverrideSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  const button = document.getElementById("retirementOverrideBtn");
  if (button) button.disabled = !player;
}

export function updateContractPreview() {
  const preview = document.getElementById("contractPreviewText");
  const player = getSelectedContractPlayer();
  const tag = lookupContractCandidate("tag");
  const option = lookupContractCandidate("option");
  const tagBtn = document.getElementById("franchiseTagBtn");
  const optionBtn = document.getElementById("fifthOptionBtn");
  const resignBtn = document.getElementById("contractsResignBtn");
  const negotiateBtn = document.getElementById("contractsNegotiateBtn");
  const restructureBtn = document.getElementById("contractsRestructureBtn");
  const tradeBtn = document.getElementById("contractsTradeBtn");
  const blockBtn = document.getElementById("contractsTradeBlockBtn");
  const capSpace = state.contractCap?.capSpace || 0;

  if (tagBtn) tagBtn.disabled = !tag;
  if (optionBtn) optionBtn.disabled = !option;
  if (resignBtn) resignBtn.disabled = !player;
  if (negotiateBtn) negotiateBtn.disabled = !player;
  if (restructureBtn) restructureBtn.disabled = !player;
  if (tradeBtn) tradeBtn.disabled = !player;
  if (blockBtn) blockBtn.disabled = !player;

  if (!preview) return;
  if (!player) {
    preview.textContent = "Select a player row to stage a contract action or queue a trade package.";
    renderContractsSpotlight();
    return;
  }

  const demand = state.negotiationTargets.find((entry) => entry.id === player.id)?.demand || null;

  if (tag) {
    const resultingCap = capSpace + (tag.contract?.capHit || 0) - (tag.projectedCapHit || 0);
    preview.textContent =
      `Tag Preview: ${tag.name} (${tag.pos}) ${fmtMoney(tag.contract?.capHit || 0)} -> ${fmtMoney(tag.projectedCapHit || 0)} (${fmtDeltaMoney(tag.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    renderContractsSpotlight();
    return;
  }

  if (option) {
    const resultingCap = capSpace + (option.contract?.capHit || 0) - (option.projectedCapHit || 0);
    preview.textContent =
      `Option Preview: ${option.name} (${option.pos}) ${fmtMoney(option.contract?.capHit || 0)} -> ${fmtMoney(option.projectedCapHit || 0)} (${fmtDeltaMoney(option.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    renderContractsSpotlight();
    return;
  }

  preview.textContent =
    `${player.name} | Salary ${fmtMoney(player.contract?.salary || 0)} | Cap ${fmtMoney(player.contract?.capHit || 0)} | Years ${player.contract?.yearsRemaining || 0}` +
    (demand ? ` | Ask ${demand.years}y / ${fmtMoney(demand.salary || 0)}` : "");
  renderContractsSpotlight();
}

export function renderContractsPage() {
  const roster = state.contractRoster || [];
  const totalSalary = roster.reduce((sum, player) => sum + Number(player.contract?.salary || 0), 0);
  const totalYears = roster.reduce((sum, player) => sum + Number(player.contract?.yearsRemaining || 0), 0);
  setMetricCardValue(
    "contractsCapSpaceCard",
    fmtMoney(state.contractCap?.capSpace || 0),
    (state.contractCap?.capSpace || 0) >= 0 ? "positive" : "negative"
  );
  setMetricCardValue("contractsActiveCapCard", fmtMoney(state.contractCap?.activeCap || 0), "accent");
  setMetricCardValue(
    "contractsDeadCapCard",
    fmtMoney(state.contractCap?.deadCapCurrentYear || 0),
    (state.contractCap?.deadCapCurrentYear || 0) > 35_000_000 ? "negative" : "warning"
  );
  setMetricCardValue("contractsAvgSalaryCard", roster.length ? fmtMoney(totalSalary / roster.length) : "$0", "accent");
  setMetricCardValue("contractsAvgYearsCard", roster.length ? (totalYears / roster.length).toFixed(1) : "0.0", "info");
  setMetricCardValue(
    "contractsTradeBlockCard",
    `${roster.filter((player) => state.tradeBlockIds.includes(player.id)).length}`,
    state.tradeBlockIds.length ? "warning" : "accent"
  );

  const demandById = new Map((state.negotiationTargets || []).map((entry) => [entry.id, entry.demand || null]));
  const rows = roster.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    morale: player.morale,
    motivation: player.motivation ?? "-",
    salary: fmtMoney(player.contract?.salary || 0),
    capHit: fmtMoney(player.contract?.capHit || 0),
    guaranteed: fmtMoney(player.contract?.guaranteed || 0),
    years: player.contract?.yearsRemaining || 0,
    ask: demandById.get(player.id) ? fmtMoney(demandById.get(player.id).salary || 0) : "-",
    block: state.tradeBlockIds.includes(player.id) ? "Yes" : "",
    action: ""
  }));
  renderTable("contractsRosterTable", rows);
  decoratePlayerColumnFromRows("contractsRosterTable", rows, { idKeys: ["id"] });
  document.getElementById("contractsRosterTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isBlocked = state.tradeBlockIds.includes(row.id);
    cell.innerHTML = [
      `<button data-contract-select="${escapeHtml(row.id)}">Select</button>`,
      `<button data-contract-action="trade" data-player-id="${escapeHtml(row.id)}">Trade</button>`,
      `<button data-contract-action="block" data-player-id="${escapeHtml(row.id)}">${isBlocked ? "Unblock" : "Block"}</button>`
    ].join(" ");
  });

  const tradeBlockRows = roster
    .filter((player) => state.tradeBlockIds.includes(player.id))
    .map((player) => ({
      id: player.id,
      player: player.name,
      pos: player.pos,
      ovr: player.overall,
      capHit: fmtMoney(player.contract?.capHit || 0),
      years: player.contract?.yearsRemaining || 0,
      action: ""
    }));
  renderTable("tradeBlockTable", tradeBlockRows);
  decoratePlayerColumnFromRows("tradeBlockTable", tradeBlockRows, { idKeys: ["id"] });
  document.getElementById("tradeBlockTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = tradeBlockRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-action="trade" data-player-id="${escapeHtml(row.id)}">Trade</button> <button data-contract-action="block" data-player-id="${escapeHtml(row.id)}">Unblock</button>`;
  });

  updateContractPreview();
  renderContractsSpotlight();
}

export function renderContractsSpotlight() {
  const spotlight = document.getElementById("contractsSpotlight");
  if (!spotlight) return;
  const teamId = state.contractTeamId || state.dashboard?.controlledTeamId || null;
  const team = teamByCode(teamId) || null;
  const selected = getSelectedContractPlayer();
  const demand = selected ? state.negotiationTargets.find((entry) => entry.id === selected.id)?.demand || null : null;
  const roster = state.contractRoster || [];
  const expiring = state.contractTools?.expiring || [];
  const cap = state.contractCap || {};
  const blockCount = roster.filter((player) => state.tradeBlockIds.includes(player.id)).length;

  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">${escapeHtml(team?.name || teamId || "Contracts")}</div>
      <div class="overview-team-meta">
        ${escapeHtml(team?.abbrev || teamId || "-")} | ${escapeHtml(selected ? `Selected ${selected.name} (${selected.pos})` : `${roster.length} players on contract board`)}
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Selected Player</strong>
        <div>${escapeHtml(selected ? `${selected.name} (${selected.pos})` : "No player selected")}</div>
        <div class="small">${escapeHtml(selected ? `Cap ${fmtMoney(selected.contract?.capHit || 0)} | ${selected.contract?.yearsRemaining || 0} years left` : "Pick a row to stage negotiations, trade, or restructure")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Negotiation Ask</strong>
        <div>${escapeHtml(demand ? `${demand.years}y / ${fmtMoney(demand.salary || 0)}` : "No active ask loaded")}</div>
        <div class="small">${escapeHtml(demand ? `Ask cap ${fmtMoney(demand.askCapHit || 0)}` : "Load negotiations or select a player with leverage")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Cap Posture</strong>
        <div>${escapeHtml(fmtMoney(cap.capSpace || 0))} space</div>
        <div class="small">${escapeHtml(`${expiring.length} expiring | ${blockCount} on trade block`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Risk Signal</strong>
        <div>${escapeHtml((cap.deadCapCurrentYear || 0) > (cap.capSpace || 0) ? "Dead cap pressure is elevated" : "Cap sheet is manageable")}</div>
        <div class="small">${escapeHtml(`Active cap ${fmtMoney(cap.activeCap || 0)} | Dead cap ${fmtMoney(cap.deadCapCurrentYear || 0)}`)}</div>
      </div>
    </div>
  `;

  renderPulseChips(
    "contractsPulseBar",
    [
      selected ? `Morale ${selected.morale ?? "-"}` : null,
      selected ? `Motivation ${selected.motivation ?? "-"}` : null,
      selected && state.tradeBlockIds.includes(selected.id) ? "Trade block active" : null,
      expiring.length ? `${expiring.length} expiring deals` : null,
      state.contractTools?.tagEligible?.length ? `${state.contractTools.tagEligible.length} tag candidates` : null,
      state.contractTools?.optionEligible?.length ? `${state.contractTools.optionEligible.length} option candidates` : null
    ],
    "Load a contract board to see cap and leverage signals"
  );
}

export function setContractActionText(text) {
  const el = document.getElementById("contractActionText");
  if (el) el.textContent = text;
}

export function toggleTradeBlockPlayer(playerId) {
  const next = state.tradeBlockIds.includes(playerId)
    ? state.tradeBlockIds.filter((id) => id !== playerId)
    : [...state.tradeBlockIds, playerId];
  saveTradeBlockIds(next);
  renderContractsPage();
}

export function getTradeTeamId(side) {
  const selectId = side === "A" ? "tradeTeamA" : "tradeTeamB";
  return document.getElementById(selectId)?.value || state.dashboard?.controlledTeamId || "BUF";
}

export function setTradeEvalCards({ fairness = null, capDeltaA = null, capDeltaB = null } = {}) {
  document.getElementById("tradeFairnessScore").textContent = fairness == null ? "-" : `${fairness.toFixed(0)} / 100`;
  document.getElementById("tradeCapDeltaA").textContent = capDeltaA == null ? "-" : fmtDeltaMoney(capDeltaA);
  document.getElementById("tradeCapDeltaB").textContent = capDeltaB == null ? "-" : fmtDeltaMoney(capDeltaB);
}

export function clearTradePackages({ keepMessage = false } = {}) {
  state.tradeAssets = createEmptyTradeAssets();
  renderTradeWorkspace();
  if (!keepMessage) {
    setTradeEvalText("Use evaluate to see cap/value impact.");
    setTradeEvalCards();
  }
}

export function getTradePlayersForSide(side) {
  const { playerKey, rosterKey } = tradeAssetKeys(side);
  const roster = state[rosterKey] || [];
  const rosterById = new Map(roster.map((player) => [player.id, player]));
  return state.tradeAssets[playerKey]
    .map((id) => rosterById.get(id))
    .filter(Boolean);
}

export function getTradePicksForSide(side) {
  const { pickKey, picksKey } = tradeAssetKeys(side);
  const picks = state[picksKey] || [];
  const picksById = new Map(picks.map((pick) => [pick.id, pick]));
  return state.tradeAssets[pickKey]
    .map((id) => picksById.get(id))
    .filter(Boolean);
}

export function setTradePackageText(side) {
  const el = document.getElementById(side === "A" ? "tradeSelectedAText" : "tradeSelectedBText");
  if (!el) return;
  const players = getTradePlayersForSide(side).map((player) => `${player.name} (${player.pos})`);
  const picks = getTradePicksForSide(side).map((pick) => `${pick.year} R${pick.round} (${teamCode(pick.originalTeamId)})`);
  const assets = [...players, ...picks];
  el.textContent = `Team ${side} Assets: ${assets.length ? assets.join(", ") : "None"}`;
}

export function toggleTradeAsset(side, type, id) {
  const { playerKey, pickKey } = tradeAssetKeys(side);
  const key = type === "pick" ? pickKey : playerKey;
  const current = state.tradeAssets[key] || [];
  state.tradeAssets[key] = current.includes(id) ? current.filter((value) => value !== id) : uniqueIds([...current, id]);
  renderTradeWorkspace();
}

export function queueTradePlayer(playerId) {
  const teamId = state.contractTeamId || state.dashboard?.controlledTeamId || "BUF";
  const previousTeamA = getTradeTeamId("A");
  document.getElementById("tradeTeamA").value = teamId;
  if (previousTeamA !== teamId) {
    clearTradePackages({ keepMessage: true });
  }
  state.tradeAssets.teamAPlayerIds = uniqueIds([...state.tradeAssets.teamAPlayerIds, playerId]);
  activateTab("transactionsTab");
  const player = state.contractRoster.find((entry) => entry.id === playerId);
  renderTradeWorkspace();
  setTradeEvalText(`${player?.name || playerId} queued for Team A. Add more assets, then evaluate or execute.`);
  void loadPickAssets();
}

export function renderTradeRosterTable(tableId, roster, side) {
  const selectedIds = new Set(side === "A" ? state.tradeAssets.teamAPlayerIds : state.tradeAssets.teamBPlayerIds);
  const rows = (roster || []).map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    capHit: fmtMoney(player.contract?.capHit || 0),
    action: ""
  }));
  renderTable(tableId, rows);
  decoratePlayerColumnFromRows(tableId, rows, { idKeys: ["id"] });
  document.getElementById(tableId)?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected = selectedIds.has(row.id);
    cell.innerHTML = `<button data-trade-roster-side="${side}" data-trade-player-id="${escapeHtml(row.id)}">${isSelected ? "Remove" : "Add"}</button>`;
  });
}

export function renderTradeWorkspace() {
  renderTradeRosterTable("tradeTeamARosterTable", state.tradeTeamARoster, "A");
  renderTradeRosterTable("tradeTeamBRosterTable", state.tradeTeamBRoster, "B");
  setTradePackageText("A");
  setTradePackageText("B");
}

export function deriveContractToolsFromRoster(roster, expiringPlayers) {
  const expiringMap = new Map((expiringPlayers || []).map((player) => [player.id, player]));
  const expiring = roster
    .filter((player) => expiringMap.has(player.id) || (player.contract?.yearsRemaining || 0) <= 1)
    .map((player) => ({
      id: player.id,
      name: player.name,
      pos: player.pos,
      overall: player.overall,
      contract: player.contract || {}
    }));

  const tagEligible = roster
    .filter((player) => (player.contract?.yearsRemaining || 0) <= 1)
    .map((player) => {
      const capHit = Number(player.contract?.capHit || 0);
      const salary = Number(player.contract?.salary || capHit);
      const projectedCapHit = Math.max(salary * 1.2, capHit * 1.35, 18_000_000);
      return {
        id: player.id,
        name: player.name,
        pos: player.pos,
        overall: player.overall,
        contract: player.contract || {},
        projectedCapHit,
        capDelta: projectedCapHit - capHit
      };
    })
    .sort((a, b) => b.overall - a.overall || a.capDelta - b.capDelta);

  const optionEligible = roster
    .filter((player) => {
      const exp = Number(player.experience || 0);
      return exp >= 3 && exp <= 5 && (player.contract?.yearsRemaining || 0) <= 2 && player.contract?.optionYear !== true;
    })
    .map((player) => {
      const capHit = Number(player.contract?.capHit || 0);
      const salary = Number(player.contract?.salary || capHit);
      const projectedCapHit = Math.max(salary * 1.15, capHit * 1.2, 7_500_000);
      return {
        id: player.id,
        name: player.name,
        pos: player.pos,
        overall: player.overall,
        experience: player.experience || 0,
        contract: player.contract || {},
        projectedCapHit,
        capDelta: projectedCapHit - capHit
      };
    })
    .sort((a, b) => b.overall - a.overall || a.capDelta - b.capDelta);

  return { expiring, tagEligible, optionEligible };
}

export function renderCapCasualtyPanel() {
  const content = document.getElementById("capCasualtyContent");
  if (!content) return;
  const roster = state.contractRoster || [];
  if (!roster.length) {
    content.innerHTML = `<div class="narrative-empty">Load contracts to see cut risk analysis.</div>`;
    return;
  }
  const d = state.dashboard;
  const salaryCap = d?.cap?.salaryCap || 200_000_000;
  const candidates = roster
    .filter((p) => (p.yearsLeft || p.yearsRemaining || 0) > 0)
    .map((p) => {
      const salary = p.salary || 0;
      const ovr = p.overall || 75;
      const pct = salary / Math.max(1, salaryCap);
      let risk = "low";
      if (ovr < 65 || pct > 0.08) risk = "high";
      else if (ovr < 72 || pct > 0.05) risk = "medium";
      return { name: p.name || p.playerId, pos: p.pos, salary, ovr, risk, barPct: Math.min(100, Math.round(pct * 400)) };
    })
    .filter((p) => p.risk !== "low")
    .sort((a, b) => (b.risk === "high" ? 1 : 0) - (a.risk === "high" ? 1 : 0))
    .slice(0, 10);
  if (!candidates.length) {
    content.innerHTML = `<div class="narrative-empty">No high-risk contracts detected.</div>`;
    return;
  }
  content.innerHTML = candidates.map((p) => `
    <div class="cap-casualty-row">
      <div class="cap-casualty-name">${escapeHtml(p.name)}</div>
      <div class="cap-casualty-pos">${escapeHtml(p.pos || "")}</div>
      <div class="cap-casualty-ovr">OVR ${escapeHtml(String(p.ovr))}</div>
      <div class="cap-casualty-salary">${fmtMoney(p.salary)}</div>
      <div class="cut-risk-bar"><div class="cut-risk-fill ${escapeHtml(p.risk)}" style="width:${p.barPct}%"></div></div>
      <span class="cut-risk-label ${escapeHtml(p.risk)}">${p.risk.toUpperCase()}</span>
    </div>`).join("");
}

export function renderCapProjectionPanel() {
  const content = document.getElementById("capProjectionContent");
  if (!content) return;
  const d = state.dashboard;
  if (!d?.cap) { content.innerHTML = `<div class="narrative-empty">Cap data unavailable.</div>`; return; }
  const baseCap = d.cap.salaryCap || 200_000_000;
  const baseSpace = d.cap.capSpace || 0;
  const growthRate = state.leagueSettings?.capGrowthRate ?? 0.045;
  const years = [0, 1, 2].map((offset) => {
    const yr = (d.currentYear || 2024) + offset;
    const projCap = Math.round(baseCap * Math.pow(1 + growthRate, offset));
    const projSpace = offset === 0 ? baseSpace : Math.round(projCap * 0.18);
    const pct = Math.max(0, Math.min(100, Math.round((Math.max(0, projSpace) / projCap) * 100)));
    return { yr, projCap, projSpace, pct };
  });
  content.innerHTML = `<div class="cap-projection-bars">` + years.map(({ yr, projCap, projSpace, pct }) => `
    <div class="cap-proj-year-row">
      <div class="cap-proj-year-label">${yr}</div>
      <div class="cap-proj-bar-wrap"><div class="cap-proj-bar-fill" style="width:${pct}%"></div></div>
      <div class="cap-proj-space">${fmtMoney(projSpace)} free / ${fmtMoney(projCap)} cap</div>
    </div>`).join("") + `</div>`;
}

export function openAgentModal(playerId) {
  _agentModalPlayerId = playerId;
  const modal = document.getElementById("agentNegotiationModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  renderAgentModal(playerId);
}

export function closeAgentModal() {
  _agentModalPlayerId = null;
  document.getElementById("agentNegotiationModal")?.classList.add("hidden");
}

export async function renderAgentModal(playerId) {
  const card = document.getElementById("agentModalCard");
  if (!card) return;
  card.innerHTML = `<div class="narrative-empty">Loading agent profile…</div>`;
  try {
    const data = await api("/api/agent/roster");
    const agents = data.agents || [];
    const agent = agents.find((a) => a.playerId === playerId) || agents[0];
    if (!agent) {
      card.innerHTML = `<div class="narrative-empty">No agent data for this player.</div>`;
      return;
    }
    const salaryVal = agent.askingSalary || 5_000_000;
    const barPct = Math.min(100, Math.round((salaryVal / 30_000_000) * 100));
    card.innerHTML = `
      <div class="agent-personality-box">${escapeHtml(agent.personality || "balanced")}</div>
      <div class="agent-name">${escapeHtml(agent.name || playerId)}</div>
      <div class="agent-pos-ovr">${escapeHtml(agent.pos || "")} · OVR ${escapeHtml(String(agent.overall ?? "—"))}</div>
      <div class="agent-demand-bar-wrap">
        <label>Asking Price</label>
        <div class="agent-demand-bar"><div class="agent-demand-fill" style="width:${barPct}%"></div></div>
        <span class="agent-demand-val">${fmtMoney(salaryVal)}/yr</span>
      </div>
      <div class="agent-offer-form">
        <label>Your Offer ($/yr):</label>
        <input type="number" id="agentOfferSalary" class="form-input" value="${salaryVal}" step="500000" min="500000">
        <label>Years:</label>
        <input type="number" id="agentOfferYears" class="form-input" value="3" min="1" max="6">
        <button class="btn primary" id="agentSubmitBtn">Submit Offer</button>
        <button class="btn" id="agentCompetingBtn">Signal Competing Offer</button>
      </div>
      <div id="agentResponseBox" class="agent-response-box"></div>
      <div id="agentHistoryBox" class="agent-history-box"></div>`;
    document.getElementById("agentSubmitBtn")?.addEventListener("click", submitAgentOffer);
    document.getElementById("agentCompetingBtn")?.addEventListener("click", signalCompetingOffer);
    if (agent.negotiationHistory?.length) {
      const histBox = document.getElementById("agentHistoryBox");
      if (histBox) histBox.innerHTML = `<strong>History</strong>` +
        agent.negotiationHistory.map((h) => `<div>${escapeHtml(h.label || JSON.stringify(h))}</div>`).join("");
    }
  } catch {
    card.innerHTML = `<div class="narrative-empty">Error loading agent data.</div>`;
  }
}

export async function submitAgentOffer() {
  if (!_agentModalPlayerId) return;
  const salary = Number(document.getElementById("agentOfferSalary")?.value || 0);
  const years = Number(document.getElementById("agentOfferYears")?.value || 3);
  const box = document.getElementById("agentResponseBox");
  if (box) box.textContent = "Processing offer…";
  try {
    const data = await api("/api/agent/offer", {
      method: "POST",
      body: { playerId: _agentModalPlayerId, salary, years }
    });
    const r = data.result || {};
    if (box) {
      box.className = `agent-response-box ${r.outcome === "accepted" ? "accepted" : r.outcome === "counter" ? "counter" : "walked"}`;
      box.textContent = r.message || r.outcome || "Offer submitted.";
    }
  } catch {
    if (box) box.textContent = "Error submitting offer.";
  }
}

export async function signalCompetingOffer() {
  if (!_agentModalPlayerId) return;
  const box = document.getElementById("agentResponseBox");
  if (box) box.textContent = "Signaling competing interest…";
  try {
    const data = await api("/api/agent/competing-offer", {
      method: "POST",
      body: { playerId: _agentModalPlayerId, competingSalary: 0 }
    });
    if (box) {
      box.className = "agent-response-box counter";
      box.textContent = data.result?.message || "Competing offer signaled.";
    }
  } catch {
    if (box) box.textContent = "Error.";
  }
}
