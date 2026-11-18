/**
 * GM career — tenures, dismissal and the job market.
 *
 * A general manager who cannot be fired has nothing to lose. This module owns
 * the one piece of state that makes a tenure terminal: `league.gmCareer`. It
 * lives on the league, so it travels inside the save snapshot with everything
 * else, and its shape is declared exactly once (`createTenure` /
 * `createGmCareer`) and reused for creation, for a new job, and for repairing
 * a save that predates it.
 *
 * Nothing here decides who MAY act — that is the command boundary's job
 * (src/runtime/franchiseAuthority.js). These functions record what happened.
 *
 * Save compatibility: a league saved before this module existed has no
 * `gmCareer`. It loads as "employed" at the club it controls, with the tenure
 * start taken from the unbroken run of seasons the career record already
 * credits to that club, and with no warnings on file — so the owner must warn
 * again before he can act. Nothing else in the save is touched.
 */

import { formatRecord } from "../stats/teamRecord.js";
import { reportMilestone } from "./beatReporter.js";
import { computeGmLegacyScore, initGmLegacy } from "./gmLegacyScore.js";
import { decideOwnerVerdict, patienceAtDismissalLine, resolveCareerStakes } from "./ownerConfidence.js";

export const GM_CAREER_VERSION = 1;
const HISTORY_LIMIT = 40;
const WARNING_LIMIT = 12;
const POOR_RECORD_POOL = 12;
const RECENT_SEASONS = 3;

const STATUS = Object.freeze({ EMPLOYED: "employed", DISMISSED: "dismissed" });

// Only a real number (or a numeric string) counts. `Number(null)`, `Number("")`
// and `Number([])` are all 0, and a silent 0 is how a missing value gets laundered.
function finiteOr(value, fallback) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

// ── The shape, declared once ─────────────────────────────────────────────────

export function createTenure({ teamId = null, startYear = null } = {}) {
  return {
    teamId: teamId ? String(teamId) : null,
    startYear: finiteOr(startYear, null),
    // Every warning the owner has put in front of this general manager.
    warnings: [],
    // The season review at which patience first sat at the dismissal line with
    // the win target missed; null when the last review cleared it.
    flooredReviewYear: null
  };
}

export function createGmCareer({ teamId = null, startYear = null } = {}) {
  return {
    version: GM_CAREER_VERSION,
    status: STATUS.EMPLOYED,
    tenure: createTenure({ teamId, startYear }),
    dismissal: null,
    lastReview: null,
    history: []
  };
}

function normalizeWarning(raw) {
  if (!raw || typeof raw !== "object") return null;
  const year = finiteOr(raw.year, null);
  if (year === null) return null;
  return { year, week: finiteOr(raw.week, null), kind: String(raw.kind || "warning") };
}

function normalizeOffer(raw) {
  if (!raw || typeof raw !== "object" || !raw.teamId) return null;
  return { teamId: String(raw.teamId), kind: ["ready", "retool", "rebuild"].includes(raw.kind) ? raw.kind : "rebuild" };
}

/** Rebuild a stored career onto the declared shape; unknown or damaged fields fall back to the defaults. */
export function normalizeGmCareer(raw, fallback = {}) {
  const career = createGmCareer(fallback);
  if (!raw || typeof raw !== "object") return career;
  if (raw.tenure && typeof raw.tenure === "object") {
    const tenure = createTenure({
      teamId: raw.tenure.teamId || fallback.teamId || null,
      startYear: finiteOr(raw.tenure.startYear, finiteOr(fallback.startYear, null))
    });
    tenure.warnings = (Array.isArray(raw.tenure.warnings) ? raw.tenure.warnings : [])
      .map(normalizeWarning).filter(Boolean).slice(-WARNING_LIMIT);
    tenure.flooredReviewYear = finiteOr(raw.tenure.flooredReviewYear, null);
    career.tenure = tenure;
  }
  if (raw.status === STATUS.DISMISSED && raw.dismissal && typeof raw.dismissal === "object") {
    career.status = STATUS.DISMISSED;
    career.dismissal = {
      teamId: raw.dismissal.teamId ? String(raw.dismissal.teamId) : career.tenure.teamId,
      teamName: String(raw.dismissal.teamName || raw.dismissal.teamId || ""),
      year: finiteOr(raw.dismissal.year, null),
      reason: String(raw.dismissal.reason || "dismissed"),
      summary: String(raw.dismissal.summary || ""),
      record: String(raw.dismissal.record || ""),
      seasons: finiteOr(raw.dismissal.seasons, 0),
      offers: (Array.isArray(raw.dismissal.offers) ? raw.dismissal.offers : []).map(normalizeOffer).filter(Boolean)
    };
  }
  career.lastReview = raw.lastReview && typeof raw.lastReview === "object"
    ? {
        year: finiteOr(raw.lastReview.year, null),
        action: String(raw.lastReview.action || "none"),
        reason: raw.lastReview.reason ? String(raw.lastReview.reason) : null,
        message: String(raw.lastReview.message || "")
      }
    : null;
  career.history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((entry) => entry && typeof entry === "object" && entry.teamId)
    .slice(-HISTORY_LIMIT);
  return career;
}

// ── Reading the career record ────────────────────────────────────────────────

/** Seasons the career record credits to this tenure. Derived, never stored twice. */
export function tenureSeasons(league, tenure) {
  if (!tenure?.teamId) return [];
  const start = finiteOr(tenure.startYear, -Infinity);
  return (league?.gmLegacy?.seasonHistory || []).filter(
    (entry) => entry.teamId === tenure.teamId && Number(entry.year) >= start
  );
}

function summarizeTenure(league, tenure) {
  const seasons = tenureSeasons(league, tenure);
  const total = (field) => seasons.reduce((sum, entry) => sum + finiteOr(entry[field], 0), 0);
  const wins = total("wins");
  const losses = total("losses");
  const ties = total("ties");
  const years = seasons.map((entry) => Number(entry.year)).filter(Number.isFinite);
  return {
    seasons: seasons.length,
    wins,
    losses,
    ties,
    record: formatRecord({ wins, losses, ties }),
    playoffAppearances: seasons.filter((entry) => entry.madePlayoffs === true).length,
    titles: seasons.filter((entry) => entry.wonSuperBowl === true).length,
    startYear: years.length ? Math.min(...years) : finiteOr(tenure?.startYear, null),
    endYear: years.length ? Math.max(...years) : finiteOr(tenure?.startYear, null)
  };
}

function inferTenureStart(league, teamId, currentYear) {
  const history = league?.gmLegacy?.seasonHistory || [];
  let start = finiteOr(currentYear, null);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].teamId !== teamId) break;
    const year = Number(history[index].year);
    if (Number.isFinite(year)) start = year;
  }
  return start;
}

/** The year the next season the career record will credit to a newly taken club. */
function nextCreditedYear(league, currentYear) {
  const credited = (league?.gmLegacy?.seasonHistory || []).some((entry) => Number(entry.year) === Number(currentYear));
  return credited ? Number(currentYear) + 1 : Number(currentYear);
}

/**
 * The league's career state, created or repaired on first read. Safe to call
 * from any read path: it never touches the random stream.
 */
export function ensureGmCareer(league, { controlledTeamId = null, currentYear = null } = {}) {
  if (!league) return createGmCareer();
  const valid = league.gmCareer && typeof league.gmCareer === "object" && league.gmCareer.version === GM_CAREER_VERSION &&
    league.gmCareer.tenure && Array.isArray(league.gmCareer.tenure.warnings) && Array.isArray(league.gmCareer.history) &&
    [STATUS.EMPLOYED, STATUS.DISMISSED].includes(league.gmCareer.status) &&
    // "Dismissed" is only believed with its record; otherwise the state is repaired.
    (league.gmCareer.status !== STATUS.DISMISSED ||
      (league.gmCareer.dismissal && typeof league.gmCareer.dismissal === "object" && Array.isArray(league.gmCareer.dismissal.offers)));
  if (!valid) {
    league.gmCareer = normalizeGmCareer(league.gmCareer, {
      teamId: controlledTeamId,
      startYear: inferTenureStart(league, controlledTeamId, currentYear)
    });
  }
  const career = league.gmCareer;
  // The controlled club can change outside the job market (Sandbox rules, a
  // loaded save, a lobby). An employed general manager's tenure follows it.
  if (career.status === STATUS.EMPLOYED && controlledTeamId && career.tenure.teamId !== controlledTeamId) {
    closeTenure(league, career, { reason: "moved", year: currentYear, onlyIfServed: true });
    career.tenure = createTenure({ teamId: controlledTeamId, startYear: nextCreditedYear(league, currentYear) });
    career.lastReview = null;
  }
  return career;
}

export function isGmDismissed(league) {
  return league?.gmCareer?.status === STATUS.DISMISSED;
}

// ── Writing the career record ────────────────────────────────────────────────

const REASON_LABELS = Object.freeze({
  "ultimatum-failed": "Relieved of duties — missed the owner's win demand",
  "patience-exhausted": "Relieved of duties — the owner ran out of patience",
  resigned: "Resigned",
  moved: "Moved on"
});

function closeTenure(league, career, { reason, year, onlyIfServed = false }) {
  const summary = summarizeTenure(league, career.tenure);
  if (onlyIfServed && summary.seasons === 0) return null;
  const team = (league.teams || []).find((entry) => entry.id === career.tenure.teamId) || null;
  const entry = {
    teamId: career.tenure.teamId,
    teamName: team?.name || career.tenure.teamId,
    startYear: summary.startYear,
    endYear: finiteOr(year, summary.endYear),
    seasons: summary.seasons,
    wins: summary.wins,
    losses: summary.losses,
    ties: summary.ties,
    record: summary.record,
    playoffAppearances: summary.playoffAppearances,
    titles: summary.titles,
    reason,
    reasonLabel: REASON_LABELS[reason] || "Left the club"
  };
  career.history.push(entry);
  if (career.history.length > HISTORY_LIMIT) career.history.splice(0, career.history.length - HISTORY_LIMIT);
  return entry;
}

/** Record a warning the player was actually shown. */
export function recordOwnerWarning(league, context, { kind = "warning", year, week = null } = {}) {
  const career = ensureGmCareer(league, context);
  if (career.status !== STATUS.EMPLOYED || !Number.isFinite(Number(year))) return null;
  const warning = { year: Number(year), week: finiteOr(week, null), kind: String(kind) };
  career.tenure.warnings.push(warning);
  if (career.tenure.warnings.length > WARNING_LIMIT) career.tenure.warnings.splice(0, career.tenure.warnings.length - WARNING_LIMIT);
  return warning;
}

// ── Job market ───────────────────────────────────────────────────────────────

function recentSeasonRows(session, teamId) {
  const archived = (session.statBook?.getTeamSeasonTable?.({ team: teamId }) || [])
    .slice()
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, RECENT_SEASONS);
  if (archived.length) return archived;
  const live = (session.statBook?.getLiveTeamSeasonTable?.(session.currentYear) || []).filter((row) => row.team === teamId);
  return live.slice(0, 1);
}

function recentWinPct(rows) {
  const wins = rows.reduce((sum, row) => sum + finiteOr(row.wins, 0), 0);
  const ties = rows.reduce((sum, row) => sum + finiteOr(row.ties, 0), 0);
  const games = rows.reduce((sum, row) => sum + finiteOr(row.wins, 0) + finiteOr(row.losses, 0) + finiteOr(row.ties, 0), 0);
  return games > 0 ? (wins + ties * 0.5) / games : 0.5;
}

export function careerStanding(league) {
  const computed = computeGmLegacyScore(league?.gmLegacy);
  const score = finiteOr(computed.score, 0);
  return {
    score,
    grade: computed.grade,
    label: computed.label,
    record: computed.record || "0-0",
    seasons: finiteOr(computed.seasons, 0),
    // The same score bands the career card already uses for its labels.
    tier: score >= 55 ? "strong" : score >= 40 ? "steady" : "poor"
  };
}

/**
 * Three to five clubs that would hire this general manager. Every candidate
 * has a poor recent record; the career record decides which of them call.
 * A strong record hears from the struggling clubs with the most talent, a poor
 * one from the clubs starting over. Deterministic — no random draw.
 */
export function buildJobOffers(session, { excludeTeamId = null } = {}) {
  const league = session.league;
  const pool = (league.teams || [])
    .filter((team) => team.id !== excludeTeamId)
    .map((team) => ({ team, pct: recentWinPct(recentSeasonRows(session, team.id)) }))
    .sort((a, b) => a.pct - b.pct || String(a.team.id).localeCompare(String(b.team.id)))
    .slice(0, POOR_RECORD_POOL)
    .sort((a, b) => finiteOr(b.team.overallRating, 0) - finiteOr(a.team.overallRating, 0) || String(a.team.id).localeCompare(String(b.team.id)));
  if (!pool.length) return [];
  const standing = careerStanding(league);
  const count = Math.min(pool.length, standing.tier === "strong" ? 5 : standing.tier === "steady" ? 4 : 3);
  const start = standing.tier === "strong"
    ? 0
    : standing.tier === "steady"
      ? Math.max(0, Math.floor((pool.length - count) / 2))
      : pool.length - count;
  const third = pool.length / 3;
  return pool.slice(start, start + count).map((entry) => {
    const rank = pool.indexOf(entry);
    return { teamId: entry.team.id, kind: rank < third ? "ready" : rank < third * 2 ? "retool" : "rebuild" };
  });
}

const OFFER_KIND_COPY = Object.freeze({
  ready: { label: "Ready to win", pitch: "A talented roster that has underachieved. The owner wants it turned around now." },
  retool: { label: "Retooling", pitch: "Some pieces are in place. The club needs a plan and a couple of good offseasons." },
  rebuild: { label: "Rebuilding job", pitch: "A club starting over. Expect a thin roster and a long road." }
});

const MANDATE_COPY = Object.freeze({
  "playoffs-or-bust": "The owner expects a playoff team right away.",
  "develop-core": "The owner wants a young core developed and will give it time.",
  "profit-and-stability": "The owner wants a steady, well-run club.",
  "winning-season": "The owner expects a winning season."
});

function money(value) {
  const amount = finiteOr(value, 0);
  return `$${(Math.abs(amount) / 1_000_000).toFixed(1)}M`;
}

/** One job-market card, read live from the league so it can never go stale. */
export function describeJobOffer(session, offer) {
  const team = (session.league.teams || []).find((entry) => entry.id === offer.teamId);
  if (!team) return null;
  const cap = session.getTeamCapSummary?.(team.id) || null;
  const capSpace = finiteOr(cap?.capSpace, null);
  const expectation = team.owner?.expectation || {};
  const targetWins = finiteOr(expectation.targetWins, null);
  const copy = OFFER_KIND_COPY[offer.kind] || OFFER_KIND_COPY.rebuild;
  return {
    teamId: team.id,
    name: team.name || team.id,
    abbrev: team.abbrev || team.id,
    kind: offer.kind,
    kindLabel: copy.label,
    pitch: copy.pitch,
    overallRating: finiteOr(team.overallRating, null),
    recentRecords: recentSeasonRows(session, team.id).map((row) => ({
      year: Number(row.year),
      record: formatRecord({ wins: finiteOr(row.wins, 0), losses: finiteOr(row.losses, 0), ties: finiteOr(row.ties, 0) })
    })),
    capSpace,
    capText: capSpace === null
      ? "Cap position unavailable"
      : capSpace >= 0 ? `${money(capSpace)} in cap room` : `${money(capSpace)} over the cap`,
    expectation: `${MANDATE_COPY[expectation.mandate] || MANDATE_COPY["winning-season"]}${targetWins !== null ? ` Target: ${targetWins} wins.` : ""}`
  };
}

// ── Dismissal, resignation, a new job ────────────────────────────────────────

const DISMISSAL_SUMMARY = Object.freeze({
  "ultimatum-failed": ({ target, record }) =>
    `The owner demanded ${target ?? "more"} wins. The club finished ${record}. He has decided to make a change.`,
  "patience-exhausted": ({ record }) =>
    `The club missed the owner's win target again, finishing ${record}, and his patience had already run out. He has decided to make a change.`,
  resigned: () => "You stepped down as general manager."
});

function voidOpenCommitments(league, teamId) {
  for (const commitment of league.gmCommitments || []) {
    if (commitment.teamId === teamId && commitment.status === "active") {
      commitment.status = "void";
      commitment.evidence = "The general manager left the club.";
    }
  }
}

/**
 * End the current tenure. Terminal for that tenure: it is written into the
 * career history, and the general manager is without a club until a job offer
 * is taken. The league itself carries on untouched.
 */
export function endTenure(session, { reason, seasonRecord = null, target = null } = {}) {
  const league = session.league;
  const career = ensureGmCareer(league, { controlledTeamId: session.controlledTeamId, currentYear: session.currentYear });
  if (career.status !== STATUS.EMPLOYED) return null;
  const teamId = career.tenure.teamId;
  const team = (league.teams || []).find((entry) => entry.id === teamId) || null;
  const closed = closeTenure(league, career, { reason, year: session.currentYear });
  const describe = DISMISSAL_SUMMARY[reason] || DISMISSAL_SUMMARY.resigned;
  career.status = STATUS.DISMISSED;
  career.dismissal = {
    teamId,
    teamName: team?.name || teamId,
    year: Number(session.currentYear),
    reason,
    summary: describe({ target, record: seasonRecord || closed?.record || "0-0" }),
    record: closed?.record || "0-0",
    seasons: closed?.seasons || 0,
    offers: buildJobOffers(session, { excludeTeamId: teamId })
  };
  voidOpenCommitments(league, teamId);
  const fired = reason !== "resigned";
  reportMilestone(league, {
    type: fired ? "owner-ultimatum" : "gm-resignation",
    year: session.currentYear,
    week: session.currentWeek,
    teamIds: [teamId],
    headline: fired
      ? `${team?.name || teamId} relieve their general manager of his duties`
      : `${team?.name || teamId} general manager steps down`,
    detail: career.dismissal.summary
  });
  session.logNews?.(fired ? `${teamId} ownership has made a change at general manager` : `${teamId} general manager resigns`, {
    type: fired ? "gm-dismissed" : "gm-resigned",
    teamId,
    reason
  });
  return career.dismissal;
}

/**
 * Take one of the offered jobs. Starts a fresh tenure on the declared shape;
 * the caller (GameSession) moves the controlled team and resets the owner.
 */
export function beginTenureFromOffer(session, teamId) {
  const league = session.league;
  const career = league.gmCareer;
  if (!career || career.status !== STATUS.DISMISSED) {
    return { ok: false, reasonCode: "career-not-on-market", error: "You already run a club. Resign first to see the job market." };
  }
  const wanted = String(teamId || "").toUpperCase();
  const offer = (career.dismissal?.offers || []).find((entry) => String(entry.teamId).toUpperCase() === wanted);
  if (!offer) {
    return { ok: false, reasonCode: "job-not-offered", error: "That club has not offered you its general manager job." };
  }
  career.status = STATUS.EMPLOYED;
  career.dismissal = null;
  career.lastReview = null;
  career.tenure = createTenure({ teamId: offer.teamId, startYear: nextCreditedYear(league, session.currentYear) });
  return { ok: true, teamId: offer.teamId, kind: offer.kind };
}

// ── Season review ────────────────────────────────────────────────────────────

const REVIEW_MESSAGES = Object.freeze({
  warning: "The owner is deeply unhappy with this season. Under these league rules your job is safe, but he expects a clear improvement.",
  "final-warning": "Final warning from the owner: one more missed target and he will make a change at general manager.",
  dismiss: "The owner has relieved you of your duties."
});

/**
 * The owner's season review for the controlled club. Called once, by the real
 * advance path, when a season is complete and the career record has been
 * updated for it. Returns the review that was recorded (or null).
 */
export function reviewGmSeason(session) {
  const league = session.league;
  const year = Number(session.currentYear);
  const career = ensureGmCareer(league, { controlledTeamId: session.controlledTeamId, currentYear: year });
  if (career.status !== STATUS.EMPLOYED) return null;
  if (career.lastReview?.year === year) return career.lastReview;
  const team = (league.teams || []).find((entry) => entry.id === session.controlledTeamId);
  if (!team?.owner) return null;
  const stakes = resolveCareerStakes(session.getLeagueSettings(), { commissionerLobby: league.commissionerLobby === true });
  const patience = team.owner.patience;
  // A missing or damaged patience is no evidence against the general manager.
  if (typeof patience !== "number" || !Number.isFinite(patience)) return null;
  const ultimatum = (league.gmCommitments || []).find(
    (entry) => entry.teamId === team.id && entry.choiceId === "owner-ultimatum" && Number(entry.createdYear) === year
  ) || null;
  const wins = finiteOr(team.season?.wins, 0);
  const target = finiteOr(ultimatum?.targetWins, finiteOr(team.owner.expectation?.targetWins, null));
  const targetMissed = target !== null && wins < target;
  const tenure = career.tenure;
  const verdict = decideOwnerVerdict({
    stakes,
    patience,
    tenureSeasons: tenureSeasons(league, tenure).length,
    ultimatumFailed: ultimatum?.status === "failed",
    targetMissed,
    warned: tenure.warnings.length > 0,
    flooredAtLastReview: tenure.flooredReviewYear !== null && tenure.flooredReviewYear < year
  });
  if (verdict.atLine && targetMissed) {
    if (tenure.flooredReviewYear === null) tenure.flooredReviewYear = year;
  } else {
    tenure.flooredReviewYear = null;
  }
  const seasonRecord = formatRecord({ wins, losses: finiteOr(team.season?.losses, 0), ties: finiteOr(team.season?.ties, 0) });
  const review = { year, action: verdict.action, reason: verdict.reason, message: REVIEW_MESSAGES[verdict.action] || "" };
  career.lastReview = review;
  if (verdict.action === "warning" || verdict.action === "final-warning") {
    recordOwnerWarning(league, { controlledTeamId: session.controlledTeamId, currentYear: year }, { kind: verdict.action, year, week: session.currentWeek });
    reportMilestone(league, {
      type: "owner-ultimatum",
      year,
      week: session.currentWeek,
      teamIds: [team.id],
      headline: verdict.action === "final-warning" ? "Final warning from the owner" : "The owner is not happy",
      detail: `${review.message} The club finished ${seasonRecord}${target !== null ? ` against a target of ${target} wins` : ""}.`
    });
  } else if (verdict.action === "dismiss") {
    endTenure(session, { reason: verdict.reason, seasonRecord, target });
    // endTenure cleared nothing on the review; keep it so the season review can show it.
    career.lastReview = review;
  }
  return review;
}

// ── Dashboard view ───────────────────────────────────────────────────────────

/** Everything the client needs, in words. Read-only apart from first-read repair. */
export function buildGmCareerView(session) {
  const league = session.league;
  const career = ensureGmCareer(league, { controlledTeamId: session.controlledTeamId, currentYear: session.currentYear });
  const stakes = resolveCareerStakes(session.getLeagueSettings(), { commissionerLobby: league.commissionerLobby === true });
  const dismissed = career.status === STATUS.DISMISSED;
  const team = (league.teams || []).find((entry) => entry.id === session.controlledTeamId) || null;
  const tenureServed = tenureSeasons(league, career.tenure).length;
  let warning = null;
  if (!dismissed && team?.owner) {
    const patience = team.owner.patience;
    const ultimatumActive = team.owner.expectation?.ultimatum?.active === true;
    if (stakes.firing && patienceAtDismissalLine(patience, stakes)) {
      warning = tenureServed >= 1
        ? "The owner's patience has run out. One more missed target and he will make a change at general manager."
        : "The owner's patience has run out. He will not make a change in your first season, but he is keeping count.";
    } else if (stakes.firing && ultimatumActive) {
      warning = "Miss this demand with the owner's patience gone and he will replace his general manager.";
    } else if (stakes.sternWarningOnly && patienceAtDismissalLine(patience, stakes)) {
      warning = "The owner's patience has run out. Under these league rules your job is safe, but expect a hard conversation.";
    }
  }
  return {
    status: career.status,
    dismissed,
    firingEnabled: stakes.firing,
    freeTeamSwitch: stakes.freeTeamSwitch && !dismissed,
    canResign: !dismissed,
    warning,
    attention: dismissed || warning !== null,
    // The client loads its career screens only when one of them has work to do:
    // a dismissal, a warning to show, or the Sandbox club switcher to bind.
    ui: dismissed || warning !== null || stakes.freeTeamSwitch,
    tenure: {
      teamId: career.tenure.teamId,
      startYear: career.tenure.startYear,
      seasons: tenureServed,
      warnings: career.tenure.warnings.length
    },
    lastReview: career.lastReview,
    standing: careerStanding(league),
    dismissal: dismissed
      ? {
          teamId: career.dismissal.teamId,
          teamName: career.dismissal.teamName,
          year: career.dismissal.year,
          reason: career.dismissal.reason,
          summary: career.dismissal.summary,
          record: career.dismissal.record,
          seasons: career.dismissal.seasons
        }
      : null,
    offers: dismissed
      ? career.dismissal.offers.map((offer) => describeJobOffer(session, offer)).filter(Boolean)
      : [],
    history: career.history.slice(-10).reverse()
  };
}
