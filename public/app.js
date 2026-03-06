const state = {
  dashboard: null,
  roster: [],
  freeAgents: [],
  statsRows: [],
  statsPage: 1,
  statsPageSize: 40,
  statsSortKey: null,
  statsSortDir: "desc",
  draftState: null,
  depthChart: null,
  depthSnapShare: null,
  depthRoster: [],
  scheduleWeek: null,
  scheduleYear: null,
  scheduleCache: {},
  calendar: null,
  calendarWeek: 1,
  scouting: null,
  txRows: [],
  saves: [],
  picks: [],
  newsRows: [],
  analytics: null,
  staffState: null,
  leagueSettings: null,
  ownerState: null,
  observability: null,
  persistence: null,
  calibrationJobs: [],
  realismVerification: null,
  pipeline: null,
  simJobs: [],
  comparePlayers: [],
  commandFilter: "",
  retiredPool: [],
  contractTools: {
    expiring: [],
    tagEligible: [],
    optionEligible: []
  }
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function setStatus(text) {
  const el = document.getElementById("statusChip");
  if (el) el.textContent = text;
}

function showToast(message) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

function setTableSkeleton(tableId, rows = 6) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.innerHTML = Array.from({ length: rows })
    .map(() => `<tr><td><div class="skeleton"></div></td></tr>`)
    .join("");
}

function valueAsNumber(row, key) {
  const raw = row?.[key];
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIds(text) {
  return String(text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function fmtDeltaMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  const abs = fmtMoney(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function formatTradeList(rows = []) {
  if (!rows.length) return "none";
  return rows.map((row) => `${row.player || row.playerId} (${fmtMoney(row.capHit || 0)})`).join(", ");
}

function formatTransactionDetails(entry) {
  const d = entry.details || {};
  if (entry.type === "signing") return `from ${d.from || "FA"} | cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "release") {
    const wire = d.toWaivers ? "waivers" : d.destination || "FA";
    return `to ${wire} | dead now ${fmtMoney(d.deadCapCurrentYear)} | dead next ${fmtMoney(d.deadCapNextYear)}`;
  }
  if (entry.type === "trade") return `A: ${formatTradeList(d.fromA)} | B: ${formatTradeList(d.fromB)}`;
  if (entry.type === "waiver-claim") return d.status || "submitted";
  if (entry.type === "waiver-award") return `cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "re-sign") return `${d.yearsRemaining || 0}y | cap ${fmtMoney(d.capHit)} | salary ${fmtMoney(d.salary)}`;
  if (entry.type === "restructure") return `${fmtMoney(d.capHitBefore)} -> ${fmtMoney(d.capHitAfter)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "franchise-tag") return `tag cap ${fmtMoney(d.capHit)}`;
  if (entry.type === "fifth-year-option") return `option cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "negotiation") return `${d.outcome || ""} | offer ${d.offerYears || 0}y ${fmtMoney(d.offerSalary || 0)}`;
  if (entry.type === "designation") return `${d.designation || ""} -> ${d.active ? "ON" : "OFF"}`;
  if (entry.type === "fa-offer") return `${d.years || 0}y ${fmtMoney(d.salary || 0)}`;
  if (entry.type === "fa-signing") return `${d.years || 0}y ${fmtMoney(d.salary || 0)}`;
  if (entry.type === "staff-update") return `${d.role || ""} ${d.name || ""}`;
  if (entry.type === "owner-update") return `ticket ${d.ticketPrice || "-"} | staff budget ${fmtMoney(d.staffBudget || 0)}`;
  if (entry.type === "practice-squad-move") return `${d.from || "active"} -> ${d.to || "active"}`;
  if (entry.type === "retirement-override") return `team ${d.teamId || "FA"} | min win ${Math.round((d.minWinningPct || 0.55) * 100)}%`;
  if (entry.type === "championship") return `beat ${d.runnerUp || "-"} | ${d.score || ""}`;
  const text = JSON.stringify(d);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function setTradeEvalText(text) {
  const el = document.getElementById("tradeEvalText");
  if (el) el.textContent = text;
}

function renderTable(tableId, rows, { sortable = false, onSort = null, sortKey = null, sortDir = "desc", maxRows = null } = {}) {
  const table = document.getElementById(tableId);
  if (!table) return;
  if (!rows?.length) {
    table.innerHTML = "<tr><td>No rows</td></tr>";
    return;
  }

  const visibleRows = maxRows == null ? rows : rows.slice(0, Math.max(1, maxRows));
  const columns = Object.keys(visibleRows[0]);
  const head = `<tr>${columns
    .map((col) => {
      if (!sortable) return `<th>${escapeHtml(col)}</th>`;
      const marker = sortKey === col ? (sortDir === "asc" ? " ^" : " v") : "";
      return `<th data-sort-key="${escapeHtml(col)}">${escapeHtml(col)}${marker}</th>`;
    })
    .join("")}</tr>`;

  const body = visibleRows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => `<td>${row[col] == null ? "" : escapeHtml(row[col])}</td>`)
          .join("")}</tr>`
    )
    .join("");

  table.innerHTML = `${head}${body}`;

  if (sortable && typeof onSort === "function") {
    table.querySelectorAll("th[data-sort-key]").forEach((th) => {
      th.addEventListener("click", () => onSort(th.dataset.sortKey));
    });
  }
}

function setSelectOptions(selectId, options, preferredValue = null) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const previous = el.value;
  el.innerHTML = options.map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join("");

  if (preferredValue && options.some((opt) => opt.value === preferredValue)) {
    el.value = preferredValue;
    return;
  }
  if (options.some((opt) => opt.value === previous)) {
    el.value = previous;
  }
}

function syncTeamSelects() {
  const teams = state.dashboard?.teams || [];
  const controlled = state.dashboard?.controlledTeamId || teams[0]?.id;
  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: `${team.id} - ${team.name}`
  }));

  setSelectOptions("teamSelect", teamOptions, controlled);
  setSelectOptions("rosterTeamSelect", teamOptions);
  setSelectOptions("tradeTeamA", teamOptions);
  setSelectOptions("tradeTeamB", teamOptions);
  setSelectOptions("teamHistorySelect", teamOptions);
  setSelectOptions("depthTeamSelect", teamOptions);
  setSelectOptions("retirementOverrideTeamSelect", teamOptions, controlled);
  setSelectOptions("analyticsTeamFilter", [{ value: "", label: "ALL Teams" }, ...teamOptions]);
  setSelectOptions("staffTeamSelect", teamOptions, controlled);
  setSelectOptions("ownerTeamSelect", teamOptions, controlled);

  ["rosterTeamSelect", "tradeTeamA", "teamHistorySelect", "depthTeamSelect", "retirementOverrideTeamSelect"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value && controlled) el.value = controlled;
  });

  const statsSelect = document.getElementById("statsTeamFilter");
  const statsPrevious = statsSelect?.value;
  setSelectOptions(
    "statsTeamFilter",
    [{ value: "ALL", label: "ALL Teams" }, ...teamOptions],
    statsPrevious || "ALL"
  );

  const txSelect = document.getElementById("txTeamFilter");
  const txPrevious = txSelect?.value;
  setSelectOptions(
    "txTeamFilter",
    [{ value: "", label: "ALL Teams" }, ...teamOptions],
    txPrevious || ""
  );
}

function updateTopMeta() {
  const d = state.dashboard;
  if (!d) return;
  document.getElementById("topMetaText").textContent =
    `${d.currentYear} W${d.currentWeek} | ${d.phase} | Team: ${d.controlledTeamId}`;
}

function renderOverview() {
  const d = state.dashboard;
  if (!d) return;
  document.getElementById("phaseCard").textContent = d.phase;
  document.getElementById("yearCard").textContent = `${d.currentYear} / W${d.currentWeek}`;
  document.getElementById("seasonsCard").textContent = String(d.seasonsSimulated || 0);
  document.getElementById("capCard").textContent = fmtMoney(d.cap?.capSpace || 0);
  document.getElementById("deadCapCard").textContent = fmtMoney(d.cap?.deadCap || 0);
  document.getElementById("ovrCard").textContent = d.controlledTeam?.overallRating ?? "-";
}

function renderRosterNeeds() {
  const needs = (state.dashboard?.rosterNeeds || [])
    .slice()
    .sort((a, b) => a.delta - b.delta || a.position.localeCompare(b.position))
    .map((entry) => ({
      pos: entry.position,
      target: entry.target,
      current: entry.current,
      delta: entry.delta,
      status: entry.delta < 0 ? `Need ${Math.abs(entry.delta)}` : entry.delta === 0 ? "On target" : `+${entry.delta}`
    }));
  renderTable("needsTable", needs);
}

function renderLeaders() {
  const category = document.getElementById("leadersCategory")?.value || "passing";
  const source = state.dashboard?.leaders?.[category] || [];
  const rows = source.slice(0, 20).map((row, index) => {
    if (category === "passing") {
      return {
        rk: index + 1,
        player: row.player,
        tm: row.tm,
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
        tm: row.tm,
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
      tm: row.tm,
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

function renderSchedule() {
  const week = state.scheduleWeek || state.dashboard?.currentWeek || 1;
  const schedule = state.scheduleCache[week] || null;
  const weekText = document.getElementById("scheduleWeekText");
  if (!schedule) {
    weekText.textContent = `Week ${week}`;
    renderTable("scheduleTable", []);
    return;
  }
  weekText.textContent = `Week ${schedule.week} (${schedule.played ? "Played" : "Upcoming"})`;
  const rows = (schedule.games || []).map((game) => ({
    away: game.awayTeamId,
    home: game.homeTeamId,
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : game.winnerId || "") : "TBD"
  }));
  renderTable("scheduleTable", rows);
}

function decoratePlayerColumnFromRows(tableId, rows, { nameKey = "player", idKeys = ["playerId", "id"] } = {}) {
  if (!rows?.length) return;
  const columns = Object.keys(rows[0]);
  const nameIndex = columns.indexOf(nameKey);
  if (nameIndex < 0) return;
  const idKey = idKeys.find((key) => columns.includes(key));
  if (!idKey) return;

  const table = document.getElementById(tableId);
  if (!table) return;
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const row = rows[i - 1];
    const playerId = row?.[idKey];
    const playerName = row?.[nameKey];
    if (!playerId || !playerName) continue;
    const td = tr[i].children[nameIndex];
    if (!td) continue;
    td.innerHTML = `<button class="link-btn" data-player-id="${escapeHtml(playerId)}">${escapeHtml(playerName)}</button>`;
  }
}

function decoratePlayerColumnByIds(tableId, playerIds, playerColumnIndex = 1) {
  const table = document.getElementById(tableId);
  if (!table || !playerIds?.length) return;
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const playerId = playerIds[i - 1];
    if (!playerId) continue;
    const td = tr[i].children[playerColumnIndex];
    if (!td) continue;
    const label = td.textContent || playerId;
    td.innerHTML = `<button class="link-btn" data-player-id="${escapeHtml(playerId)}">${escapeHtml(label)}</button>`;
  }
}

function renderStandings() {
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

function renderWeekResults() {
  const week = state.dashboard?.latestWeekResults;
  const games = (week?.games || []).map((game) => ({
    week: week.week,
    away: game.awayTeamId,
    home: game.homeTeamId,
    score: `${game.awayScore}-${game.homeScore}`,
    winner: game.winnerId || "TIE"
  }));
  renderTable("weekTable", games);

  const injuries = (state.dashboard?.injuryReport || []).map((entry) => ({
    player: entry.player,
    team: entry.teamId,
    pos: entry.pos,
    status: entry.injury?.type || "",
    weeks: entry.injury?.weeksRemaining || 0
  }));

  const suspensions = (state.dashboard?.suspensionReport || []).map((entry) => ({
    player: entry.player,
    team: entry.teamId,
    pos: entry.pos,
    status: "Suspension",
    weeks: entry.suspensionWeeks
  }));

  renderTable("injuryTable", [...injuries, ...suspensions].slice(0, 100));
}

function renderRoster() {
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
    const playerId = rows[i - 1].id;
    tr[i].lastElementChild.innerHTML =
      `<button data-act="release" data-id="${escapeHtml(playerId)}" class="warn">Release</button> ` +
      `<button data-act="ps" data-id="${escapeHtml(playerId)}">To PS</button> ` +
      `<button data-act="active" data-id="${escapeHtml(playerId)}">To Active</button>`;
  }
  decoratePlayerColumnFromRows("rosterTable", rows, { idKeys: ["id"] });
}

function renderFreeAgency() {
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

function renderExpiringContracts() {
  const expiring = state.contractTools?.expiring || [];
  const tagEligible = state.contractTools?.tagEligible || [];
  const optionEligible = state.contractTools?.optionEligible || [];

  const expiringRows = expiring.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    ovr: player.overall,
    yearsLeft: player.contract?.yearsRemaining,
    capHit: fmtMoney(player.contract?.capHit || 0)
  }));
  renderTable("expiringTable", expiringRows);

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
    cell.innerHTML = `<button data-contract-fill="tag" data-player-id="${escapeHtml(row.id)}">Use</button>`;
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
    cell.innerHTML = `<button data-contract-fill="option" data-player-id="${escapeHtml(row.id)}">Use</button>`;
  });

  decoratePlayerColumnFromRows("expiringTable", expiringRows, { idKeys: ["id"] });
  decoratePlayerColumnFromRows("tagEligibleTable", tagRows, { idKeys: ["id"] });
  decoratePlayerColumnFromRows("optionEligibleTable", optionRows, { idKeys: ["id"] });
  updateContractPreview();
}

function lookupContractCandidate(kind, playerId) {
  if (!playerId) return null;
  if (kind === "tag") return (state.contractTools?.tagEligible || []).find((row) => row.id === playerId) || null;
  if (kind === "option") return (state.contractTools?.optionEligible || []).find((row) => row.id === playerId) || null;
  return null;
}

function updateContractPreview() {
  const preview = document.getElementById("contractPreviewText");
  const tagPlayerId = document.getElementById("tagPlayerId")?.value?.trim();
  const optionPlayerId = document.getElementById("optionPlayerId")?.value?.trim();
  const capSpace = state.dashboard?.cap?.capSpace || 0;

  const tag = lookupContractCandidate("tag", tagPlayerId);
  const option = lookupContractCandidate("option", optionPlayerId);
  const tagBtn = document.getElementById("franchiseTagBtn");
  const optionBtn = document.getElementById("fifthOptionBtn");

  if (tagBtn) tagBtn.disabled = !tag;
  if (optionBtn) optionBtn.disabled = !option;

  if (tag) {
    const resultingCap = capSpace + (tag.contract?.capHit || 0) - (tag.projectedCapHit || 0);
    preview.textContent =
      `Tag Preview: ${tag.name} (${tag.pos}) ${fmtMoney(tag.contract?.capHit || 0)} -> ${fmtMoney(tag.projectedCapHit || 0)} (${fmtDeltaMoney(tag.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    return;
  }

  if (option) {
    const resultingCap = capSpace + (option.contract?.capHit || 0) - (option.projectedCapHit || 0);
    preview.textContent =
      `Option Preview: ${option.name} (${option.pos}) ${fmtMoney(option.contract?.capHit || 0)} -> ${fmtMoney(option.projectedCapHit || 0)} (${fmtDeltaMoney(option.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    return;
  }

  preview.textContent = "Select an eligible player to preview cap impact.";
}

function deriveContractToolsFromRoster(roster, expiringPlayers) {
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

function renderDepthChart() {
  const position = document.getElementById("depthPositionSelect")?.value;
  const ids = state.depthChart?.[position] || [];
  const shareRows = state.depthSnapShare?.[position] || [];
  const rosterById = new Map(state.depthRoster.map((player) => [player.id, player]));

  const rows = ids.map((playerId, index) => {
    const player = rosterById.get(playerId);
    const share = shareRows.find((row) => row.playerId === playerId) || shareRows[index];
    return {
      rank: index + 1,
      role: share?.role || `${position}${index + 1}`,
      playerId,
      player: player?.name || "Unknown",
      pos: player?.pos || position,
      ovr: player?.overall || "",
      snapShare: share ? `${Math.round((share.snapShare || 0) * 100)}%` : "-"
    };
  });
  renderTable("depthTable", rows);
}

function renderRetiredPool() {
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
    cell.innerHTML = row.eligible === "Yes"
      ? `<button data-retired-override-id="${escapeHtml(row.id)}">Use</button>`
      : "";
  });
  decoratePlayerColumnFromRows("retiredTable", rows, { idKeys: ["id"] });
}

function renderRealismVerification() {
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

function renderRulesTab() {
  const coreRows = [
    { area: "League Structure", rule: "32 teams, 17-game regular season, NFL playoff format, division/conference standings." },
    { area: "Simulation Engine", rule: "Drive/possession simulation with rating, coaching, chemistry, and scheme effects." },
    { area: "Depth Chart Usage", rule: "Each depth slot has position-specific snap-share targets; game snaps and touches are role-weighted." },
    { area: "Stats Model", rule: "PFR-style season/career tables for passing, rushing, receiving, defense, blocking, kicking, punting, and snaps." },
    { area: "Contracts & Cap", rule: "Cap hits, dead cap, restructures, tags, options, waivers, and rollover modeled in team cap ledger." },
    { area: "Career & Retirement", rule: "Position max ages (QB 45, RB 40, etc), age curve progression/decline, and override comeback logic." },
    { area: "Retirement Override", rule: "You can bring retired players back while age-eligible; winning teams can suppress retirement chance." },
    { area: "Realism Verification", rule: "Runs 10-20 year verification against season and career PFR-based position targets with drift flags." },
    { area: "Persistence", rule: "Save/load slots and rolling backups preserve full league state, history, and transaction timeline." }
  ];
  renderTable("rulesCoreTable", coreRows);

  const actionRows = [
    { tab: "Overview", feature: "Advance Week/Season", behavior: "Simulates schedule, updates standings, stats, transactions, and events." },
    { tab: "Roster & FA", feature: "Release / PS / Active", behavior: "Moves players between active/practice/waiver/free-agent pools with eligibility checks." },
    { tab: "Transactions", feature: "Trade + Evaluate", behavior: "Validates package fairness/cap before executing asset swaps." },
    { tab: "Transactions", feature: "Retirement Overrides", behavior: "Loads retired pool and applies comeback override with team + win threshold." },
    { tab: "Draft", feature: "Scouting + Draft", behavior: "Allocates scouting points, locks board, runs user/CPU picks, and tracks selections." },
    { tab: "Statistics", feature: "Player/Team Filters", behavior: "PFR-style filtered tables by scope, year, team, position, and category." },
    { tab: "Calendar", feature: "Year/Week Browser", behavior: "Displays regular season schedule + playoff bracket snapshots." },
    { tab: "League Log", feature: "Transaction Filters", behavior: "Filters transaction events by team, type, year, and limit." },
    { tab: "History", feature: "Records + Timelines", behavior: "Shows records, awards, champions, player timelines, and team history." },
    { tab: "Settings", feature: "Realism Verify", behavior: "Runs multi-year season/career drift check against target profiles." },
    { tab: "Settings", feature: "League Settings", behavior: "Controls injuries, offseason automation, comp picks, chemistry, and retirement retention." }
  ];
  renderTable("rulesActionsTable", actionRows);
}

function renderDraft() {
  const draft = state.draftState;
  if (!draft) {
    renderTable("draftTable", []);
    return;
  }

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
}

function renderScouting() {
  const scouting = state.scouting;
  if (!scouting) {
    document.getElementById("scoutingPointsText").textContent = "Points: 0";
    document.getElementById("scoutingLockText").textContent = "Board: Unlocked";
    renderTable("scoutingTable", []);
    renderTable("scoutingReportTable", []);
    return;
  }

  document.getElementById("scoutingPointsText").textContent = `Points: ${scouting.points || 0}`;
  document.getElementById("scoutingLockText").textContent = scouting.locked ? "Board: Locked" : "Board: Unlocked";
  const rows = (scouting.prospects || []).slice(0, 140).map((prospect) => ({
    playerId: prospect.playerId,
    player: prospect.player,
    pos: prospect.pos,
    age: prospect.age,
    rank: prospect.rank,
    projRnd: prospect.projectedRound,
    forty: prospect.combine40,
    scoutOvr: prospect.scoutedOverall ?? "-",
    baseline: prospect.baselineScout ?? "-",
    confidence: `${prospect.confidence ?? 0}%`
  }));
  renderTable("scoutingTable", rows);
  decoratePlayerColumnFromRows("scoutingTable", rows, { idKeys: ["playerId"] });

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
}

function renderRecordsAndHistory() {
  const box = document.getElementById("recordsBox");
  const records = state.dashboard?.records;

  if (!records) {
    box.innerHTML = "<div class='record'>No record data</div>";
  } else {
    const leaders = [
      ["Career Pass Yards", "passingYards"],
      ["Career Rush Yards", "rushingYards"],
      ["Career Rec Yards", "receivingYards"],
      ["Career Sacks", "sacks"],
      ["Career INT", "interceptions"],
      ["Career FG Made", "fieldGoalsMade"]
    ];

    box.innerHTML = leaders
      .map(([title, key]) => {
        const row = records[key]?.[0];
        if (!row) return `<div class="record"><strong>${escapeHtml(title)}</strong><div>None</div></div>`;
        return (
          `<div class="record"><strong>${escapeHtml(title)}</strong>` +
          `<div>${escapeHtml(row.player)} (${escapeHtml(row.pos)}) - ${escapeHtml(row.value)}</div>` +
          `<div class="small">${escapeHtml(row.status || "")}</div></div>`
        );
      })
      .join("");
  }

  renderTable(
    "awardsTable",
    (state.dashboard?.awards || []).slice().reverse().map((award) => ({
      year: award.year,
      MVP: award.MVP?.player || "",
      OPOY: award.OPOY?.player || "",
      DPOY: award.DPOY?.player || "",
      OROY: award.OROY?.player || "",
      DROY: award.DROY?.player || ""
    }))
  );

  renderTable(
    "championsTable",
    (state.dashboard?.champions || []).slice().reverse().map((champion) => ({
      year: champion.year,
      champion: champion.championTeamId,
      runnerUp: champion.runnerUpTeamId,
      score: champion.score
    }))
  );
}

function renderCalendar() {
  const calendar = state.calendar;
  if (!calendar) {
    renderTable("calendarWeeksTable", []);
    renderTable("calendarGamesTable", []);
    renderTable("afcBracketTable", []);
    renderTable("nfcBracketTable", []);
    renderTable("sbBracketTable", []);
    return;
  }

  const yearOptions = (calendar.availableYears || [calendar.year]).map((year) => ({
    value: String(year),
    label: String(year)
  }));
  setSelectOptions("calendarYearFilter", yearOptions, String(calendar.year));

  const weekOptions = (calendar.weeks || []).map((week) => ({ value: String(week.week), label: `Week ${week.week}` }));
  setSelectOptions("calendarWeekFilter", weekOptions, String(state.calendarWeek || calendar.currentWeek || 1));

  const weekRows = (calendar.weeks || []).map((week) => ({
    week: week.week,
    games: week.games?.length || 0,
    completed: week.games?.filter((game) => game.played).length || 0,
    points: week.games?.reduce((sum, game) => sum + (game.homeScore || 0) + (game.awayScore || 0), 0) || 0
  }));
  renderTable("calendarWeeksTable", weekRows);

  const selectedWeek = Number(state.calendarWeek || calendar.currentWeek || 1);
  const selected = (calendar.weeks || []).find((week) => week.week === selectedWeek) || calendar.weeks?.[0];
  if (selected) state.calendarWeek = selected.week;
  const gameRows = (selected?.games || []).map((game) => ({
    away: game.awayTeamId,
    home: game.homeTeamId,
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : game.winnerId || "") : "TBD"
  }));
  renderTable("calendarGamesTable", gameRows);

  const toBracketRows = (conf, bracket) =>
    ["wildcard", "divisional", "conference"].flatMap((round) =>
      (bracket?.[round] || []).map((game) => ({
        conf,
        round,
        away: game.awayTeamId,
        home: game.homeTeamId,
        score: `${game.awayScore}-${game.homeScore}`,
        winner: game.winnerId
      }))
    );
  renderTable("afcBracketTable", toBracketRows("AFC", calendar.postseason?.AFC));
  renderTable("nfcBracketTable", toBracketRows("NFC", calendar.postseason?.NFC));
  const sb = calendar.superBowl || calendar.postseason?.superBowl;
  renderTable(
    "sbBracketTable",
    sb
      ? [
          {
            away: sb.awayTeamId,
            home: sb.homeTeamId,
            score: `${sb.awayScore}-${sb.homeScore}`,
            winner: sb.championTeamId || sb.winnerId
          }
        ]
      : []
  );
}

function renderTransactionLog() {
  const rows = state.txRows.map((entry) => ({
    seq: entry.seq,
    year: entry.year,
    week: entry.week,
    phase: entry.phase,
    type: entry.type,
    team: entry.teamId || `${entry.teamA || ""}${entry.teamB ? `/${entry.teamB}` : ""}`,
    player: entry.playerName || entry.playerId || "",
    details: formatTransactionDetails(entry)
  }));
  renderTable("txTable", rows);
}

function renderNews() {
  const rows = (state.newsRows || []).map((entry) => ({
    year: entry.year,
    week: entry.week,
    phase: entry.phase,
    headline: entry.headline
  }));
  renderTable("newsTable", rows);
}

function renderPickAssets() {
  const rows = (state.picks || []).map((pick) => ({
    id: pick.id,
    yr: pick.year,
    rnd: pick.round,
    orig: pick.originalTeamId,
    owner: pick.ownerTeamId,
    value: pick.value
  }));
  renderTable("pickAssetsTable", rows);
}

function renderNegotiationTargets(rows) {
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
    cell.innerHTML = `<button data-negotiate-id="${escapeHtml(row.id)}">Use</button>`;
  });
  decoratePlayerColumnFromRows("negotiationTable", tableRows, { idKeys: ["id"] });
}

function renderAnalytics() {
  const analytics = state.analytics;
  if (!analytics) {
    renderTable("analyticsSummaryTable", []);
    renderTable("analyticsPlaymakersTable", []);
    return;
  }
  renderTable("analyticsSummaryTable", [
    {
      year: analytics.year,
      team: analytics.teamId || "ALL",
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

function renderStaff() {
  const s = state.staffState;
  if (!s?.staff) {
    renderTable("staffTable", []);
    return;
  }
  const rows = Object.entries(s.staff).map(([role, staff]) => ({
    role,
    name: staff.name,
    playcalling: staff.playcalling,
    development: staff.development,
    discipline: staff.discipline,
    years: staff.yearsRemaining
  }));
  renderTable("staffTable", rows);
}

function renderRosterBoard() {
  const rows = (state.roster || []).map((player, index) => ({
    order: index + 1,
    id: player.id,
    player: player.name,
    pos: player.pos,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    morale: player.morale
  }));
  renderTable("rosterBoardTable", rows);
}

function renderOwner() {
  const owner = state.ownerState?.owner;
  if (!owner) {
    renderTable("ownerTable", []);
    return;
  }
  renderTable("ownerTable", [
    {
      market: owner.marketSize,
      fanInterest: owner.fanInterest,
      ticketPrice: owner.ticketPrice,
      staffBudget: fmtMoney(owner.staffBudget),
      cash: fmtMoney(owner.cash),
      revenueYtd: fmtMoney(owner.finances?.revenueYtd || 0),
      expensesYtd: fmtMoney(owner.finances?.expensesYtd || 0),
      training: owner.facilities?.training,
      rehab: owner.facilities?.rehab,
      analytics: owner.facilities?.analytics
    }
  ]);
}

function renderObservability() {
  const obs = state.observability;
  if (!obs) {
    renderTable("observabilityTable", []);
    return;
  }
  const rows = [
    { metric: "serverRequests", value: obs.server?.requests ?? 0 },
    { metric: "apiRequests", value: obs.server?.apiRequests ?? 0 },
    { metric: "uptimeSeconds", value: obs.server?.uptimeSeconds ?? 0 },
    { metric: "runtimeCounters", value: Object.keys(obs.runtime?.counters || {}).length }
  ];
  renderTable("observabilityTable", rows);
}

function renderPersistence() {
  const p = state.persistence;
  if (!p) {
    renderTable("persistenceTable", []);
    return;
  }
  renderTable("persistenceTable", [
    {
      kind: p.kind,
      available: p.available,
      notes: p.notes
    }
  ]);
}

function renderPipeline() {
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

function renderCalibrationJobs() {
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

function renderSimJobs() {
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

function renderComparePlayers() {
  renderTable(
    "comparePlayersTable",
    (state.comparePlayers || []).map((player) => ({
      id: player.id,
      name: player.name,
      tm: player.teamId,
      pos: player.position,
      ovr: player.overall,
      fit: player.schemeFit ?? "-",
      age: player.age,
      dev: player.developmentTrait
    }))
  );
}

function renderCommandPalette() {
  const commands = [
    { id: "overview", label: "Open Overview", run: () => activateTab("overviewTab") },
    { id: "roster", label: "Open Roster", run: () => activateTab("rosterTab") },
    { id: "transactions", label: "Open Transactions", run: () => activateTab("transactionsTab") },
    { id: "stats", label: "Open Stats", run: () => activateTab("statsTab") },
    { id: "rules", label: "Open Rules", run: () => activateTab("rulesTab") },
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

function renderAnalyticsChart() {
  const canvas = document.getElementById("analyticsChart");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const data = state.analytics;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const metrics = [
    { label: "PPG", value: Number(data?.teamAverages?.pointsPerGame || 0), max: 40 },
    { label: "PA/G", value: Number(data?.teamAverages?.pointsAllowedPerGame || 0), max: 40 },
    { label: "Sack%", value: Number(data?.efficiency?.sackRate || 0) * 100, max: 12 },
    { label: "INT%", value: Number(data?.efficiency?.interceptionRate || 0) * 100, max: 6 },
    { label: "Rush YPA", value: Number(data?.efficiency?.rushYardsPerAttempt || 0), max: 8 }
  ];
  const width = canvas.width || canvas.clientWidth || 420;
  const height = canvas.height || 160;
  const barW = Math.max(24, Math.floor(width / (metrics.length * 1.8)));
  metrics.forEach((metric, index) => {
    const x = 24 + index * (barW + 20);
    const barHeight = Math.round((Math.min(metric.value, metric.max) / metric.max) * (height - 42));
    const y = height - barHeight - 20;
    ctx.fillStyle = "#49b3a1";
    ctx.fillRect(x, y, barW, barHeight);
    ctx.fillStyle = "#d8e6e2";
    ctx.font = "11px Bahnschrift";
    ctx.fillText(metric.label, x, height - 4);
  });
}

function applySettingsControls() {
  const settings = state.leagueSettings || state.dashboard?.settings;
  if (!settings) return;
  const allowInjuries = document.getElementById("settingAllowInjuries");
  const autoOffseason = document.getElementById("settingAutoOffseason");
  const ownerMode = document.getElementById("settingEnableOwnerMode");
  const narratives = document.getElementById("settingEnableNarratives");
  const compPicks = document.getElementById("settingEnableCompPicks");
  const chemistry = document.getElementById("settingEnableChemistry");
  const retirementRetention = document.getElementById("settingRetirementWinningRetention");
  const era = document.getElementById("settingEraProfile");
  if (allowInjuries) allowInjuries.checked = settings.allowInjuries !== false;
  if (autoOffseason) autoOffseason.checked = settings.autoProgressOffseason === true;
  if (ownerMode) ownerMode.checked = settings.enableOwnerMode !== false;
  if (narratives) narratives.checked = settings.enableNarratives !== false;
  if (compPicks) compPicks.checked = settings.enableCompPicks !== false;
  if (chemistry) chemistry.checked = settings.enableChemistry !== false;
  if (retirementRetention) retirementRetention.checked = settings.retirementWinningRetention !== false;
  if (era) era.value = settings.eraProfile || "modern";
  document.getElementById("settingInjuryRate").value = settings.injuryRateMultiplier ?? 1;
  document.getElementById("settingCapGrowth").value = settings.capGrowthRate ?? 0.045;
  document.getElementById("settingTradeAggression").value = settings.cpuTradeAggression ?? 0.5;
  document.getElementById("settingRetirementMinWinPct").value = settings.retirementOverrideMinWinningPct ?? 0.55;
}

async function loadPlayerModal(playerId) {
  const payload = await api(`/api/player?playerId=${encodeURIComponent(playerId)}`);
  const profile = payload.profile;
  const player = profile.player;

  document.getElementById("playerModalTitle").textContent = `${player.name} (${player.position})`;
  document.getElementById("playerModalMeta").textContent =
    `${player.teamId} | OVR ${player.overall} | Age ${player.age} | Dev ${player.developmentTrait}`;

  const ratingRows = Object.entries(player.ratings || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([rating, value]) => ({ rating, value }));
  renderTable("playerRatingsTable", ratingRows);

  renderTable("playerContractTable", [
    {
      salary: fmtMoney(player.contract?.salary || 0),
      years: player.contract?.yearsRemaining || 0,
      capHit: fmtMoney(player.contract?.capHit || 0),
      guaranteed: fmtMoney(player.contract?.guaranteed || 0)
    }
  ]);

  renderTable("playerCareerTable", [
    {
      passingYds: profile.career?.passing?.yds || 0,
      passingTd: profile.career?.passing?.td || 0,
      rushingYds: profile.career?.rushing?.yds || 0,
      rushingTd: profile.career?.rushing?.td || 0,
      receivingYds: profile.career?.receiving?.yds || 0,
      receivingTd: profile.career?.receiving?.td || 0,
      tackles: profile.career?.defense?.tkl || 0,
      sacks: profile.career?.defense?.sacks || 0,
      interceptions: profile.career?.defense?.int || 0
    }
  ]);

  const seasonRows = (profile.timeline || [])
    .slice()
    .reverse()
    .slice(0, 12)
    .map((entry) => ({
      year: entry.year,
      passYds: entry.stats?.passing?.yards || 0,
      passTd: entry.stats?.passing?.td || 0,
      rushYds: entry.stats?.rushing?.yards || 0,
      recYds: entry.stats?.receiving?.yards || 0,
      tkl: entry.stats?.defense?.tackles || 0,
      sacks: entry.stats?.defense?.sacks || 0
    }));
  renderTable("playerSeasonTable", seasonRows);

  renderTable(
    "playerTxTable",
    (profile.transactionHistory || []).slice(0, 30).map((entry) => ({
      year: entry.year,
      week: entry.week,
      type: entry.type,
      team: entry.teamId || `${entry.teamA || ""}${entry.teamB ? `/${entry.teamB}` : ""}`,
      details: formatTransactionDetails(entry)
    }))
  );

  document.getElementById("playerModal").classList.remove("hidden");
}

function closePlayerModal() {
  document.getElementById("playerModal").classList.add("hidden");
}

function updateStatsControls() {
  const scope = document.getElementById("scopeFilter").value;
  const category = document.getElementById("categoryFilter");
  const position = document.getElementById("positionFilter");
  const year = document.getElementById("yearFilter");

  if (scope === "team") {
    category.disabled = true;
    position.disabled = true;
    year.disabled = false;
    return;
  }

  if (scope === "career") {
    category.disabled = false;
    position.disabled = false;
    year.disabled = true;
    return;
  }

  category.disabled = false;
  position.disabled = false;
  year.disabled = false;
}

function applyStatsSort() {
  const virtualized = document.getElementById("statsVirtualizedToggle")?.checked !== false;
  state.statsPageSize = virtualized ? 80 : 40;
  const rows = [...state.statsRows];
  if (state.statsSortKey) {
    rows.sort((a, b) => {
      const av = valueAsNumber(a, state.statsSortKey);
      const bv = valueAsNumber(b, state.statsSortKey);
      let cmp = 0;
      if (av != null && bv != null) cmp = av - bv;
      else cmp = String(a[state.statsSortKey] ?? "").localeCompare(String(b[state.statsSortKey] ?? ""));
      return state.statsSortDir === "asc" ? cmp : -cmp;
    });
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / state.statsPageSize));
  state.statsPage = Math.min(totalPages, Math.max(1, state.statsPage));

  const start = (state.statsPage - 1) * state.statsPageSize;
  const pageRows = rows.slice(start, start + state.statsPageSize);

  renderTable("statsTable", pageRows, {
    sortable: true,
    onSort: (key) => {
      if (state.statsSortKey === key) {
        state.statsSortDir = state.statsSortDir === "asc" ? "desc" : "asc";
      } else {
        state.statsSortKey = key;
        state.statsSortDir = "desc";
      }
      applyStatsSort();
    },
    sortKey: state.statsSortKey,
    sortDir: state.statsSortDir,
    maxRows: virtualized ? 80 : null
  });
  decoratePlayerColumnFromRows("statsTable", pageRows, { idKeys: ["playerId"] });

  document.getElementById("statsPageText").textContent = `Page ${state.statsPage}/${totalPages} (${rows.length} rows)`;
}

function applyDashboard(newState) {
  const previous = state.dashboard;
  state.dashboard = newState;
  state.leagueSettings = newState.settings || state.leagueSettings;
  state.contractTools = {
    expiring: newState.contractTools?.expiring || [],
    tagEligible: newState.contractTools?.tagEligible || [],
    optionEligible: newState.contractTools?.optionEligible || []
  };
  state.pipeline = newState.offseasonPipeline || state.pipeline;
  state.calibrationJobs = newState.calibrationJobs || state.calibrationJobs;
  state.observability = newState.observability ? { ...(state.observability || {}), runtime: newState.observability } : state.observability;
  state.depthSnapShare = newState.depthChartSnapShare || state.depthSnapShare;
  state.realismVerification = newState.lastRealismVerificationReport || state.realismVerification;

  if (!previous || previous.currentYear !== newState.currentYear) {
    state.scheduleYear = newState.currentYear;
    state.scheduleWeek = newState.currentWeek;
    state.scheduleCache = {};
  } else if (previous.currentWeek !== newState.currentWeek) {
    state.scheduleCache = {};
    if (state.scheduleWeek === previous.currentWeek || !Number.isFinite(state.scheduleWeek)) {
      state.scheduleWeek = newState.currentWeek;
    }
  }

  if (newState.currentWeekSchedule) {
    state.scheduleCache[newState.currentWeekSchedule.week] = newState.currentWeekSchedule;
  }
  if (newState.nextWeekSchedule) {
    state.scheduleCache[newState.nextWeekSchedule.week] = newState.nextWeekSchedule;
  }
  if (!Number.isFinite(state.scheduleWeek)) {
    state.scheduleWeek = newState.currentWeek;
  }

  updateTopMeta();
  syncTeamSelects();
  renderOverview();
  renderRosterNeeds();
  renderLeaders();
  renderSchedule();
  renderStandings();
  renderWeekResults();
  renderFreeAgency();
  renderExpiringContracts();
  state.newsRows = newState.news || state.newsRows;
  state.picks = newState.draftPickAssets || state.picks;
  renderNews();
  renderPickAssets();
  renderPipeline();
  renderCalibrationJobs();
  renderRealismVerification();
  renderRulesTab();
  applySettingsControls();
  renderRecordsAndHistory();

  const yearInput = document.getElementById("yearFilter");
  if (yearInput && (!yearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    yearInput.value = String(state.dashboard.currentYear);
  }
  const txYearInput = document.getElementById("txYearFilter");
  if (txYearInput && (!txYearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    txYearInput.value = String(state.dashboard.currentYear);
  }
  const analyticsYearInput = document.getElementById("analyticsYearFilter");
  if (analyticsYearInput && (!analyticsYearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    analyticsYearInput.value = String(state.dashboard.currentYear);
  }
}

function activateTab(tabId) {
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

async function loadState() {
  const data = await api("/api/state");
  applyDashboard(data);
}

async function loadScheduleWeek(week) {
  const safeWeek = Math.max(1, Number(week) || state.dashboard?.currentWeek || 1);
  state.scheduleWeek = safeWeek;
  if (!state.scheduleCache[safeWeek]) {
    const payload = await api(`/api/schedule?week=${safeWeek}`);
    state.scheduleCache[safeWeek] = payload.schedule || null;
  }
  renderSchedule();
}

async function loadCalendar() {
  const selectedYear = Number(document.getElementById("calendarYearFilter").value || state.dashboard?.currentYear);
  const payload = await api(`/api/calendar?year=${selectedYear}`);
  state.calendar = payload.calendar || null;
  const selectedWeek = Number(document.getElementById("calendarWeekFilter").value || state.dashboard?.currentWeek || 1);
  state.calendarWeek = selectedWeek;
  renderCalendar();
}

async function loadTransactionLog() {
  const team = document.getElementById("txTeamFilter").value;
  const type = document.getElementById("txTypeFilter").value;
  const year = document.getElementById("txYearFilter").value;
  const limit = Number(document.getElementById("txLimitFilter").value || 300);

  const query = new URLSearchParams();
  if (team) query.set("team", team);
  if (type) query.set("type", type);
  if (year) query.set("year", year);
  query.set("limit", String(limit));

  const payload = await api(`/api/transactions?${query.toString()}`);
  state.txRows = payload.transactions || [];
  renderTransactionLog();
}

async function loadNews() {
  const payload = await api("/api/news?limit=120");
  state.newsRows = payload.news || [];
  renderNews();
}

async function loadPickAssets() {
  const controlledTeam = state.dashboard?.controlledTeamId || document.getElementById("tradeTeamA").value;
  const payload = await api(`/api/picks?team=${encodeURIComponent(controlledTeam)}`);
  state.picks = payload.picks || [];
  renderPickAssets();
}

async function loadNegotiations() {
  const teamId = state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/contracts/negotiations?team=${encodeURIComponent(teamId)}`);
  renderNegotiationTargets(payload.targets || []);
}

async function loadAnalytics() {
  const year = document.getElementById("analyticsYearFilter").value || state.dashboard?.currentYear;
  const teamId = document.getElementById("analyticsTeamFilter").value;
  const query = new URLSearchParams({ year: String(year) });
  if (teamId) query.set("team", teamId);
  const payload = await api(`/api/analytics?${query.toString()}`);
  state.analytics = payload.analytics || null;
  renderAnalytics();
  renderAnalyticsChart();
}

async function loadSettings() {
  const payload = await api("/api/settings");
  state.leagueSettings = payload.settings || null;
  applySettingsControls();
}

async function loadStaff() {
  const teamId = document.getElementById("staffTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/staff?team=${encodeURIComponent(teamId)}`);
  state.staffState = payload.staff || null;
  renderStaff();
}

async function loadOwner() {
  const teamId = document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/owner?team=${encodeURIComponent(teamId)}`);
  state.ownerState = payload.owner || null;
  const owner = state.ownerState?.owner;
  if (owner) {
    document.getElementById("ownerTicketPriceInput").value = owner.ticketPrice ?? "";
    document.getElementById("ownerStaffBudgetInput").value = owner.staffBudget ?? "";
    document.getElementById("ownerTrainingInput").value = owner.facilities?.training ?? "";
    document.getElementById("ownerRehabInput").value = owner.facilities?.rehab ?? "";
    document.getElementById("ownerAnalyticsInput").value = owner.facilities?.analytics ?? "";
  }
  renderOwner();
}

async function loadObservability() {
  const payload = await api("/api/observability");
  state.observability = payload || null;
  renderObservability();
}

async function loadPersistence() {
  const payload = await api("/api/system/persistence");
  state.persistence = payload.persistence || null;
  renderPersistence();
}

async function loadPipeline() {
  const payload = await api("/api/offseason/pipeline");
  state.pipeline = payload.pipeline || null;
  renderPipeline();
}

async function loadCalibrationJobs() {
  const payload = await api("/api/calibration/jobs?limit=60");
  state.calibrationJobs = payload.jobs || [];
  renderCalibrationJobs();
}

async function runRealismVerification() {
  const years = Number(document.getElementById("realismVerifyYearsInput").value || 12);
  const safeYears = Math.max(1, Math.min(30, Math.floor(years)));
  const payload = await api(`/api/realism/verify?seasons=${encodeURIComponent(safeYears)}`);
  state.realismVerification = payload.report || null;
  renderRealismVerification();
}

async function loadSimJobs() {
  const payload = await api("/api/jobs/simulate");
  state.simJobs = payload.jobs || [];
  renderSimJobs();
}

async function loadComparePlayers() {
  const ids = parseIds(document.getElementById("comparePlayerIdsInput").value);
  if (!ids.length) {
    state.comparePlayers = [];
    renderComparePlayers();
    return;
  }
  const payload = await api(`/api/compare/players?ids=${encodeURIComponent(ids.join(","))}`);
  state.comparePlayers = payload.players || [];
  renderComparePlayers();
}

async function loadRoster() {
  const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const query = new URLSearchParams({ team: teamId });
  const pos = document.getElementById("rosterPosFilter").value;
  const minOverall = document.getElementById("rosterMinOverallFilter").value;
  const minAge = document.getElementById("rosterMinAgeFilter").value;
  const maxAge = document.getElementById("rosterMaxAgeFilter").value;
  if (pos) query.set("position", pos);
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const data = await api(`/api/roster?${query.toString()}`);
  state.roster = data.roster || [];
  renderRoster();
  renderRosterBoard();

  const expiring = await api(`/api/contracts/expiring?team=${encodeURIComponent(teamId)}`);
  const derived = deriveContractToolsFromRoster(state.roster, expiring.players || []);
  const isControlledTeam = teamId === (state.dashboard?.controlledTeamId || "");
  const dashboardTools = state.dashboard?.contractTools || {};
  state.contractTools = {
    expiring: expiring.players || derived.expiring,
    tagEligible: isControlledTeam ? dashboardTools.tagEligible?.length ? dashboardTools.tagEligible : derived.tagEligible : derived.tagEligible,
    optionEligible: isControlledTeam ? dashboardTools.optionEligible?.length ? dashboardTools.optionEligible : derived.optionEligible : derived.optionEligible
  };
  renderExpiringContracts();
  await loadNegotiations();
}

async function loadFreeAgency() {
  const position = document.getElementById("faPositionFilter").value;
  const query = new URLSearchParams({ limit: "220" });
  if (position) query.set("position", position);
  const minOverall = document.getElementById("faMinOverallFilter").value;
  const minAge = document.getElementById("faMinAgeFilter").value;
  const maxAge = document.getElementById("faMaxAgeFilter").value;
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const data = await api(`/api/free-agents?${query.toString()}`);
  state.freeAgents = data.freeAgents || [];
  renderFreeAgency();
}

async function loadRetiredPool() {
  const query = new URLSearchParams({ limit: "300" });
  const position = document.getElementById("retiredPosFilter").value;
  const minOverall = document.getElementById("retiredMinOverallFilter").value;
  const minAge = document.getElementById("retiredMinAgeFilter").value;
  const maxAge = document.getElementById("retiredMaxAgeFilter").value;
  if (position) query.set("position", position);
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const payload = await api(`/api/retired?${query.toString()}`);
  state.retiredPool = payload.retired || [];
  renderRetiredPool();
}

async function loadStats() {
  const scope = document.getElementById("scopeFilter").value;
  const category = document.getElementById("categoryFilter").value;
  const position = document.getElementById("positionFilter").value;
  const teamFilter = document.getElementById("statsTeamFilter").value;
  let year = document.getElementById("yearFilter").value;

  if (scope !== "career" && !year) {
    year = String(state.dashboard?.currentYear || new Date().getFullYear());
    document.getElementById("yearFilter").value = year;
  }

  let payload;
  if (scope === "season") {
    const query = new URLSearchParams({ category });
    if (year) query.set("year", year);
    if (position) query.set("position", position);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    payload = await api(`/api/tables/player-season?${query.toString()}`);
  } else if (scope === "career") {
    const query = new URLSearchParams({ category });
    if (position) query.set("position", position);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    payload = await api(`/api/tables/player-career?${query.toString()}`);
  } else {
    const query = new URLSearchParams();
    if (year) query.set("year", year);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    payload = await api(`/api/tables/team-season?${query.toString()}`);
  }

  state.statsRows = payload.rows || [];
  state.statsPage = 1;
  if (state.statsRows[0] && (!state.statsSortKey || !(state.statsSortKey in state.statsRows[0]))) {
    const preferred = ["yds", "td", "tkl", "sacks", "offSn", "defSn", "fgm", "pf", "wins"];
    state.statsSortKey = preferred.find((col) => col in state.statsRows[0]) || Object.keys(state.statsRows[0])[0];
  }
  applyStatsSort();
}

async function loadDraftState() {
  const data = await api("/api/draft");
  state.draftState = data.draft || null;
  renderDraft();
}

async function loadScouting() {
  const teamId = state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/scouting?team=${encodeURIComponent(teamId)}&limit=140`);
  state.scouting = payload.scouting || null;
  renderScouting();
}

async function loadDepthChart() {
  const teamId = (document.getElementById("depthTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const [payload, rosterPayload] = await Promise.all([
    api(`/api/depth-chart?team=${encodeURIComponent(teamId)}`),
    api(`/api/roster?team=${encodeURIComponent(teamId)}`)
  ]);
  state.depthChart = payload.depthChart || null;
  state.depthSnapShare = payload.snapShare || null;
  state.depthRoster = rosterPayload.roster || [];
  renderDepthChart();
}

async function loadSaves() {
  const payload = await api("/api/saves");
  state.saves = payload.slots || [];
  const text = state.saves.length
    ? state.saves.map((slot) => `${slot.slot} (${new Date(slot.updatedAt).toLocaleString()})`).join(" | ")
    : "No save slots yet.";
  document.getElementById("saveListText").textContent = text;
}

async function loadQa() {
  const year = state.dashboard?.currentYear || new Date().getFullYear();
  const payload = await api(`/api/qa/season?year=${year}`);
  const rows = Object.entries(payload.report.actual || {}).map(([metric, actual]) => ({
    metric,
    target: payload.report.target?.[metric],
    actual,
    delta: payload.report.deltas?.[metric]
  }));
  renderTable("qaTable", rows);
}

async function loadTeamHistory() {
  const teamId = document.getElementById("teamHistorySelect").value || state.dashboard?.controlledTeamId;
  const payload = await api(`/api/history/team?team=${encodeURIComponent(teamId)}`);
  renderTable(
    "teamHistoryTable",
    (payload.history?.seasons || []).map((season) => ({
      year: season.year,
      w: season.wins,
      l: season.losses,
      t: season.ties,
      pf: season.pf,
      pa: season.pa
    }))
  );
}

async function loadPlayerTimeline() {
  const playerId = document.getElementById("playerTimelineId").value.trim();
  if (!playerId) return;
  const payload = await api(`/api/history/player?playerId=${encodeURIComponent(playerId)}`);
  const rows = (payload.timeline?.timeline || []).map((entry) => ({
    year: entry.year,
    passYds: entry.stats?.passing?.yards || 0,
    passTd: entry.stats?.passing?.td || 0,
    rushYds: entry.stats?.rushing?.yards || 0,
    rushTd: entry.stats?.rushing?.td || 0,
    recYds: entry.stats?.receiving?.yards || 0,
    recTd: entry.stats?.receiving?.td || 0,
    tackles: entry.stats?.defense?.tackles || 0,
    sacks: entry.stats?.defense?.sacks || 0,
    ints: entry.stats?.defense?.int || 0
  }));
  renderTable("playerTimelineTable", rows);
}

async function refreshEverything() {
  await loadState();
  updateStatsControls();
  document.getElementById("analyticsYearFilter").value = String(state.dashboard?.currentYear || new Date().getFullYear());
  await Promise.all([
    loadRoster(),
    loadFreeAgency(),
    loadRetiredPool(),
    loadStats(),
    loadDraftState(),
    loadScouting(),
    loadDepthChart(),
    loadSaves(),
    loadQa(),
    loadTeamHistory(),
    loadCalendar(),
    loadTransactionLog(),
    loadNews(),
    loadPickAssets(),
    loadNegotiations(),
    loadAnalytics(),
    loadSettings(),
    loadStaff(),
    loadOwner(),
    loadObservability(),
    loadPersistence(),
    loadPipeline(),
    loadCalibrationJobs(),
    loadSimJobs()
  ]);
  renderCommandPalette();
  renderRulesTab();
  renderAnalyticsChart();
  renderRealismVerification();
}

async function runAction(fn, statusText = "Working...") {
  try {
    setStatus(statusText);
    await fn();
    setStatus("Ready");
    showToast("Done");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    showToast(`Error: ${error.message}`);
  }
}

function bindMenuTabs() {
  document.querySelectorAll(".menu-btn").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

function bindEvents() {
  bindMenuTabs();

  document.getElementById("backSetupBtn").addEventListener("click", () => {
    window.location.href = "/";
  });

  document.getElementById("teamSelect").addEventListener("change", (event) =>
    runAction(async () => {
      const response = await api("/api/control-team", { method: "POST", body: { teamId: event.target.value } });
      applyDashboard(response.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadRetiredPool(),
        loadStats(),
        loadDepthChart(),
        loadDraftState(),
        loadScouting(),
        loadTeamHistory(),
        loadCalendar(),
        loadTransactionLog(),
        loadNews(),
        loadPickAssets(),
        loadNegotiations(),
        loadStaff(),
        loadOwner(),
        loadPipeline(),
        loadObservability()
      ]);
    }, "Switching team...")
  );

  document.getElementById("advanceWeekBtn").addEventListener("click", () =>
    runAction(async () => {
      const response = await api("/api/advance-week", { method: "POST", body: { count: 1 } });
      applyDashboard(response.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadRetiredPool(),
        loadStats(),
        loadDraftState(),
        loadScouting(),
        loadQa(),
        loadTeamHistory(),
        loadCalendar(),
        loadTransactionLog(),
        loadNews(),
        loadOwner(),
        loadPipeline(),
        loadSimJobs()
      ]);
    }, "Advancing week...")
  );

  document.getElementById("advance4WeeksBtn").addEventListener("click", () =>
    runAction(async () => {
      const response = await api("/api/advance-week", { method: "POST", body: { count: 4 } });
      applyDashboard(response.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadRetiredPool(),
        loadStats(),
        loadDraftState(),
        loadScouting(),
        loadQa(),
        loadTeamHistory(),
        loadCalendar(),
        loadTransactionLog(),
        loadNews(),
        loadOwner(),
        loadPipeline(),
        loadSimJobs()
      ]);
    }, "Advancing 4 weeks...")
  );

  document.getElementById("advanceSeasonBtn").addEventListener("click", () =>
    runAction(async () => {
      const response = await api("/api/advance-season", { method: "POST", body: { count: 1 } });
      applyDashboard(response.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadStats(),
        loadDraftState(),
        loadScouting(),
        loadQa(),
        loadTeamHistory(),
        loadCalendar(),
        loadTransactionLog(),
        loadNews(),
        loadOwner(),
        loadPipeline(),
        loadSimJobs()
      ]);
    }, "Advancing season...")
  );

  document.getElementById("refreshBtn").addEventListener("click", () => runAction(refreshEverything, "Refreshing..."));

  document.getElementById("loadRosterBtn").addEventListener("click", () => runAction(loadRoster, "Loading roster..."));
  document.getElementById("loadFaBtn").addEventListener("click", () => runAction(loadFreeAgency, "Loading pool..."));
  document.getElementById("loadStatsBtn").addEventListener("click", () => runAction(loadStats, "Loading stats..."));
  document.getElementById("rosterTeamSelect").addEventListener("change", () => runAction(loadRoster, "Loading roster..."));
  ["rosterPosFilter", "rosterMinOverallFilter", "rosterMinAgeFilter", "rosterMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadRoster, "Filtering roster..."));
  });
  ["faMinOverallFilter", "faMinAgeFilter", "faMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadFreeAgency, "Filtering pool..."));
  });
  document.getElementById("loadRetiredBtn").addEventListener("click", () =>
    runAction(loadRetiredPool, "Loading retired pool...")
  );
  ["retiredPosFilter", "retiredMinOverallFilter", "retiredMinAgeFilter", "retiredMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadRetiredPool, "Filtering retired pool..."));
  });

  document.getElementById("rosterTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;
    const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
    const playerId = button.dataset.id;
    const act = button.dataset.act;

    runAction(async () => {
      if (act === "release") await api("/api/release", { method: "POST", body: { teamId, playerId } });
      if (act === "ps") await api("/api/practice-squad", { method: "POST", body: { teamId, playerId, moveToPractice: true } });
      if (act === "active") await api("/api/practice-squad", { method: "POST", body: { teamId, playerId, moveToPractice: false } });
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadCalendar(), loadTransactionLog()]);
    }, "Applying roster move...");
  });

  document.getElementById("faTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    runAction(async () => {
      const teamId = state.dashboard?.controlledTeamId;
      const playerId = button.dataset.id;
      if (button.dataset.act === "sign") {
        await api("/api/sign", { method: "POST", body: { teamId, playerId } });
      } else if (button.dataset.act === "offer") {
        await api("/api/free-agency/offer", { method: "POST", body: { teamId, playerId, years: 2 } });
      } else {
        await api("/api/waiver-claim", { method: "POST", body: { teamId, playerId } });
      }
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadTransactionLog(), loadNews()]);
    }, "Processing transaction...");
  });

  document.getElementById("retiredTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-retired-override-id]");
    if (!button) return;
    document.getElementById("retirementOverridePlayerId").value = button.dataset.retiredOverrideId || "";
  });

  document.getElementById("retirementOverrideBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamId = (document.getElementById("retirementOverrideTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/retirement/override", {
        method: "POST",
        body: {
          playerId: document.getElementById("retirementOverridePlayerId").value.trim(),
          teamId,
          minWinningPct: Number(document.getElementById("retirementOverrideWinPct").value || 0.55),
          forceSign: true
        }
      });
      await Promise.all([loadState(), loadRoster(), loadRetiredPool(), loadTransactionLog(), loadNews()]);
    }, "Applying retirement override...")
  );

  document.getElementById("applyDesignationBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: document.getElementById("designationPlayerId").value.trim(),
          designation: document.getElementById("designationType").value,
          active: true
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Applying designation...")
  );

  document.getElementById("clearDesignationBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: document.getElementById("designationPlayerId").value.trim(),
          designation: document.getElementById("designationType").value,
          active: false
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Clearing designation...")
  );

  const moveRosterBoard = (direction) => {
    const playerId = document.getElementById("boardPlayerId").value.trim();
    if (!playerId) return;
    const index = state.roster.findIndex((player) => player.id === playerId);
    if (index < 0) return;
    const swapWith = direction < 0 ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= state.roster.length) return;
    const copy = [...state.roster];
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
    state.roster = copy;
    renderRosterBoard();
  };
  document.getElementById("boardMoveUpBtn").addEventListener("click", () => moveRosterBoard(-1));
  document.getElementById("boardMoveDownBtn").addEventListener("click", () => moveRosterBoard(1));

  document.getElementById("tradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamA = document.getElementById("tradeTeamA").value;
      const teamB = document.getElementById("tradeTeamB").value;
      const payload = {
        teamA,
        teamB,
        teamAPlayerIds: parseIds(document.getElementById("tradeAIds").value),
        teamBPlayerIds: parseIds(document.getElementById("tradeBIds").value),
        teamAPickIds: parseIds(document.getElementById("tradeAPickIds").value),
        teamBPickIds: parseIds(document.getElementById("tradeBPickIds").value)
      };
      const result = await api("/api/trade", {
        method: "POST",
        body: payload
      });
      const aDelta = result.valuation?.[teamA]?.delta || 0;
      const bDelta = result.valuation?.[teamB]?.delta || 0;
      setTradeEvalText(`Trade accepted. ${teamA} delta ${aDelta}, ${teamB} delta ${bDelta}`);
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadTransactionLog()]);
    }, "Executing trade...")
  );

  document.getElementById("tradeTeamA").addEventListener("change", () =>
    runAction(async () => {
      const teamId = document.getElementById("tradeTeamA").value;
      const payload = await api(`/api/picks?team=${encodeURIComponent(teamId)}`);
      state.picks = payload.picks || [];
      renderPickAssets();
    }, "Loading pick assets...")
  );

  document.getElementById("evaluateTradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamA = document.getElementById("tradeTeamA").value;
      const teamB = document.getElementById("tradeTeamB").value;
      const payload = {
        teamA,
        teamB,
        teamAPlayerIds: parseIds(document.getElementById("tradeAIds").value),
        teamBPlayerIds: parseIds(document.getElementById("tradeBIds").value),
        teamAPickIds: parseIds(document.getElementById("tradeAPickIds").value),
        teamBPickIds: parseIds(document.getElementById("tradeBPickIds").value)
      };
      const result = await api("/api/trade/evaluate", { method: "POST", body: payload });
      const a = result.valuation?.[teamA];
      const b = result.valuation?.[teamB];
      setTradeEvalText(
        `${teamA}: in ${a?.incomingValue ?? 0} / out ${a?.outgoingValue ?? 0} | ${teamB}: in ${b?.incomingValue ?? 0} / out ${b?.outgoingValue ?? 0}`
      );
    }, "Evaluating trade...")
  );

  document.getElementById("tradeWizardEvaluateBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamA = document.getElementById("tradeTeamA").value;
      const teamB = document.getElementById("tradeTeamB").value;
      const parseWizardAssets = (text) => {
        const ids = parseIds(text);
        return {
          players: ids.filter((id) => !id.startsWith("PICK-") && !id.startsWith("COMP-")),
          picks: ids.filter((id) => id.startsWith("PICK-") || id.startsWith("COMP-"))
        };
      };
      const aAssets = parseWizardAssets(document.getElementById("tradeWizardA").value);
      const bAssets = parseWizardAssets(document.getElementById("tradeWizardB").value);
      const result = await api("/api/trade/evaluate", {
        method: "POST",
        body: {
          teamA,
          teamB,
          teamAPlayerIds: aAssets.players,
          teamBPlayerIds: bAssets.players,
          teamAPickIds: aAssets.picks,
          teamBPickIds: bAssets.picks
        }
      });
      const a = result.valuation?.[teamA] || {};
      const b = result.valuation?.[teamB] || {};
      const fairness = Math.max(0, 100 - Math.abs((a.delta || 0) - (b.delta || 0)) * 4);
      document.getElementById("tradeFairnessScore").textContent = `${fairness.toFixed(0)} / 100`;
      document.getElementById("tradeCapDeltaA").textContent = fmtDeltaMoney(a.capDelta || 0);
      document.getElementById("tradeCapDeltaB").textContent = fmtDeltaMoney(b.capDelta || 0);
    }, "Evaluating trade wizard...")
  );

  document.getElementById("resignBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/contracts/resign", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerId: document.getElementById("resignPlayerId").value.trim(),
          years: Number(document.getElementById("resignYears").value || 3)
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Re-signing...")
  );

  document.getElementById("restructureBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/contracts/restructure", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerId: document.getElementById("restructurePlayerId").value.trim()
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Restructuring...")
  );

  document.getElementById("franchiseTagBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/contracts/franchise-tag", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerId: document.getElementById("tagPlayerId").value.trim()
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Applying franchise tag...")
  );

  document.getElementById("fifthOptionBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/contracts/fifth-year-option", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerId: document.getElementById("optionPlayerId").value.trim()
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Applying fifth-year option...")
  );

  document.getElementById("negotiateBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/contracts/negotiate", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerId: document.getElementById("negotiatePlayerId").value.trim(),
          years: Number(document.getElementById("negotiateYears").value || 0) || null,
          salary: Number(document.getElementById("negotiateSalary").value || 0) || null
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog(), loadNegotiations()]);
    }, "Negotiating contract...")
  );

  document.getElementById("negotiationTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-negotiate-id]");
    if (!button) return;
    document.getElementById("negotiatePlayerId").value = button.dataset.negotiateId || "";
  });

  document.getElementById("tagEligibleTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-fill]");
    if (!button) return;
    const playerId = button.dataset.playerId || "";
    if (button.dataset.contractFill === "tag") document.getElementById("tagPlayerId").value = playerId;
    if (button.dataset.contractFill === "option") document.getElementById("optionPlayerId").value = playerId;
    updateContractPreview();
  });

  document.getElementById("optionEligibleTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-fill]");
    if (!button) return;
    const playerId = button.dataset.playerId || "";
    if (button.dataset.contractFill === "tag") document.getElementById("tagPlayerId").value = playerId;
    if (button.dataset.contractFill === "option") document.getElementById("optionPlayerId").value = playerId;
    updateContractPreview();
  });

  document.getElementById("tagPlayerId").addEventListener("input", updateContractPreview);
  document.getElementById("optionPlayerId").addEventListener("input", updateContractPreview);

  document.getElementById("loadDepthBtn").addEventListener("click", () => runAction(loadDepthChart, "Loading depth chart..."));
  document.getElementById("saveDepthBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/depth-chart", {
        method: "POST",
        body: {
          teamId: document.getElementById("depthTeamSelect").value,
          position: document.getElementById("depthPositionSelect").value,
          playerIds: parseIds(document.getElementById("depthIdsInput").value)
        }
      });
      await loadDepthChart();
    }, "Saving depth chart...")
  );

  document.getElementById("prepareDraftBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/prepare", { method: "POST", body: {} });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadCalendar()]);
    }, "Preparing draft...")
  );

  document.getElementById("cpuDraftBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 224, untilUserPick: true } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Running CPU draft...")
  );

  document.getElementById("cpuDraftAllBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 224, untilUserPick: false } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Finishing draft...")
  );

  document.getElementById("userPickBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/user-pick", {
        method: "POST",
        body: { playerId: document.getElementById("userPickPlayerId").value.trim() }
      });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Submitting user pick...")
  );

  document.getElementById("loadScoutingBtn").addEventListener("click", () =>
    runAction(loadScouting, "Loading scouting board...")
  );

  document.getElementById("allocateScoutingBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/scouting/allocate", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerId: document.getElementById("scoutPlayerId").value.trim(),
          points: Number(document.getElementById("scoutPointsInput").value || 10)
        }
      });
      await loadScouting();
    }, "Scouting prospect...")
  );

  document.getElementById("lockBoardBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/scouting/lock-board", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerIds: parseIds(document.getElementById("lockBoardIdsInput").value)
        }
      });
      await loadScouting();
    }, "Locking board...")
  );

  document.getElementById("scopeFilter").addEventListener("change", () =>
    runAction(async () => {
      updateStatsControls();
      await loadStats();
    }, "Loading stats...")
  );
  ["categoryFilter", "positionFilter", "statsTeamFilter", "yearFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadStats, "Loading stats..."));
  });
  document.getElementById("statsVirtualizedToggle").addEventListener("change", () => applyStatsSort());
  document.getElementById("comparePlayersBtn").addEventListener("click", () =>
    runAction(loadComparePlayers, "Comparing players...")
  );

  document.getElementById("leadersCategory").addEventListener("change", () => {
    renderLeaders();
  });

  document.getElementById("prevScheduleWeekBtn").addEventListener("click", () =>
    runAction(() => loadScheduleWeek((state.scheduleWeek || state.dashboard?.currentWeek || 1) - 1), "Loading schedule...")
  );

  document.getElementById("nextScheduleWeekBtn").addEventListener("click", () =>
    runAction(() => loadScheduleWeek((state.scheduleWeek || state.dashboard?.currentWeek || 1) + 1), "Loading schedule...")
  );

  document.getElementById("loadCalendarBtn").addEventListener("click", () =>
    runAction(loadCalendar, "Loading calendar...")
  );

  document.getElementById("calendarYearFilter").addEventListener("change", () =>
    runAction(loadCalendar, "Loading calendar year...")
  );

  document.getElementById("calendarWeekFilter").addEventListener("change", () => {
    state.calendarWeek = Number(document.getElementById("calendarWeekFilter").value || 1);
    renderCalendar();
  });

  document.getElementById("loadTxBtn").addEventListener("click", () =>
    runAction(loadTransactionLog, "Loading transaction log...")
  );
  ["txTeamFilter", "txTypeFilter", "txYearFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadTransactionLog, "Loading transaction log..."));
  });

  document.getElementById("loadAnalyticsBtn").addEventListener("click", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );

  document.getElementById("analyticsYearFilter").addEventListener("change", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );
  document.getElementById("analyticsTeamFilter").addEventListener("change", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );

  document.getElementById("saveSettingsBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = await api("/api/settings", {
        method: "POST",
        body: {
          allowInjuries: document.getElementById("settingAllowInjuries").checked,
          autoProgressOffseason: document.getElementById("settingAutoOffseason").checked,
          enableOwnerMode: document.getElementById("settingEnableOwnerMode").checked,
          enableNarratives: document.getElementById("settingEnableNarratives").checked,
          enableCompPicks: document.getElementById("settingEnableCompPicks").checked,
          enableChemistry: document.getElementById("settingEnableChemistry").checked,
          retirementWinningRetention: document.getElementById("settingRetirementWinningRetention").checked,
          retirementOverrideMinWinningPct: Number(document.getElementById("settingRetirementMinWinPct").value || 0.55),
          eraProfile: document.getElementById("settingEraProfile").value,
          injuryRateMultiplier: Number(document.getElementById("settingInjuryRate").value || 1),
          capGrowthRate: Number(document.getElementById("settingCapGrowth").value || 0.045),
          cpuTradeAggression: Number(document.getElementById("settingTradeAggression").value || 0.5)
        }
      });
      state.leagueSettings = payload.settings || state.leagueSettings;
      applySettingsControls();
      applyDashboard(payload.state);
    }, "Saving settings...")
  );

  document.getElementById("ownerTeamSelect").addEventListener("change", () =>
    runAction(loadOwner, "Loading owner...")
  );
  document.getElementById("loadOwnerBtn").addEventListener("click", () =>
    runAction(loadOwner, "Loading owner...")
  );
  document.getElementById("saveOwnerBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/owner", {
        method: "POST",
        body: {
          teamId: document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId,
          ticketPrice: Number(document.getElementById("ownerTicketPriceInput").value || 0) || null,
          staffBudget: Number(document.getElementById("ownerStaffBudgetInput").value || 0) || null,
          training: Number(document.getElementById("ownerTrainingInput").value || 0) || null,
          rehab: Number(document.getElementById("ownerRehabInput").value || 0) || null,
          analytics: Number(document.getElementById("ownerAnalyticsInput").value || 0) || null
        }
      });
      await Promise.all([loadState(), loadOwner(), loadTransactionLog()]);
    }, "Saving owner settings...")
  );

  document.getElementById("loadObservabilityBtn").addEventListener("click", () =>
    runAction(loadObservability, "Loading metrics...")
  );
  document.getElementById("loadPersistenceBtn").addEventListener("click", () =>
    runAction(loadPersistence, "Loading persistence...")
  );
  document.getElementById("runCalibrationJobBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/calibration/jobs", {
        method: "POST",
        body: { year: state.dashboard?.currentYear, samples: 40, label: "ui-run" }
      });
      await loadCalibrationJobs();
    }, "Running calibration job...")
  );
  document.getElementById("runRealismVerifyBtn").addEventListener("click", () =>
    runAction(runRealismVerification, "Running 10-20 year realism verification...")
  );
  document.getElementById("loadPipelineBtn").addEventListener("click", () =>
    runAction(loadPipeline, "Loading pipeline...")
  );
  document.getElementById("advancePipelineBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/offseason/advance", { method: "POST", body: {} });
      await Promise.all([loadState(), loadPipeline(), loadRoster(), loadNews()]);
    }, "Advancing pipeline...")
  );

  document.getElementById("staffTeamSelect").addEventListener("change", () =>
    runAction(loadStaff, "Loading staff...")
  );

  document.getElementById("updateStaffBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = await api("/api/staff", {
        method: "POST",
        body: {
          teamId: document.getElementById("staffTeamSelect").value || state.dashboard?.controlledTeamId,
          role: document.getElementById("staffRoleSelect").value,
          name: document.getElementById("staffNameInput").value.trim() || null,
          playcalling: Number(document.getElementById("staffPlaycallingInput").value || 75),
          development: Number(document.getElementById("staffDevelopmentInput").value || 75),
          discipline: Number(document.getElementById("staffDisciplineInput").value || 75),
          yearsRemaining: Number(document.getElementById("staffYearsInput").value || 3)
        }
      });
      state.staffState = payload.team || state.staffState;
      renderStaff();
      applyDashboard(payload.state);
    }, "Updating staff...")
  );

  document.getElementById("startSimJobBtn").addEventListener("click", () =>
    runAction(async () => {
      const seasons = Number(document.getElementById("jobSeasonsInput").value || 10);
      await api("/api/jobs/simulate", { method: "POST", body: { seasons } });
      await loadSimJobs();
    }, "Starting simulation job...")
  );
  document.getElementById("refreshJobsBtn").addEventListener("click", () =>
    runAction(loadSimJobs, "Refreshing jobs...")
  );

  document.getElementById("prevStatsPageBtn").addEventListener("click", () => {
    state.statsPage = Math.max(1, state.statsPage - 1);
    applyStatsSort();
  });

  document.getElementById("nextStatsPageBtn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.statsRows.length / state.statsPageSize));
    state.statsPage = Math.min(totalPages, state.statsPage + 1);
    applyStatsSort();
  });

  document.getElementById("loadPlayerTimelineBtn").addEventListener("click", () =>
    runAction(loadPlayerTimeline, "Loading player history...")
  );
  document.getElementById("loadTeamHistoryBtn").addEventListener("click", () => runAction(loadTeamHistory, "Loading team history..."));

  document.getElementById("saveBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      await api("/api/saves/save", { method: "POST", body: { slot } });
      await loadSaves();
    }, "Saving league...")
  );

  document.getElementById("loadBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      const payload = await api("/api/saves/load", { method: "POST", body: { slot } });
      applyDashboard(payload.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadStats(),
        loadDraftState(),
        loadScouting(),
        loadDepthChart(),
        loadQa(),
        loadTeamHistory(),
        loadSaves(),
        loadCalendar(),
        loadTransactionLog(),
        loadOwner(),
        loadPipeline(),
        loadObservability(),
        loadCalibrationJobs(),
        loadSimJobs()
      ]);
    }, "Loading save...")
  );

  document.getElementById("deleteSaveBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      await api("/api/saves/delete", { method: "POST", body: { slot } });
      await loadSaves();
    }, "Deleting save...")
  );

  document.getElementById("loadQaBtn").addEventListener("click", () => runAction(loadQa, "Loading QA report..."));

  const openCommandPalette = () => {
    document.getElementById("commandPalette").classList.remove("hidden");
    document.getElementById("commandInput").focus();
    renderCommandPalette();
  };
  const closeCommandPalette = () => {
    document.getElementById("commandPalette").classList.add("hidden");
  };
  document.getElementById("commandPaletteBtn").addEventListener("click", openCommandPalette);
  document.getElementById("closeCommandPaletteBtn").addEventListener("click", closeCommandPalette);
  document.getElementById("commandInput").addEventListener("input", (event) => {
    state.commandFilter = event.target.value || "";
    renderCommandPalette();
  });
  document.getElementById("commandTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-command-id]");
    if (!button) return;
    const id = button.dataset.commandId;
    closeCommandPalette();
    if (id === "overview") activateTab("overviewTab");
    if (id === "roster") activateTab("rosterTab");
    if (id === "transactions") activateTab("transactionsTab");
    if (id === "stats") activateTab("statsTab");
    if (id === "rules") activateTab("rulesTab");
    if (id === "settings") activateTab("settingsTab");
    if (id === "advance-week") document.getElementById("advanceWeekBtn").click();
    if (id === "refresh") document.getElementById("refreshBtn").click();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
      return;
    }
    if (event.key === "Escape") {
      closeCommandPalette();
      closePlayerModal();
      return;
    }
    if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (document.activeElement?.tagName !== "INPUT") {
        document.getElementById("refreshBtn").click();
      }
    }
  });

  document.addEventListener("click", (event) => {
    const playerButton = event.target.closest("button[data-player-id]");
    if (playerButton) {
      runAction(() => loadPlayerModal(playerButton.dataset.playerId), "Loading player...");
      return;
    }
    const modal = document.getElementById("playerModal");
    if (event.target === modal) closePlayerModal();
    const commandModal = document.getElementById("commandPalette");
    if (event.target === commandModal) closeCommandPalette();
  });

  document.getElementById("closePlayerModalBtn").addEventListener("click", () => {
    closePlayerModal();
  });
}

async function init() {
  bindEvents();
  activateTab("overviewTab");
  await refreshEverything();
  setInterval(() => {
    loadSimJobs().catch(() => {});
  }, 8000);
  setStatus("Ready");
}

init();










