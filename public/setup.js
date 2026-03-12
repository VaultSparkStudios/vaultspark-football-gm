import {
  createApiClient,
  getRuntimeMode,
  isServerRuntimeAvailable,
  setRuntimeMode,
  warmLocalRuntime
} from "./lib/api/createApiClient.js";

const state = {
  currentYear: new Date().getFullYear(),
  saves: [],
  savesDeferred: false,
  teams: [],
  saveSearch: "",
  backups: [],
  backupsDeferred: false,
  configCatalog: null,
  settings: null,
  setupDiagnostics: null
};

const api = createApiClient();
let setupLoadVersion = 0;

const MODE_HELP = {
  drive: "Drive resolves games possession-by-possession. It is faster for long sims and keeps weekly progression moving.",
  play: "Play resolves more individual play outcomes. It is slower, but gives more granular stat swings and box-score detail."
};

const SETUP_GUIDE_ROWS = [
  "Choose `Drive` for faster weekly simulation or `Play` for more granular play-level outcomes.",
  "Era profiles change league tendencies: `Modern Pass` pushes more passing volume, `Balanced` stays near league-average, and `Legacy` tilts toward a lower-tempo run-heavy environment.",
  "Franchise archetypes now shape the opening challenge: rebuilds buy patience, contenders raise pressure, and cap-hell/no-QB starts add immediate roster stress.",
  "Rules, difficulty, and challenge presets compose into league settings first, then any checkbox overrides apply on top.",
  "Randomized leagues now use one real U.S. city plus one generated nickname per team for a single clean identity in each save.",
  "After league creation, the controlled team becomes the default roster and depth-chart focus in the franchise view."
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(text) {
  const el = document.getElementById("setupStatus");
  if (el) el.textContent = text;
}

function setupStatusText(base = "Ready") {
  const diag = state.setupDiagnostics || {};
  const parts = [base];
  if (Number.isFinite(diag.clientInitMs)) parts.push(`client ${diag.clientInitMs}ms`);
  if (Number.isFinite(diag.totalMs)) parts.push(`api ${diag.totalMs}ms`);
  if (Number.isFinite(diag.savesMs) && !diag.savesDeferred) parts.push(`saves ${diag.savesMs}ms`);
  if (diag.savesDeferred) parts.push("saves deferred");
  return parts.join(" | ");
}

function pageUrl(page) {
  return new URL(`./${page}`, document.baseURI).toString();
}

function teamCode(team) {
  return team?.abbrev || team?.id || "-";
}

function applyRuntimeModeUi() {
  const select = document.getElementById("runtimeModeSelect");
  if (!select) return;
  const serverAvailable = isServerRuntimeAvailable();
  const mode = getRuntimeMode();
  select.value = mode;
  const serverOption = select.querySelector('option[value="server"]');
  if (serverOption) serverOption.disabled = !serverAvailable;
  const pathInput = document.getElementById("pfrPathInput");
  const profileInput = document.getElementById("profilePathInput");
  const description = document.getElementById("runtimeModeDescription");
  const disabled = mode === "client";
  if (pathInput) pathInput.disabled = disabled;
  if (profileInput) profileInput.disabled = disabled;
  if (description) {
    description.textContent = serverAvailable
      ? "Client-only mode stores leagues in this browser and does not use filesystem path imports."
      : "This Pages deployment is client-only. Server-backed mode requires a live backend and is unavailable here.";
  }
}

function renderSetupGuide() {
  const box = document.getElementById("setupGuideContent");
  if (!box) return;
  box.innerHTML = SETUP_GUIDE_ROWS.map((row) => `<div class="record">${escapeHtml(row)}</div>`).join("");
}

function updateModeHelp() {
  const mode = document.getElementById("modeInput")?.value || "drive";
  const text = document.getElementById("modeHelpText");
  const tip = document.getElementById("modeHelpTip");
  if (text) text.textContent = MODE_HELP[mode] || MODE_HELP.drive;
  if (tip) tip.title = MODE_HELP[mode] || MODE_HELP.drive;
}

function renderTeams() {
  const select = document.getElementById("teamSelect");
  if (!select) return;

  if (!state.teams.length) {
    select.innerHTML = "<option value=\"BUF\">BUF - Buffalo Bills</option>";
    return;
  }

  select.innerHTML = state.teams
    .map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(teamCode(team))} - ${escapeHtml(team.name)}</option>`)
    .join("");

  if (state.teams.some((team) => team.id === "BUF")) {
    select.value = "BUF";
  }
}

function renderActiveLeague(activeLeague) {
  const text = document.getElementById("activeLeagueText");
  const button = document.getElementById("continueActiveBtn");
  if (!activeLeague || !activeLeague.currentYear) {
    text.textContent = "No active league in memory.";
    button.disabled = true;
    return;
  }

  const team = activeLeague.controlledTeamAbbrev || activeLeague.controlledTeamId || "-";
  const name = activeLeague.controlledTeamName ? ` - ${activeLeague.controlledTeamName}` : "";
  const mode = activeLeague.mode ? ` | ${activeLeague.mode}` : "";
  const config = activeLeague.configSummary
    ? ` | ${activeLeague.configSummary.franchiseArchetype?.label || ""} / ${activeLeague.configSummary.difficultyPreset?.label || ""}`
    : "";
  text.textContent = `Active: ${activeLeague.currentYear} W${activeLeague.currentWeek} (${activeLeague.phase}) Team ${team}${name}${mode}${config}`;
  button.disabled = false;
}

function renderConfigSelect(selectId, options = [], selectedId = null) {
  const select = document.getElementById(selectId);
  if (!select || !Array.isArray(options) || !options.length) return;
  select.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label || option.id)}</option>`)
    .join("");
  select.value = selectedId && options.some((entry) => entry.id === selectedId) ? selectedId : options[0].id;
}

function findCatalogEntry(collection, id) {
  return (collection || []).find((entry) => entry.id === id) || null;
}

function renderConfigSummary() {
  const box = document.getElementById("configSummaryContent");
  if (!box || !state.configCatalog) return;
  const entries = [
    findCatalogEntry(state.configCatalog.eraProfiles, document.getElementById("eraProfileInput")?.value),
    findCatalogEntry(state.configCatalog.franchiseArchetypes, document.getElementById("franchiseArchetypeInput")?.value),
    findCatalogEntry(state.configCatalog.rulesPresets, document.getElementById("rulesPresetInput")?.value),
    findCatalogEntry(state.configCatalog.difficultyPresets, document.getElementById("difficultyPresetInput")?.value),
    findCatalogEntry(state.configCatalog.challengeModes, document.getElementById("challengeModeInput")?.value)
  ].filter(Boolean);
  box.innerHTML = entries
    .map((entry) => `<div class="record"><strong>${escapeHtml(entry.label || entry.id)}</strong>: ${escapeHtml(entry.summary || "")}</div>`)
    .join("");
}

function applySettingsToForm(settings = {}) {
  state.settings = settings;
  if (settings.eraProfile) document.getElementById("eraProfileInput").value = settings.eraProfile;
  if (settings.franchiseArchetype) document.getElementById("franchiseArchetypeInput").value = settings.franchiseArchetype;
  if (settings.rulesPreset) document.getElementById("rulesPresetInput").value = settings.rulesPreset;
  if (settings.difficultyPreset) document.getElementById("difficultyPresetInput").value = settings.difficultyPreset;
  if (settings.challengeMode) document.getElementById("challengeModeInput").value = settings.challengeMode;
  if (settings.enableOwnerMode != null) document.getElementById("ownerModeInput").checked = settings.enableOwnerMode === true;
  if (settings.enableNarratives != null) document.getElementById("narrativesInput").checked = settings.enableNarratives === true;
  if (settings.enableCompPicks != null) document.getElementById("compPicksInput").checked = settings.enableCompPicks === true;
  if (settings.enableChemistry != null) document.getElementById("chemistryInput").checked = settings.enableChemistry === true;
  renderConfigSummary();
}

function renderConfigCatalog(catalog = null, settings = {}) {
  state.configCatalog = catalog;
  if (!catalog) return;
  renderConfigSelect("eraProfileInput", catalog.eraProfiles, settings.eraProfile);
  renderConfigSelect("franchiseArchetypeInput", catalog.franchiseArchetypes, settings.franchiseArchetype);
  renderConfigSelect("rulesPresetInput", catalog.rulesPresets, settings.rulesPreset);
  renderConfigSelect("difficultyPresetInput", catalog.difficultyPresets, settings.difficultyPreset);
  renderConfigSelect("challengeModeInput", catalog.challengeModes, settings.challengeMode);
  applySettingsToForm(settings);
}

function renderSaves() {
  const table = document.getElementById("savesTable");
  const latestBtn = document.getElementById("resumeLatestBtn");
  if (!table) return;
  if (state.savesDeferred) {
    table.innerHTML = "<tr><td>Saved leagues are loading in the background. Click Refresh Saves if this takes too long.</td></tr>";
    if (latestBtn) latestBtn.disabled = true;
    return;
  }

  const needle = state.saveSearch.trim().toLowerCase();
  const filtered = !needle
    ? state.saves
    : state.saves.filter((save) => {
        const meta = save.meta || {};
        const haystack = [
          save.slot,
          meta.currentYear,
          meta.phase,
          meta.controlledTeamAbbrev,
          meta.controlledTeamId,
          meta.controlledTeamName
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });

  if (!filtered.length) {
    table.innerHTML = "<tr><td>No saved leagues yet.</td></tr>";
    if (latestBtn) latestBtn.disabled = state.saves.length === 0;
    return;
  }

  const rows = filtered
    .map((save) => {
      const meta = save.meta || {};
      const season = meta.currentYear ? `${meta.currentYear} W${meta.currentWeek || 1}` : "-";
      const teamCodeValue = meta.controlledTeamAbbrev || meta.controlledTeamId || "-";
      const team = meta.controlledTeamId
        ? `${teamCodeValue}${meta.controlledTeamName ? ` - ${meta.controlledTeamName}` : ""}`
        : "-";
      return (
        `<tr>` +
        `<td>${escapeHtml(save.slot)}</td>` +
        `<td>${escapeHtml(season)}</td>` +
        `<td>${escapeHtml(meta.phase || "-")}</td>` +
        `<td>${escapeHtml(team)}</td>` +
        `<td>${escapeHtml(String(meta.seasonsSimulated ?? 0))}</td>` +
        `<td>${escapeHtml(new Date(save.updatedAt).toLocaleString())}</td>` +
        `<td>${escapeHtml((save.sizeBytes / 1024).toFixed(1))} KB</td>` +
        `<td><button data-resume="${escapeHtml(save.slot)}">Resume</button></td>` +
        `<td><button data-slot="${escapeHtml(save.slot)}">Use Slot</button></td>` +
        `</tr>`
      );
    })
    .join("");

  table.innerHTML =
    "<tr><th>Slot</th><th>Season</th><th>Phase</th><th>Team</th><th>Seasons</th><th>Updated</th><th>Size</th><th>Resume</th><th>Save Slot</th></tr>" +
    rows;
  if (latestBtn) latestBtn.disabled = state.saves.length === 0;
}

async function refreshSaves({ preserveStatus = false, loadVersion = setupLoadVersion } = {}) {
  const started = performance.now();
  const payload = await api("/api/saves");
  if (loadVersion !== setupLoadVersion) return;
  state.saves = payload.slots || [];
  state.savesDeferred = false;
  state.setupDiagnostics = {
    ...(state.setupDiagnostics || {}),
    savesMs: Math.round(performance.now() - started),
    savesDeferred: false
  };
  renderSaves();
  if (!preserveStatus) setStatus(setupStatusText("Ready"));
}

function renderBackups() {
  const table = document.getElementById("backupsTable");
  if (!table) return;
  if (state.backupsDeferred) {
    table.innerHTML = "<tr><td>Backups are not loaded on first open. Click Refresh Backups to load them.</td></tr>";
    return;
  }
  if (!state.backups.length) {
    table.innerHTML = "<tr><td>No backups yet.</td></tr>";
    return;
  }

  const rows = state.backups
    .map((save) => {
      const meta = save.meta || {};
      const season = meta.currentYear ? `${meta.currentYear} W${meta.currentWeek || 1}` : "-";
      const reason = save.slot.replace(/^auto-/, "").split("-y")[0] || "auto";
      return (
        `<tr>` +
        `<td>${escapeHtml(save.slot)}</td>` +
        `<td>${escapeHtml(reason)}</td>` +
        `<td>${escapeHtml(season)}</td>` +
        `<td>${escapeHtml(meta.phase || "-")}</td>` +
        `<td>${escapeHtml(new Date(save.updatedAt).toLocaleString())}</td>` +
        `<td>${escapeHtml((save.sizeBytes / 1024).toFixed(1))} KB</td>` +
        `<td><button data-backup-resume="${escapeHtml(save.slot)}">Restore</button></td>` +
        `<td><button data-backup-slot="${escapeHtml(save.slot)}">Use Slot</button></td>` +
        `</tr>`
      );
    })
    .join("");

  table.innerHTML =
    "<tr><th>Slot</th><th>Reason</th><th>Season</th><th>Phase</th><th>Updated</th><th>Size</th><th>Restore</th><th>Delete Slot</th></tr>" +
    rows;
}

async function loadSetup() {
  const loadVersion = ++setupLoadVersion;
  const started = performance.now();
  applyRuntimeModeUi();
  if (getRuntimeMode() === "client") {
    warmLocalRuntime().catch(() => {});
  }
  const init = await api("/api/setup/init?includeSaves=0&includeBackups=0");
  if (loadVersion !== setupLoadVersion) return;
  state.currentYear = init.currentYear;
  state.saves = init.saves || [];
  state.savesDeferred = init.savesDeferred === true;
  state.teams = init.teams || [];
  state.backups = init.backups || [];
  state.backupsDeferred = init.backupsDeferred === true;
  state.settings = init.settings || state.settings || {};
  state.setupDiagnostics = {
    ...(init.diagnostics?.setup || {}),
    clientInitMs: Math.round(performance.now() - started)
  };

  document.getElementById("seedInput").value = Date.now();
  document.getElementById("startYearInput").value = init.currentYear;

  renderTeams();
  renderActiveLeague(init.activeLeague);
  renderConfigCatalog(init.configCatalog || null, init.settings || {});
  renderSaves();
  renderBackups();
  renderSetupGuide();
  updateModeHelp();
  setStatus(setupStatusText("Ready"));

  if (state.savesDeferred) {
    queueMicrotask(() => {
      refreshSaves({ preserveStatus: true, loadVersion }).catch(() => {
        if (loadVersion !== setupLoadVersion) return;
        state.savesDeferred = false;
        renderSaves();
        setStatus(setupStatusText("Ready"));
      });
    });
  }
}

async function createLeague() {
  setStatus("Creating league...");
  await api("/api/new-league", {
    method: "POST",
    body: {
      seed: Number(document.getElementById("seedInput").value || Date.now()),
      startYear: Number(document.getElementById("startYearInput").value || state.currentYear),
      mode: document.getElementById("modeInput").value,
      eraProfile: document.getElementById("eraProfileInput").value || "modern",
      franchiseArchetype: document.getElementById("franchiseArchetypeInput").value || "balanced",
      rulesPreset: document.getElementById("rulesPresetInput").value || "standard",
      difficultyPreset: document.getElementById("difficultyPresetInput").value || "standard",
      challengeMode: document.getElementById("challengeModeInput").value || "open",
      enableOwnerMode: document.getElementById("ownerModeInput").checked,
      enableNarratives: document.getElementById("narrativesInput").checked,
      enableCompPicks: document.getElementById("compPicksInput").checked,
      enableChemistry: document.getElementById("chemistryInput").checked,
      controlledTeamId: document.getElementById("teamSelect").value || "BUF",
      pfrPath: document.getElementById("pfrPathInput").value.trim() || null,
      realismProfilePath: document.getElementById("profilePathInput").value.trim() || null
    }
  });
  window.location.href = pageUrl("game.html");
}

async function resumeSlot(slot) {
  setStatus(`Loading ${slot}...`);
  await api("/api/saves/load", { method: "POST", body: { slot } });
  window.location.href = pageUrl("game.html");
}

async function resumeBackup(slot) {
  setStatus(`Restoring backup ${slot}...`);
  await api("/api/backups/load", { method: "POST", body: { slot } });
  window.location.href = pageUrl("game.html");
}

async function deleteSlot() {
  const slot = document.getElementById("deleteSlotInput").value.trim();
  if (!slot) return;
  setStatus(`Deleting ${slot}...`);
  const response = await api("/api/saves/delete", { method: "POST", body: { slot } });
  state.saves = response.slots || [];
  renderSaves();
  setStatus("Ready");
}

async function deleteBackupSlot() {
  const slot = document.getElementById("deleteBackupInput").value.trim();
  if (!slot) return;
  setStatus(`Deleting backup ${slot}...`);
  const response = await api("/api/backups/delete", { method: "POST", body: { slot } });
  state.backups = response.slots || [];
  renderBackups();
  setStatus("Ready");
}

function bindEvents() {
  document.getElementById("runtimeModeSelect")?.addEventListener("change", (event) => {
    const mode = setRuntimeMode(event.target.value);
    event.target.value = mode;
    const statusText = mode === "client" ? "Loading client-only menu..." : "Loading server-backed menu...";
    setStatus(statusText);
    if (mode === "client") {
      warmLocalRuntime().catch(() => {});
    }
    loadSetup()
      .then(() => setStatus(setupStatusText("Ready")))
      .catch((error) => {
        setStatus(`Error: ${error.message}`);
      });
  });
  document.getElementById("modeInput")?.addEventListener("change", updateModeHelp);
  ["eraProfileInput", "franchiseArchetypeInput", "rulesPresetInput", "difficultyPresetInput", "challengeModeInput"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", renderConfigSummary);
  });

  const applyPreset = (preset) => {
    const quickStart = (state.configCatalog?.quickStarts || []).find((entry) => entry.id === preset)?.selections;
    if (!quickStart) return;
    document.getElementById("modeInput").value = quickStart.mode || "drive";
    applySettingsToForm({
      ...state.settings,
      ...quickStart
    });
  };

  document.getElementById("presetModernBtn").addEventListener("click", () => applyPreset("modern"));
  document.getElementById("presetBalancedBtn").addEventListener("click", () => applyPreset("balanced"));
  document.getElementById("presetLegacyBtn").addEventListener("click", () => applyPreset("legacy"));

  document.getElementById("createLeagueBtn").addEventListener("click", async () => {
    try {
      await createLeague();
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("continueActiveBtn").addEventListener("click", () => {
    window.location.href = pageUrl("game.html");
  });

  document.getElementById("resumeLatestBtn").addEventListener("click", async () => {
    try {
      const latest = state.saves[0];
      if (!latest) {
        setStatus("No save slots available.");
        return;
      }
      await resumeSlot(latest.slot);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("refreshSavesBtn").addEventListener("click", async () => {
    try {
      await refreshSaves();
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("deleteSlotBtn").addEventListener("click", async () => {
    try {
      await deleteSlot();
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("refreshBackupsBtn").addEventListener("click", async () => {
    try {
      const payload = await api("/api/backups");
      state.backups = payload.slots || [];
      state.backupsDeferred = false;
      renderBackups();
      setStatus("Ready");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("deleteBackupBtn").addEventListener("click", async () => {
    try {
      await deleteBackupSlot();
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("savesTable").addEventListener("click", async (event) => {
    const resumeBtn = event.target.closest("button[data-resume]");
    const useSlotBtn = event.target.closest("button[data-slot]");

    try {
      if (resumeBtn) {
        await resumeSlot(resumeBtn.dataset.resume);
        return;
      }
      if (useSlotBtn) {
        document.getElementById("deleteSlotInput").value = useSlotBtn.dataset.slot;
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("backupsTable").addEventListener("click", async (event) => {
    const resumeBtn = event.target.closest("button[data-backup-resume]");
    const useSlotBtn = event.target.closest("button[data-backup-slot]");

    try {
      if (resumeBtn) {
        await resumeBackup(resumeBtn.dataset.backupResume);
        return;
      }
      if (useSlotBtn) {
        document.getElementById("deleteBackupInput").value = useSlotBtn.dataset.backupSlot;
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  });

  document.getElementById("saveSearchInput").addEventListener("input", (event) => {
    state.saveSearch = event.target.value || "";
    renderSaves();
  });
}

async function init() {
  bindEvents();
  await loadSetup();
}

init();
