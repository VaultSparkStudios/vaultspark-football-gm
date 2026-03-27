/**
 * Draft Combine System — Pre-Draft Measurables
 *
 * Runs a combine week before the draft. Each prospect receives
 * position-specific event scores that narrow or widen their
 * scouting confidence range.
 *
 * Events by position group:
 *   Skill positions (QB/RB/WR/TE): 40-yard dash, vertical jump, position drill
 *   Big men (OL/DL): bench press, short shuttle, motor test
 *   Coverage (LB/DB): vertical jump, cone drill, coverage drill
 *   Specialists (K/P): accuracy and leg-strength tests
 *
 * A great combine (grade 75+) narrows confidence by 5 pts.
 * A poor combine (grade < 45) widens confidence by 5 pts (more unknown).
 * Average combine leaves confidence unchanged.
 *
 * Combine results attach to prospect.combineResults: { grade, events, performedAt }.
 */

// ── Position baselines [min, max] ─────────────────────────────────────────────

const COMBINE_BASELINES = {
  QB:  { fortyYard: [4.5, 5.1], verticalJump: [28, 38], qbAccuracy: [55, 95] },
  RB:  { fortyYard: [4.2, 4.7], verticalJump: [33, 46], explosiveness: [65, 95] },
  WR:  { fortyYard: [4.2, 4.6], verticalJump: [32, 46], routeCrispness: [55, 90] },
  TE:  { fortyYard: [4.5, 5.1], verticalJump: [28, 42], blockingTest: [50, 85] },
  OL:  { benchPress: [20, 42],  shortShuttle: [4.4, 5.2], blockingDrill: [55, 90] },
  DL:  { benchPress: [22, 44],  shortShuttle: [4.2, 5.0], motorTest: [55, 95] },
  LB:  { verticalJump: [30, 44], coneDrill: [6.5, 8.0], coverageDrill: [50, 85] },
  DB:  { fortyYard: [4.2, 4.6], verticalJump: [32, 46], coverageDrill: [55, 90] },
  K:   { kickAccuracy: [60, 98], legStrength: [50, 92] },
  P:   { puntAccuracy: [58, 96], hangTime:    [3.8, 5.2] }
};

function lerp(min, max, t) {
  return min + (max - min) * Math.max(0, Math.min(1, t));
}

// ── Run combine for one prospect ──────────────────────────────────────────────

export function runCombineForProspect(prospect, rng) {
  const pos = prospect.position;
  const baseline = COMBINE_BASELINES[pos] || COMBINE_BASELINES.LB;

  // Skill bias: OVR 60 → 0.3, OVR 85 → 0.7
  const skillBias = 0.3 + ((prospect.overall || 70) - 60) * 0.016;

  const events = {};
  for (const [event, [min, max]] of Object.entries(baseline)) {
    const noise = (rng.next() - 0.5) * 0.5;
    const t = Math.min(1, Math.max(0, skillBias + noise));
    events[event] = Number(lerp(min, max, t).toFixed(2));
  }

  const grade = _computeGrade(events, pos, skillBias);

  return {
    prospectId:  prospect.id,
    name:        prospect.name,
    position:    pos,
    overall:     prospect.overall,
    events,
    grade,
    performedAt: new Date().toISOString()
  };
}

function _computeGrade(events, pos, skillBias) {
  // Normalize event values to 0-1 using baselines, average them
  const baseline = COMBINE_BASELINES[pos] || COMBINE_BASELINES.LB;
  const scores = Object.entries(events).map(([event, val]) => {
    const [min, max] = baseline[event] || [0, 100];
    // For 40-yard dash and cone drill, lower is better
    const isTimeEvent = event.includes("forty") || event.includes("cone") || event.includes("shuttle");
    return isTimeEvent ? 1 - ((val - min) / Math.max(1, max - min)) : (val - min) / Math.max(1, max - min);
  });
  const avg = scores.reduce((s, v) => s + v, 0) / Math.max(1, scores.length);
  return Math.round(Math.min(99, Math.max(35, avg * 64 + 35)));
}

// ── Apply combine result to scouting confidence ───────────────────────────────

export function applyCombineToScouting(prospect, combineResult) {
  const grade = combineResult.grade;
  const delta =
    grade >= 78 ? -6 :    // great combine → narrows uncertainty
    grade >= 65 ? -3 :
    grade >= 50 ?  0 :
    grade >= 40 ?  4 :    // poor combine → widens uncertainty
                   7;
  prospect.scoutingConfidence = Math.round(
    Math.min(95, Math.max(5, (prospect.scoutingConfidence || 50) + delta))
  );
  prospect.combineResults = combineResult;
}

// ── Run combine for entire draft class ───────────────────────────────────────

export function runLeagueCombine(draftClass, rng) {
  if (!Array.isArray(draftClass) || !draftClass.length) return [];
  const results = [];
  for (const prospect of draftClass) {
    const result = runCombineForProspect(prospect, rng);
    applyCombineToScouting(prospect, result);
    results.push(result);
  }
  return results;
}

// ── Combine summary for UI ────────────────────────────────────────────────────

export function getCombineSummary(draftClass, controlledTeamBoardIds = []) {
  const results = draftClass
    .filter((p) => p.combineResults)
    .map((p) => ({
      id:         p.id,
      name:       p.name,
      position:   p.position,
      overall:    p.overall || "?",
      grade:      p.combineResults.grade,
      gradeLabel: p.combineResults.grade >= 75 ? "Elite" :
                  p.combineResults.grade >= 62 ? "Good"  :
                  p.combineResults.grade >= 48 ? "Avg"   : "Poor",
      onBoard:    controlledTeamBoardIds.includes(p.id),
      topEvent:   _topEvent(p.combineResults.events)
    }))
    .sort((a, b) => b.grade - a.grade);

  return results;
}

function _topEvent(events) {
  if (!events) return "";
  const [key] = Object.entries(events).sort(([, a], [, b]) => b - a)[0] || [];
  return key
    ? key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim()
    : "";
}
