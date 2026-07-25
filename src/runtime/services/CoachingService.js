import {
  getTeamCoachingLineage,
  initCoachingTree,
  processCoachingCarousel,
  registerCoordinator,
  registerRootHeadCoach
} from "../../engine/coachingTree.js";

const COORDINATOR_ROLES = Object.freeze([
  ["offensiveCoordinator", "OC"],
  ["defensiveCoordinator", "DC"]
]);

function nodeForStaff(tree, teamId, staffer, role) {
  return Object.values(tree?.nodes || {}).find((node) =>
    node.currentTeamId === teamId &&
    node.role === role &&
    node.name === staffer?.name
  ) || null;
}

export class CoachingService {
  constructor(sessionOrLeague) {
    this.session = sessionOrLeague?.league ? sessionOrLeague : null;
    this.league = sessionOrLeague?.league || sessionOrLeague;
  }

  currentYear() {
    return this.session?.currentYear || this.league?.currentYear || 1;
  }

  ensureAuthority() {
    if (!this.league) return null;
    this.league.currentYear = this.currentYear();
    initCoachingTree(this.league);
    for (const team of this.league.teams || []) {
      const headCoach = team.staff?.headCoach;
      if (headCoach) {
        const headCoachCandidates = Object.values(this.league.coachingTree.nodes).filter(
          (node) => node.currentTeamId === team.id && node.role === "HC"
        );
        headCoachCandidates.sort((left, right) =>
          (right.promotionHistory?.length || 0) - (left.promotionHistory?.length || 0) ||
          (right.generation || 0) - (left.generation || 0) ||
          (right.hireYear || 0) - (left.hireYear || 0)
        );
        const activeHeadCoach = headCoachCandidates[0] || null;
        for (const duplicate of headCoachCandidates.slice(1)) {
          duplicate.role = "departed";
          duplicate.currentTeamId = null;
        }
        if (activeHeadCoach) headCoach.name = activeHeadCoach.name;
        else registerRootHeadCoach(this.league, team, headCoach, this.currentYear());
      }
      for (const [staffKey, role] of COORDINATOR_ROLES) {
        const staffer = team.staff?.[staffKey];
        if (staffer && !nodeForStaff(this.league.coachingTree, team.id, staffer, role)) {
          registerCoordinator(this.league, team, staffer.name, role, this.session?.rng);
        }
      }
    }
    return this.league.coachingTree;
  }

  getTeamView(teamId) {
    const tree = this.ensureAuthority();
    if (!tree || !teamId) return null;
    const lineage = getTeamCoachingLineage(this.league, teamId);
    const currentStaff = Object.values(tree.nodes)
      .filter((node) => node.currentTeamId === teamId && ["HC", "OC", "DC"].includes(node.role))
      .sort((left, right) => ["HC", "OC", "DC"].indexOf(left.role) - ["HC", "OC", "DC"].indexOf(right.role))
      .map((node) => ({
        id: node.id,
        name: node.name,
        role: node.role,
        generation: node.generation,
        mentorId: node.mentorId,
        mentor: node.mentorId ? tree.nodes[node.mentorId]?.name || null : null,
        scheme: `${node.offenseScheme} / ${node.defenseScheme}`,
        tempo: node.tempo,
        hireYear: node.hireYear,
        promotions: node.promotionHistory?.length || 0
      }));
    const headCoach = currentStaff.find((node) => node.role === "HC");
    const familySize = headCoach
      ? Object.values(tree.nodes).filter((node) => {
          let cursor = node;
          const visited = new Set();
          while (cursor && !visited.has(cursor.id)) {
            if (cursor.id === headCoach.id) return true;
            visited.add(cursor.id);
            cursor = cursor.mentorId ? tree.nodes[cursor.mentorId] : null;
          }
          return false;
        }).length
      : 0;
    return {
      schemaVersion: "1.0",
      source: "league.coachingTree",
      teamId,
      currentStaff,
      lineage,
      familySize,
      disclaimer: "Lineage records mentorship and scheme inheritance. It does not claim a coach caused team results."
    };
  }

  processLifecycle({ createStaffProfile, applyStaffToCoaching, logNews } = {}) {
    this.ensureAuthority();
    const expired = [];
    const firedHeadCoachIds = [];
    for (const team of this.league.teams || []) {
      for (const [staffKey, role] of [["headCoach", "HC"], ...COORDINATOR_ROLES]) {
        const staffer = team.staff?.[staffKey];
        if (!staffer) continue;
        staffer.yearsRemaining = Math.max(0, (staffer.yearsRemaining || 1) - 1);
        if (staffer.yearsRemaining > 0) continue;
        const node = nodeForStaff(this.league.coachingTree, team.id, staffer, role);
        if (node) {
          node.role = "fired";
          node.currentTeamId = null;
          if (role === "HC") firedHeadCoachIds.push(node.id);
        }
        const replacement = createStaffProfile()[staffKey];
        team.staff[staffKey] = replacement;
        expired.push({ team, staffKey, role, replacement, previousName: staffer.name });
      }
    }

    processCoachingCarousel(this.league, this.session?.rng, firedHeadCoachIds);

    for (const event of expired) {
      if (event.role === "HC") {
        const promoted = Object.values(this.league.coachingTree.nodes).find(
          (node) => node.currentTeamId === event.team.id && node.role === "HC"
        );
        if (promoted) event.team.staff.headCoach.name = promoted.name;
      } else {
        registerCoordinator(
          this.league,
          event.team,
          event.team.staff[event.staffKey].name,
          event.role,
          this.session?.rng
        );
      }
      logNews?.(`${event.team.id} hired a new ${event.staffKey}`, {
        teamId: event.team.id,
        role: event.staffKey,
        name: event.team.staff[event.staffKey].name,
        predecessor: event.previousName,
        coachingTree: true
      });
    }
    for (const team of this.league.teams || []) applyStaffToCoaching?.(team);
    return { expired: expired.length, view: this.getTeamView(this.session?.controlledTeamId) };
  }
}
