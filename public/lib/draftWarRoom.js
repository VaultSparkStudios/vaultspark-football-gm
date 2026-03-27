/**
 * Draft War Room — Cinematic Draft Day Mode
 *
 * Transforms the draft screen into an immersive War Room experience:
 *   - Pick countdown timer per selection
 *   - Rival GM trade-call surface at pick N-3
 *   - Live board updates as picks are taken
 *   - On-the-clock animation and pick card reveal
 *
 * This is a presentation layer — all actual draft logic runs in the
 * existing engine. War Room mode controls timing and surfacing only.
 */

const ON_THE_CLOCK_MS = 90_000; // 90 second pick timer
const TRADE_CALL_BEFORE_PICKS = 3; // show trade call N picks before user's turn

export class DraftWarRoom {
  constructor({ onPickTimeout, onTradeCallDismiss, callApi, getState }) {
    this.onPickTimeout = onPickTimeout || (() => {});
    this.onTradeCallDismiss = onTradeCallDismiss || (() => {});
    this.callApi = callApi;
    this.getState = getState;
    this._timer = null;
    this._timerStart = null;
    this._tradeCallShown = false;
    this._active = false;
    this._listeners = [];
  }

  // ── Mode entry/exit ─────────────────────────────────────────────────────────

  enter() {
    this._active = true;
    this._tradeCallShown = false;
    this._emit("mode-enter");
  }

  exit() {
    this._active = false;
    this._clearTimer();
    this._emit("mode-exit");
  }

  // ── Pick clock ──────────────────────────────────────────────────────────────

  startPickClock(onTick, durationMs = ON_THE_CLOCK_MS) {
    this._clearTimer();
    this._timerStart = Date.now();
    const end = this._timerStart + durationMs;

    const tick = () => {
      const remaining = Math.max(0, end - Date.now());
      const pct = (remaining / durationMs) * 100;
      onTick({ remaining, pct, urgent: remaining < 15_000 });
      if (remaining <= 0) {
        this._clearTimer();
        this.onPickTimeout();
      } else {
        this._timer = setTimeout(tick, 250);
      }
    };
    this._timer = setTimeout(tick, 0);
  }

  stopPickClock() {
    this._clearTimer();
  }

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  // ── Trade call surface ──────────────────────────────────────────────────────

  /**
   * Check if a rival GM trade call should surface.
   * @param {number} currentPick  — overall pick number (1-indexed)
   * @param {number} userNextPick — user's next pick number
   */
  checkTradeCall(currentPick, userNextPick, prospects, userNeed) {
    if (this._tradeCallShown) return null;
    if (userNextPick - currentPick !== TRADE_CALL_BEFORE_PICKS) return null;

    // Find a trade target: a prospect the user likely wants who another team covets
    const target = (prospects || []).find((p) =>
      p.position === userNeed && (p.overall || p.potential || 70) >= 75
    );
    if (!target) return null;

    const callerTeams = ["LAR", "DAL", "NE", "SEA", "SF", "KC", "BUF", "PHI", "GB"];
    const caller = callerTeams[Math.floor(Math.random() * callerTeams.length)];

    this._tradeCallShown = true;

    return {
      type: "trade-call",
      callerTeam: caller,
      targetName: target.name,
      targetPosition: target.position,
      message: `${caller} is calling. They want to move up for ${target.name} (${target.position}).`,
      options: [
        { id: "accept-call", label: "Take the call", action: "open-trade-ui" },
        { id: "ignore-call", label: "Ignore", action: "dismiss" }
      ]
    };
  }

  // ── Pick reveal animation data ──────────────────────────────────────────────

  buildPickReveal(pick) {
    return {
      pickNumber: pick.overall,
      round: pick.round,
      selection: pick.roundPick,
      teamId: pick.teamId,
      playerName: pick.playerName || "—",
      position: pick.position || "—",
      college: pick.college || "—",
      overall: pick.overall || "—",
      devTrait: pick.devTrait || "Normal",
      backstory: pick.backstory || null,
      animationClass: pick.teamId === this._controlledTeam ? "pick-reveal-user" : "pick-reveal-cpu"
    };
  }

  setControlledTeam(teamId) { this._controlledTeam = teamId; }

  // ── Event system ────────────────────────────────────────────────────────────

  on(event, fn) { this._listeners.push({ event, fn }); }
  off(event, fn) { this._listeners = this._listeners.filter((l) => !(l.event === event && l.fn === fn)); }
  _emit(event, data) { this._listeners.filter((l) => l.event === event).forEach((l) => l.fn(data)); }
}

// ── War Room pick board renderer ──────────────────────────────────────────────

export function renderWarRoomBoard(container, {
  picks, controlledTeamId, currentPickIdx, userPickIdx, teamColor = "#4a8fb5"
}) {
  if (!container) return;

  const rows = picks.map((pick, idx) => {
    const isUser = pick.teamId === controlledTeamId;
    const isCurrent = idx === currentPickIdx;
    const isPast = idx < currentPickIdx;
    const isUserNext = idx === userPickIdx;

    let rowClass = "wrb-row";
    if (isUser) rowClass += " wrb-user-pick";
    if (isCurrent) rowClass += " wrb-on-clock";
    if (isPast) rowClass += " wrb-made";
    if (isUserNext && !isCurrent) rowClass += " wrb-user-next";

    const pickText = isPast
      ? `${pick.playerName || "—"} (${pick.position || "—"})`
      : isCurrent
        ? `<span class="wrb-clock-label">On the Clock</span>`
        : "Pending";

    return `
      <div class="${rowClass}" style="${isUser ? `--wrb-accent:${teamColor}` : ""}">
        <span class="wrb-pick-num">#${pick.overall}</span>
        <span class="wrb-team">${pick.teamId}</span>
        <span class="wrb-selection">${pickText}</span>
        ${!isPast && !isCurrent ? `<span class="wrb-need">${pick.need || ""}</span>` : ""}
      </div>`;
  }).join("");

  container.innerHTML = `<div class="war-room-board">${rows}</div>`;
}

// ── Pick clock renderer ───────────────────────────────────────────────────────

export function renderPickClock(container, { remaining, pct, urgent }) {
  if (!container) return;
  const seconds = Math.ceil(remaining / 1000);
  const colorClass = urgent ? "clock-urgent" : pct < 40 ? "clock-warning" : "clock-normal";
  container.innerHTML = `
    <div class="war-room-clock ${colorClass}">
      <div class="clock-bar-track"><div class="clock-bar-fill" style="width:${pct}%"></div></div>
      <div class="clock-seconds">${seconds}s</div>
    </div>`;
}

// ── Trade call modal renderer ─────────────────────────────────────────────────

export function renderTradeCall(container, tradeCall, onAction) {
  if (!container || !tradeCall) return;
  const btns = tradeCall.options.map((opt) =>
    `<button class="btn-sm ${opt.id === "accept-call" ? "btn-primary" : "btn-ghost"}" data-action="${opt.action}" data-id="${opt.id}">${opt.label}</button>`
  ).join("");

  container.innerHTML = `
    <div class="war-room-trade-call">
      <div class="trade-call-header">
        <span class="trade-call-icon">&#128222;</span>
        <span class="trade-call-team">${tradeCall.callerTeam} is calling</span>
      </div>
      <div class="trade-call-body">${tradeCall.message}</div>
      <div class="trade-call-actions">${btns}</div>
    </div>`;

  container.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => onAction(btn.dataset.id, btn.dataset.action));
  });
}
