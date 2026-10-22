/**
 * Veteran mentorship authority.
 *
 * Explicit covenants consume the same pair slots and OVR budget as the original
 * automatic system. CPU clubs therefore keep automatic fallback, while a player
 * can choose who learns from whom without manufacturing extra development.
 */

const MIN_VETERAN_SEASONS = 5;
const MIN_VETERAN_OVERALL = 75;
const MAX_MENTEE_AGE = 25;
const MAX_MENTEE_SEASONS = 3;
const PLAN_VERSION = "2.0";

export const MENTORSHIP_FOCUSES = Object.freeze({
  fundamentals: Object.freeze({ id: "fundamentals", label: "Fundamentals", description: "Position fundamentals and repeatable professional habits." }),
  "film-study": Object.freeze({ id: "film-study", label: "Film study", description: "Recognition, preparation, and shared film work." }),
  leadership: Object.freeze({ id: "leadership", label: "Leadership", description: "Communication, standards, and role ownership." })
});

const FOCUS_DISCLOSURE = "Focus labels the covenant; it does not increase the existing +1/+2 OVR mentorship budget.";
const idOf = (player) => String(player?.id || "");
const rosterFor = (league, teamId) => (league?.players || []).filter((player) => player.teamId === teamId && player.status !== "retired");
const mentorEligible = (player) => Boolean(player) && (player.seasonsPlayed || 0) >= MIN_VETERAN_SEASONS && (player.overall || 0) >= MIN_VETERAN_OVERALL && player.status !== "retired";
const menteeEligible = (player) => Boolean(player) && (player.age || 25) <= MAX_MENTEE_AGE && (player.seasonsPlayed || 0) < MAX_MENTEE_SEASONS && player.status !== "retired";
const bonusFor = (mentor) => Math.min(2, Math.round(1 + Math.max(0, ((mentor?.overall || 75) - 75) / 15)));

function hash(value) {
  let result = 2166136261;
  for (const character of String(value || "")) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function planFor(league, teamId) {
  if (!league.mentorshipPlans || typeof league.mentorshipPlans !== "object") league.mentorshipPlans = {};
  if (!league.mentorshipPlans[teamId]) {
    league.mentorshipPlans[teamId] = { schemaVersion: PLAN_VERSION, teamId, revision: 0, assignments: [] };
  }
  const plan = league.mentorshipPlans[teamId];
  plan.schemaVersion = PLAN_VERSION;
  plan.teamId = teamId;
  plan.revision = Number(plan.revision || 0);
  plan.assignments = Array.isArray(plan.assignments) ? plan.assignments : [];
  return plan;
}

/** Original CPU automatic pairing; also defines the explicit-plan budget. */
export function computeMentorships(roster) {
  const veterans = roster.filter(mentorEligible).sort((left, right) =>
    (right.overall || 0) - (left.overall || 0) || idOf(left).localeCompare(idOf(right)));
  const young = roster.filter(menteeEligible);
  const assigned = new Set();
  const pairs = [];
  for (const mentor of veterans) {
    const mentee = young.find((player) => player.position === mentor.position && !assigned.has(idOf(player)));
    if (!mentee) continue;
    assigned.add(idOf(mentee));
    pairs.push({ mentor, mentee });
  }
  return pairs;
}

function rosterFingerprint(league, teamId) {
  return rosterFor(league, teamId).map((player) => [
    idOf(player), player.teamId, player.status || "active", player.position || "",
    player.age || 0, player.seasonsPlayed || 0, player.overall || 0
  ].join(":" )).sort().join("|");
}

export function mentorshipPlanFingerprint(league, teamId) {
  const plan = planFor(league, teamId);
  const rows = plan.assignments.map((row) => [row.id, row.mentorId, row.menteeId, row.focus].join(":" )).sort().join("|");
  return `mentorship-${hash(`${teamId}|${plan.revision}|${rows}|${rosterFingerprint(league, teamId)}`)}`;
}

function invalidReason(league, teamId, assignment) {
  const mentor = (league.players || []).find((player) => idOf(player) === assignment.mentorId);
  const mentee = (league.players || []).find((player) => idOf(player) === assignment.menteeId);
  if (!mentor || mentor.teamId !== teamId || mentor.status === "retired") return "mentor-left-franchise";
  if (!mentee || mentee.teamId !== teamId || mentee.status === "retired") return "mentee-left-franchise";
  if (!mentorEligible(mentor)) return "mentor-no-longer-eligible";
  if (!menteeEligible(mentee)) return "mentee-no-longer-eligible";
  if (mentor.position !== mentee.position) return "position-no-longer-matches";
  return null;
}

export function reconcileMentorshipAssignments(league, teamId, clock = {}) {
  const plan = planFor(league, teamId);
  if (!Array.isArray(league.mentorshipDissolutionLog)) league.mentorshipDissolutionLog = [];
  const existing = new Set(league.mentorshipDissolutionLog.map((row) => row.assignmentId));
  const active = [];
  const dissolved = [];
  for (const assignment of plan.assignments) {
    const reasonCode = invalidReason(league, teamId, assignment);
    if (!reasonCode) { active.push(assignment); continue; }
    const receipt = {
      id: `mentorship-dissolved-${assignment.id}`, assignmentId: assignment.id, teamId,
      mentorId: assignment.mentorId, menteeId: assignment.menteeId, focus: assignment.focus,
      status: "dissolved", reasonCode, year: clock.year ?? null, week: clock.week ?? null
    };
    dissolved.push(receipt);
    if (!existing.has(assignment.id)) league.mentorshipDissolutionLog.push(receipt);
  }
  if (dissolved.length) {
    plan.assignments = active;
    plan.revision += 1;
    plan.lastReconciled = { year: clock.year ?? null, week: clock.week ?? null };
    league.mentorshipDissolutionLog = league.mentorshipDissolutionLog.slice(-160);
  }
  return dissolved;
}

function resolvePairs(league, teamId) {
  reconcileMentorshipAssignments(league, teamId);
  const roster = rosterFor(league, teamId);
  const players = new Map(roster.map((player) => [idOf(player), player]));
  const baseline = computeMentorships(roster);
  const budget = baseline.reduce((sum, pair) => sum + bonusFor(pair.mentor), 0);
  const usedMentors = new Set();
  const usedMentees = new Set();
  const pairs = [];
  for (const assignment of planFor(league, teamId).assignments) {
    const mentor = players.get(assignment.mentorId);
    const mentee = players.get(assignment.menteeId);
    if (!mentor || !mentee || pairs.length >= baseline.length) continue;
    usedMentors.add(assignment.mentorId); usedMentees.add(assignment.menteeId);
    pairs.push({ mentor, mentee, assignment, source: "explicit" });
  }
  const fallbackRoster = roster.filter((player) => !usedMentors.has(idOf(player)) && !usedMentees.has(idOf(player)));
  for (const pair of computeMentorships(fallbackRoster)) {
    if (pairs.length >= baseline.length) break;
    pairs.push({ ...pair, assignment: null, source: "automatic" });
  }
  let remaining = budget;
  return {
    budget,
    pairs: pairs.map((pair) => {
      const bonus = Math.min(bonusFor(pair.mentor), remaining);
      remaining -= bonus;
      return { ...pair, bonus };
    }).filter((pair) => pair.bonus > 0)
  };
}

function pairRow(pair) {
  const focus = MENTORSHIP_FOCUSES[pair.assignment?.focus] || MENTORSHIP_FOCUSES.fundamentals;
  return {
    assignmentId: pair.assignment?.id || null, source: pair.source,
    mentorId: idOf(pair.mentor), mentorName: pair.mentor.name || "Veteran", mentorOvr: pair.mentor.overall || 0,
    menteeId: idOf(pair.mentee), menteeName: pair.mentee.name || "Prospect", menteeAge: pair.mentee.age || 0,
    position: pair.mentor.position, projectedBonus: pair.bonus, focus: focus.id,
    focusLabel: focus.label, focusDescription: focus.description, focusDisclosure: FOCUS_DISCLOSURE
  };
}

export function getMentorshipState(league, teamId, clock = {}) {
  const freshDissolutions = reconcileMentorshipAssignments(league, teamId, clock);
  const plan = planFor(league, teamId);
  const roster = rosterFor(league, teamId);
  const resolved = resolvePairs(league, teamId);
  const dissolutionRows = [...freshDissolutions, ...(league.mentorshipDissolutionLog || []).filter((row) => row.teamId === teamId)];
  return {
    schemaVersion: PLAN_VERSION, teamId, revision: plan.revision,
    fingerprint: mentorshipPlanFingerprint(league, teamId),
    assignments: plan.assignments.map((row) => ({ ...row })), pairs: resolved.pairs.map(pairRow),
    eligibleMentors: roster.filter(mentorEligible).map((player) => ({ id: idOf(player), name: player.name || idOf(player), position: player.position, overall: player.overall || 0 })),
    eligibleMentees: roster.filter(menteeEligible).map((player) => ({ id: idOf(player), name: player.name || idOf(player), position: player.position, age: player.age || 0 })),
    focuses: Object.values(MENTORSHIP_FOCUSES).map((focus) => ({ ...focus, disclosure: FOCUS_DISCLOSURE })),
    budget: { maximumPairs: computeMentorships(roster).length, totalOvr: resolved.budget, disclosure: FOCUS_DISCLOSURE },
    history: getMentorshipHistory(league, teamId),
    dissolutions: dissolutionRows.filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index).slice(-10)
  };
}

function concurrencyError(league, teamId, input) {
  const state = getMentorshipState(league, teamId, input);
  if (!Number.isFinite(Number(input.expectedRevision)) || !input.expectedFingerprint) {
    return { ok: false, status: 400, reasonCode: "mentorship-authority-required", error: "Current revision and fingerprint are required.", state };
  }
  if (Number(input.expectedRevision) !== state.revision || String(input.expectedFingerprint) !== state.fingerprint) {
    return { ok: false, status: 409, reasonCode: "stale-mentorship-plan", error: "The roster or mentorship plan changed. Reload its current authority.", state };
  }
  return null;
}

export function assignMentorshipCovenant(league, input = {}) {
  const teamId = String(input.teamId || "").toUpperCase();
  const conflict = concurrencyError(league, teamId, input); if (conflict) return conflict;
  const roster = rosterFor(league, teamId);
  const mentor = roster.find((player) => idOf(player) === String(input.mentorId || ""));
  const mentee = roster.find((player) => idOf(player) === String(input.menteeId || ""));
  const focus = MENTORSHIP_FOCUSES[input.focus];
  if (!mentorEligible(mentor)) return { ok: false, status: 400, reasonCode: "mentor-ineligible", error: "Choose an eligible veteran mentor." };
  if (!menteeEligible(mentee)) return { ok: false, status: 400, reasonCode: "mentee-ineligible", error: "Choose an eligible young player." };
  if (mentor.position !== mentee.position) return { ok: false, status: 400, reasonCode: "mentorship-position", error: "Mentor and mentee must share a position." };
  if (!focus) return { ok: false, status: 400, reasonCode: "mentorship-focus", error: "Choose a recognized mentorship focus." };
  const baseline = computeMentorships(roster);
  if (!baseline.length) return { ok: false, status: 409, reasonCode: "mentorship-budget-empty", error: "This roster has no mentorship development slots." };
  const plan = planFor(league, teamId);
  const nextAssignments = plan.assignments.filter((row) => row.mentorId !== idOf(mentor) && row.menteeId !== idOf(mentee));
  if (nextAssignments.length >= baseline.length) return { ok: false, status: 409, reasonCode: "mentorship-budget-full", error: "Clear one covenant before assigning another." };
  plan.revision += 1;
  const assignment = {
    id: `MC-${teamId}-${plan.revision}-${hash(`${idOf(mentor)}|${idOf(mentee)}|${focus.id}`)}`,
    mentorId: idOf(mentor), menteeId: idOf(mentee), position: mentor.position, focus: focus.id,
    createdYear: input.year ?? null, createdWeek: input.week ?? null
  };
  plan.assignments = [...nextAssignments, assignment];
  plan.updatedAt = { year: input.year ?? null, week: input.week ?? null };
  return { ok: true, assignment, state: getMentorshipState(league, teamId, input) };
}

export function clearMentorshipCovenant(league, input = {}) {
  const teamId = String(input.teamId || "").toUpperCase();
  const conflict = concurrencyError(league, teamId, input); if (conflict) return conflict;
  const plan = planFor(league, teamId);
  const assignmentId = String(input.assignmentId || "");
  if (!plan.assignments.some((row) => row.id === assignmentId)) return { ok: false, status: 404, reasonCode: "mentorship-assignment-missing", error: "That covenant is no longer active." };
  plan.assignments = plan.assignments.filter((row) => row.id !== assignmentId);
  plan.revision += 1;
  plan.updatedAt = { year: input.year ?? null, week: input.week ?? null };
  return { ok: true, clearedAssignmentId: assignmentId, state: getMentorshipState(league, teamId, input) };
}

/** Apply exactly one receipt per team/year; repeated calls are no-ops. */
export function applyMentorshipBonuses(league, year) {
  if (!Array.isArray(league.mentorshipLog)) league.mentorshipLog = [];
  const receipts = [];
  for (const team of league.teams || []) {
    reconcileMentorshipAssignments(league, team.id, { year });
    const id = `mentorship-${team.id}-${year}`;
    const previous = league.mentorshipLog.find((row) => row.id === id || (row.teamId === team.id && Number(row.year) === Number(year)));
    if (previous) { receipts.push(previous); continue; }
    const resolved = resolvePairs(league, team.id);
    const bonuses = resolved.pairs.map((pair) => {
      pair.mentee.overall = Math.min(99, (pair.mentee.overall || 60) + pair.bonus);
      return { ...pairRow(pair), bonus: pair.bonus };
    });
    const receipt = { id, teamId: team.id, year, status: "applied", totalBonusBudget: resolved.budget, totalBonusApplied: bonuses.reduce((sum, row) => sum + row.bonus, 0), bonuses };
    league.mentorshipLog.push(receipt); receipts.push(receipt);
  }
  league.mentorshipLog = league.mentorshipLog.slice(-640);
  return receipts;
}

export const getMentorshipStatus = (league, teamId) => getMentorshipState(league, teamId).pairs;
export const getMentorshipHistory = (league, teamId) => (league.mentorshipLog || []).filter((row) => row.teamId === teamId).slice(-10);
