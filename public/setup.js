const state = {
  currentYear: new Date().getFullYear(),
  saves: [],
  teams: [],
  saveSearch: "",
  backups: []
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

function setStatus(text) {
  const el = document.getElementById("setupStatus");
  if (el) el.textContent = text;
}

function renderTeams() {
  const select = document.getElementById("teamSelect");
  if (!select) return;

  if (!state.teams.length) {
    select.innerHTML = "<option value=\"BUF\">BUF - Buffalo Bills</option>";
    return;
  }

  select.innerHTML = state.teams
    .map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.id)} - ${escapeHtml(team.name)}</option>`)
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

  const team = activeLeague.controlledTeamId || "-";
  text.textContent = `Active: ${activeLeague.currentYear} W${activeLeague.currentWeek} (${activeLeague.phase}) Team ${team}`;
  button.disabled = false;
}

function renderSaves() {
  const table = document.getElementById("savesTable");
  const latestBtn = document.getElementById("resumeLatestBtn");
  if (!table) return;

  const needle = state.saveSearch.trim().toLowerCase();
  const filtered = !needle
    ? state.saves
    : state.saves.filter((save) => {
        const meta = save.meta || {};
        const haystack = [
          save.slot,
          meta.currentYear,
          meta.phase,
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
      const team = meta.controlledTeamId ? `${meta.controlledTeamId}${meta.controlledTeamName ? ` - ${meta.controlledTeamName}` : ""}` : "-";
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

function renderBackups() {
  const table = document.getElementById("backupsTable");
  if (!table) return;
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
  const [init, backupsPayload] = await Promise.all([api("/api/setup/init"), api("/api/backups")]);
  state.currentYear = init.currentYear;
  state.saves = init.saves || [];
  state.teams = init.teams || [];
  state.backups = backupsPayload.slots || [];

  document.getElementById("seedInput").value = Date.now();
  document.getElementById("startYearInput").value = init.currentYear;

  renderTeams();
  renderActiveLeague(init.activeLeague);
  renderSaves();
  renderBackups();
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
      enableOwnerMode: document.getElementById("ownerModeInput").checked,
      enableNarratives: document.getElementById("narrativesInput").checked,
      enableCompPicks: document.getElementById("compPicksInput").checked,
      enableChemistry: document.getElementById("chemistryInput").checked,
      controlledTeamId: document.getElementById("teamSelect").value || "BUF",
      pfrPath: document.getElementById("pfrPathInput").value.trim() || null,
      realismProfilePath: document.getElementById("profilePathInput").value.trim() || null
    }
  });
  window.location.href = "/game.html";
}

async function resumeSlot(slot) {
  setStatus(`Loading ${slot}...`);
  await api("/api/saves/load", { method: "POST", body: { slot } });
  window.location.href = "/game.html";
}

async function resumeBackup(slot) {
  setStatus(`Restoring backup ${slot}...`);
  await api("/api/backups/load", { method: "POST", body: { slot } });
  window.location.href = "/game.html";
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
  const applyPreset = (preset) => {
    if (preset === "modern") {
      document.getElementById("modeInput").value = "play";
      document.getElementById("eraProfileInput").value = "modern";
      document.getElementById("ownerModeInput").checked = true;
      document.getElementById("narrativesInput").checked = true;
      document.getElementById("compPicksInput").checked = true;
      document.getElementById("chemistryInput").checked = true;
      return;
    }
    if (preset === "balanced") {
      document.getElementById("modeInput").value = "drive";
      document.getElementById("eraProfileInput").value = "balanced";
      document.getElementById("ownerModeInput").checked = true;
      document.getElementById("narrativesInput").checked = true;
      document.getElementById("compPicksInput").checked = true;
      document.getElementById("chemistryInput").checked = true;
      return;
    }
    document.getElementById("modeInput").value = "drive";
    document.getElementById("eraProfileInput").value = "legacy";
    document.getElementById("ownerModeInput").checked = true;
    document.getElementById("narrativesInput").checked = false;
    document.getElementById("compPicksInput").checked = true;
    document.getElementById("chemistryInput").checked = true;
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
    window.location.href = "/game.html";
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
      const payload = await api("/api/saves");
      state.saves = payload.slots || [];
      renderSaves();
      setStatus("Ready");
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
  setStatus("Ready");
}

init();
