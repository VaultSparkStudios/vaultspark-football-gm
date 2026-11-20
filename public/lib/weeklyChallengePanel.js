/**
 * weeklyChallengePanel.js — the weekly challenge's goal, score and share text.
 *
 * Loaded on demand after the first dashboard arrives, never at boot. It asks
 * the game which league is in play; when that is one of the open weekly
 * challenge leagues it shows the week's goal in the challenge panel, the score
 * once the first season ends, a share text, and — only with Community Stats
 * sharing on — how the score compares with other GMs. The scoring rules and
 * the board live in weeklyChallengeScoreContract.js and are loaded only for a
 * weekly league.
 */
import { api, state } from "./appState.js";
import { escapeHtml, showToast } from "./appCore.js";
import { recordClientDiagnostic } from "./clientDiagnostics.js";
import { dashboardAuthorityKey } from "./franchiseScope.js";
import { encodeChallengeCode } from "./challengeCodes.js";
import { challengeLink, isoWeek, weeklyChallengeWeekForSeed } from "./weeklyChallenge.js";

const HOST_ID = "weeklyChallengeScore";
let bound = false;
let lastKey = null;
let renderToken = 0;
let announced = "";

function leagueKey(dashboard = state.dashboard) {
  return `${dashboard?.controlledTeamId}|${dashboard?.startYear}|${dashboard?.currentYear}|${dashboard?.phase}`;
}

function host() {
  let element = document.getElementById(HOST_ID);
  if (element) return element;
  const anchor = document.getElementById("speedrunStatus");
  if (!anchor) return null;
  element = document.createElement("div");
  element.id = HOST_ID;
  element.dataset.testid = "weekly-challenge-score";
  element.style.marginTop = "10px";
  anchor.insertAdjacentElement("afterend", element);
  return element;
}

function announce(key, message) {
  if (announced === key) return;
  announced = key;
  showToast(message);
}

async function copyShareText(element) {
  const box = element.querySelector("#weeklyChallengeShareText");
  const status = element.querySelector("#weeklyChallengeShareStatus");
  if (!box || !status) return;
  try {
    await navigator.clipboard.writeText(box.value);
    status.textContent = "Copied. Paste it anywhere.";
  } catch {
    // The text is already on screen: select it so one key press copies it.
    box.focus();
    box.select();
    status.textContent = "Could not copy for you. The text is selected: press Ctrl+C or Cmd+C.";
  }
}

function boardLine(contract, standing, board, sharing, submission) {
  if (!sharing) return "Turn on Community Stats in Settings to post this score and see how other GMs did. Nothing is sent while it is off.";
  if (!board) return submission?.status === "failed" ? "Could not reach the shared board. Your score is still yours; it will be posted next time." : "Could not reach the shared board right now.";
  const percentile = contract.challengePercentile(board, standing.score);
  if (percentile == null) return "Not enough scores yet. The board opens once five GMs have posted one.";
  const when = isoWeek()?.key === standing.week.key ? "this week" : `in Week ${standing.week.week}`;
  return `You beat ${percentile}% of GMs ${when}. ${board.gms} GMs have posted a score.`;
}

async function render(meta) {
  const token = ++renderToken;
  const element = host();
  if (!element) return;
  const weekly = meta?.seed != null && weeklyChallengeWeekForSeed(meta.seed);
  if (!weekly) { element.replaceChildren(); return; }

  const contract = await import("./weeklyChallengeScoreContract.js");
  const standing = contract.weeklyChallengeStanding(meta, (state.dashboard?.teams || []).map((team) => team.id));
  if (token !== renderToken) return;
  if (!standing) { element.replaceChildren(); return; }
  const goal = `<div class="speedrun-rival" data-testid="weekly-challenge-goal"><strong>Week ${standing.week.week} goal:</strong> ${escapeHtml(standing.objective.goal)}</div>`;

  if (standing.state === "other-setup") {
    element.innerHTML = `${goal}<p class="small">This league was not started with the challenge's own club and start year, so this run is not scored.</p>`;
    return;
  }
  if (standing.state === "playing") {
    element.innerHTML = `${goal}<p class="small" data-testid="weekly-challenge-state">Your score is counted when this first season ends.</p>`;
    announce(`${standing.week.key}:goal`, `This week's challenge: ${standing.objective.goal}`);
    return;
  }
  if (standing.state === "unscored") {
    element.innerHTML = `${goal}<p class="small" data-testid="weekly-challenge-state">This league's first season ended before a score could be worked out, so this run has no score.</p>`;
    return;
  }

  const scoreText = contract.formatChallengeScore(standing.objective.id, standing.score);
  const link = challengeLink(encodeChallengeCode({ seed: meta.seed, startYear: meta.startYear, teamId: meta.controlledTeamId }) || "weekly", new URL("./", location.href).href);
  const shareText = (percentile = null) => contract.buildChallengeShareText({ week: standing.week.key, objectiveId: standing.objective.id, score: standing.score, link, percentile });
  element.innerHTML = `${goal}
    <div class="speedrun-stat" data-testid="weekly-challenge-result"><strong>Your score:</strong> ${escapeHtml(scoreText)} <span aria-hidden="true">${contract.challengeScoreBlocks(standing.objective.id, standing.score)}</span></div>
    <p class="small" id="weeklyChallengeBoardLine" data-testid="weekly-challenge-board" aria-live="polite">Checking the shared board…</p>
    <label class="small" for="weeklyChallengeShareText">Share your result</label>
    <textarea id="weeklyChallengeShareText" data-testid="weekly-challenge-share-text" readonly rows="6" style="width:100%;resize:vertical"></textarea>
    <div class="row compact"><button id="weeklyChallengeCopyBtn" data-testid="weekly-challenge-copy-btn" class="btn btn-sm" type="button">Copy Result</button>
    <span class="small" id="weeklyChallengeShareStatus" role="status"></span></div>`;
  const box = element.querySelector("#weeklyChallengeShareText");
  box.value = shareText();
  element.querySelector("#weeklyChallengeCopyBtn").addEventListener("click", () => copyShareText(element));
  // Only when the season ended during this visit, not on every later visit.
  if (announced === `${standing.week.key}:goal`) announce(`${standing.week.key}:score`, `Challenge score: ${scoreText}. Your result is in Settings.`);

  const transport = await import("./weeklyChallengeBoard.js");
  const { getCommunityParticipation } = await import("./communityTelemetry.js");
  const sharing = getCommunityParticipation();
  let submission = null;
  let board = null;
  if (sharing) {
    submission = await transport.submitChallengeScore({ week: standing.week.key, objective: standing.objective.id, score: standing.score });
    board = await transport.fetchChallengeBoard(standing.week.key);
  }
  if (token !== renderToken) return;
  const line = element.querySelector("#weeklyChallengeBoardLine");
  if (line) line.textContent = boardLine(contract, standing, board, sharing, submission);
  const percentile = board ? contract.challengePercentile(board, standing.score) : null;
  if (percentile != null && box.isConnected) box.value = shareText(percentile);
}

function reportFailure(error) {
  recordClientDiagnostic({ surface: "challenge", operation: "weekly-challenge-panel", error, authorityKey: dashboardAuthorityKey(state.dashboard), severity: "warning" });
}

/**
 * Ask the game which league is in play and draw the panel for it. Also keeps
 * `state.speedrunWeeklyWeek` current for the challenge panel's own week line.
 */
export async function syncWeeklyChallenge() {
  if (!bound) {
    bound = true;
    document.addEventListener("vsfgm:dashboard-applied", () => {
      if (leagueKey() !== lastKey) syncWeeklyChallenge().catch(reportFailure);
    });
    window.addEventListener("fa:community-participation", () => { render(state.speedrunLeagueMeta).catch(reportFailure); });
  }
  lastKey = leagueKey();
  const status = await api("/api/speedrun/status");
  const meta = status?.leagueMeta || null;
  state.speedrunLeagueMeta = meta;
  state.speedrunWeeklyWeek = meta?.seed != null ? weeklyChallengeWeekForSeed(meta.seed) : null;
  globalThis._renderSpeedrunPanel?.();
  await render(meta);
  return state.speedrunWeeklyWeek;
}
