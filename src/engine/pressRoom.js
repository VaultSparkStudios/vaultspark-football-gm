/**
 * pressRoom.js — the GM finally gets to answer the question (S63).
 *
 * The post-game podium has always been write-only. `generatePressConference`
 * picked a tone from the result, pushed two or three quote cards into the news
 * log, and recorded the podium for next week. The GM never chose anything.
 *
 * The strange part is that the machinery for a GM who *does* choose was already
 * built and half-idle. `continuityLedger` records and reads last week's podium,
 * and `followupKey` already models three transitions — `promise-kept`,
 * `promise-broken`, `humbled` — with authored quote banks for each. A system
 * designed around a general manager making promises, in which no general manager
 * could ever make one: every follow-up resolved against a tone the *engine*
 * picked, so "I told you last week this wouldn't happen again" was words the
 * player never said.
 *
 * This module closes that loop. After a controlled-team game the GM answers with
 * one of three postures, and the answer is the thing next week remembers.
 *
 * Design constraints, in order of importance:
 *
 *   - **Deterministic.** Consequences derive from the result and the chosen
 *     posture. No randomness, no hidden bonuses, no outcome prediction.
 *   - **Receipted.** Every point of owner patience, fan interest and chemistry
 *     names the sentence that moved it.
 *   - **Bounded.** Effects are small and clamped. A podium is a week of weather,
 *     not a trade.
 *   - **Skipping is a choice.** Declining to speak has its own honest, stated
 *     consequence. It is never a dead end and never a silent no-op.
 */

const clampStat = (value) => Math.max(0, Math.min(100, Math.round(value)));
const clampPatience = (value) => Number(Math.max(0.05, Math.min(0.95, value)).toFixed(4));

const RECEIPT_LIMIT = 24;

/**
 * The three postures, plus the honest fourth option of saying nothing.
 *
 * `promises` marks a response that puts the GM's own word on the record. Only a
 * promise can be kept or broken next week — that is what makes the existing
 * follow-up quote banks answerable.
 */
export const PRESS_RESPONSE_CATALOG = Object.freeze({
  "back-the-room": Object.freeze({
    id: "back-the-room",
    label: "Back the room",
    posture: "loyal",
    promises: false,
    quote: {
      win: "\"That result belongs to the players. They prepared, they executed, and they deserve every word of credit.\"",
      loss: "\"I'm not going to stand here and pick apart my own locker room. This group works. The result isn't who they are.\""
    },
    effects: Object.freeze({
      win: { chemistry: 2, fanInterest: 1, patience: 0 },
      loss: { chemistry: 3, fanInterest: -1, patience: -0.012 }
    }),
    reasons: Object.freeze({
      win: "credited the players publicly",
      loss: "shielded the locker room instead of assigning blame"
    })
  }),
  "take-the-blame": Object.freeze({
    id: "take-the-blame",
    label: "Take the blame",
    posture: "accountable",
    promises: true,
    quote: {
      win: "\"We won, but the margin was on me — the plan asked too much of them. I'll be better prepared next week.\"",
      loss: "\"That one is mine. The preparation was mine, the plan was mine, and the result is mine. It will be different next week.\""
    },
    effects: Object.freeze({
      win: { chemistry: 1, fanInterest: 0, patience: 0.008 },
      loss: { chemistry: 2, fanInterest: -2, patience: 0.014 }
    }),
    reasons: Object.freeze({
      win: "took responsibility despite the win",
      loss: "owned the loss in public"
    })
  }),
  "put-on-notice": Object.freeze({
    id: "put-on-notice",
    label: "Put them on notice",
    posture: "demanding",
    promises: true,
    quote: {
      win: "\"A win is the floor, not the ceiling. I expect more from this group and I've told them so. Nobody's spot is safe.\"",
      loss: "\"That was unacceptable and everyone in the building knows it. It will not happen again. Hold me to that.\""
    },
    effects: Object.freeze({
      win: { chemistry: -2, fanInterest: 2, patience: 0.006 },
      loss: { chemistry: -3, fanInterest: 3, patience: 0.01 }
    }),
    reasons: Object.freeze({
      win: "demanded more after a win",
      loss: "publicly promised a response"
    })
  }),
  decline: Object.freeze({
    id: "decline",
    label: "Say nothing",
    posture: "silent",
    promises: false,
    quote: {
      win: "\"I'll let the tape speak for itself.\"",
      loss: "\"I'm not answering that today.\""
    },
    effects: Object.freeze({
      win: { chemistry: 0, fanInterest: -1, patience: 0 },
      loss: { chemistry: 0, fanInterest: -2, patience: -0.006 }
    }),
    reasons: Object.freeze({
      win: "declined to speak after a win",
      loss: "declined to answer after a loss"
    })
  })
});

/** The three real postures, in the order they are offered. `decline` is the skip. */
export const PRESS_RESPONSE_IDS = Object.freeze(["back-the-room", "take-the-blame", "put-on-notice"]);

function ensurePressRoom(league) {
  if (!league.pressRoom || typeof league.pressRoom !== "object") {
    league.pressRoom = { pending: null, receipts: [] };
  }
  if (!Array.isArray(league.pressRoom.receipts)) league.pressRoom.receipts = [];
  return league.pressRoom;
}

export function pressQuestionId({ teamId, year, week }) {
  return `press-${teamId}-${year}-${week}`;
}

/**
 * The question the room asks, phrased from the actual result.
 * Derived only from observable facts — score, margin, streak, opponent.
 */
function questionFor({ isWin, margin, streak, opponent, topPerformer }) {
  if (!isWin && margin >= 21) {
    return `That was a ${margin}-point loss to ${opponent}. What do you say to the people who watched it?`;
  }
  if (!isWin && streak <= -3) {
    return `That's ${Math.abs(streak)} straight. At what point does someone answer for this?`;
  }
  if (!isWin) {
    return `A one-score loss to ${opponent}. Where did this game get away from you?`;
  }
  if (margin >= 21) {
    return `A ${margin}-point win over ${opponent}. Is this the team you thought you had?`;
  }
  if (streak >= 3) {
    return `${streak} in a row. Are you willing to say out loud what this team is?`;
  }
  return topPerformer
    ? `${topPerformer} carried a lot of that. How much of this is one player?`
    : `A close win over ${opponent}. What did you learn about this group?`;
}

/**
 * Open the podium after a controlled-team game.
 *
 * Returns the pending question, or null when there is nothing to ask about.
 * Idempotent: re-opening the same week does not replace an unanswered question
 * or reopen one the GM already answered.
 */
export function openPressQuestion(league, { teamId, year, week, isWin, margin, streak, opponent, score, topPerformer = null }) {
  if (!league || !teamId) return null;
  const room = ensurePressRoom(league);
  const id = pressQuestionId({ teamId, year, week });

  if (room.pending?.id === id) return room.pending;
  if (room.receipts.some((receipt) => receipt.questionId === id)) return null;

  room.pending = {
    id,
    teamId,
    year,
    week,
    isWin: Boolean(isWin),
    margin: Number(margin) || 0,
    score: score || null,
    opponent: opponent || null,
    topPerformer,
    question: questionFor({ isWin, margin, streak: Number(streak) || 0, opponent, topPerformer }),
    options: PRESS_RESPONSE_IDS.map((responseId) => {
      const response = PRESS_RESPONSE_CATALOG[responseId];
      return {
        id: response.id,
        label: response.label,
        posture: response.posture,
        preview: response.quote[isWin ? "win" : "loss"],
        promises: response.promises,
        consequence: describeEffects(response.effects[isWin ? "win" : "loss"])
      };
    }),
    skip: {
      id: "decline",
      label: PRESS_RESPONSE_CATALOG.decline.label,
      consequence: describeEffects(PRESS_RESPONSE_CATALOG.decline.effects[isWin ? "win" : "loss"])
    }
  };
  return room.pending;
}

/** Plain-language statement of exactly what a response costs and buys. */
export function describeEffects(effects = {}) {
  const parts = [];
  const push = (value, up, down) => {
    if (!value) return;
    parts.push(value > 0 ? up : down);
  };
  push(effects.chemistry, `locker room +${effects.chemistry}`, `locker room ${effects.chemistry}`);
  push(effects.fanInterest, `fans +${effects.fanInterest}`, `fans ${effects.fanInterest}`);
  push(
    effects.patience,
    `owner +${(effects.patience * 100).toFixed(1)}`,
    `owner ${(effects.patience * 100).toFixed(1)}`
  );
  return parts.length ? parts.join(" · ") : "no measurable movement";
}

export function getPendingPressQuestion(league, teamId = null) {
  const pending = ensurePressRoom(league).pending;
  if (!pending) return null;
  if (teamId && pending.teamId !== teamId) return null;
  return pending;
}

export function getPressReceipts(league, { limit = 12 } = {}) {
  return ensurePressRoom(league).receipts.slice(0, limit);
}

/**
 * Answer the question.
 *
 * Applies bounded consequences to team chemistry, owner fan interest and owner
 * patience, records a receipt naming why each moved, and — when the posture put
 * the GM's word on the record — stores the promise so next week's follow-up
 * resolves against what the player actually said.
 */
export function answerPressQuestion(league, { teamId, responseId, questionId = null } = {}) {
  const room = ensurePressRoom(league);
  const pending = room.pending;
  if (!pending) return { ok: false, error: "No press question is open.", reasonCode: "press-no-pending" };
  if (teamId && pending.teamId !== teamId) {
    return { ok: false, error: "That press question belongs to another franchise.", reasonCode: "press-wrong-team" };
  }
  if (questionId && questionId !== pending.id) {
    return {
      ok: false,
      error: "That question has already moved on — the room is asking about a different game.",
      reasonCode: "press-stale-question"
    };
  }
  const response = PRESS_RESPONSE_CATALOG[responseId];
  if (!response) {
    return {
      ok: false,
      error: `Unknown press response "${responseId}".`,
      reasonCode: "press-unknown-response"
    };
  }

  const outcome = pending.isWin ? "win" : "loss";
  const effects = response.effects[outcome];
  const team = league.teams?.find((entry) => entry.id === pending.teamId);
  const reasons = [];

  if (team) {
    if (effects.chemistry) {
      team.chemistry = clampStat((team.chemistry ?? 70) + effects.chemistry);
      reasons.push(`${response.reasons[outcome]} (locker room ${effects.chemistry > 0 ? "+" : ""}${effects.chemistry})`);
    }
    if (team.owner) {
      if (effects.fanInterest) {
        team.owner.fanInterest = clampStat((team.owner.fanInterest ?? 70) + effects.fanInterest);
        reasons.push(`fan interest ${effects.fanInterest > 0 ? "+" : ""}${effects.fanInterest}`);
      }
      if (effects.patience) {
        team.owner.patience = clampPatience((team.owner.patience ?? 0.55) + effects.patience);
        reasons.push(`owner patience ${effects.patience > 0 ? "+" : ""}${(effects.patience * 100).toFixed(1)}`);
      }
    }
  }
  if (!reasons.length) reasons.push(`${response.reasons[outcome]} — nothing measurable moved`);

  // A promise only exists after a loss. Promising to be better after a win is a
  // posture; promising after a loss is a debt the next result settles.
  const promised = response.promises && !pending.isWin;

  const receipt = {
    questionId: pending.id,
    teamId: pending.teamId,
    year: pending.year,
    week: pending.week,
    responseId: response.id,
    label: response.label,
    posture: response.posture,
    quote: response.quote[outcome],
    isWin: pending.isWin,
    score: pending.score,
    opponent: pending.opponent,
    promised,
    reasons,
    chemistry: team?.chemistry ?? null,
    fanInterest: team?.owner?.fanInterest ?? null,
    patience: team?.owner?.patience ?? null
  };

  room.receipts.unshift(receipt);
  room.receipts.length = Math.min(room.receipts.length, RECEIPT_LIMIT);
  room.pending = null;

  return { ok: true, receipt, promised };
}

/**
 * What the GM said last week, if last week was actually last week.
 *
 * Mirrors `continuityLedger.getLastPress`'s adjacency rule — continuity has no
 * memory across gaps, and a podium two weeks stale is not something the room
 * would quote back at you.
 */
export function getLastPressResponse(league, { year, week }) {
  const [latest] = ensurePressRoom(league).receipts;
  if (!latest) return null;
  if (latest.year !== year || latest.week !== week - 1) return null;
  return latest;
}
