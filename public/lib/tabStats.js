import { state, api, STATS_BENCHMARK_HINTS } from "./appState.js";
import { decoratePlayerColumnFromRows, escapeHtml, renderTable, shouldHideInternalColumn, teamCode, toTitleCaseKey, valueAsNumber } from "./appCore.js";

export function updateStatsControls() {
  const scope = document.getElementById("scopeFilter").value;
  const category = document.getElementById("categoryFilter");
  const position = document.getElementById("positionFilter");
  const year = document.getElementById("yearFilter");
  const seasonType = document.getElementById("statsSeasonTypeFilter");

  if (scope === "team") {
    category.disabled = true;
    position.disabled = true;
    year.disabled = false;
    if (seasonType) seasonType.disabled = true;
    renderStatsBenchmarkHint();
    return;
  }

  if (scope === "career") {
    category.disabled = false;
    position.disabled = false;
    year.disabled = true;
    if (seasonType) seasonType.disabled = false;
    renderStatsBenchmarkHint();
    return;
  }

  category.disabled = false;
  position.disabled = false;
  year.disabled = false;
  if (seasonType) seasonType.disabled = false;
  renderStatsBenchmarkHint();
}

export function renderStatsBenchmarkHint() {
  const box = document.getElementById("statsBenchmarkText");
  if (!box) return;
  const scope = document.getElementById("scopeFilter")?.value || "season";
  const category = scope === "team" ? "team" : document.getElementById("categoryFilter")?.value || "passing";
  const position = document.getElementById("positionFilter")?.value || "";
  const seasonType = document.getElementById("statsSeasonTypeFilter")?.value || "regular";
  const hints = STATS_BENCHMARK_HINTS[category] || {};
  const base = hints[position] || hints.default || "Benchmarks are unavailable for this view.";
  const qualifiers = [];
  if (scope === "career") qualifiers.push("Career tables aggregate seasons, so use the baseline as a role anchor, not a direct total target.");
  if (scope === "season" && seasonType !== "regular") qualifiers.push("Displayed benchmark is still based on regular-season starter samples.");
  if (scope === "season" && !position && ["receiving", "rushing", "defense"].includes(category)) {
    qualifiers.push("Choose a position filter for the cleanest NFL-average comparison.");
  }
  box.textContent = [base, ...qualifiers].join(" ");
}

export function applyStatsSort() {
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
    maxRows: virtualized ? 80 : null,
    hiddenColumns: state.statsHiddenColumns
  });
  decoratePlayerColumnFromRows("statsTable", pageRows, { idKeys: ["playerId"] });

  document.getElementById("statsPageText").textContent = `Page ${state.statsPage}/${totalPages} (${rows.length} rows)`;
  renderStatsColumnFilters(rows[0] ? Object.keys(rows[0]).filter((key) => !shouldHideInternalColumn(key)) : []);
}

export function renderStatsColumnFilters(columns) {
  const container = document.getElementById("statsColumnFilters");
  if (!container) return;
  if (!columns.length) {
    container.innerHTML = "<span class=\"small\">No columns loaded</span>";
    return;
  }
  container.innerHTML = columns
    .map((column) => {
      const checked = !state.statsHiddenColumns.includes(column);
      return `<label><input type="checkbox" data-stats-column="${escapeHtml(column)}" ${checked ? "checked" : ""} /> ${escapeHtml(toTitleCaseKey(column))}</label>`;
    })
    .join("");
}

export function renderComparePlayers() {
  const rows = (state.comparePlayers || []).map((player) => ({
    id: player.id,
    name: player.name,
    tm: teamCode(player.teamId),
    pos: player.position,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    age: player.age,
    dev: player.developmentTrait
  }));
  renderTable("comparePlayersTable", rows);
  decoratePlayerColumnFromRows("comparePlayersTable", rows, { nameKey: "name", idKeys: ["id"] });
  const label = document.getElementById("compareSelectedPlayersText");
  if (label) {
    const names = (state.comparePlayers || []).map((player) => player.name);
    label.textContent = `Selected: ${state.comparePlayerIds.length} / 8${names.length ? ` (${names.join(", ")})` : ""}`;
  }
}

export function renderCompareSearchResults() {
  const rows = (state.compareSearchResults || []).map((player) => ({
    id: player.id,
    player: player.name,
    tm: teamCode(player.teamId),
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    status: player.status,
    action: ""
  }));
  renderTable("comparePlayerSearchTable", rows);
  decoratePlayerColumnFromRows("comparePlayerSearchTable", rows, { idKeys: ["id"] });
  document.getElementById("comparePlayerSearchTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected = state.comparePlayerIds.includes(row.id);
    cell.innerHTML = `<button data-compare-player-toggle="${escapeHtml(row.id)}">${isSelected ? "Remove" : "Add"}</button>`;
  });
}

export function renderAnalyticsChart() {
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
