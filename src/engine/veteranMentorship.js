/**
 * Veteran Mentorship System
 * Veterans (5+ seasons, OVR ≥ 75) accelerate development of younger players
 * at the same position. Applied during offseason development.
 *
 * Bonus: +1 to +2 OVR per mentee, scaled by mentor quality.
 * Side effect: adds entry to league.mentorshipLog for narrative tracking.
 */

const MIN_VETERAN_SEASONS = 5;
const MIN_VETERAN_OVERALL = 75;
const MAX_MENTEE_AGE = 25;
const MAX_MENTEE_SEASONS = 3;

/**
 * Find mentor-mentee pairs for a team's roster.
 * @param {object[]} roster  full player objects with position, overall, age, seasonsPlayed
 * @returns {{ mentor: object, mentee: object }[]}
 */
export function computeMentorships(roster) {
  const veterans = roster.filter(
    (p) =>
      (p.seasonsPlayed || 0) >= MIN_VETERAN_SEASONS &&
      (p.overall || 0) >= MIN_VETERAN_OVERALL &&
      p.status !== "retired"
  );
  const youngPlayers = roster.filter(
    (p) =>
      (p.age || 25) <= MAX_MENTEE_AGE &&
      (p.seasonsPlayed || 0) < MAX_MENTEE_SEASONS &&
      p.status !== "retired"
  );

  const pairs = [];
  const assignedMentees = new Set();

  for (const vet of veterans.sort((a, b) => (b.overall || 0) - (a.overall || 0))) {
    const eligibleMentees = youngPlayers.filter(
      (y) => y.position === vet.position && !assignedMentees.has(y.id)
    );
    if (eligibleMentees.length) {
      const mentee = eligibleMentees[0];
      assignedMentees.add(mentee.id);
      pairs.push({ mentor: vet, mentee });
    }
  }
  return pairs;
}

/**
 * Apply mentorship OVR bonuses to all teams during offseason.
 * Mutates player.overall in place.
 * @param {object} league
 * @param {number} year
 */
export function applyMentorshipBonuses(league, year) {
  if (!league.mentorshipLog) league.mentorshipLog = [];
  for (const team of league.teams) {
    const roster = (league.players || []).filter(
      (p) => p.teamId === team.id && p.status !== "retired"
    );
    const pairs = computeMentorships(roster);
    const bonuses = [];
    for (const { mentor, mentee } of pairs) {
      // Bonus scales with mentor quality: OVR 75 → +1, OVR 90 → +2
      const bonus = Math.round(1 + Math.max(0, ((mentor.overall || 75) - 75) / 15));
      mentee.overall = Math.min(99, (mentee.overall || 60) + bonus);
      bonuses.push({
        mentorId: mentor.id,
        mentorName: mentor.name,
        menteeId: mentee.id,
        menteeName: mentee.name,
        position: mentor.position,
        bonus
      });
    }
    if (bonuses.length) {
      league.mentorshipLog.push({ teamId: team.id, year, bonuses });
      // Keep log bounded
      if (league.mentorshipLog.length > 500) {
        league.mentorshipLog = league.mentorshipLog.slice(-500);
      }
    }
  }
}

/**
 * Get current mentorship pairings for a team (for UI display).
 * @param {object} league
 * @param {string} teamId
 * @returns {{ mentorId, mentorName, mentorOvr, menteeId, menteeName, menteeAge, position, projectedBonus }[]}
 */
export function getMentorshipStatus(league, teamId) {
  const roster = (league.players || []).filter(
    (p) => p.teamId === teamId && p.status !== "retired"
  );
  return computeMentorships(roster).map(({ mentor, mentee }) => ({
    mentorId: mentor.id,
    mentorName: mentor.name || "Veteran",
    mentorOvr: mentor.overall || 0,
    menteeId: mentee.id,
    menteeName: mentee.name || "Prospect",
    menteeAge: mentee.age || 0,
    position: mentor.position,
    projectedBonus: Math.round(1 + Math.max(0, ((mentor.overall || 75) - 75) / 15))
  }));
}

/**
 * Get mentorship history log entries for a team.
 * @param {object} league
 * @param {string} teamId
 * @returns {object[]}
 */
export function getMentorshipHistory(league, teamId) {
  return (league.mentorshipLog || [])
    .filter((entry) => entry.teamId === teamId)
    .slice(-10);
}
