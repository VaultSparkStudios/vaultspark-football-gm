/**
 * engagementFeatures.js — Session 8 engagement & depth feature suite
 *
 * Exports:
 *   Priority Inbox system (bell icon, CRITICAL/IMPORTANT/FLAVOR tiers)
 *   Franchise Moment card (cinematic post-game drama)
 *   GM Decision modal (pre-advance critical-week choices)
 *   Sim-Watch overlay (live 300ms drive-log animation)
 *   Season Narrative Arcs panel
 *   Cap War Room panel
 *   Trade Breakdown card
 *   Dynasty Records Board
 *   AI GM Archetypes display
 *   Mentorship badge renderer
 */

import { state, api } from "./appState.js";
import { escapeHtml, fmtMoney, showToast, renderTable, teamCode } from "./appCore.js";

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY INBOX SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

const _inbox = { items: [], seen: new Set() };

export function classifyNewsItem(item) {
  const type = (item.type || "").toLowerCase();
  const headline = (item.headline || "").toLowerCase();
  if (type === "injury" && (headline.includes("out for season") || headline.includes("severe"))) return "CRITICAL";
  if (type === "cap-alert" || type === "cap_alert") return "CRITICAL";
  if (type === "trade" || type === "signing" || type === "milestone") return "IMPORTANT";
  if (type === "injury") return "IMPORTANT";
  if (type === "standings" || type === "streak" || type === "upset" || type === "blowout") return "IMPORTANT";
  return "FLAVOR";
}

export function ingestNewsIntoInbox(newsItems = []) {
  let newCount = 0;
  for (const item of newsItems) {
    const key = `${item.type}-${item.headline}-${item.week}`;
    if (_inbox.seen.has(key)) continue;
    _inbox.seen.add(key);
    const tier = classifyNewsItem(item);
    _inbox.items.unshift({ ...item, tier, receivedAt: Date.now() });
    if (tier === "CRITICAL" || tier === "IMPORTANT") newCount++;
  }
  // Cap at 60 items
  if (_inbox.items.length > 60) _inbox.items = _inbox.items.slice(0, 60);
  return newCount;
}

export function getUnreadCount() {
  const lastSeen = Number(localStorage.getItem("vsfgm-inbox-seen") || 0);
  return _inbox.items.filter((i) => i.receivedAt > lastSeen && (i.tier === "CRITICAL" || i.tier === "IMPORTANT")).length;
}

export function renderInboxBadge() {
  const badge = document.getElementById("inboxBadge");
  if (!badge) return;
  const count = getUnreadCount();
  badge.textContent = count > 9 ? "9+" : String(count);
  badge.hidden = count === 0;
  badge.className = count > 0 ? "inbox-badge" + (_inbox.items.some((i) => i.tier === "CRITICAL" && i.receivedAt > Number(localStorage.getItem("vsfgm-inbox-seen") || 0)) ? " inbox-badge-critical" : "") : "inbox-badge";
}

export function openInbox() {
  const drawer = document.getElementById("inboxDrawer");
  if (!drawer) return;
  localStorage.setItem("vsfgm-inbox-seen", String(Date.now()));
  renderInboxBadge();
  renderInboxContent();
  drawer.classList.add("open");
}

export function closeInbox() {
  const drawer = document.getElementById("inboxDrawer");
  if (drawer) drawer.classList.remove("open");
}

function renderInboxContent() {
  const list = document.getElementById("inboxList");
  if (!list) return;
  if (!_inbox.items.length) {
    list.innerHTML = `<div class="inbox-empty">No messages yet. Simulate weeks to generate league events.</div>`;
    return;
  }
  const tierIcons = { CRITICAL: "🔴", IMPORTANT: "🟡", FLAVOR: "⬜" };
  const tierLabels = { CRITICAL: "Critical", IMPORTANT: "Important", FLAVOR: "Flavor" };
  const typeIcons = {
    injury: "🚑", trade: "🔄", blowout: "💥", upset: "⚡", milestone: "🌟",
    streak: "🔥", standings: "📊", retirement: "👋", signing: "✍️",
    "press-conference": "🎤", championship: "🏆", "cap-alert": "💰", "cap_alert": "💰",
  };
  list.innerHTML = _inbox.items.slice(0, 30).map((item) => {
    const typeIcon = typeIcons[item.type?.toLowerCase()] || "📰";
    return `
      <div class="inbox-item inbox-tier-${escapeHtml(item.tier.toLowerCase())}">
        <div class="inbox-item-header">
          <span class="inbox-tier-dot" title="${escapeHtml(tierLabels[item.tier])}">${escapeHtml(tierIcons[item.tier])}</span>
          <span class="inbox-type-icon">${typeIcon}</span>
          <span class="inbox-headline">${escapeHtml(item.headline || item.type || "League Event")}</span>
          <span class="inbox-week">W${item.week ?? "?"}</span>
        </div>
        ${item.detail ? `<div class="inbox-detail">${escapeHtml(item.detail)}</div>` : ""}
        ${item.quote ? `<div class="inbox-quote">"${escapeHtml(item.quote.slice(0, 100))}"</div>` : ""}
      </div>`;
  }).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// FRANCHISE MOMENT CARD
// ─────────────────────────────────────────────────────────────────────────────

let _lastShownMomentGameId = null;

export async function checkAndShowFranchiseMoment() {
  try {
    const data = await api("/api/franchise-moment");
    if (!data?.moment) return;
    const moment = data.moment;
    if (moment.gameId === _lastShownMomentGameId) return;
    if (moment.dramaScore < 2) return; // Only show genuinely dramatic moments
    _lastShownMomentGameId = moment.gameId;
    showFranchiseMomentCard(moment);
  } catch {
    // non-critical
  }
}

export function showFranchiseMomentCard(moment) {
  const modal = document.getElementById("franchiseMomentModal");
  if (!modal) return;
  const isWin = moment.result === "win";
  document.getElementById("fmHeadline").textContent = moment.headline || "Franchise Moment";
  document.getElementById("fmScore").textContent = moment.score || "-";
  document.getElementById("fmWeek").textContent = `Week ${moment.week || "?"} · ${moment.year || ""}`;
  document.getElementById("fmHighlight").textContent = moment.highlight || "";
  const topPlay = document.getElementById("fmTopPlay");
  if (topPlay) {
    topPlay.textContent = moment.topPlay || "";
    topPlay.hidden = !moment.topPlay;
  }
  const shareBtn = document.getElementById("fmShareBtn");
  if (shareBtn) {
    shareBtn.onclick = () => {
      navigator.clipboard?.writeText(moment.shareText || "").then(() => showToast("Copied to clipboard!")).catch(() => {});
    };
  }
  modal.className = `franchise-moment-modal ${isWin ? "fm-win" : "fm-loss"}`;
  modal.hidden = false;
  modal.classList.add("fm-animate-in");
  setTimeout(() => modal.classList.remove("fm-animate-in"), 600);
}

export function closeFranchiseMomentModal() {
  const modal = document.getElementById("franchiseMomentModal");
  if (modal) modal.hidden = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GM DECISION MODAL
// ─────────────────────────────────────────────────────────────────────────────

let _pendingDecisionResolve = null;
let _activeDecision = null;

export async function checkAndShowGmDecision() {
  try {
    const data = await api("/api/gm-decision");
    if (!data?.decisions?.length) return null;
    const decision = data.decisions[0]; // Show highest-priority first
    const shownKey = `vsfgm-decision-${decision.id}-w${decision.week}`;
    if (localStorage.getItem(shownKey)) return null; // Already shown this week
    return new Promise((resolve) => {
      _pendingDecisionResolve = (choice) => {
        localStorage.setItem(shownKey, "1");
        resolve(choice);
      };
      showGmDecisionModal(decision);
    });
  } catch {
    return null;
  }
}

export function showGmDecisionModal(decision) {
  const modal = document.getElementById("gmDecisionModal");
  if (!modal) return;
  _activeDecision = decision;
  document.getElementById("gmDecisionPrompt").textContent = decision.prompt || "";
  const optionsEl = document.getElementById("gmDecisionOptions");
  if (optionsEl) {
    optionsEl.innerHTML = (decision.options || []).map((opt) => `
      <button class="gm-decision-option" data-choice="${escapeHtml(opt.id)}">
        <div class="gm-decision-opt-label">${escapeHtml(opt.label)}</div>
        <div class="gm-decision-opt-effect">${escapeHtml(opt.effect)}</div>
      </button>`).join("");
    optionsEl.querySelectorAll(".gm-decision-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.choice;
        resolveGmDecision(choice);
      });
    });
  }
  modal.hidden = false;
}

export function resolveGmDecision(choice) {
  const modal = document.getElementById("gmDecisionModal");
  if (modal) modal.hidden = true;
  if (_pendingDecisionResolve) {
    const fn = _pendingDecisionResolve;
    _pendingDecisionResolve = null;
    _activeDecision = null;
    fn(choice);
  }
}

export function dismissGmDecision() {
  resolveGmDecision(null);
}

// ─────────────────────────────────────────────────────────────────────────────
// SIM-WATCH OVERLAY (Live box score feed with 300ms animation)
// ─────────────────────────────────────────────────────────────────────────────

let _simWatchActive = false;
let _simWatchSkip = false;

export async function runSimWatch(gameId) {
  const overlay = document.getElementById("simWatchOverlay");
  if (!overlay || _simWatchActive) return;
  try {
    const data = await api(`/api/boxscore?gameId=${encodeURIComponent(gameId)}`);
    const bs = data?.boxScore;
    if (!bs) return;
    _simWatchActive = true;
    _simWatchSkip = false;
    renderSimWatchHeader(bs);
    overlay.hidden = false;
    overlay.classList.add("sim-watch-open");
    const feed = document.getElementById("simWatchFeed");
    if (feed) feed.innerHTML = "";
    const plays = bs.playByPlay || [];
    const scoring = bs.scoringSummary || [];
    const scoringSet = new Set(scoring.map((s) => s.description));
    // Animate drives with 300ms delays, skip available
    for (let i = 0; i < plays.length && _simWatchActive; i++) {
      if (_simWatchSkip) break;
      await new Promise((r) => setTimeout(r, 280));
      if (!_simWatchActive) break;
      appendSimWatchPlay(plays[i], scoringSet);
      updateSimWatchScore(bs, scoring, i, plays);
    }
    // Show final state
    showSimWatchFinal(bs);
  } catch {
    // non-critical
  } finally {
    _simWatchActive = false;
  }
}

function renderSimWatchHeader(bs) {
  const header = document.getElementById("simWatchHeader");
  if (!header) return;
  header.innerHTML = `
    <div class="sw-matchup">
      <span class="sw-team">${escapeHtml(bs.awayTeamName || bs.awayTeamId)}</span>
      <span class="sw-score" id="swAwayScore">0</span>
      <span class="sw-vs">@</span>
      <span class="sw-score" id="swHomeScore">0</span>
      <span class="sw-team">${escapeHtml(bs.homeTeamName || bs.homeTeamId)}</span>
    </div>
    <div class="sw-meta">${escapeHtml(String(bs.year || ""))} · Week ${escapeHtml(String(bs.week || ""))} · ${escapeHtml(bs.seasonType || "regular")}</div>
  `;
}

function appendSimWatchPlay(play, scoringSet) {
  const feed = document.getElementById("simWatchFeed");
  if (!feed) return;
  const desc = play.description || "";
  const isScoring = scoringSet.has(desc) || desc.toLowerCase().includes("touchdown");
  const isTurnover = desc.toLowerCase().includes("interception") || desc.toLowerCase().includes("fumble");
  const is4th = play.clock?.startsWith("4th") || play.quarterLabel?.includes("4");
  const isHighlight = isScoring || isTurnover || (is4th && desc.toLowerCase().includes("stop"));
  const el = document.createElement("div");
  el.className = `sw-play${isHighlight ? " sw-highlight" : ""}${isScoring ? " sw-scoring" : ""}${isTurnover ? " sw-turnover" : ""}`;
  el.innerHTML = `
    <span class="sw-play-qtr">${escapeHtml(play.quarterLabel || play.clock || "")}</span>
    <span class="sw-play-team">${escapeHtml(play.offenseTeamId || "")}</span>
    <span class="sw-play-desc">${escapeHtml(desc.slice(0, 120))}</span>
    ${isHighlight ? `<span class="sw-play-tag">${isScoring ? "TD" : isTurnover ? "TURNOVER" : "4TH"}</span>` : ""}
  `;
  feed.prepend(el);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateSimWatchScore(bs, scoring, playIndex, plays) {
  // Count scoring plays up to current index
  const desc = plays.slice(0, playIndex + 1).map((p) => p.description);
  const awayTDs = scoring.filter((s) => desc.includes(s.description) && s.teamId === bs.awayTeamId).length;
  const homeTDs = scoring.filter((s) => desc.includes(s.description) && s.teamId === bs.homeTeamId).length;
  const awayEl = document.getElementById("swAwayScore");
  const homeEl = document.getElementById("swHomeScore");
  if (awayEl) awayEl.textContent = String(awayTDs * 7);
  if (homeEl) homeEl.textContent = String(homeTDs * 7);
}

function showSimWatchFinal(bs) {
  const awayEl = document.getElementById("swAwayScore");
  const homeEl = document.getElementById("swHomeScore");
  if (awayEl) awayEl.textContent = String(bs.awayTeam?.score ?? 0);
  if (homeEl) homeEl.textContent = String(bs.homeTeam?.score ?? 0);
  const finalBanner = document.getElementById("simWatchFinal");
  if (finalBanner) {
    const awayScore = bs.awayTeam?.score ?? 0;
    const homeScore = bs.homeTeam?.score ?? 0;
    const winner = awayScore > homeScore ? bs.awayTeamName : homeScore > awayScore ? bs.homeTeamName : null;
    finalBanner.textContent = winner ? `Final — ${winner} wins ${Math.max(awayScore, homeScore)}-${Math.min(awayScore, homeScore)}` : `Final — Tie ${awayScore}-${homeScore}`;
    finalBanner.hidden = false;
  }
}

export function skipSimWatch() {
  _simWatchSkip = true;
}

export function closeSimWatch() {
  _simWatchActive = false;
  _simWatchSkip = true;
  const overlay = document.getElementById("simWatchOverlay");
  if (overlay) {
    overlay.classList.remove("sim-watch-open");
    overlay.hidden = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASON NARRATIVE ARCS PANEL
// ─────────────────────────────────────────────────────────────────────────────

export async function renderSeasonArcs() {
  const el = document.getElementById("seasonArcsPanel");
  if (!el) return;
  try {
    const data = await api("/api/season-arcs");
    const arcs = data?.arcs || [];
    if (!arcs.length) { el.hidden = true; return; }
    el.hidden = false;
    const statusColors = { "on-track": "var(--success)", "at-risk": "var(--danger)", resolved: "var(--muted)" };
    const statusLabels = { "on-track": "On Track", "at-risk": "At Risk", resolved: "Resolved" };
    document.getElementById("seasonArcsContent").innerHTML = arcs.map((arc) => `
      <div class="season-arc-card">
        <span class="season-arc-icon">${escapeHtml(arc.icon || "📖")}</span>
        <div class="season-arc-body">
          <div class="season-arc-title">${escapeHtml(arc.title)}</div>
          <div class="season-arc-status" style="color:${statusColors[arc.status] || "var(--muted)"}">
            ${escapeHtml(statusLabels[arc.status] || arc.status)}
            ${arc.resolved !== null ? ` · ${arc.resolved ? "✓ Achieved" : "✗ Failed"}` : ""}
          </div>
        </div>
        <div class="season-arc-type">${escapeHtml(arc.type?.replace(/_/g, " ") || "")}</div>
      </div>`).join("");
  } catch {
    // non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CAP WAR ROOM (multi-year cap timeline)
// ─────────────────────────────────────────────────────────────────────────────

export async function renderCapWarRoom() {
  const el = document.getElementById("capWarRoomPanel");
  if (!el) return;
  try {
    const teamId = state.contractTeamId || state.dashboard?.controlledTeamId || "BUF";
    const data = await api(`/api/roster?team=${encodeURIComponent(teamId)}`);
    const roster = data?.roster || [];
    const cap = data?.cap || {};
    const currentYear = state.dashboard?.currentYear || new Date().getFullYear();
    const CAP_LIMIT = 255_000_000;
    // Build 4-year projection by summing contracts per year
    const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
    const yearData = years.map((yr) => {
      let committed = 0;
      let dead = 0;
      let expiring = 0;
      for (const player of roster) {
        const contract = player.contract || {};
        const yearsRemaining = contract.yearsRemaining || 0;
        const contractYear = currentYear + (yr - currentYear);
        if (yr <= currentYear + yearsRemaining - 1) {
          committed += contract.salary || 0;
        } else {
          dead += contract.deadCap || 0;
        }
        if (yr === currentYear && yearsRemaining === 1) expiring++;
      }
      const total = Math.min(committed + dead, CAP_LIMIT * 1.1);
      const pct = Math.min(100, Math.round((total / CAP_LIMIT) * 100));
      const zone = pct >= 95 ? "critical" : pct >= 85 ? "warning" : "safe";
      return { year: yr, committed, dead, total, pct, zone, expiring };
    });
    el.hidden = false;
    const bars = yearData.map((d) => `
      <div class="cwr-year">
        <div class="cwr-year-label">${d.year}</div>
        <div class="cwr-bar-track">
          <div class="cwr-bar-fill cwr-zone-${escapeHtml(d.zone)}" style="width:${d.pct}%" title="${fmtMoney(d.total)} / ${fmtMoney(CAP_LIMIT)}"></div>
        </div>
        <div class="cwr-pct cwr-pct-${escapeHtml(d.zone)}">${d.pct}%</div>
        <div class="cwr-detail">
          <span>${fmtMoney(d.committed)} committed</span>
          ${d.dead > 0 ? `<span class="cwr-dead">+${fmtMoney(d.dead)} dead</span>` : ""}
          ${d.expiring > 0 ? `<span class="cwr-expiring">${d.expiring} expiring</span>` : ""}
        </div>
      </div>`).join("");
    document.getElementById("capWarRoomBars").innerHTML = bars;
    const hint = document.getElementById("capWarRoomHint");
    if (hint) {
      const critical = yearData.find((d) => d.zone === "critical");
      const warning = yearData.find((d) => d.zone === "warning");
      if (critical) hint.textContent = `⚠ ${critical.year} is over the danger zone — restructure or release contracts now.`;
      else if (warning) hint.textContent = `Watch ${warning.year} — limited flexibility. Plan restructures early.`;
      else hint.textContent = "Cap trajectory looks healthy across all projected years.";
    }
  } catch {
    // non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADE BREAKDOWN CARD (letter grades + verdict)
// ─────────────────────────────────────────────────────────────────────────────

export function renderTradeBreakdown(evalResult) {
  const el = document.getElementById("tradeBreakdownCard");
  if (!el || !evalResult) return;
  const { fairness, teamAPlayers, teamBPlayers, teamAPicksValue, teamBPicksValue } = evalResult;
  const gradeScore = (score) => {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "A-";
    if (score >= 75) return "B+";
    if (score >= 70) return "B";
    if (score >= 65) return "B-";
    if (score >= 60) return "C+";
    if (score >= 55) return "C";
    if (score >= 50) return "C-";
    return "D";
  };
  const gradeClass = (grade) => {
    if (grade.startsWith("A")) return "grade-a";
    if (grade.startsWith("B")) return "grade-b";
    if (grade.startsWith("C")) return "grade-c";
    return "grade-d";
  };
  const aVal = (teamAPlayers || []).reduce((s, p) => s + (p.tradeValue || p.overall || 70), 0) + (teamAPicksValue || 0);
  const bVal = (teamBPlayers || []).reduce((s, p) => s + (p.tradeValue || p.overall || 70), 0) + (teamBPicksValue || 0);
  const delta = aVal - bVal;
  const verdict = Math.abs(delta) < 5
    ? "Even trade — both sides get fair value"
    : delta > 15 ? "Team B wins this trade decisively"
    : delta < -15 ? "Team A wins this trade decisively"
    : delta > 0 ? "Slight edge to Team B"
    : "Slight edge to Team A";
  const fairGrade = gradeScore(Number(fairness) || 70);
  el.hidden = false;
  el.innerHTML = `
    <div class="tbd-header">Trade Breakdown</div>
    <div class="tbd-row">
      <div class="tbd-side">
        <div class="tbd-side-label">Team A Gets</div>
        ${(teamBPlayers || []).map((p) => `<div class="tbd-player"><span class="tbd-pos">${escapeHtml(p.pos || "")}</span><span>${escapeHtml(p.name || p.playerId || "")}</span><span class="tbd-grade ${gradeClass(gradeScore(p.overall || 70))}">${gradeScore(p.overall || 70)}</span></div>`).join("")}
        ${teamBPicksValue ? `<div class="tbd-picks">+${fmtMoney(teamBPicksValue * 1000)} pick value</div>` : ""}
      </div>
      <div class="tbd-divider">⇄</div>
      <div class="tbd-side">
        <div class="tbd-side-label">Team B Gets</div>
        ${(teamAPlayers || []).map((p) => `<div class="tbd-player"><span class="tbd-pos">${escapeHtml(p.pos || "")}</span><span>${escapeHtml(p.name || p.playerId || "")}</span><span class="tbd-grade ${gradeClass(gradeScore(p.overall || 70))}">${gradeScore(p.overall || 70)}</span></div>`).join("")}
        ${teamAPicksValue ? `<div class="tbd-picks">+${fmtMoney(teamAPicksValue * 1000)} pick value</div>` : ""}
      </div>
    </div>
    <div class="tbd-verdict">
      <span class="tbd-fairness-grade ${gradeClass(fairGrade)}">${fairGrade}</span>
      <span class="tbd-verdict-text">${escapeHtml(verdict)}</span>
    </div>
  `;
}

export function hideTradeBreakdown() {
  const el = document.getElementById("tradeBreakdownCard");
  if (el) el.hidden = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNASTY RECORDS BOARD
// ─────────────────────────────────────────────────────────────────────────────

export async function renderDynastyRecordsBoard() {
  const el = document.getElementById("dynastyRecordsBoard");
  if (!el) return;
  try {
    const teamId = state.dashboard?.controlledTeamId || "BUF";
    const data = await api(`/api/records/franchise?team=${encodeURIComponent(teamId)}`);
    const records = data?.records || {};
    const cats = Object.entries(records).slice(0, 12);
    if (!cats.length) { el.innerHTML = `<div class="records-empty">No franchise records yet — simulate seasons to build your legacy.</div>`; return; }
    el.innerHTML = `<div class="records-grid">${cats.map(([cat, record]) => {
      if (!record) return "";
      const label = cat.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
      const val = typeof record === "object" ? (record.value ?? record.stat ?? "-") : record;
      const player = typeof record === "object" ? (record.player || record.name || "") : "";
      const year = typeof record === "object" ? (record.year || "") : "";
      return `
        <div class="record-card">
          <div class="record-cat">${escapeHtml(label)}</div>
          <div class="record-val">${typeof val === "number" ? val.toLocaleString() : escapeHtml(String(val))}</div>
          ${player ? `<div class="record-player">${escapeHtml(player)}</div>` : ""}
          ${year ? `<div class="record-year">${escapeHtml(String(year))}</div>` : ""}
        </div>`;
    }).join("")}</div>`;
  } catch {
    // non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI GM ARCHETYPES DISPLAY
// ─────────────────────────────────────────────────────────────────────────────

let _archetypesCache = null;

export async function loadTeamArchetypes() {
  try {
    const data = await api("/api/team-archetypes");
    _archetypesCache = {};
    for (const team of (data?.archetypes || [])) {
      _archetypesCache[team.teamId] = team.archetype;
    }
  } catch {
    // non-critical
  }
}

export function getTeamArchetype(teamId) {
  return _archetypesCache?.[teamId] || null;
}

export function renderArchetypesTable() {
  const el = document.getElementById("teamArchetypesTable");
  if (!el || !_archetypesCache) return;
  const rows = Object.entries(_archetypesCache).map(([teamId, arch]) => ({
    team: teamCode(teamId),
    archetype: arch.icon + " " + arch.label,
    style: arch.description
  }));
  renderTable("teamArchetypesTable", rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// MENTORSHIP BADGE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

export function buildMentorshipBadge(player, mentorships = []) {
  if (!player?.id) return "";
  const pair = mentorships.find((m) => m.menteeId === player.id || m.menteePlayerId === player.id);
  if (!pair) return "";
  const bonus = pair.statBonus || pair.bonus || 0;
  const mentorName = pair.mentorName || pair.mentor?.name || "Veteran";
  return `
    <div class="mentorship-badge" title="Mentored by ${escapeHtml(mentorName)}">
      <span class="mentorship-badge-icon">🎓</span>
      <span class="mentorship-badge-text">Mentored by <strong>${escapeHtml(mentorName)}</strong></span>
      ${bonus > 0 ? `<span class="mentorship-badge-bonus">+${bonus} AWR</span>` : ""}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCALSTORAGE SIZE GUARD
// ─────────────────────────────────────────────────────────────────────────────

const REWIND_SIZE_LIMIT = 4 * 1024 * 1024; // 4MB

export function checkAndPruneRewindStorage() {
  try {
    const indexRaw = localStorage.getItem("vsfgm-rw-index");
    if (!indexRaw) return;
    const index = JSON.parse(indexRaw);
    if (!Array.isArray(index)) return;
    // Estimate total size of rewind slots
    let totalSize = indexRaw.length;
    for (const slot of index) {
      const raw = localStorage.getItem(`vsfgm:rw-state:${slot.id}`);
      if (raw) totalSize += raw.length;
    }
    if (totalSize <= REWIND_SIZE_LIMIT) return;
    // Prune oldest slots until under limit
    let pruned = 0;
    const sorted = [...index].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    while (totalSize > REWIND_SIZE_LIMIT && sorted.length > 1) {
      const oldest = sorted.shift();
      const raw = localStorage.getItem(`vsfgm:rw-state:${oldest.id}`);
      if (raw) totalSize -= raw.length;
      localStorage.removeItem(`vsfgm:rw-state:${oldest.id}`);
      const newIndex = index.filter((s) => s.id !== oldest.id);
      localStorage.setItem("vsfgm-rw-index", JSON.stringify(newIndex));
      pruned++;
    }
    if (pruned > 0) {
      showToast(`Rewind storage pruned — ${pruned} oldest checkpoint${pruned > 1 ? "s" : ""} removed to free space.`, "warning");
    }
  } catch {
    // non-critical — never block gameplay
  }
}
