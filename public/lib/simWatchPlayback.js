export const SIM_WATCH_SPEEDS = Object.freeze([0.5, 1, 2, 4]);

function highlightKind(play = {}, scoringDescriptions = new Set()) {
  const description = String(play.description || "");
  const lower = description.toLowerCase();
  const scoring = scoringDescriptions.has(description)
    || lower.includes("touchdown")
    || lower.includes("field goal")
    || lower.includes("safety");
  const turnover = lower.includes("interception") || lower.includes("intercepted") || lower.includes("fumble") || lower.includes("turnover");
  const fourthDown = /fourth|4th down/.test(lower);
  const late = /(?:Q(?:uarter)?\s*)?(4|OT)/i.test(String(play.quarterLabel || play.quarter || ""));
  return { scoring, turnover, fourthDown, late };
}

export function deriveFinalReel(plays = [], scoring = [], limit = 8) {
  const scoringDescriptions = new Set(scoring.map((entry) => String(entry?.description || "")));
  const ranked = plays.map((play, index) => {
    const kind = highlightKind(play, scoringDescriptions);
    const score = (kind.scoring ? 100 : 0) + (kind.turnover ? 70 : 0) + (kind.fourthDown ? 35 : 0) + (kind.late ? 20 : 0);
    return { play, index, score, kind };
  }).filter((entry) => entry.score > 0);
  return ranked
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, Math.max(1, Math.min(12, Number(limit) || 8)))
    .sort((left, right) => left.index - right.index)
    .map(({ play, index, kind }) => ({ ...play, reelSourceIndex: index, reelKind: kind }));
}

function scoreMatchesPlay(score = {}, play = {}) {
  if (score.teamId && play.offenseTeamId && score.teamId !== play.offenseTeamId) return false;
  const type = String(score.type || "").toUpperCase();
  const playType = String(play.type || "").toLowerCase();
  const description = String(play.description || "").toLowerCase();
  if (type === "TD") return description.includes("touchdown");
  if (type === "FG") return playType === "field-goal" || (description.includes("field goal") && !description.includes("miss"));
  if (type === "SAFETY") return description.includes("safety");
  return false;
}

export function buildScoringTimeline(plays = [], scoring = []) {
  let cursor = 0;
  return scoring.map((score) => {
    const offset = plays.slice(cursor).findIndex((play) => scoreMatchesPlay(score, play));
    const playIndex = offset < 0 ? null : cursor + offset;
    if (playIndex != null) cursor = playIndex + 1;
    return { teamId: score.teamId || null, points: Number(score.points || 0), type: score.type || null, playIndex };
  });
}

export function resolveBoxScoreTeamIds(boxScore = {}) {
  return {
    away: boxScore.awayTeamId || boxScore.awayTeam?.teamId || null,
    home: boxScore.homeTeamId || boxScore.homeTeam?.teamId || null
  };
}

function clampIndex(index, length) {
  return Math.max(-1, Math.min(Math.max(-1, length - 1), Number(index) || 0));
}

function quarterKey(play = {}) {
  return String(play.quarterLabel || play.quarter || play.clock || "Game").match(/(?:Q(?:uarter)?\s*)?([1-4]|OT)/i)?.[1] || "Game";
}

function driveKey(play = {}, index, previous = null) {
  if (play.driveId != null) return `id:${play.driveId}`;
  if (play.driveNumber != null) return `number:${play.driveNumber}`;
  const offense = play.offenseTeamId || "unknown";
  return previous?.offenseTeamId === offense ? previous.__derivedDriveKey : `derived:${index}:${offense}`;
}

export function deriveBroadcastProgress(plays = [], index = -1) {
  const safeIndex = clampIndex(index, plays.length);
  if (safeIndex < 0 || !plays.length) {
    return { index: -1, played: 0, total: plays.length, progressPct: 0, quarter: "Pregame", quarterPlay: 0, quarterTotal: 0, drive: 0, driveTotal: 0 };
  }
  const decorated = [];
  for (let playIndex = 0; playIndex < plays.length; playIndex += 1) {
    const play = { ...plays[playIndex] };
    play.__quarterKey = quarterKey(play);
    play.__derivedDriveKey = driveKey(play, playIndex, decorated[playIndex - 1]);
    decorated.push(play);
  }
  const current = decorated[safeIndex];
  const quarterRows = decorated.filter((play) => play.__quarterKey === current.__quarterKey);
  const driveKeys = [...new Set(decorated.map((play) => play.__derivedDriveKey))];
  return {
    index: safeIndex,
    played: safeIndex + 1,
    total: plays.length,
    progressPct: Math.round(((safeIndex + 1) / plays.length) * 100),
    quarter: current.__quarterKey === "Game" ? "Game" : current.__quarterKey === "OT" ? "OT" : `Q${current.__quarterKey}`,
    quarterPlay: quarterRows.findIndex((play) => play === current) + 1,
    quarterTotal: quarterRows.length,
    drive: driveKeys.indexOf(current.__derivedDriveKey) + 1,
    driveTotal: driveKeys.length
  };
}

export function createSimWatchPlayback({
  plays = [],
  speed = 1,
  baseDelayMs = 280,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (handle) => clearTimeout(handle),
  onChange = () => {}
} = {}) {
  const rows = [...plays];
  let index = -1;
  let playbackSpeed = SIM_WATCH_SPEEDS.includes(Number(speed)) ? Number(speed) : 1;
  let status = "paused";
  let timer = null;

  const snapshot = (reason = "snapshot") => Object.freeze({
    reason,
    status,
    speed: playbackSpeed,
    delayMs: Math.round(baseDelayMs / playbackSpeed),
    play: index >= 0 ? rows[index] : null,
    ...deriveBroadcastProgress(rows, index)
  });
  const emit = (reason) => {
    const value = snapshot(reason);
    onChange(value);
    return value;
  };
  const clearTimer = () => {
    if (timer != null) cancel(timer);
    timer = null;
  };
  const queue = () => {
    clearTimer();
    if (status !== "playing") return;
    timer = schedule(tick, Math.round(baseDelayMs / playbackSpeed));
  };
  const tick = () => {
    timer = null;
    if (status !== "playing") return;
    if (index >= rows.length - 1) {
      status = "complete";
      emit("complete");
      return;
    }
    index += 1;
    emit("tick");
    if (index >= rows.length - 1) {
      status = "complete";
      emit("complete");
    } else queue();
  };

  return Object.freeze({
    snapshot,
    play() {
      if (!rows.length) { status = "complete"; return emit("complete"); }
      if (status === "complete" && index >= rows.length - 1) index = -1;
      status = "playing";
      const value = emit("play");
      queue();
      return value;
    },
    pause() {
      clearTimer();
      if (status !== "complete") status = "paused";
      return emit("pause");
    },
    toggle() { return status === "playing" ? this.pause() : this.play(); },
    setSpeed(nextSpeed) {
      const value = Number(nextSpeed);
      if (!SIM_WATCH_SPEEDS.includes(value)) throw new RangeError(`Unsupported Sim-Watch speed: ${nextSpeed}`);
      playbackSpeed = value;
      const next = emit("speed");
      if (status === "playing") queue();
      return next;
    },
    next() {
      clearTimer();
      index = Math.min(rows.length - 1, index + 1);
      if (index >= rows.length - 1) status = "complete";
      else if (status !== "playing") status = "paused";
      const value = emit("next");
      if (status === "playing") queue();
      return value;
    },
    previous() {
      clearTimer();
      index = Math.max(-1, index - 1);
      status = "paused";
      return emit("previous");
    },
    skip() {
      clearTimer();
      index = rows.length - 1;
      status = "complete";
      return emit("skip");
    },
    stop() {
      clearTimer();
      status = "stopped";
      return emit("stop");
    }
  });
}
