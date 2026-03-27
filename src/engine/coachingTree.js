/**
 * Coaching Tree System
 *
 * Tracks the mentor-protégé lineage between coaches across the league.
 * When a coordinator is promoted to HC elsewhere, they inherit their
 * mentor's scheme tendencies with drift — creating organic cross-team
 * narrative continuity across decades.
 *
 * Data model (attached to league.coachingTree):
 *   {
 *     nodes: { [coachId]: CoachNode },
 *     edges: { [coachId]: parentCoachId }   // protégé → mentor
 *   }
 *
 * CoachNode:
 *   { id, name, currentTeamId, role, hireYear, offenseScheme, defenseScheme,
 *     tempo, generation, mentorId, promotionHistory[] }
 */

import { clamp } from "../utils/rng.js";

const SCHEME_OPTIONS = {
  offense: ["air-raid", "vertical-spread", "ground-control", "balanced"],
  defense: ["pressure-front", "contain-shell", "multiple"],
  tempo:   ["up-tempo", "measured"]
};

function pickWithDrift(options, parentValue, rng, driftChance = 0.25) {
  if (parentValue && rng.next() > driftChance) return parentValue;
  return rng.pick(options);
}

function coachId(name, teamId, year) {
  return `coach-${name.replace(/\s+/g, "-").toLowerCase()}-${teamId}-${year}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCoachingTree(league) {
  if (!league.coachingTree) {
    league.coachingTree = { nodes: {}, edges: {} };
  }
  // Seed from existing team staff (head coaches become root nodes)
  for (const team of league.teams) {
    const hc = team.staff?.headCoach;
    if (!hc) continue;
    const id = coachId(hc.name || `HC-${team.id}`, team.id, league.currentYear || 1);
    if (!league.coachingTree.nodes[id]) {
      league.coachingTree.nodes[id] = {
        id,
        name: hc.name || `Head Coach (${team.id})`,
        currentTeamId: team.id,
        role: "HC",
        hireYear: league.currentYear || 1,
        offenseScheme: team.scheme?.offense || "balanced",
        defenseScheme: team.scheme?.defense || "multiple",
        tempo: team.scheme?.tempo || "measured",
        generation: 0,
        mentorId: null,
        promotionHistory: []
      };
    }
  }
}

// ── Register a new coordinator (potential future HC) ─────────────────────────

export function registerCoordinator(league, team, coordinatorName, role, rng) {
  const tree = league.coachingTree;
  if (!tree) return null;

  // Find the HC of this team to use as mentor
  const hcNode = Object.values(tree.nodes).find(
    (n) => n.currentTeamId === team.id && n.role === "HC"
  );

  const id = coachId(coordinatorName, team.id, league.currentYear || 1);
  const mentor = hcNode || null;

  tree.nodes[id] = {
    id,
    name: coordinatorName,
    currentTeamId: team.id,
    role,
    hireYear: league.currentYear || 1,
    // Inherit mentor's scheme with drift
    offenseScheme: mentor
      ? pickWithDrift(SCHEME_OPTIONS.offense, mentor.offenseScheme, rng)
      : rng.pick(SCHEME_OPTIONS.offense),
    defenseScheme: mentor
      ? pickWithDrift(SCHEME_OPTIONS.defense, mentor.defenseScheme, rng)
      : rng.pick(SCHEME_OPTIONS.defense),
    tempo: mentor
      ? pickWithDrift(SCHEME_OPTIONS.tempo, mentor.tempo, rng)
      : rng.pick(SCHEME_OPTIONS.tempo),
    generation: mentor ? mentor.generation + 1 : 0,
    mentorId: mentor?.id || null,
    promotionHistory: []
  };

  if (mentor) tree.edges[id] = mentor.id;
  return tree.nodes[id];
}

// ── Promote a coordinator to HC at a new team ─────────────────────────────────

export function promoteToHeadCoach(league, coordinatorId, newTeamId, year, rng) {
  const tree = league.coachingTree;
  if (!tree || !tree.nodes[coordinatorId]) return null;

  const node = tree.nodes[coordinatorId];

  // Record promotion
  node.promotionHistory.push({ fromTeamId: node.currentTeamId, toTeamId: newTeamId, year, role: node.role });
  node.currentTeamId = newTeamId;
  node.role = "HC";

  // Slight scheme drift on promotion — new environment
  if (rng.next() < 0.3) {
    node.offenseScheme = rng.pick(SCHEME_OPTIONS.offense);
  }
  if (rng.next() < 0.3) {
    node.defenseScheme = rng.pick(SCHEME_OPTIONS.defense);
  }

  // Apply inherited scheme tendencies to the new team
  const newTeam = league.teams.find((t) => t.id === newTeamId);
  if (newTeam) {
    if (!newTeam.scheme) newTeam.scheme = {};
    newTeam.scheme.offense = node.offenseScheme;
    newTeam.scheme.defense = node.defenseScheme;
    newTeam.scheme.tempo   = node.tempo;
    newTeam.scheme.coachingTreeGeneration = node.generation;
    newTeam.scheme.promotedFromTeam = node.promotionHistory.at(-1)?.fromTeamId || null;
  }

  return { node, newTeam };
}

// ── Get coaching lineage for a team ──────────────────────────────────────────

export function getTeamCoachingLineage(league, teamId) {
  const tree = league.coachingTree;
  if (!tree) return [];
  const hcNode = Object.values(tree.nodes).find(
    (n) => n.currentTeamId === teamId && n.role === "HC"
  );
  if (!hcNode) return [];

  const lineage = [];
  let current = hcNode;
  while (current) {
    lineage.push({
      id: current.id,
      name: current.name,
      generation: current.generation,
      teamId: current.currentTeamId,
      offenseScheme: current.offenseScheme,
      defenseScheme: current.defenseScheme
    });
    current = current.mentorId ? tree.nodes[current.mentorId] : null;
  }
  return lineage;
}

// ── Get all coaches who share a mentor tree ───────────────────────────────────

export function getCoachingFamily(league, rootCoachId) {
  const tree = league.coachingTree;
  if (!tree) return [];
  const family = [];
  for (const [id, node] of Object.entries(tree.nodes)) {
    let cursor = node;
    while (cursor) {
      if (cursor.id === rootCoachId) { family.push(node); break; }
      cursor = cursor.mentorId ? tree.nodes[cursor.mentorId] : null;
    }
  }
  return family;
}

// ── Offseason carousel integration ───────────────────────────────────────────

export function processCoachingCarousel(league, rng, firedCoachIds = []) {
  const tree = league.coachingTree;
  if (!tree) return;

  const year = league.currentYear || 1;

  // Mark fired coaches
  for (const id of firedCoachIds) {
    if (tree.nodes[id]) {
      tree.nodes[id].role = "fired";
      tree.nodes[id].currentTeamId = null;
    }
  }

  // Find vacant HC seats (teams whose HC node is missing or fired)
  const teamsNeedingHC = league.teams.filter((team) => {
    return !Object.values(tree.nodes).some(
      (n) => n.currentTeamId === team.id && n.role === "HC"
    );
  });

  // Find available coordinator candidates (sorted by generation desc — experienced trees first)
  const candidates = Object.values(tree.nodes)
    .filter((n) => n.role !== "HC" && n.role !== "fired" && n.currentTeamId)
    .sort((a, b) => b.generation - a.generation);

  for (const team of teamsNeedingHC) {
    const candidate = candidates.shift();
    if (candidate) {
      promoteToHeadCoach(league, candidate.id, team.id, year, rng);
    } else {
      // No tree candidate — generate a fresh root-level HC
      const name = `New HC (${team.id})`;
      const id = coachId(name, team.id, year);
      tree.nodes[id] = {
        id,
        name,
        currentTeamId: team.id,
        role: "HC",
        hireYear: year,
        offenseScheme: rng.pick(SCHEME_OPTIONS.offense),
        defenseScheme: rng.pick(SCHEME_OPTIONS.defense),
        tempo: rng.pick(SCHEME_OPTIONS.tempo),
        generation: 0,
        mentorId: null,
        promotionHistory: []
      };
    }
  }
}
