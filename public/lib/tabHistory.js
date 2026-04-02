import { state, api } from "./appState.js";
import { decoratePlayerColumnFromRows, escapeHtml, renderPulseChips, renderTable, setElementTone, setSelectOptions, teamCode, teamName } from "./appCore.js";

export function setHistoryView(view) {
  state.historyView = view === "hall-of-fame" ? "hall-of-fame" : "season-awards";
  document.querySelectorAll("[data-history-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historyView === state.historyView);
  });
  const seasonPanel = document.getElementById("historySeasonAwardsPanel");
  const hallPanel = document.getElementById("historyHallOfFamePanel");
  if (seasonPanel) seasonPanel.classList.toggle("hidden", state.historyView !== "season-awards");
  if (hallPanel) hallPanel.classList.toggle("hidden", state.historyView !== "hall-of-fame");
}

export function formatAwardList(list = []) {
  return (list || []).map((entry) => `${entry.player} (${entry.team})`).join(", ");
}

export function hallOfFameCareerLine(entry) {
  const stats = entry.careerStats || {};
  if (entry.pos === "QB") return `${stats.passing?.yards || 0} pass yds, ${stats.passing?.td || 0} pass TD`;
  if (entry.pos === "RB") return `${stats.rushing?.yards || 0} rush yds, ${stats.rushing?.td || 0} rush TD`;
  if (entry.pos === "WR" || entry.pos === "TE") return `${stats.receiving?.yards || 0} rec yds, ${stats.receiving?.td || 0} rec TD`;
  if (entry.pos === "K") return `${stats.kicking?.fgm || 0} FGM, ${stats.kicking?.xpm || 0} XPM`;
  if (entry.pos === "P") return `${stats.punting?.punts || 0} punts, ${stats.punting?.in20 || 0} in20`;
  return `${stats.defense?.tackles || 0} tackles, ${stats.defense?.sacks || 0} sacks, ${stats.defense?.int || 0} INT`;
}

export function awardCountLine(awardCounts = {}) {

export function hallOfFamePolicyLine(settings = state.leagueSettings || state.dashboard?.settings || {}) {

export function retiredNumberPolicyLine(settings = state.leagueSettings || state.dashboard?.settings || {}) {

export function setSelectedHistoryPlayerFromAwardEntry(entry) {
  if (!entry?.playerId) return;
  setSelectedHistoryPlayer({ id: entry.playerId, name: entry.player, pos: entry.pos || "-" });
}

export function renderAwardGallery(containerId, entries = [], emptyText = "No honors recorded for this group.") {
  const gallery = document.getElementById(containerId);
  if (!gallery) return;
  if (!entries.length) {
    gallery.innerHTML = `<div class="history-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  gallery.innerHTML = entries.map((entry) => `
    <article class="history-card">
      <div class="history-card-top">
        <div class="history-card-title">
          <strong>${escapeHtml(entry.player || "-")}</strong>
          <div class="history-card-meta">${escapeHtml(entry.pos || "-")} | ${escapeHtml(entry.team || "-")}</div>
        </div>
        <div class="history-number-plate">${escapeHtml(entry.av ?? "-")}</div>
      </div>
      <div class="history-card-grid">
        <div class="history-card-stat"><strong>Honor</strong><div>${escapeHtml(entry.label || "-")}</div></div>
        <div class="history-card-stat"><strong>Team</strong><div>${escapeHtml(entry.team || "-")}</div></div>
        <div class="history-card-stat"><strong>Position</strong><div>${escapeHtml(entry.pos || "-")}</div></div>
        <div class="history-card-stat"><strong>AV</strong><div>${escapeHtml(entry.av ?? "-")}</div></div>
      </div>
      <div class="history-card-actions">
        <span class="small">${escapeHtml(entry.note || `${entry.label || "Honor"} selection`)}</span>
        ${entry.playerId ? `<button type="button" data-award-player-select="${escapeHtml(entry.playerId)}">Select Player</button>` : ""}
      </div>
    </article>
  `).join("");
  gallery.querySelectorAll("[data-award-player-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = entries.find((entry) => entry.playerId === button.dataset.awardPlayerSelect);
      if (selected) setSelectedHistoryPlayerFromAwardEntry(selected);
    });
  });
}

export function renderSeasonAwardsShowcase(selectedAward = null) {
  const spotlight = document.getElementById("seasonAwardsSpotlight");
  const winnerGallery = document.getElementById("awardWinnerGallery");
  if (!selectedAward) {
    if (spotlight) {
      spotlight.innerHTML = `
        <div class="history-spotlight-mark">
          <div class="history-spotlight-label">Season Awards Archive</div>
          <div class="history-spotlight-meta">Select an award year to review winners, All-Pro teams, Pro Bowl rosters, and the Super Bowl summary.</div>
        </div>
      `;
    }
    if (winnerGallery) winnerGallery.innerHTML = `<div class="history-empty">No award year selected.</div>`;
    renderAwardGallery("allPro1Gallery", []);
    renderAwardGallery("allPro2Gallery", []);
    renderAwardGallery("allPro3Gallery", []);
    renderAwardGallery("proBowlGallery", []);
    return;
  }

  const superBowlSummary = selectedAward.SuperBowl
    ? `${selectedAward.SuperBowl.championTeamId || "-"} def. ${selectedAward.SuperBowl.runnerUpTeamId || "-"} ${selectedAward.SuperBowl.finalScore || ""}`
    : "No Super Bowl summary recorded";
  if (spotlight) {
    spotlight.innerHTML = `
      <div class="history-spotlight-mark">
        <div class="history-spotlight-label">${escapeHtml(String(selectedAward.year))} Awards Class</div>
        <div class="history-spotlight-meta">${escapeHtml(superBowlSummary)}</div>
      </div>
      <div class="history-spotlight-grid">
        <div class="history-spotlight-card">
          <strong>MVP Standard</strong>
          <div>${escapeHtml(selectedAward.MVP?.player || "No MVP recorded")}</div>
          <div class="small">${escapeHtml(selectedAward.MVP ? `${selectedAward.MVP.team || "-"} | ${selectedAward.MVP.pos || "-"}` : "No major award winner logged.")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Super Bowl MVP</strong>
          <div>${escapeHtml(selectedAward.SuperBowl?.MVP?.player || "No Super Bowl MVP")}</div>
          <div class="small">${escapeHtml(selectedAward.SuperBowl?.pivotalMoment || "No pivotal moment logged")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>All-Pro Depth</strong>
          <div>${escapeHtml((selectedAward.AllPro1 || []).length + (selectedAward.AllPro2 || []).length + (selectedAward.AllPro3 || []).length)} selections</div>
          <div class="small">${escapeHtml(`${(selectedAward.AllPro1 || []).length} first-team | ${(selectedAward.ProBowl || []).length} Pro Bowl`)}</div>
        </div>
      </div>
    `;
  }

  const winnerEntries = [
    { label: "MVP", ...selectedAward.MVP, note: "League MVP winner" },
    { label: "OPOY", ...selectedAward.OPOY, note: "Offensive Player of the Year" },
    { label: "DPOY", ...selectedAward.DPOY, note: "Defensive Player of the Year" },
    { label: "OROY", ...selectedAward.OROY, note: "Offensive Rookie of the Year" },
    { label: "DROY", ...selectedAward.DROY, note: "Defensive Rookie of the Year" },
    { label: "ROY", ...selectedAward.ROY, note: "Overall Rookie of the Year" },
    { label: "CPOY", ...selectedAward.CPOY, note: "Comeback Player of the Year" },
    { label: "Most Improved", ...selectedAward.MostImproved, note: "Most Improved award winner" },
    { label: "Super Bowl MVP", ...selectedAward.SuperBowl?.MVP, team: selectedAward.SuperBowl?.championTeamId, note: selectedAward.SuperBowl?.pivotalMoment || "Super Bowl MVP" }
  ].filter((entry) => entry?.player);

  if (winnerGallery) {
    winnerGallery.classList.add("micro");
  }
  renderAwardGallery("awardWinnerGallery", winnerEntries, "No headline winners recorded for this season.");
  renderAwardGallery(
    "allPro1Gallery",
    (selectedAward.AllPro1 || []).map((entry) => ({ label: "All-Pro 1", note: "First-team All-Pro selection", ...entry })),
    "No All-Pro first-team selections recorded."
  );
  renderAwardGallery(
    "allPro2Gallery",
    (selectedAward.AllPro2 || []).map((entry) => ({ label: "All-Pro 2", note: "Second-team All-Pro selection", ...entry })),
    "No All-Pro second-team selections recorded."
  );
  renderAwardGallery(
    "allPro3Gallery",
    (selectedAward.AllPro3 || []).map((entry) => ({ label: "All-Pro 3", note: "Third-team All-Pro selection", ...entry })),
    "No All-Pro third-team selections recorded."
  );
  renderAwardGallery(
    "proBowlGallery",
    (selectedAward.ProBowl || []).map((entry) => ({ label: "Pro Bowl", note: "Pro Bowl selection", ...entry })),
    "No Pro Bowl selections recorded."
  );
}

export function timelineEntrySummary(entry, position) {
  const stats = entry?.stats || {};
  if (position === "QB") {
    return `${stats.passing?.yards || 0} pass yds, ${stats.passing?.td || 0} TD, ${stats.passing?.int || 0} INT`;
  }
  if (position === "RB") {
    return `${stats.rushing?.yards || 0} rush yds, ${stats.rushing?.td || 0} rush TD, ${stats.receiving?.yards || 0} rec yds`;
  }
  if (position === "WR" || position === "TE") {
    return `${stats.receiving?.rec || 0} rec, ${stats.receiving?.yards || 0} yds, ${stats.receiving?.td || 0} TD`;
  }
  if (position === "K") {
    return `${stats.kicking?.fgm || 0}/${stats.kicking?.fga || 0} FG, ${stats.kicking?.xpm || 0}/${stats.kicking?.xpa || 0} XP`;
  }
  if (position === "P") {
    return `${stats.punting?.punts || 0} punts, ${stats.punting?.in20 || 0} in20`;
  }
  if (position === "OL") {
    return `${stats.gamesStarted || 0} starts in ${stats.games || 0} games`;
  }
  return `${stats.defense?.tackles || 0} tackles, ${stats.defense?.sacks || 0} sacks, ${stats.defense?.int || 0} INT`;
}

export function renderPlayerHistoryArchive(payload = null) {
  const spotlight = document.getElementById("playerHistorySpotlight");
  const gallery = document.getElementById("playerTimelineGallery");
  const selected = (state.historyPlayerSearchResults || []).find((player) => player.id === state.selectedHistoryPlayerId) || null;
  if (!payload?.timeline?.length) {
    if (spotlight) {
      spotlight.innerHTML = `
        <div class="history-spotlight-mark">
          <div class="history-spotlight-label">${escapeHtml(selected?.name || "Player Archive")}</div>
          <div class="history-spotlight-meta">${escapeHtml(selected ? `${selected.pos} | ${teamCode(selected.teamId)} | OVR ${selected.overall || "-"}` : "Search for a player, then load their history to review seasons, titles, and awards.")}</div>
        </div>
        <div class="history-spotlight-grid">
          <div class="history-spotlight-card">
            <strong>Archive Status</strong>
            <div>${escapeHtml(selected ? "Player selected" : "No player selected")}</div>
            <div class="small">${escapeHtml(selected ? "Use Load Player History to open the full career archive." : "The archive populates after a player is selected.")}</div>
          </div>
        </div>
      `;
    }
    if (gallery) gallery.innerHTML = `<div class="history-empty">No player history loaded yet.</div>`;
    return;
  }

  const timeline = payload.timeline || [];
  const latest = timeline[timeline.length - 1] || null;
  const titles = timeline.filter((entry) => entry.champion).length;
  const totalAwards = timeline.reduce((sum, entry) => sum + ((entry.awards || []).length), 0);
  const teams = [...new Set(timeline.map((entry) => entry.teamId).filter(Boolean))];
  const position = payload.pos;
  if (spotlight) {
    spotlight.innerHTML = `
      <div class="history-spotlight-mark">
        <div class="history-spotlight-label">${escapeHtml(payload.player || "Player Archive")}</div>
        <div class="history-spotlight-meta">${escapeHtml(payload.pos || "-")} | ${escapeHtml(payload.status || "retired")} | ${escapeHtml(timeline.length)} seasons | ${escapeHtml(teams.join(", ") || "No teams logged")}</div>
      </div>
      <div class="history-spotlight-grid">
        <div class="history-spotlight-card">
          <strong>Career Snapshot</strong>
          <div>${escapeHtml(latest ? timelineEntrySummary(latest, position) : "No recorded season")}</div>
          <div class="small">${escapeHtml(latest ? `${latest.year} latest season | ${teamCode(latest.teamId)}` : "Load a player with recorded seasons")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Honors</strong>
          <div>${escapeHtml(`${titles} titles | ${totalAwards} award hits`)}</div>
          <div class="small">${escapeHtml(latest?.awards?.length ? latest.awards.join(", ") : "Latest season had no listed awards")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Career Span</strong>
          <div>${escapeHtml(`${timeline[0]?.year || "-"} to ${latest?.year || "-"}`)}</div>
          <div class="small">${escapeHtml(teams.length ? `${teams.length} franchise${teams.length === 1 ? "" : "s"}` : "No franchise history logged")}</div>
        </div>
      </div>
    `;
  }
  if (!gallery) return;
  gallery.innerHTML = timeline.slice().reverse().map((entry) => `
    <article class="history-card">
      <div class="history-card-top">
        <div class="history-card-title">
          <strong>${escapeHtml(String(entry.year))}</strong>
          <div class="history-card-meta">${escapeHtml(teamCode(entry.teamId))} | ${escapeHtml(entry.pos || position || "-")} | ${escapeHtml(entry.champion ? "Champion season" : "Season record")}</div>
        </div>
        <div class="history-number-plate">${escapeHtml(teamCode(entry.teamId))}</div>
      </div>
      <div class="history-card-grid">
        <div class="history-card-stat"><strong>Games</strong><div>${escapeHtml(entry.stats?.games || 0)}</div></div>
        <div class="history-card-stat"><strong>Starts</strong><div>${escapeHtml(entry.stats?.gamesStarted || 0)}</div></div>
        <div class="history-card-stat"><strong>Summary</strong><div>${escapeHtml(timelineEntrySummary(entry, position))}</div></div>
        <div class="history-card-stat"><strong>Awards</strong><div>${escapeHtml((entry.awards || []).length || 0)}</div></div>
      </div>
      <div class="history-chip-row">
        ${(entry.awards || []).length
          ? entry.awards.map((award) => `<span class="history-chip">${escapeHtml(award)}</span>`).join("")
          : `<span class="history-chip">No awards</span>`}
      </div>
    </article>
  `).join("");
}

export function renderHistorySpotlight() {
  const awards = state.dashboard?.awards || [];
  const hall = state.dashboard?.hallOfFame || [];
  const champions = state.dashboard?.champions || [];
  const retiredCount = hall.reduce((sum, entry) => sum + (entry.retiredNumbers?.length || 0), 0);
  const latestChampion = champions.slice().sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
  const topLegacy = hall[0] || null;
  const settings = state.leagueSettings || state.dashboard?.settings || {};
  const spotlight = document.getElementById("historySpotlight");
  if (spotlight) {
    spotlight.innerHTML = `
      <div class="history-spotlight-mark">
        <div class="history-spotlight-label">Legacy Ledger</div>
        <div class="history-spotlight-meta">${escapeHtml(latestChampion ? `${latestChampion.year} champion ${latestChampion.championTeamId}` : "No champions recorded yet")} | ${escapeHtml(hall.length)} Hall of Fame resumes | ${escapeHtml(retiredCount)} retired numbers logged | ${escapeHtml(hallOfFamePolicyLine(settings))}</div>
      </div>
      <div class="history-spotlight-grid">
        <div class="history-spotlight-card">
          <strong>Top Resume</strong>
          <div>${escapeHtml(topLegacy ? `${topLegacy.player} (${topLegacy.pos})` : "No inductees yet")}</div>
          <div class="small">${escapeHtml(topLegacy ? `Career AV ${topLegacy.careerAv || 0} | ${topLegacy.championships || 0} titles` : "Retired legends will appear here once careers close.")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Award Archive</strong>
          <div>${escapeHtml(awards.length)} seasons captured</div>
          <div class="small">${escapeHtml(awards.length ? `Latest awards class ${awards[awards.length - 1]?.year}` : "No award history recorded yet")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Ring Standard</strong>
          <div>${escapeHtml(latestChampion ? latestChampion.score || "-" : "-")}</div>
          <div class="small">${escapeHtml(latestChampion ? `${latestChampion.championTeamId} over ${latestChampion.runnerUpTeamId}` : "Super Bowl scorecards will show here")}</div>
        </div>
      </div>
    `;
  }
  const hallCountCard = document.getElementById("historyHallCountCard");
  const retiredCountCard = document.getElementById("historyRetiredCountCard");
  const awardYearsCard = document.getElementById("historyAwardYearsCard");
  const championCard = document.getElementById("historyChampionCard");
  if (hallCountCard) {
    hallCountCard.textContent = String(hall.length);
    setElementTone(hallCountCard, hall.length ? "accent" : null);
  }
  if (retiredCountCard) {
    retiredCountCard.textContent = String(retiredCount);
    setElementTone(retiredCountCard, retiredCount ? "positive" : null);
  }
  if (awardYearsCard) {
    awardYearsCard.textContent = String(awards.length);
    setElementTone(awardYearsCard, awards.length ? "info" : null);
  }
  if (championCard) {
    championCard.textContent = latestChampion?.championTeamId || "-";
    setElementTone(championCard, latestChampion ? "accent" : null);
  }
  renderPulseChips(
    "historyPulseBar",
    [
      topLegacy ? `Top AV ${topLegacy.player} ${topLegacy.careerAv || 0}` : null,
      latestChampion ? `Latest score ${latestChampion.score}` : null,
      hall.length ? `Most rings ${hall.slice().sort((a, b) => (b.championships || 0) - (a.championships || 0))[0]?.player}` : null,
      retiredCount ? `${retiredCount} jersey retirements tracked` : "No retired numbers yet"
    ],
    "Legacy archive updates load here"
  );
}

export function renderHallOfFameGallery(entries = []) {
  const gallery = document.getElementById("hallOfFameGallery");
  const spotlight = document.getElementById("hallOfFameSpotlight");
  const settings = state.leagueSettings || state.dashboard?.settings || {};
  if (spotlight) {
    const top = entries[0] || null;
    const mostDecorated = entries.slice().sort((a, b) =>
      ((b.awardCounts?.MVP || 0) + (b.awardCounts?.OPOY || 0) + (b.awardCounts?.DPOY || 0) + (b.awardCounts?.AllPro1 || 0) * 0.5) -
      ((a.awardCounts?.MVP || 0) + (a.awardCounts?.OPOY || 0) + (a.awardCounts?.DPOY || 0) + (a.awardCounts?.AllPro1 || 0) * 0.5)
    )[0] || null;
    spotlight.innerHTML = `
      <div class="history-spotlight-mark">
        <div class="history-spotlight-label">${escapeHtml(top ? top.player : "Hall of Fame pending")}</div>
        <div class="history-spotlight-meta">${escapeHtml(top ? `${top.pos} | Retired ${top.retiredYear} | Career AV ${top.careerAv || 0}` : "Players who clear the induction threshold will appear here.")}</div>
      </div>
      <div class="history-spotlight-grid">
        <div class="history-spotlight-card">
          <strong>Standard Bearer</strong>
          <div>${escapeHtml(top ? hallOfFameCareerLine(top) : "No inducted resume yet")}</div>
          <div class="small">${escapeHtml(top ? `${top.championships || 0} titles | Legacy ${Math.round(top.legacyScore || 0)}` : "The archive populates as careers end.")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Most Decorated</strong>
          <div>${escapeHtml(mostDecorated ? mostDecorated.player : "No decorated legend yet")}</div>
          <div class="small">${escapeHtml(mostDecorated ? awardCountLine(mostDecorated.awardCounts || {}) : "Award-heavy careers will surface here.")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Induction Policy</strong>
          <div>${escapeHtml(hallOfFamePolicyLine(settings))}</div>
          <div class="small">${escapeHtml(entries.length ? "Commissioner settings can tighten or loosen the legacy bar." : "Lower the bar only if the archive is too thin for your league.")}</div>
        </div>
      </div>
    `;
  }
  if (!gallery) return;
  if (!entries.length) {
    gallery.innerHTML = `<div class="history-empty">No Hall of Fame players yet.</div>`;
    return;
  }
  gallery.innerHTML = entries.slice(0, 18).map((entry) => `
    <article class="history-card">
      <div class="history-card-top">
        <div class="history-card-title">
          <strong>${escapeHtml(entry.player)}</strong>
          <div class="history-card-meta">${escapeHtml(entry.pos)} | Retired ${escapeHtml(entry.retiredYear || "-")} | ${escapeHtml((entry.teams || []).join(", ") || "No teams logged")}</div>
        </div>
        <div class="history-number-plate">#${escapeHtml(entry.jerseyNumber ?? "--")}</div>
      </div>
      <div class="history-card-grid">
        <div class="history-card-stat"><strong>Career AV</strong><div>${escapeHtml(entry.careerAv || 0)}</div></div>
        <div class="history-card-stat"><strong>Titles</strong><div>${escapeHtml(entry.championships || 0)}</div></div>
        <div class="history-card-stat"><strong>Legacy</strong><div>${escapeHtml(Math.round(entry.legacyScore || 0))}</div></div>
        <div class="history-card-stat"><strong>Resume</strong><div>${escapeHtml(hallOfFameCareerLine(entry))}</div></div>
      </div>
      <div class="history-chip-row">
        ${(entry.retiredNumbers || []).length
          ? entry.retiredNumbers.map((row) => `<span class="history-chip">${escapeHtml(row.teamId)} #${escapeHtml(row.number)}</span>`).join("")
          : `<span class="history-chip">No jersey retired yet</span>`}
      </div>
      <div class="small">${escapeHtml(awardCountLine(entry.awardCounts || {}))}</div>
      <div class="history-card-actions">
        <span class="small">${escapeHtml(hallOfFameCareerLine(entry))}</span>
        <button type="button" data-hof-player-select="${escapeHtml(entry.playerId)}">Select Player</button>
      </div>
    </article>
  `).join("");
  gallery.querySelectorAll("[data-hof-player-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = entries.find((entry) => entry.playerId === button.dataset.hofPlayerSelect);
      if (!selected) return;
      setSelectedHistoryPlayer({ id: selected.playerId, name: selected.player, pos: selected.pos });
    });
  });
}

export function renderTeamHistorySpotlight(history = null) {
  const spotlight = document.getElementById("teamHistorySpotlight");
  const gallery = document.getElementById("retiredNumbersGallery");
  const settings = state.leagueSettings || state.dashboard?.settings || {};
  if (spotlight) {
    const seasons = history?.seasons || [];
    const bestSeason = seasons.slice().sort((a, b) => (b.w || 0) - (a.w || 0) || (b.pf || 0) - (a.pf || 0))[0] || null;
    spotlight.innerHTML = `
      <div class="history-spotlight-mark">
        <div class="history-spotlight-label">${escapeHtml(history?.teamName || "Franchise Legacy")}</div>
        <div class="history-spotlight-meta">${escapeHtml(bestSeason ? `Best recorded season: ${bestSeason.year} (${bestSeason.w}-${bestSeason.l}${bestSeason.t ? `-${bestSeason.t}` : ""})` : "Load a team to review titles, retired numbers, and historical seasons.")}</div>
      </div>
      <div class="history-spotlight-grid">
        <div class="history-spotlight-card">
          <strong>Titles</strong>
          <div>${escapeHtml(history?.championships?.length || 0)}</div>
          <div class="small">${escapeHtml(history?.championships?.length ? `${history.championships.slice(-1)[0]?.year} latest ring` : "No championships recorded")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Retired Numbers</strong>
          <div>${escapeHtml(history?.retiredNumbers?.length || 0)}</div>
          <div class="small">${escapeHtml(history?.retiredNumbers?.length ? `Policy: ${retiredNumberPolicyLine(settings)}` : "No retired numbers recorded yet")}</div>
        </div>
        <div class="history-spotlight-card">
          <strong>Best Year</strong>
          <div>${escapeHtml(bestSeason ? String(bestSeason.year) : "-")}</div>
          <div class="small">${escapeHtml(bestSeason ? `${bestSeason.pf || 0} PF | ${bestSeason.pa || 0} PA` : "Historical team seasons will appear after load.")}</div>
        </div>
      </div>
    `;
  }
  if (!gallery) return;
  const retiredNumbers = history?.retiredNumbers || [];
  if (!retiredNumbers.length) {
    gallery.innerHTML = `<div class="history-empty">No retired numbers recorded for this team yet.</div>`;
    return;
  }
  gallery.innerHTML = retiredNumbers.map((entry) => `
    <article class="history-card">
      <div class="history-card-top">
        <div class="history-card-title">
          <strong>${escapeHtml(entry.player)}</strong>
          <div class="history-card-meta">${escapeHtml(entry.pos)} | Retired ${escapeHtml(entry.retiredYear || "-")}</div>
        </div>
        <div class="history-number-plate">#${escapeHtml(entry.number)}</div>
      </div>
      <div class="history-card-grid">
        <div class="history-card-stat"><strong>Career AV</strong><div>${escapeHtml(entry.careerAv || 0)}</div></div>
        <div class="history-card-stat"><strong>Titles</strong><div>${escapeHtml(entry.championships || 0)}</div></div>
      </div>
      <div class="small">${escapeHtml(awardCountLine(entry.awards || {}))}</div>
    </article>
  `).join("");
}

export function renderRecordsAndHistory() {
  const box = document.getElementById("recordsBox");
  const records = state.dashboard?.records;
  const awards = (state.dashboard?.awards || []).slice().reverse();
  const awardYears = awards.map((award) => String(award.year));
  renderHistorySpotlight();
  renderTeamHistorySpotlight(state.teamHistory);
  renderPlayerHistoryArchive(state.historyTimeline);

  if (!records) {
    box.innerHTML = "<div class='record'>No record data</div>";
  } else {
    const leaders = [
      ["Career Pass Yards", "passingYards"],
      ["Career Rush Yards", "rushingYards"],
      ["Career Rec Yards", "receivingYards"],
      ["Career Sacks", "sacks"],
      ["Career INT", "interceptions"],
      ["Career FG Made", "fieldGoalsMade"],
      ["Career AV", "approximateValue"]
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
    awards.map((award) => ({
      year: award.year,
      MVP: award.MVP?.player || "",
      OPOY: award.OPOY?.player || "",
      DPOY: award.DPOY?.player || "",
      OROY: award.OROY?.player || "",
      DROY: award.DROY?.player || "",
      ROY: award.ROY?.player || "",
      CPOY: award.CPOY?.player || "",
      mostImproved: award.MostImproved?.player || "",
      sbScore: award.SuperBowl?.finalScore || "",
      sbMVP: award.SuperBowl?.MVP?.player || ""
    }))
  );

  setSelectOptions(
    "historyAwardYearSelect",
    awardYears.map((year) => ({ value: year, label: year })),
    state.selectedAwardsYear && awardYears.includes(String(state.selectedAwardsYear))
      ? String(state.selectedAwardsYear)
      : awardYears[0] || ""
  );
  if (!state.selectedAwardsYear && awardYears[0]) state.selectedAwardsYear = Number(awardYears[0]);
  const selectedAward =
    awards.find((award) => String(award.year) === String(state.selectedAwardsYear || awardYears[0] || "")) || null;
  if (selectedAward) state.selectedAwardsYear = selectedAward.year;
  renderSeasonAwardsShowcase(selectedAward);

  renderTable(
    "awardDetailTable",
    selectedAward
      ? [{
          year: selectedAward.year,
          MVP: selectedAward.MVP?.player || "",
          OPOY: selectedAward.OPOY?.player || "",
          DPOY: selectedAward.DPOY?.player || "",
          OROY: selectedAward.OROY?.player || "",
          DROY: selectedAward.DROY?.player || "",
          ROY: selectedAward.ROY?.player || "",
          CPOY: selectedAward.CPOY?.player || "",
          mostImproved: selectedAward.MostImproved?.player || "",
          superBowl: `${selectedAward.SuperBowl?.championTeamId || "-"} def. ${selectedAward.SuperBowl?.runnerUpTeamId || "-"} ${selectedAward.SuperBowl?.finalScore || ""}`,
          superBowlMVP: selectedAward.SuperBowl?.MVP?.player || "",
          pivotalMoment: selectedAward.SuperBowl?.pivotalMoment || ""
        }]
      : []
  );

  renderTable("allPro1Table", (selectedAward?.AllPro1 || []).map((entry) => ({ team: "All-Pro 1", pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));
  renderTable("allPro2Table", (selectedAward?.AllPro2 || []).map((entry) => ({ team: "All-Pro 2", pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));
  renderTable("allPro3Table", (selectedAward?.AllPro3 || []).map((entry) => ({ team: "All-Pro 3", pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));
  renderTable("proBowlTable", (selectedAward?.ProBowl || []).map((entry) => ({ pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));

  renderTable(
    "championsTable",
    (state.dashboard?.champions || []).slice().reverse().map((champion) => ({
      year: champion.year,
      champion: champion.championTeamId,
      runnerUp: champion.runnerUpTeamId,
      score: champion.score
    }))
  );

  renderHallOfFameGallery(state.dashboard?.hallOfFame || []);

  setHistoryView(state.historyView);
}

export function renderCalendar() {
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
    byes: week.byeTeams?.length || 0,
    completed: week.games?.filter((game) => game.played).length || 0,
    points: week.games?.reduce((sum, game) => sum + (game.homeScore || 0) + (game.awayScore || 0), 0) || 0
  }));
  renderTable("calendarWeeksTable", weekRows);

  const selectedWeek = Number(state.calendarWeek || calendar.currentWeek || 1);
  const selected = (calendar.weeks || []).find((week) => week.week === selectedWeek) || calendar.weeks?.[0];
  if (selected) state.calendarWeek = selected.week;
  const gameRows = (selected?.games || []).map((game) => ({
    away: teamCode(game.awayTeamId),
    home: teamCode(game.homeTeamId),
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : teamCode(game.winnerId) || "") : "TBD"
  }));
  for (const teamId of selected?.byeTeams || []) {
    gameRows.push({
      away: teamCode(teamId),
      home: "BYE",
      score: "-",
      winner: "REST"
    });
  }
  renderTable("calendarGamesTable", gameRows);

  const toBracketRows = (conf, bracket) =>
    ["wildcard", "divisional", "conference"].flatMap((round) =>
      (bracket?.[round] || []).map((game) => ({
        conf,
        round,
        away: teamCode(game.awayTeamId),
        home: teamCode(game.homeTeamId),
        score: `${game.awayScore}-${game.homeScore}`,
        winner: teamCode(game.winnerId)
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
            away: teamCode(sb.awayTeamId),
            home: teamCode(sb.homeTeamId),
            score: `${sb.awayScore}-${sb.homeScore}`,
            winner: teamCode(sb.championTeamId || sb.winnerId)
          }
        ]
      : []
  );
}

export function setSelectedHistoryPlayer(player = null) {
  const changedSelection = state.selectedHistoryPlayerId !== (player?.id || null);
  state.selectedHistoryPlayerId = player?.id || null;
  if (!player || changedSelection) {
    state.historyTimeline = null;
    renderTable("playerTimelineTable", []);
  }
  const label = document.getElementById("playerTimelineSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  const button = document.getElementById("loadPlayerTimelineBtn");
  if (button) button.disabled = !player;
  const retireButton = document.getElementById("retireSelectedJerseyBtn");
  if (retireButton) retireButton.disabled = !player;
  renderPlayerHistoryArchive(state.historyTimeline);
}

export function renderPlayerTimelineSearchResults() {
  const rows = (state.historyPlayerSearchResults || []).map((player) => ({
    id: player.id,
    player: player.name,
    tm: teamCode(player.teamId),
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    status: player.status,
    action: ""
  }));
  renderTable("playerTimelineSearchTable", rows);
  decoratePlayerColumnFromRows("playerTimelineSearchTable", rows, { idKeys: ["id"] });
  document.getElementById("playerTimelineSearchTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected = row.id === state.selectedHistoryPlayerId;
    cell.innerHTML = `<button data-history-player-select="${escapeHtml(row.id)}">${isSelected ? "Selected" : "Select"}</button>`;
  });
}
