/**
 * GM Profile — the player's own page.
 *
 * Loaded on demand only (the "gm-profile" hydration domain imports it the first
 * time the tab opens), never statically: the boot payload has no room for it.
 *
 * The page holds four things, in this order: the career record, the Trophy
 * Case, the share buttons, and saves and backups. Only the career record is
 * drawn here. The Trophy Case is still drawn by achievements.js, and the save,
 * backup and cloud controls are the same elements, with the same ids and the
 * same handlers, that used to sit in Settings.
 */

import { api, state } from "./appState.js";
import { gmLegacyMarkup, recordFranchiseCareer, summarizeGmLegacy } from "./gmLegacyLedger.js";
import { escapeHtml } from "./appCore.js";
import { observeBackgroundTask, recordClientDiagnostic } from "./clientDiagnostics.js";
import { dashboardAuthorityKey } from "./franchiseScope.js";
import { invokeUiIsland, loadUiIsland } from "./uiIslands.js";
import { ACHIEVEMENTS, deriveTrophyRoad, readEarnedAchievements, renderTrophyCase } from "./achievements.js";
import { buildGmProfile } from "./gmProfileModel.js";

const TAB_ID = "gmProfileTab";

let bound = false;
let trophyObserver = null;
let lastLegacy = null;

// ── Career record ────────────────────────────────────────────────────────────

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

function statCard(label, value, note = "") {
  return `<div class="control-spotlight-card"><strong>${escapeHtml(label)}</strong><div class="gm-profile-stat">${escapeHtml(String(value))}</div>${note ? `<div class="small">${escapeHtml(note)}</div>` : ""}</div>`;
}

function clubRow(club) {
  const facts = [club.years, plural(club.seasons, "season")];
  if (club.record) facts.push(club.record);
  if (club.playoffBerths) facts.push(plural(club.playoffBerths, "playoff berth"));
  if (club.titles) facts.push(plural(club.titles, "title"));
  const ending = club.current ? "Current club" : club.howItEnded;
  return `
    <li class="gm-profile-club${club.current ? " is-current" : ""}" data-club="${escapeHtml(club.teamId)}">
      <strong>${escapeHtml(club.name)}</strong>
      <span>${escapeHtml(facts.filter(Boolean).join(" · "))}</span>
      ${ending ? `<span class="small">${escapeHtml(ending)}</span>` : ""}
    </li>`;
}

function tierMarkup(career) {
  if (!career.tier) return `<p class="small">Your legacy tier appears after your first full season.</p>`;
  const next = career.nextTier;
  const paths = next
    ? next.paths.map((path) => `
        <li class="gm-persona-path ${path.done ? "complete" : "open"}">
          <span>${escapeHtml(path.label)}</span>
          <strong>${escapeHtml(String(path.current))}/${escapeHtml(String(path.target))}</strong>
          <small>${escapeHtml(path.done ? "reached" : `${path.remaining} to go`)}</small>
        </li>`).join("")
    : "";
  return `
    <div class="gm-profile-tier">
      <div class="small">Legacy tier ${escapeHtml(String(career.tier.number))} of 6</div>
      <strong class="gm-profile-tier-name">${escapeHtml(career.tier.name)}</strong>
      ${career.tier.description ? `<p class="small">${escapeHtml(career.tier.description)}</p>` : ""}
      ${next
        ? `<div class="gm-persona-next">Next tier: <strong>${escapeHtml(next.name)}</strong>. ${escapeHtml(next.rule)}</div>
           <ul class="gm-persona-paths" aria-label="What the next tier needs">${paths}</ul>`
        : `<div class="gm-persona-next">You have reached the top tier.</div>`}
    </div>`;
}

function renderCareer(career) {
  const host = document.getElementById("gmProfileCareer");
  if (!host) return;
  const clubs = career.clubs.length
    ? `<ol class="gm-profile-clubs">${career.clubs.map(clubRow).join("")}</ol>`
    : `<p class="small">No club on record yet.</p>`;
  host.innerHTML = `
    ${career.statusText ? `<p class="gm-profile-status">${escapeHtml(career.statusText)}</p>` : ""}
    <div class="control-spotlight-grid" data-testid="gm-profile-stats">
      ${statCard("Seasons", career.seasons, career.seasons ? "" : "Finish a season to start your record")}
      ${statCard("Record", career.record, career.grade ? `Career grade ${career.grade}` : "")}
      ${statCard("Playoff berths", career.playoffBerths)}
      ${statCard("Titles", career.titles)}
      ${statCard("Clubs managed", career.clubCount, career.dismissals ? `Let go ${career.dismissals === 1 ? "once" : `${career.dismissals} times`}` : "")}
    </div>
    <h3>Clubs managed</h3>
    ${clubs}
    <h3>Legacy tier</h3>
    ${tierMarkup(career)}
    <h3>Across every franchise</h3>
    ${gmLegacyMarkup(summarizeGmLegacy(recordFranchiseCareer({ dashboard: state.dashboard, career })), { escapeHtml, card: statCard })}`;
}

// ── Trophy Case: progress on the trophies still locked ───────────────────────

function decorateTrophyCase(rows) {
  const host = document.getElementById("trophyCaseContent");
  if (!host) return;
  const byId = new Map(rows.map((row) => [row.id, row]));
  host.querySelectorAll(".trophy-locked[data-trophy-id]").forEach((node) => {
    const progress = byId.get(node.dataset.trophyId)?.progress;
    const body = node.querySelector(".trophy-body");
    if (!progress || !body || body.querySelector("[data-trophy-progress]")) return;
    const wrap = document.createElement("span");
    wrap.className = "trophy-meta gm-profile-trophy-progress";
    wrap.dataset.trophyProgress = "";
    const bar = document.createElement("progress");
    bar.max = progress.target;
    bar.value = Math.min(progress.current, progress.target);
    bar.setAttribute("aria-label", `${byId.get(node.dataset.trophyId).name} progress`);
    const label = document.createElement("span");
    label.textContent = progress.text;
    wrap.append(bar, label);
    body.append(wrap);
  });
}

function trophyRows() {
  const earned = readEarnedAchievements();
  const road = deriveTrophyRoad(
    { dashboard: state.dashboard || {}, recentBoxScores: state.recentBoxScores || [], earned },
    ACHIEVEMENTS.length
  );
  return buildGmProfile({ achievements: ACHIEVEMENTS, earned, locked: road.objectives }).trophies.rows;
}

function watchTrophyCase() {
  const host = document.getElementById("trophyCaseContent");
  if (!host || trophyObserver || typeof MutationObserver !== "function") return;
  // achievements.js redraws the case when a trophy unlocks; the progress bars
  // are put back each time. Only the host's own children are watched, so adding
  // a bar inside a row does not call this again.
  trophyObserver = new MutationObserver(() => decorateTrophyCase(trophyRows()));
  trophyObserver.observe(host, { childList: true });
}

// ── Share ────────────────────────────────────────────────────────────────────

function bindShareControls() {
  const exportTask = (operation, task) => () => observeBackgroundTask(task, {
    surface: "export-island",
    operation,
    authorityKey: dashboardAuthorityKey(state.dashboard)
  });
  document.getElementById("shareDynastyBtn")?.addEventListener("click", exportTask(
    "dynasty-timeline",
    () => invokeUiIsland("settings", "shareDynastyTimeline")
  ));
  document.getElementById("leagueStoryCardBtn")?.addEventListener("click", exportTask("league-story", async () => {
    const exportsIsland = await loadUiIsland("exports");
    const story = exportsIsland.story.buildLeagueStoryFromDashboard(state.dashboard || {});
    exportsIsland.story.downloadLeagueStory(story);
  }));
  document.getElementById("franchiseNewsletterBtn")?.addEventListener("click", exportTask("franchise-newsletter", async () => {
    const exportsIsland = await loadUiIsland("exports");
    return exportsIsland.newsletter.generateFranchiseNewsletter(state);
  }));
}

async function renderTimeline() {
  // The timeline is drawn from the club's season history. Load it once if the
  // Dynasty tab has not been opened yet, so the share button has something to share.
  const teamId = state.dashboard?.controlledTeamId;
  if (!state.teamHistory && teamId) {
    const payload = await api(`/api/history/team?team=${encodeURIComponent(teamId)}`);
    if (!state.teamHistory) state.teamHistory = payload.history || null;
  }
  await invokeUiIsland("settings", "renderDynastyTimeline");
}

// ── Entry point ──────────────────────────────────────────────────────────────

function bindOnce() {
  if (bound) return;
  bound = true;
  bindShareControls();
  document.addEventListener("vsfgm:dashboard-applied", () => {
    if (state.activeTab !== TAB_ID) return;
    observeBackgroundTask(() => renderGmProfile(), { surface: "gm-profile", operation: "refresh", severity: "warning" });
  });
}

export async function renderGmProfile() {
  bindOnce();
  let legacy = lastLegacy;
  try {
    legacy = (await api("/api/gm-legacy")).legacy || null;
    lastLegacy = legacy;
  } catch (error) {
    // Show the page with the last career summary we were given, and report the
    // failed request so it is never mistaken for a fresh one.
    legacy = lastLegacy || state.gmLegacy || null;
    if (!legacy) throw error;
    recordClientDiagnostic({ surface: "gm-profile", operation: "career-summary", error, severity: "warning" });
  }
  const earned = readEarnedAchievements();
  const road = deriveTrophyRoad(
    { dashboard: state.dashboard || {}, recentBoxScores: state.recentBoxScores || [], earned },
    ACHIEVEMENTS.length
  );
  const profile = buildGmProfile({
    legacy,
    gmCareer: state.dashboard?.gmCareer || null,
    teams: state.dashboard?.teams || [],
    achievements: ACHIEVEMENTS,
    earned,
    locked: road.objectives
  });
  renderCareer(profile.career);
  renderTrophyCase();
  decorateTrophyCase(profile.trophies.rows);
  watchTrophyCase();
  await renderTimeline();
  return profile;
}
