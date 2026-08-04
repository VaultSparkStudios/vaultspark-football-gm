// Reward beats (S70): the three most-repeated actions — weekly sim, draft
// pick, trade — each earn a moment. One shared non-modal, auto-dismissing
// beat card renders every verdict; it never intercepts navigation (the S30
// return-digest lesson) and every line derives from receipted data.

import { state } from "./appState.js";
import { escapeHtml, teamName } from "./appCore.js";
import { playSound, vibrate, HAPTIC_PATTERNS } from "./audioFeedback.js";

const AUTO_DISMISS_MS = 8000;
let dismissTimer = null;

export function showBeatCard({ kicker, headline, line, meta = "", tone = "neutral" }) {
  let card = document.getElementById("weekRecapCard");
  if (!card) {
    card = document.createElement("div");
    card.id = "weekRecapCard";
    document.body.appendChild(card);
  }
  card.className = `week-recap-card wr-${tone}`;
  card.innerHTML = `
    <div class="wr-kicker">${escapeHtml(kicker)}</div>
    <div class="wr-headline">${escapeHtml(headline)}</div>
    <div class="wr-score">${escapeHtml(line)}</div>
    ${meta ? `<div class="wr-meta">${escapeHtml(meta)}</div>` : ""}
    <button class="wr-close" aria-label="Dismiss">×</button>`;
  card.querySelector(".wr-close")?.addEventListener("click", hideBeatCard, { once: true });
  card.hidden = false;
  requestAnimationFrame(() => card.classList.add("wr-visible"));
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(hideBeatCard, AUTO_DISMISS_MS);
  return true;
}

export function hideBeatCard() {
  const card = document.getElementById("weekRecapCard");
  if (!card) return;
  card.classList.remove("wr-visible");
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  setTimeout(() => {
    card.hidden = true;
  }, 250);
}

// ── Week recap ───────────────────────────────────────────────────────────────

export function buildWeekRecapModel({ game, dashboard }) {
  if (!game) return null;
  const d = dashboard || {};
  const standings = d.latestStandings || [];
  const abbrev = d.controlledTeam?.abbrev || d.controlledTeamId;
  const rowIndex = standings.findIndex((row) => row.team === abbrev || row.teamId === d.controlledTeamId);
  const myRow = rowIndex >= 0 ? standings[rowIndex] : null;
  const headline = game.won
    ? game.margin >= 30 ? "Statement Win" : game.margin <= 3 ? "Escape Act" : "Victory"
    : game.margin >= -3 ? "Heartbreaker" : game.margin <= -30 ? "Woodshed" : "Defeat";
  return {
    won: game.won,
    headline,
    scoreLine: `${game.teamScore}–${game.oppScore} ${game.home ? "vs" : "at"} ${teamName(game.opponent) || game.opponent}`,
    week: game.week,
    record: myRow ? `${myRow.wins}–${myRow.losses}` : null,
    rank: rowIndex >= 0 ? rowIndex + 1 : null,
    seasonType: game.seasonType
  };
}

export function presentWeekRecap(game) {
  const model = buildWeekRecapModel({ game, dashboard: state.dashboard });
  if (!model) return false;
  playSound(model.won ? "win-chime" : "loss-thud");
  vibrate(model.won ? HAPTIC_PATTERNS.win : HAPTIC_PATTERNS.loss);
  return showBeatCard({
    kicker: `Week ${model.week}${model.seasonType === "playoffs" ? " · Playoffs" : ""} Recap`,
    headline: model.headline,
    line: model.scoreLine,
    meta: `${model.record ? `Record ${model.record}` : ""}${model.rank ? ` · League #${model.rank}` : ""}`.replace(/^ · /, ""),
    tone: model.won ? "win" : "loss"
  });
}

// ── Draft pick verdict ───────────────────────────────────────────────────────

export function buildDraftPickVerdict(prospect, draft) {
  const grade = Number(prospect?.grade);
  const pick = Number(draft?.currentPick) || null;
  const round = draft?.slots?.[pick - 1]?.round
    || (pick ? Math.max(1, Math.ceil(pick / 32)) : null);
  if (!Number.isFinite(grade)) {
    return { verdict: "unknown", label: "Wild Card", line: "The scouts will tell us in three years." };
  }
  if (grade >= 78 && (round || 1) >= 2) {
    return { verdict: "steal", label: "Draft Day Steal", line: `Elite grade (${grade}) still on the board in round ${round}. The war room is celebrating.` };
  }
  if (grade >= 78) {
    return { verdict: "blue-chip", label: "Blue Chip", line: `Elite combine grade (${grade}). Exactly what the top of the draft is for.` };
  }
  if (grade >= 65) {
    return { verdict: "solid", label: "Solid Value", line: `Good grade (${grade}) — a real contributor if development goes right.` };
  }
  if ((round || 2) === 1 && grade < 50) {
    return { verdict: "reach", label: "Bold Reach", line: `Grade ${grade} in round 1 — the beat writers have questions.` };
  }
  return { verdict: "developmental", label: "Developmental Swing", line: `Grade ${grade}. Late-round dice roll — every dynasty has one that hit.` };
}

export function presentDraftPickBeat(prospect, draft) {
  const verdict = buildDraftPickVerdict(prospect, draft);
  playSound("draft-brass");
  vibrate(HAPTIC_PATTERNS.tick);
  showBeatCard({
    kicker: "The Pick Is In",
    headline: `${prospect?.name || "Unknown"} · ${verdict.label}`,
    line: verdict.line,
    meta: `${prospect?.position || prospect?.pos || "?"} · OVR ${prospect?.overall ?? "—"}`,
    tone: verdict.verdict === "reach" ? "loss" : verdict.verdict === "steal" ? "win" : "neutral"
  });
  return verdict;
}

// ── Trade verdict ────────────────────────────────────────────────────────────

export function buildTradeVerdict({ myDelta, theirDelta }) {
  const edge = Number(myDelta || 0) - Number(theirDelta || 0);
  if (edge >= 15) return { edge, label: "Grand Theft Roster", line: `You won this deal by ${edge} value points. Somewhere, a rival GM is explaining themselves to their owner.` };
  if (edge >= 5) return { edge, label: "Sharp Deal", line: `A clear win: +${edge} value edge.` };
  if (edge > -5) return { edge, label: "Fair Exchange", line: "Both front offices can defend this one." };
  return { edge, label: "Costly Move", line: `You gave up ${Math.abs(edge)} points of value — it had better solve a problem.` };
}

export function presentTradeBeat({ myDelta, theirDelta, partner, inbound = false }) {
  const verdict = buildTradeVerdict({ myDelta, theirDelta });
  playSound("sign-thunk");
  vibrate(HAPTIC_PATTERNS.tick);
  showBeatCard({
    kicker: inbound ? "Inbound Deal Closed" : "Trade Executed",
    headline: verdict.label,
    line: verdict.line,
    meta: partner ? `With ${teamName(partner) || partner}` : "",
    tone: verdict.edge >= 5 ? "win" : verdict.edge <= -5 ? "loss" : "neutral"
  });
  return verdict;
}
