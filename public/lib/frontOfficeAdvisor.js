/**
 * frontOfficeAdvisor.js — S109, "front-office-advisor-narrates-the-co-gm-packet".
 *
 * A lazy island. The Co-GM briefing packet (coGmBriefing.js) already carries
 * the bounded authority a human co-GM would read: the ranked command, the
 * pressure summary (owner, cap, injuries, needs), the thesis and the last
 * three decision receipts. Until now the packet was exported and rendered as
 * four stat tiles; nobody in the building read it and said what they would do.
 *
 * This module is that voice. It is deterministic, draws no RNG, and cites
 * only fields present in the packet (`advice.cites` is the list of paths it
 * read and found defined, so a test can prove it invented nothing). When a
 * field is missing the advice degrades — fewer reasons, softer confidence —
 * rather than filling the gap.
 *
 * Pure functions only. `renderAdvisorCard` returns an HTML string and touches
 * no DOM; the caller injects `ADVISOR_STYLE` once.
 */
import { describeWeeklyPlanReceipt } from "./weeklyPlanComposer.js";

export const FRONT_OFFICE_ADVISOR_SCHEMA_VERSION = "1.0";

/**
 * The whole scoring table. Every number the ranking uses is here so the
 * advice can be audited against the packet by hand.
 */
export const ADVISOR_WEIGHTS = Object.freeze({
  thresholds: Object.freeze({
    capTightUnder: 5_000_000,
    capRichOver: 25_000_000,
    ownerWarmAt: 40,
    ownerHotAt: 60,
    injuryHeavyAt: 3,
    deadlineUrgentWeeksLeft: 1
  }),
  // Base score per candidate kind. A kind is only a candidate when the packet
  // exposes the field that makes it real (see `collectCandidates`).
  candidate: Object.freeze({
    "gm-decision": 10,
    "draft-clock": 9,
    "cap-pressure": 6,
    "injury-depth": 4,
    "deadline-window": 4,
    "owner-mandate": 3,
    "roster-need": 2,
    "advance-week": 1
  }),
  modifiers: Object.freeze({
    blockingCommand: 5,
    negativeCapPerMillion: 0.5,
    injuryEach: 0.75,
    heatOverWarmPerTen: 1,
    rosterNeedEach: 0.5,
    deadlineUrgent: 2,
    trendFalling: 2
  }),
  // How a GM-decision choice is read. The lexicon maps a choice's own label
  // and effect text onto a posture; the posture is then priced by the packet.
  choice: Object.freeze({
    lexicon: Object.freeze({
      aggressive: Object.freeze(["buy", "acquire", "sign", "extend", "push", "spend", "upgrade", "chase", "all-in", "all in", "add "]),
      conservative: Object.freeze(["sell", "stock", "picks", "future", "rebuild", "wait", "decline", "pass", "cut", "clear", "shed"]),
      steady: Object.freeze(["hold", "stay", "course", "keep", "no trade", "standing", "status quo", "steady"])
    }),
    capRichAggressive: 3,
    capTightAggressive: -4,
    capNegativeAggressive: -6,
    capTightConservative: 2,
    capNegativeConservative: 3,
    ownerHotAggressive: 2,
    ownerHotConservative: -3,
    trendFallingAggressive: 1,
    injuryHeavyAggressive: 1,
    steadyBase: 1
  }),
  confidence: Object.freeze({ firmMargin: 3, leanMargin: 1 })
});

const MAX_REASONS = 3;

function isDefined(value) {
  return value !== undefined && value !== null;
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function money(value) {
  const amount = finite(value);
  if (amount === null) return "—";
  const absolute = Math.abs(amount);
  const prefix = amount < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${prefix}$${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${prefix}$${(absolute / 1_000).toFixed(0)}K`;
  return `${prefix}$${absolute}`;
}

/**
 * Reads packet paths and remembers every path that resolved to a defined
 * value. `cites` is the sorted list of those paths — the proof of what the
 * advice was built from.
 */
function packetReader(packet) {
  const cites = new Set();
  const read = (path) => {
    let cursor = packet;
    for (const segment of String(path).split(".")) {
      if (!isDefined(cursor) || typeof cursor !== "object") return undefined;
      cursor = cursor[segment];
    }
    if (isDefined(cursor)) cites.add(path);
    return cursor;
  };
  return { read, cites: () => [...cites].sort() };
}

function parseRecord(label) {
  const match = /^(\d+)\s*[-–]\s*(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(String(label ?? "").trim());
  if (!match) return null;
  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const ties = Number(match[3] || 0);
  const games = wins + losses + ties;
  return { wins, losses, ties, games, winPct: games ? (wins + ties / 2) / games : null };
}

function parseDeadlineWeek(detail) {
  const match = /deadline closes (?:at the )?end of Week (\d+)/i.exec(String(detail ?? ""));
  return match ? Number(match[1]) : null;
}

function classifyChoice(choice) {
  const haystack = `${choice.label || ""} ${choice.effect || ""} ${choice.id || ""}`.toLowerCase();
  const { lexicon } = ADVISOR_WEIGHTS.choice;
  for (const posture of ["aggressive", "conservative", "steady"]) {
    if (lexicon[posture].some((term) => haystack.includes(term))) return posture;
  }
  return "unread";
}

/**
 * Everything the reasons and the ranking share, read once through the
 * citing reader. Absent fields stay null and every consumer tolerates that.
 */
function readSignals(read) {
  const capSpace = finite(read("pressure.capSpace"));
  const ownerHeat = finite(read("pressure.ownerHeat"));
  const ownerTrend = read("pressure.ownerTrend");
  const ownerMandate = read("pressure.ownerMandate");
  const injuries = finite(read("pressure.controlledTeamInjuries"));
  const rosterNeeds = read("pressure.rosterNeeds");
  const topNeed = Array.isArray(rosterNeeds) && rosterNeeds.length ? read("pressure.rosterNeeds.0") : null;
  const week = finite(read("authority.week"));
  const phase = read("authority.phase");
  const record = parseRecord(read("authority.record"));
  const commandAction = read("currentCommand.action");
  const commandReason = read("currentCommand.reasonCode");
  const commandTitle = read("currentCommand.title");
  const commandDetail = read("currentCommand.detail");
  const commandBlocking = read("currentCommand.blocking") === true;
  const commandTab = read("currentCommand.targetTab");
  const deadlineWeek = parseDeadlineWeek(commandDetail);
  const weeksToDeadline = deadlineWeek !== null && week !== null ? Math.max(0, deadlineWeek - week) : null;
  const choices = read("currentCommand.choices");
  const t = ADVISOR_WEIGHTS.thresholds;
  return {
    capSpace,
    capNegative: capSpace !== null && capSpace < 0,
    capTight: capSpace !== null && capSpace < t.capTightUnder,
    capRich: capSpace !== null && capSpace >= t.capRichOver,
    ownerHeat,
    ownerHot: ownerHeat !== null && ownerHeat >= t.ownerHotAt,
    ownerWarm: ownerHeat !== null && ownerHeat >= t.ownerWarmAt,
    ownerTrend: typeof ownerTrend === "string" ? ownerTrend : null,
    trendFalling: /fall|slip|declin|cold|hot seat|down/i.test(String(ownerTrend ?? "")),
    ownerMandate: typeof ownerMandate === "string" ? ownerMandate : null,
    injuries,
    injuryHeavy: injuries !== null && injuries >= t.injuryHeavyAt,
    rosterNeeds: Array.isArray(rosterNeeds) ? rosterNeeds : [],
    topNeed: typeof topNeed === "string" ? topNeed : null,
    week,
    phase: typeof phase === "string" ? phase : null,
    record,
    commandAction: typeof commandAction === "string" ? commandAction : null,
    commandReason: typeof commandReason === "string" ? commandReason : null,
    commandTitle: typeof commandTitle === "string" ? commandTitle : null,
    commandDetail: typeof commandDetail === "string" ? commandDetail : null,
    commandBlocking,
    commandTab: typeof commandTab === "string" ? commandTab : null,
    deadlineWeek,
    weeksToDeadline,
    deadlineUrgent: weeksToDeadline !== null && weeksToDeadline <= t.deadlineUrgentWeeksLeft,
    choices: Array.isArray(choices) ? choices.filter((choice) => choice && typeof choice === "object" && choice.id) : []
  };
}

/** Shared reason lines. Each embeds the number it draws on, or is omitted. */
function reasonLines(s) {
  const lines = [];
  if (s.capSpace !== null) {
    if (s.capNegative) lines.push(`Cap room is ${money(s.capSpace)} — you are over the ceiling before anyone new is paid.`);
    else if (s.capTight) lines.push(`Cap room is ${money(s.capSpace)}, under the ${money(ADVISOR_WEIGHTS.thresholds.capTightUnder)} working floor.`);
    else if (s.capRich) lines.push(`Cap room is ${money(s.capSpace)} — enough to take salary without a matching send-out.`);
    else lines.push(`Cap room is ${money(s.capSpace)}: workable, not deep.`);
  }
  if (s.ownerHeat !== null) {
    const trend = s.ownerTrend ? `, trend ${s.ownerTrend}` : "";
    if (s.ownerHot) lines.push(`Owner heat is ${s.ownerHeat}${trend}. That is a seat problem, not a mood.`);
    else if (s.ownerWarm) lines.push(`Owner heat is ${s.ownerHeat}${trend}. Watch it; it moves on the next two results.`);
    else lines.push(`Owner heat is ${s.ownerHeat}${trend}. You have room to be patient.`);
  }
  if (s.weeksToDeadline !== null) {
    lines.push(s.weeksToDeadline === 0
      ? `Deadline closes end of Week ${s.deadlineWeek} — this is the last week to move a contract.`
      : `${s.weeksToDeadline} week${s.weeksToDeadline === 1 ? "" : "s"} to the Week ${s.deadlineWeek} deadline.`);
  }
  if (s.injuries !== null && s.injuries > 0) {
    lines.push(`${s.injuries} controlled-team injur${s.injuries === 1 ? "y" : "ies"} on the report right now.`);
  }
  if (s.topNeed) {
    lines.push(`${s.rosterNeeds.length} ranked need${s.rosterNeeds.length === 1 ? "" : "s"}; ${s.topNeed} sits first.`);
  }
  if (s.record && s.record.games > 0) {
    lines.push(`Record is ${s.record.wins}-${s.record.losses}${s.record.ties ? `-${s.record.ties}` : ""} through ${s.record.games} game${s.record.games === 1 ? "" : "s"}.`);
  }
  return lines;
}

function scoreChoice(choice, s) {
  const w = ADVISOR_WEIGHTS.choice;
  const posture = classifyChoice(choice);
  let score = 0;
  if (posture === "aggressive") {
    if (s.capNegative) score += w.capNegativeAggressive;
    else if (s.capTight) score += w.capTightAggressive;
    else if (s.capRich) score += w.capRichAggressive;
    if (s.ownerHot) score += w.ownerHotAggressive;
    if (s.trendFalling) score += w.trendFallingAggressive;
    if (s.injuryHeavy) score += w.injuryHeavyAggressive;
  } else if (posture === "conservative") {
    if (s.capNegative) score += w.capNegativeConservative;
    else if (s.capTight) score += w.capTightConservative;
    if (s.ownerHot) score += w.ownerHotConservative;
  } else if (posture === "steady") {
    score += w.steadyBase;
  }
  return { posture, score };
}

function pickChoice(s) {
  const scored = s.choices.map((choice, index) => ({ choice, index, ...scoreChoice(choice, s) }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const top = scored[0] || null;
  const runnerUp = scored[1] || null;
  return { top, margin: top && runnerUp ? top.score - runnerUp.score : top ? ADVISOR_WEIGHTS.confidence.firmMargin : 0, allUnread: scored.length > 0 && scored.every((row) => row.posture === "unread") };
}

function pluralInjuries(n) {
  return `${n} injur${n === 1 ? "y" : "ies"}`;
}

/**
 * Builds every call the packet actually exposes. Each carries a transparent
 * score; `rank` orders them. A candidate whose driving field is absent is
 * simply not built.
 */
function collectCandidates(s, teamName) {
  const base = ADVISOR_WEIGHTS.candidate;
  const mod = ADVISOR_WEIGHTS.modifiers;
  const list = [];
  const push = (entry) => list.push(entry);

  if (s.commandAction === "choose-gm-decision" && s.choices.length) {
    const { top, margin, allUnread } = pickChoice(s);
    const label = top ? String(top.choice.label || top.choice.id) : "the staged option";
    const posture = top ? top.posture : "unread";
    const why = posture === "aggressive"
      ? (s.capRich ? `The room can carry salary at ${money(s.capSpace)} of room.` : s.ownerHot ? `Heat ${s.ownerHeat} says the owner wants a move now.` : "Nothing in the packet argues against adding.")
      : posture === "conservative"
        ? (s.capNegative || s.capTight ? `At ${money(s.capSpace)} of room there is nothing to buy with.` : "The packet gives no reason to spend.")
        : posture === "steady"
          ? "Neither buying nor selling is priced in by the packet; stand pat."
          : "The options read as a coin flip from here; pick and own it.";
    push({
      kind: "gm-decision",
      id: `gm-decision:${top ? top.choice.id : "first"}`,
      choiceId: top ? String(top.choice.id) : null,
      decisionTitle: s.commandTitle,
      title: `Take "${label}"`,
      body: `${s.commandTitle ? `${s.commandTitle} is on the desk. ` : ""}${why} Stage it, pick the tactic, commit the week.`,
      score: base["gm-decision"] + (s.commandBlocking ? mod.blockingCommand : 0),
      choiceMargin: allUnread ? 0 : margin,
      risk: posture === "aggressive"
        ? `A trade that misses is paid twice: on the cap and on the ${s.ownerHeat !== null ? `heat, already ${s.ownerHeat}` : "owner's patience"}.`
        : posture === "conservative"
          ? "Selling reads as surrender in the room; if the record holds, you have sold a run."
          : "Holding is a choice the owner will read as no choice."
    });
  }

  if (s.commandTab === "draftTab" || s.commandReason === "draft-authority") {
    push({
      kind: "draft-clock",
      id: "draft-clock",
      title: s.commandBlocking ? "Make the pick" : "Set the board",
      body: `${s.commandBlocking ? "The clock is yours; a delegated pick is still your pick." : "Order the board before the next slot moves."}${s.topNeed ? ` ${s.topNeed} is the first ranked need.` : ""}`,
      score: base["draft-clock"] + (s.commandBlocking ? mod.blockingCommand : 0),
      risk: "Drafting for need over the board's read is how a rebuild adds a year."
    });
  }

  if (s.capNegative || s.commandReason === "cap-pressure") {
    push({
      kind: "cap-pressure",
      id: "cap-pressure",
      title: "Clear the cap first",
      body: `Room is ${money(s.capSpace)}. Nothing else on this desk is real until a contract moves. Open contracts; restructure or shed before the week advances.`,
      score: base["cap-pressure"] + (s.capSpace !== null && s.capSpace < 0 ? Math.abs(s.capSpace) / 1_000_000 * mod.negativeCapPerMillion : 0),
      risk: "Restructures buy this year with next year's cap; count the dead money before you sign it."
    });
  }

  if (s.injuries !== null && s.injuries > 0) {
    push({
      kind: "injury-depth",
      id: "injury-depth",
      title: "Patch the depth chart",
      body: `${pluralInjuries(s.injuries)} on the controlled roster${s.injuryHeavy ? " — that is a heavy week" : ""}. Check who starts before the slate, not after.`,
      score: base["injury-depth"] + s.injuries * mod.injuryEach,
      risk: "An unchecked depth chart starts whoever the engine finds; that is a loss you chose by default."
    });
  }

  if (s.commandReason === "deadline-window" || (s.weeksToDeadline !== null && s.commandAction !== "choose-gm-decision")) {
    push({
      kind: "deadline-window",
      id: "deadline-window",
      title: s.deadlineUrgent ? "Price the market now" : "Price the market",
      body: `${s.weeksToDeadline !== null ? `${s.weeksToDeadline} week${s.weeksToDeadline === 1 ? "" : "s"} to the deadline. ` : "The deadline window is open. "}${s.topNeed ? `Shop ${s.topNeed} first. ` : ""}${s.capSpace !== null ? `Room is ${money(s.capSpace)}.` : ""}`.trim(),
      score: base["deadline-window"] + (s.deadlineUrgent ? mod.deadlineUrgent : 0),
      risk: "A deadline buy at full price is a loan against the next two drafts."
    });
  }

  if (s.ownerHeat !== null && (s.ownerHot || s.trendFalling)) {
    push({
      kind: "owner-mandate",
      id: "owner-mandate",
      title: "Answer the owner",
      body: `Heat ${s.ownerHeat}${s.ownerTrend ? `, trend ${s.ownerTrend}` : ""}${s.ownerMandate ? `, mandate "${s.ownerMandate}"` : ""}. Whatever you do this week, make it legible upstairs.`,
      score: base["owner-mandate"] + (s.ownerHeat > ADVISOR_WEIGHTS.thresholds.ownerWarmAt ? ((s.ownerHeat - ADVISOR_WEIGHTS.thresholds.ownerWarmAt) / 10) * mod.heatOverWarmPerTen : 0) + (s.trendFalling ? mod.trendFalling : 0),
      risk: "Chasing the owner's number with a splash move is how the number gets worse."
    });
  }

  if (s.topNeed && !s.capNegative) {
    push({
      kind: "roster-need",
      id: `roster-need:${s.topNeed}`,
      title: `Find a ${s.topNeed}`,
      body: `${s.rosterNeeds.length} ranked need${s.rosterNeeds.length === 1 ? "" : "s"}; ${s.topNeed} is first.${s.capSpace !== null ? ` Room is ${money(s.capSpace)}.` : ""} Check the wire and the market before the slot fills itself.`,
      score: base["roster-need"] + s.rosterNeeds.length * mod.rosterNeedEach,
      risk: "A need filled with a body is still a need."
    });
  }

  push({
    kind: "advance-week",
    id: "advance-week",
    title: "Advance the week",
    body: `Nothing on this desk outranks the slate${teamName ? ` for ${teamName}` : ""}. Set the tactic and commit.`,
    score: base["advance-week"],
    risk: "A quiet week is only quiet if the depth chart and cap were checked first."
  });

  return list;
}

function confidenceFrom(margin) {
  const { firmMargin, leanMargin } = ADVISOR_WEIGHTS.confidence;
  if (margin >= firmMargin) return "firm";
  if (margin >= leanMargin) return "lean";
  return "toss-up";
}

function limitWords(text, max = 60) {
  const words = String(text).trim().split(/\s+/);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")}…`;
}

/**
 * buildAdvice(packet, { lastWeekAdvice, lastWeekReceipt })
 *
 * Deterministic: the same packet yields the same advice, byte for byte.
 */
export function buildAdvice(packet = {}, { lastWeekAdvice = null, lastWeekReceipt = null } = {}) {
  const source = packet && typeof packet === "object" ? packet : {};
  const { read, cites } = packetReader(source);
  const teamNameRaw = read("authority.teamName");
  const teamName = typeof teamNameRaw === "string" ? teamNameRaw : null;
  const signals = readSignals(read);
  const candidates = collectCandidates(signals, teamName)
    .map((candidate, index) => ({ ...candidate, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((candidate, rank) => ({ ...candidate, rank: rank + 1 }));
  const top = candidates[0];
  const runnerUp = candidates[1] || null;
  const callMargin = runnerUp ? top.score - runnerUp.score : ADVISOR_WEIGHTS.confidence.firmMargin;
  // A GM decision always outranks the desk; its confidence is the choice's.
  const margin = top.kind === "gm-decision" ? Math.min(callMargin, top.choiceMargin) : callMargin;

  const advice = {
    schemaVersion: FRONT_OFFICE_ADVISOR_SCHEMA_VERSION,
    kind: "front-office-advice",
    authority: {
      teamId: read("authority.teamId") ?? null,
      teamName,
      year: finite(read("authority.year")),
      week: signals.week,
      phase: signals.phase
    },
    call: {
      id: top.id,
      kind: top.kind,
      choiceId: top.choiceId ?? null,
      title: top.title,
      body: limitWords(top.body)
    },
    reasons: reasonLines(signals).slice(0, MAX_REASONS),
    risk: top.risk,
    confidence: confidenceFrom(margin),
    ranking: candidates.map(({ id, kind, score, rank }) => ({ id, kind, score: Number(score.toFixed(3)), rank })),
    cites: cites()
  };

  if (lastWeekAdvice && lastWeekReceipt) {
    const agreement = scoreAgreement(lastWeekAdvice, lastWeekReceipt);
    const described = describeWeeklyPlanReceipt(lastWeekReceipt);
    advice.counterfactual = {
      saidLastWeek: String(lastWeekAdvice.call?.title || lastWeekAdvice.call?.id || "no call recorded"),
      playerDid: described ? `${described.title}: ${described.detail}` : "No plan receipt recorded.",
      agreed: agreement.agreed,
      basis: agreement.basis,
      note: agreement.agreed
        ? "Same call as the room. Tally only; no bonus either way."
        : "Went against the room. Tally only; no penalty either way."
    };
  }

  return advice;
}

/**
 * scoreAgreement(advice, receipt)
 *
 * Did the committed weekly plan match the advised call? Matching is defined
 * on what a weekly-plan receipt can observe:
 * - a `gm-decision` call matches when `receipt.plan.gmDecision.choiceId`
 *   equals the advised choice;
 * - `advance-week` matches when a plan was committed (or readied) at all;
 * - every tab-shaped call (cap, injuries, deadline, owner, need) cannot be
 *   observed by the receipt, so it matches when the player committed a week
 *   without deferring — the room said act, the player acted — and the basis
 *   says so, so a tally can separate observed from inferred agreement.
 * A deferred receipt never agrees: the room made a call and nothing was
 * committed.
 */
export function scoreAgreement(advice = {}, receipt = null) {
  const call = advice?.call || {};
  const advisedId = call.id || null;
  if (!receipt || typeof receipt !== "object") {
    return { agreed: false, basis: "no-receipt", advisedId, committedChoiceId: null };
  }
  const status = String(receipt.status || "");
  const committed = status === "committed" || status === "ready";
  const committedChoiceId = receipt.plan?.gmDecision?.choiceId ?? null;
  if (!committed) {
    return { agreed: false, basis: "deferred", advisedId, committedChoiceId };
  }
  if (call.kind === "gm-decision") {
    const agreed = call.choiceId !== null && call.choiceId !== undefined && String(committedChoiceId) === String(call.choiceId);
    return { agreed, basis: "gm-decision-choice", advisedId, committedChoiceId };
  }
  if (call.kind === "advance-week") {
    return { agreed: true, basis: "week-committed", advisedId, committedChoiceId };
  }
  return { agreed: true, basis: "week-committed-unobserved-call", advisedId, committedChoiceId };
}

/**
 * Folds one agreement into a running "went against the room" tally. The
 * tally is descriptive; it feeds no score.
 */
export function updateAgreementTally(tally = {}, agreement = {}) {
  const next = {
    schemaVersion: FRONT_OFFICE_ADVISOR_SCHEMA_VERSION,
    weeks: finite(tally?.weeks) ?? 0,
    agreed: finite(tally?.agreed) ?? 0,
    against: finite(tally?.against) ?? 0,
    deferred: finite(tally?.deferred) ?? 0
  };
  if (!agreement || typeof agreement !== "object") return next;
  next.weeks += 1;
  if (agreement.basis === "deferred" || agreement.basis === "no-receipt") next.deferred += 1;
  else if (agreement.agreed) next.agreed += 1;
  else next.against += 1;
  return next;
}

// appCore.escapeHtml is not importable here without pulling appState (DOM,
// fetch and module-level side effects) into a node test, so the island
// carries its own escaper with the same contract.
export function escapeAdvisorHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const ADVISOR_STYLE = `
.advisor-card{border:1px solid var(--line,#2a3140);border-radius:12px;padding:14px 16px;background:var(--panel,#0f1420);display:grid;gap:10px;font-size:.92rem;line-height:1.4}
.advisor-card[data-compact="true"]{padding:10px 12px;gap:6px}
.advisor-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.advisor-kicker{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
.advisor-authority{font-size:.78rem;opacity:.75}
.advisor-confidence{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid currentColor}
.advisor-card[data-confidence="firm"] .advisor-confidence{color:var(--positive,#4cc38a)}
.advisor-card[data-confidence="lean"] .advisor-confidence{color:var(--warning,#e7b84a)}
.advisor-card[data-confidence="toss-up"] .advisor-confidence{color:var(--muted,#9aa3b2)}
.advisor-call strong{display:block;font-size:1.05rem;margin-bottom:4px}
.advisor-call p{margin:0}
.advisor-reasons{margin:0;padding-left:18px;display:grid;gap:3px}
.advisor-risk{margin:0;font-size:.85rem;opacity:.85}
.advisor-risk strong{margin-right:6px}
.advisor-counterfactual{border-top:1px dashed var(--line,#2a3140);padding-top:8px;font-size:.85rem;display:grid;gap:2px}
.advisor-counterfactual[data-agreed="true"] .advisor-verdict{color:var(--positive,#4cc38a)}
.advisor-counterfactual[data-agreed="false"] .advisor-verdict{color:var(--warning,#e7b84a)}
`.trim();

/**
 * renderAdvisorCard(advice, { compact }) → HTML string. Every value passes
 * through the escaper; the caller mounts it with innerHTML.
 */
export function renderAdvisorCard(advice = {}, { compact = false } = {}) {
  const e = escapeAdvisorHtml;
  const call = advice?.call || {};
  const authority = advice?.authority || {};
  const reasons = Array.isArray(advice?.reasons) ? advice.reasons : [];
  const shownReasons = compact ? reasons.slice(0, 1) : reasons;
  const confidence = String(advice?.confidence || "toss-up");
  const authorityLine = [authority.teamName, authority.year !== null && authority.year !== undefined ? `${authority.year}${authority.week !== null && authority.week !== undefined ? ` W${authority.week}` : ""}` : null]
    .filter(Boolean)
    .join(" · ");
  const cf = advice?.counterfactual;
  const counterfactual = cf && !compact
    ? `<div class="advisor-counterfactual" data-agreed="${cf.agreed ? "true" : "false"}">
      <span><strong>Last week the room said:</strong> ${e(cf.saidLastWeek)}</span>
      <span><strong>You did:</strong> ${e(cf.playerDid)}</span>
      <span class="advisor-verdict">${e(cf.note)}</span>
    </div>`
    : "";
  return `<section class="advisor-card" data-call-id="${e(call.id || "")}" data-call-kind="${e(call.kind || "")}" data-confidence="${e(confidence)}" data-compact="${compact ? "true" : "false"}" aria-label="Front office advisor">
    <header class="advisor-head">
      <span class="advisor-kicker">Front office</span>
      ${authorityLine ? `<span class="advisor-authority">${e(authorityLine)}</span>` : ""}
      <span class="advisor-confidence">${e(confidence)}</span>
    </header>
    <div class="advisor-call"><strong>${e(call.title || "No call")}</strong><p>${e(call.body || "")}</p></div>
    ${shownReasons.length ? `<ul class="advisor-reasons">${shownReasons.map((reason) => `<li>${e(reason)}</li>`).join("")}</ul>` : ""}
    ${advice?.risk ? `<p class="advisor-risk"><strong>Risk</strong>${e(advice.risk)}</p>` : ""}
    ${counterfactual}
  </section>`;
}
