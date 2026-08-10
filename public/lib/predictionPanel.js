/**
 * predictionPanel.js — DOM surface for the weekly spread-prediction mini-game (S78).
 *
 * Pure game-state logic lives in spreadPredictions.js; this module only
 * renders it and wires clicks. Local-only, non-canon: nothing here ever
 * calls the simulation or an authority-guarded command.
 */

import { escapeHtml, teamCode } from "./appCore.js";
import {
  loadWeekPredictions,
  getPredictionStats,
  hitRatePct,
  predictionGameId,
  resolveWeekPredictions,
  submitPrediction
} from "./spreadPredictions.js";

const PANEL_ID = "weeklyPredictionsPanel";

function statsBar(stats) {
  return `
    <div class="wp-stats">
      <span class="wp-stat"><strong>${stats.seasonStreak}</strong> current streak</span>
      <span class="wp-stat"><strong>${stats.bestStreak}</strong> best streak</span>
      <span class="wp-stat"><strong>${hitRatePct(stats)}%</strong> hit rate (${stats.correctCount}/${stats.totalCount})</span>
    </div>`;
}

function pickForm(game, gameId) {
  return `
    <div class="wp-pick-form" data-game-id="${escapeHtml(gameId)}">
      <button type="button" class="wp-pick-btn" data-predict-winner="${escapeHtml(game.awayTeamId)}">${escapeHtml(teamCode(game.awayTeamId))}</button>
      <span class="wp-pick-at">@</span>
      <button type="button" class="wp-pick-btn" data-predict-winner="${escapeHtml(game.homeTeamId)}">${escapeHtml(teamCode(game.homeTeamId))}</button>
      <label class="wp-margin-label">by
        <input type="number" min="0" step="1" class="wp-margin-input" data-margin-input placeholder="margin" />
      </label>
      <button type="button" class="wp-submit-btn" data-predict-submit disabled>Predict</button>
    </div>`;
}

function pendingReceipt(prediction, game) {
  return `
    <div class="wp-pending">
      Your pick: <strong>${escapeHtml(teamCode(prediction.winnerId))}</strong>${prediction.margin != null ? ` by ${escapeHtml(String(prediction.margin))}` : ""}
    </div>`;
}

function resolvedReceipt(prediction, game) {
  const actualWinner = game.isTie ? "Tie" : teamCode(game.winnerId);
  const actualMargin = Math.abs(Number(game.awayScore || 0) - Number(game.homeScore || 0));
  const tone = prediction.correct ? "wp-correct" : "wp-incorrect";
  const icon = prediction.correct ? "✓" : "✗";
  return `
    <div class="wp-receipt ${tone}">
      <span class="wp-receipt-icon">${icon}</span>
      Predicted <strong>${escapeHtml(teamCode(prediction.winnerId))}</strong>${prediction.margin != null ? ` by ${escapeHtml(String(prediction.margin))}` : ""}
      — actual: <strong>${escapeHtml(actualWinner)}</strong> by ${actualMargin}
    </div>`;
}

function gameRowHTML(game, predictions) {
  const gameId = predictionGameId(game);
  const prediction = predictions[gameId];
  const matchup = `<span class="wp-matchup">${escapeHtml(teamCode(game.awayTeamId))} @ ${escapeHtml(teamCode(game.homeTeamId))}</span>`;

  let body;
  if (game.played) {
    body = prediction
      ? resolvedReceipt(prediction, game)
      : `<div class="wp-no-pick">No prediction submitted.</div>`;
  } else {
    body = prediction ? pendingReceipt(prediction, game) + pickForm(game, gameId) : pickForm(game, gameId);
  }

  return `<div class="wp-game-row">${matchup}${body}</div>`;
}

/**
 * Pure markup builder — no DOM, no storage. Exported so the render contract
 * (empty state, pick form, pending receipt, resolved correct/incorrect
 * receipt) is directly testable against constructed games/predictions/stats
 * fixtures, matching this repo's no-jsdom testing convention.
 */
export function buildPredictionPanelMarkup(games, predictions, stats) {
  const playableGames = (games || []).filter((g) => g.awayTeamId && g.homeTeamId);
  if (!playableGames.length) {
    return `<div class="wp-empty">No games this week to predict.</div>`;
  }
  return `
    <div class="weekly-predictions">
      <h3 class="wp-title">Predict the Week</h3>
      ${statsBar(stats)}
      <div class="wp-games">${playableGames.map((g) => gameRowHTML(g, predictions)).join("")}</div>
    </div>`;
}

/**
 * Render the weekly predictions panel for the given schedule week, and
 * resolve any now-played predictions from prior renders. Local-only:
 * `leagueId` scopes storage; nothing here touches engine/save state.
 */
export function renderPredictionPanel({ leagueId, year, week, games }) {
  const el = document.getElementById(PANEL_ID);
  if (!el) return;

  const playableGames = (games || []).filter((g) => g.awayTeamId && g.homeTeamId);
  if (!playableGames.length) {
    el.innerHTML = `<div class="wp-empty">No games this week to predict.</div>`;
    return;
  }

  resolveWeekPredictions(leagueId, year, week, playableGames);
  const predictions = loadWeekPredictions(leagueId, year, week);
  const stats = getPredictionStats(leagueId);

  el.innerHTML = buildPredictionPanelMarkup(playableGames, predictions, stats);

  el.querySelectorAll("[data-game-id]").forEach((form) => {
    const gameId = form.dataset.gameId;
    const game = playableGames.find((g) => predictionGameId(g) === gameId);
    if (!game) return;
    const submitBtn = form.querySelector("[data-predict-submit]");
    const marginInput = form.querySelector("[data-margin-input]");
    let selectedWinner = null;

    form.querySelectorAll("[data-predict-winner]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedWinner = btn.dataset.predictWinner;
        form.querySelectorAll("[data-predict-winner]").forEach((b) => b.classList.toggle("wp-selected", b === btn));
        if (submitBtn) submitBtn.disabled = false;
      });
    });

    submitBtn?.addEventListener("click", () => {
      if (!selectedWinner) return;
      submitPrediction(leagueId, year, week, game, { winnerId: selectedWinner, margin: marginInput?.value });
      renderPredictionPanel({ leagueId, year, week, games });
    });
  });
}
