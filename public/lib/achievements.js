// Cross-save achievement trophy case (S70). Every unlock derives from a real
// receipted event or live dashboard truth — no invented outcomes, no score
// effects. Earned trophies persist per browser profile (not per save), giving
// the player a permanent identity across every franchise they run.

import { state } from "./appState.js";
import { escapeHtml, showToast } from "./appCore.js";
import { playSound, vibrate, HAPTIC_PATTERNS } from "./audioFeedback.js";

const STORAGE_KEY = "fa:achievements:v1";

// ── Registry ─────────────────────────────────────────────────────────────────
// check(ctx) returns false, true, or a string detail. ctx:
//   event: { type, ...payload }   — the receipted trigger
//   game:  controlled-team game summary on week-advanced events
//   d:     state.dashboard (live truth)
// Checks must treat missing data as "not earned" — never award on absence.

export const ACHIEVEMENTS = [
  // Weekly moments
  { id: "first-win", name: "First W", icon: "🏈", tier: "bronze", desc: "Win your first game.", check: (c) => c.game?.won === true },
  { id: "nail-biter", name: "Ice in the Veins", icon: "🧊", tier: "bronze", desc: "Win a one-score game (3 points or fewer).", check: (c) => c.game?.won && c.game.margin <= 3 },
  { id: "blowout-30", name: "Statement Game", icon: "📢", tier: "silver", desc: "Win by 30 or more.", check: (c) => c.game?.won && c.game.margin >= 30 },
  { id: "shutout", name: "Brick Wall", icon: "🧱", tier: "silver", desc: "Hold an opponent scoreless.", check: (c) => c.game?.won && c.game.oppScore === 0 },
  { id: "forty-burger", name: "Forty Burger", icon: "🍔", tier: "silver", desc: "Score 40+ points in one game.", check: (c) => c.game && c.game.teamScore >= 40 },
  { id: "streak-3", name: "Heating Up", icon: "🔥", tier: "bronze", desc: "Win 3 straight games.", check: (c) => c.event.type === "week-advanced" && c.streak >= 3 },
  { id: "streak-5", name: "On a Tear", icon: "⚡", tier: "silver", desc: "Win 5 straight games.", check: (c) => c.event.type === "week-advanced" && c.streak >= 5 },
  { id: "streak-8", name: "Unstoppable", icon: "🌋", tier: "gold", desc: "Win 8 straight games.", check: (c) => c.event.type === "week-advanced" && c.streak >= 8 },
  { id: "perfect-start", name: "5–0 Start", icon: "🚀", tier: "silver", desc: "Open a season 5–0.", check: (c) => c.event.type === "week-advanced" && c.record?.wins === 5 && c.record?.losses === 0 },

  // Season arcs
  { id: "first-season", name: "Year One", icon: "📅", tier: "bronze", desc: "Complete your first season.", check: (c) => c.event.type === "season-complete" },
  { id: "winning-season", name: "Above the Line", icon: "📈", tier: "bronze", desc: "Finish a season with a winning record.", check: (c) => c.event.type === "season-complete" && c.event.wins > c.event.losses },
  { id: "twelve-wins", name: "Contender", icon: "💪", tier: "silver", desc: "Win 12+ games in a season.", check: (c) => c.event.type === "season-complete" && c.event.wins >= 12 },
  { id: "top-seed", name: "League's Best", icon: "👑", tier: "gold", desc: "Finish a season ranked #1.", check: (c) => c.event.type === "season-complete" && c.event.rank === 1 },
  { id: "playoff-berth", name: "Dancing in January", icon: "🎟️", tier: "silver", desc: "Reach the playoffs.", check: (c) => playoffAppearances(c.d) >= 1 },
  { id: "champion", name: "World Champions", icon: "🏆", tier: "gold", desc: "Win the championship.", check: (c) => titles(c.d) >= 1 },
  { id: "dynasty", name: "Dynasty", icon: "🏛️", tier: "legend", desc: "Win 3 championships in one career.", check: (c) => titles(c.d) >= 3 },
  { id: "decade-gm", name: "Decade of Power", icon: "⏳", tier: "gold", desc: "Serve 10 seasons as GM in one franchise.", check: (c) => seasonsServed(c.d) >= 10 },
  { id: "quarter-century", name: "Institution", icon: "🗿", tier: "legend", desc: "Serve 25 seasons as GM in one franchise.", check: (c) => seasonsServed(c.d) >= 25 },

  // Draft day
  { id: "first-pick", name: "With This Selection…", icon: "🎤", tier: "bronze", desc: "Make your first draft pick.", check: (c) => c.event.type === "draft-pick" },
  { id: "draft-steal", name: "Draft Day Heist", icon: "🕵️", tier: "silver", desc: "Draft a prospect graded a steal where you took them.", check: (c) => c.event.type === "draft-pick" && c.event.verdict === "steal" },
  { id: "elite-grade-pick", name: "Blue Chip", icon: "💎", tier: "silver", desc: "Draft a prospect with an elite combine grade (78+).", check: (c) => c.event.type === "draft-pick" && Number(c.event.grade) >= 78 },

  // The trade desk
  { id: "first-trade", name: "Deal Maker", icon: "🤝", tier: "bronze", desc: "Complete your first trade.", check: (c) => c.event.type === "trade-committed" },
  { id: "trade-heist", name: "Grand Theft Roster", icon: "🎭", tier: "gold", desc: "Win a trade by 15+ value points.", check: (c) => c.event.type === "trade-committed" && Number(c.event.valueEdge) >= 15 },
  { id: "inbound-accepted", name: "My Phone Rings", icon: "📞", tier: "bronze", desc: "Accept a trade offer a rival GM brought to you.", check: (c) => c.event.type === "trade-committed" && c.event.inbound === true },

  // Career identity
  { id: "tier-2", name: "Proving Ground", icon: "🌱", tier: "bronze", desc: "Reach GM legacy tier 2.", check: (c) => c.event.type === "gm-tier" && c.event.tier >= 2 },
  { id: "tier-4", name: "Front Office Royalty", icon: "🎩", tier: "silver", desc: "Reach GM legacy tier 4.", check: (c) => c.event.type === "gm-tier" && c.event.tier >= 4 },
  { id: "tier-6", name: "Immortal", icon: "🌟", tier: "legend", desc: "Reach the final GM legacy tier.", check: (c) => c.event.type === "gm-tier" && c.event.tier >= 6 },
  { id: "speedrun-finish", name: "Against the Clock", icon: "⏱️", tier: "silver", desc: "Complete a speedrun challenge.", check: (c) => c.event.type === "speedrun-complete" }
];

function playoffAppearances(d) {
  return Number(d?.gmLegacy?.playoffAppearances ?? d?.gmLegacy?.raw?.playoffAppearances ?? 0);
}

function titles(d) {
  return Number(d?.gmLegacy?.superBowlWins ?? d?.gmLegacy?.raw?.superBowlWins ?? 0);
}

function seasonsServed(d) {
  return Number(d?.gmLegacy?.seasonsServed ?? d?.gmLegacy?.raw?.seasonsServed ?? 0);
}

// ── Persistence (cross-save, bounded: ids + timestamps only) ─────────────────

export function readEarnedAchievements() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeEarnedAchievements(earned) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(earned));
  } catch {
    // Quota/storage failure: the unlock still shows this session.
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export function deriveControlledGame(recentBoxScores, controlledTeamId, week, year) {
  const rows = Array.isArray(recentBoxScores) ? recentBoxScores : [];
  const game = rows.find((row) => Number(row.week) === Number(week) && (!year || Number(row.year ?? year) === Number(year))
    && (row.homeTeamId === controlledTeamId || row.awayTeamId === controlledTeamId));
  if (!game) return null;
  const home = game.homeTeamId === controlledTeamId;
  const teamScore = Number(home ? game.homeScore : game.awayScore);
  const oppScore = Number(home ? game.awayScore : game.homeScore);
  if (!Number.isFinite(teamScore) || !Number.isFinite(oppScore)) return null;
  return {
    gameId: game.gameId,
    week: Number(game.week),
    opponent: home ? game.awayTeamId : game.homeTeamId,
    home,
    teamScore,
    oppScore,
    margin: teamScore - oppScore,
    won: teamScore > oppScore,
    seasonType: game.seasonType || "regular"
  };
}

export function deriveWinStreak(recentBoxScores, controlledTeamId) {
  const rows = (Array.isArray(recentBoxScores) ? recentBoxScores : [])
    .filter((row) => row.homeTeamId === controlledTeamId || row.awayTeamId === controlledTeamId)
    .slice()
    .sort((a, b) => Number(b.week) - Number(a.week));
  let streak = 0;
  for (const row of rows) {
    const home = row.homeTeamId === controlledTeamId;
    const won = Number(home ? row.homeScore : row.awayScore) > Number(home ? row.awayScore : row.homeScore);
    if (!won) break;
    streak += 1;
  }
  return streak;
}

export function evaluateAchievements(ctx, earned = {}) {
  const unlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (earned[achievement.id]) continue;
    let result = false;
    try {
      result = achievement.check(ctx);
    } catch {
      result = false;
    }
    if (result) unlocked.push(achievement);
  }
  return unlocked;
}

export function recordAchievementEvent(type, payload = {}) {
  const d = state.dashboard;
  const controlledTeamId = d?.controlledTeamId || d?.controlledTeam?.id || null;
  const ctx = {
    event: { type, ...payload },
    d,
    game: null,
    streak: 0,
    record: null
  };
  if (type === "week-advanced" && d && controlledTeamId) {
    const completedWeek = Number(payload.completedWeek ?? (Number(d.currentWeek) - 1));
    ctx.game = deriveControlledGame(state.recentBoxScores, controlledTeamId, completedWeek, d.currentYear);
    ctx.streak = deriveWinStreak(state.recentBoxScores, controlledTeamId);
    const standings = d.latestStandings || [];
    const abbrev = d.controlledTeam?.abbrev || controlledTeamId;
    const myRow = standings.find((row) => row.team === abbrev || row.team === controlledTeamId || row.teamId === controlledTeamId);
    if (myRow) ctx.record = { wins: Number(myRow.wins) || 0, losses: Number(myRow.losses) || 0 };
  }

  const earned = readEarnedAchievements();
  const unlocked = evaluateAchievements(ctx, earned);
  if (!unlocked.length) return { unlocked: [], game: ctx.game };

  const franchise = d ? `${d.controlledTeam?.abbrev || controlledTeamId || "?"} ${d.currentYear ?? ""}`.trim() : "";
  for (const achievement of unlocked) {
    earned[achievement.id] = { earnedAt: new Date().toISOString(), franchise };
  }
  writeEarnedAchievements(earned);
  announceUnlocks(unlocked);
  return { unlocked, game: ctx.game };
}

// ── Presentation ─────────────────────────────────────────────────────────────

const TIER_LABELS = { bronze: "Bronze", silver: "Silver", gold: "Gold", legend: "Legend" };

function announceUnlocks(unlocked) {
  playSound("trophy-unlock");
  vibrate(HAPTIC_PATTERNS.unlock);
  for (const achievement of unlocked.slice(0, 3)) {
    showToast(`${achievement.icon} Trophy unlocked: ${achievement.name}`);
  }
  const caseEl = document.getElementById("trophyCaseContent");
  if (caseEl) renderTrophyCase();
}

export function renderTrophyCase() {
  const el = document.getElementById("trophyCaseContent");
  if (!el) return;
  const earned = readEarnedAchievements();
  const earnedCount = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  const rows = ACHIEVEMENTS.map((achievement) => {
    const record = earned[achievement.id];
    const date = record?.earnedAt ? new Date(record.earnedAt).toLocaleDateString() : null;
    return `
      <div class="trophy ${record ? "trophy-earned" : "trophy-locked"} trophy-${achievement.tier}" data-trophy-id="${escapeHtml(achievement.id)}">
        <span class="trophy-icon">${record ? achievement.icon : "🔒"}</span>
        <span class="trophy-body">
          <span class="trophy-name">${escapeHtml(achievement.name)}</span>
          <span class="trophy-desc">${escapeHtml(achievement.desc)}</span>
          ${record ? `<span class="trophy-meta">${escapeHtml(TIER_LABELS[achievement.tier] || "")} · ${escapeHtml(date || "")}${record.franchise ? ` · ${escapeHtml(record.franchise)}` : ""}</span>` : `<span class="trophy-meta">${escapeHtml(TIER_LABELS[achievement.tier] || "")} · Locked</span>`}
        </span>
        ${record ? `<button class="trophy-share-btn" data-trophy-share="${escapeHtml(achievement.id)}" title="Copy share text">Share</button>` : ""}
      </div>`;
  }).join("");
  el.innerHTML = `
    <div class="trophy-case-summary">${earnedCount} / ${ACHIEVEMENTS.length} trophies earned — permanent across every franchise in this browser.</div>
    <div class="trophy-case-grid">${rows}</div>`;
  el.querySelectorAll("button[data-trophy-share]").forEach((button) => {
    button.addEventListener("click", () => {
      const achievement = ACHIEVEMENTS.find((a) => a.id === button.dataset.trophyShare);
      const record = readEarnedAchievements()[button.dataset.trophyShare];
      if (!achievement || !record) return;
      const text = `${achievement.icon} I unlocked "${achievement.name}" in Franchise Architect: Football — ${achievement.desc} (${record.franchise || "my franchise"}). Play free: https://playfranchisearchitect.com/`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => showToast("Share text copied!"),
          () => showToast("Clipboard unavailable.")
        );
      } else {
        showToast("Clipboard unavailable.");
      }
    });
  });
}

export function achievementProgressSummary() {
  const earned = readEarnedAchievements();
  const earnedCount = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  return { earnedCount, total: ACHIEVEMENTS.length };
}
