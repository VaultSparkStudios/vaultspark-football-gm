import { api } from "./appState.js";
import { escapeHtml, showToast, teamCode } from "./appCore.js";
import { observeBackgroundTask, recordClientDiagnostic, resolveClientDiagnostic } from "./clientDiagnostics.js";
import { buildScoringTimeline, createSimWatchPlayback, deriveFinalReel, resolveBoxScoreTeamIds, SIM_WATCH_SPEEDS } from "./simWatchPlayback.js";

let active = false;
let controller = null;
let context = null;

function renderHeader(boxScore) {
  const header = document.getElementById("simWatchHeader");
  if (!header) return;
  header.innerHTML = `
    <div class="sw-matchup">
      <span class="sw-team">${escapeHtml(boxScore.awayTeamName || boxScore.awayTeamId || boxScore.awayTeam?.teamId || "Away")}</span>
      <span class="sw-score" id="swAwayScore">0</span>
      <span class="sw-vs">@</span>
      <span class="sw-score" id="swHomeScore">0</span>
      <span class="sw-team">${escapeHtml(boxScore.homeTeamName || boxScore.homeTeamId || boxScore.homeTeam?.teamId || "Home")}</span>
    </div>
    <div class="sw-meta">${escapeHtml(String(boxScore.year || ""))} · Week ${escapeHtml(String(boxScore.week || ""))} · ${escapeHtml(boxScore.seasonType || "regular")}</div>`;
}

async function decorateRivalry(boxScore) {
  const header = document.getElementById("simWatchHeader");
  const teamIds = resolveBoxScoreTeamIds(boxScore);
  if (!header || !teamIds.home || !teamIds.away) return;
  const response = await api(`/api/rivalry?teamA=${encodeURIComponent(teamIds.home)}&teamB=${encodeURIComponent(teamIds.away)}`);
  const rivalry = response?.rivalry || null;
  if (!rivalry || (rivalry.heat || 0) < 60 || !active) return;
  const banner = document.createElement("div");
  banner.className = "sw-rivalry-banner";
  banner.innerHTML = `<span class="rivalry-week-badge">RIVALRY WEEK</span> ${escapeHtml(rivalry.heatLabel || "")} · Series ${rivalry.teamAWins}-${rivalry.teamBWins}${rivalry.streak?.count > 1 ? ` · ${escapeHtml(teamCode(rivalry.streak.team))} won last ${rivalry.streak.count}` : ""}`;
  header.appendChild(banner);
}

function playKind(play, scoringSet) {
  const description = String(play?.description || "");
  const lower = description.toLowerCase();
  const scoring = scoringSet.has(description) || lower.includes("touchdown") || lower.includes("field goal") || lower.includes("safety");
  const turnover = lower.includes("interception") || lower.includes("fumble");
  const fourth = play?.clock?.startsWith?.("4th") || play?.quarterLabel?.includes?.("4");
  return { description, scoring, turnover, highlight: scoring || turnover || (fourth && lower.includes("stop")) };
}

function appendPlay(play, scoringSet) {
  const feed = document.getElementById("simWatchFeed");
  if (!feed) return;
  const kind = playKind(play, scoringSet);
  const row = document.createElement("div");
  row.className = `sw-play${kind.highlight ? " sw-highlight" : ""}${kind.scoring ? " sw-scoring" : ""}${kind.turnover ? " sw-turnover" : ""}`;
  row.innerHTML = `
    <span class="sw-play-qtr">${escapeHtml(play.quarterLabel || play.clock || "")}</span>
    <span class="sw-play-team">${escapeHtml(play.offenseTeamId || "")}</span>
    <span class="sw-play-desc">${escapeHtml(kind.description.slice(0, 120))}</span>
    ${kind.highlight ? `<span class="sw-play-tag">${kind.scoring ? "SCORE" : kind.turnover ? "TURNOVER" : "4TH"}</span>` : ""}`;
  feed.appendChild(row);
}

function updateField(boxScore, play, index) {
  const field = document.getElementById("simWatchField");
  const possession = document.getElementById("simWatchPossession");
  const yardLine = document.getElementById("simWatchYardLine");
  if (!field) return;
  const description = String(play?.description || "").toLowerCase();
  const offense = play?.offenseTeamId || "";
  let x = 50 + ((index * 13) % 42) - 21;
  if (description.includes("touchdown")) x = offense === resolveBoxScoreTeamIds(boxScore).home ? 92 : 8;
  if (description.includes("interception") || description.includes("fumble")) x = 100 - x;
  x = Math.max(8, Math.min(92, x));
  field.style.setProperty("--ball-x", String(x));
  if (possession) possession.textContent = offense ? `${teamCode(offense)} ball` : "Live drive";
  if (yardLine) yardLine.textContent = x >= 50 ? `Opp ${Math.max(1, Math.round(100 - x))}` : `Own ${Math.max(1, Math.round(x))}`;
}

function scoringThrough(index) {
  const totals = { away: 0, home: 0 };
  for (const score of context.scoreTimeline) {
    if (score.playIndex == null || score.playIndex > index) continue;
    if (score.teamId === context.teamIds.away) totals.away += Number(score.points || 0);
    if (score.teamId === context.teamIds.home) totals.home += Number(score.points || 0);
  }
  return totals;
}

function showFinal() {
  const { boxScore } = context;
  const away = boxScore.awayTeam?.score ?? 0;
  const home = boxScore.homeTeam?.score ?? 0;
  document.getElementById("swAwayScore").textContent = String(away);
  document.getElementById("swHomeScore").textContent = String(home);
  const banner = document.getElementById("simWatchFinal");
  if (!banner) return;
  const winner = away > home ? boxScore.awayTeamName : home > away ? boxScore.homeTeamName : null;
  banner.textContent = winner ? `Final — ${winner} wins ${Math.max(away, home)}-${Math.min(away, home)}` : `Final — Tie ${away}-${home}`;
  banner.hidden = false;
}

function renderDirector(snapshot) {
  const play = document.getElementById("simWatchPlayPauseBtn");
  const speed = document.getElementById("simWatchSpeedSelect");
  const progress = document.getElementById("simWatchProgress");
  const label = document.getElementById("simWatchProgressLabel");
  if (play) {
    const playing = snapshot.status === "playing";
    play.textContent = playing ? "Pause" : snapshot.status === "complete" ? "Replay" : "Play";
    play.setAttribute("aria-pressed", playing ? "true" : "false");
  }
  if (speed) speed.value = String(snapshot.speed);
  if (progress) {
    progress.value = snapshot.played;
    progress.max = Math.max(1, snapshot.total);
    progress.setAttribute("aria-valuetext", `${snapshot.progressPct}% · ${snapshot.quarter} · drive ${snapshot.drive || 0} of ${snapshot.driveTotal || 0}`);
  }
  if (label) {
    const mode = context?.mode === "reel" ? "Final Reel · " : "";
    label.textContent = snapshot.total
      ? `${mode}${snapshot.quarter} · play ${snapshot.quarterPlay}/${snapshot.quarterTotal} · drive ${snapshot.drive}/${snapshot.driveTotal} · ${snapshot.played}/${snapshot.total}`
      : "Pregame · no play receipts";
  }
}

function renderFrame(snapshot) {
  renderDirector(snapshot);
  if (!context || snapshot.index < 0) return;
  const feed = document.getElementById("simWatchFeed");
  if (feed) feed.innerHTML = "";
  for (let index = 0; index <= snapshot.index; index += 1) appendPlay(context.plays[index], context.scoringSet);
  feed?.lastElementChild?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  const totals = scoringThrough(snapshot.play?.reelSourceIndex ?? snapshot.index);
  document.getElementById("swAwayScore").textContent = String(totals.away);
  document.getElementById("swHomeScore").textContent = String(totals.home);
  updateField(context.boxScore, snapshot.play, snapshot.play?.reelSourceIndex ?? snapshot.index);
  const final = document.getElementById("simWatchFinal");
  if (snapshot.status === "complete") showFinal();
  else if (final) final.hidden = true;
}

export async function runSimWatch(gameId) {
  const overlay = document.getElementById("simWatchOverlay");
  if (!overlay || active) return null;
  try {
    const response = await api(`/api/boxscore?gameId=${encodeURIComponent(gameId)}`);
    const boxScore = response?.boxScore;
    if (!boxScore) throw new Error("Box score did not include a Sim-Watch receipt.");
    const plays = boxScore.playByPlay || [];
    const scoring = boxScore.scoringSummary || [];
    context = { boxScore, teamIds: resolveBoxScoreTeamIds(boxScore), plays, fullPlays: plays, scoring, scoreTimeline: buildScoringTimeline(plays, scoring), scoringSet: new Set(scoring.map((entry) => entry.description)), mode: "full" };
    active = true;
    renderHeader(boxScore);
    overlay.hidden = false;
    overlay.classList.add("sim-watch-open");
    document.getElementById("simWatchFeed").innerHTML = "";
    document.getElementById("simWatchFinal").hidden = true;
    observeBackgroundTask(() => decorateRivalry(boxScore), {
      surface: "sim-watch", operation: "rivalry-context", authorityKey: boxScore.gameId || gameId
    });
    controller = createSimWatchPlayback({ plays, onChange: renderFrame });
    resolveClientDiagnostic({ surface: "sim-watch", operation: "playback" });
    controller.play();
    return controller.snapshot("opened");
  } catch (error) {
    active = false;
    controller = null;
    context = null;
    recordClientDiagnostic({
      surface: "sim-watch", operation: "playback", error, authorityKey: gameId, retry: () => runSimWatch(gameId)
    });
    showToast("Sim-Watch could not open. The failure is recorded in Client Diagnostics.");
    throw error;
  }
}

export function playSimWatchFinalReel() {
  if (!active || !context) return null;
  const reel = deriveFinalReel(context.fullPlays || context.plays, context.scoring, 8);
  if (!reel.length) {
    showToast("Final Reel is unavailable because this game has no high-impact play receipts.");
    return null;
  }
  controller?.stop();
  context.plays = reel;
  context.mode = "reel";
  const feed = document.getElementById("simWatchFeed");
  if (feed) feed.innerHTML = "";
  const final = document.getElementById("simWatchFinal");
  if (final) final.hidden = true;
  controller = createSimWatchPlayback({ plays: reel, baseDelayMs: 520, onChange: renderFrame });
  controller.play();
  return controller.snapshot("final-reel");
}

export function toggleSimWatchPlayback() { return controller?.toggle() || null; }
export function stepSimWatch(direction = 1) { return direction < 0 ? controller?.previous() || null : controller?.next() || null; }
export function setSimWatchSpeed(speed) { return controller?.setSpeed(Number(speed)) || null; }
export function skipSimWatch() { return controller?.skip() || null; }

export function handleSimWatchKeyboard(event) {
  if (!active || event?.target?.matches?.("input, textarea, select")) return false;
  if (event.key === " ") { event.preventDefault?.(); toggleSimWatchPlayback(); return true; }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault?.(); stepSimWatch(event.key === "ArrowLeft" ? -1 : 1); return true;
  }
  const speedIndex = Number(event.key) - 1;
  if (Number.isInteger(speedIndex) && SIM_WATCH_SPEEDS[speedIndex]) {
    setSimWatchSpeed(SIM_WATCH_SPEEDS[speedIndex]); return true;
  }
  return false;
}

export function closeSimWatch() {
  controller?.stop();
  controller = null;
  context = null;
  active = false;
  const overlay = document.getElementById("simWatchOverlay");
  if (overlay) {
    overlay.classList.remove("sim-watch-open");
    overlay.hidden = true;
  }
}
