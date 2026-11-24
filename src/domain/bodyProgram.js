// Offseason body programmes (S133). A general manager can ask one of his
// players to add mass or cut weight before next season. Each programme is a
// trade, never a free gain: what it adds in one place it costs in another,
// and the weight it moves changes the player's frame against his position
// (physicalProfile.js), which the games read. Rival clubs do not run
// programmes, so nothing here can ratchet a league upward.
//
// The choice is stored on the player as `bodyProgram` and consumed once, at
// the next offseason progression. No random numbers are drawn.

export const BODY_PROGRAMS = Object.freeze({
  maintain: Object.freeze({ id: "maintain", label: "Maintain", summary: "Keep his current frame.", weightLbs: 0, ratings: Object.freeze({}) }),
  bulk: Object.freeze({
    id: "bulk", label: "Bulk up", summary: "Add about 8 lb: more strength and power, a step slower.",
    weightLbs: 8, ratings: Object.freeze({ strength: 2, trucking: 1, speed: -1, acceleration: -1 })
  }),
  lean: Object.freeze({
    id: "lean", label: "Lean down", summary: "Cut about 8 lb: quicker and more agile, less power at contact.",
    weightLbs: -8, ratings: Object.freeze({ speed: 1, agility: 1, strength: -2 })
  })
});

// How far a body may move from where players of the position are generated,
// so a programme cannot build a 200 lb lineman or a 300 lb corner.
const WEIGHT_LIMITS = Object.freeze({
  QB: [195, 260], RB: [180, 250], WR: [165, 240], TE: [225, 290], OL: [280, 380],
  DL: [240, 345], LB: [210, 280], DB: [170, 230], K: [160, 235], P: [175, 245]
});

export function normalizeBodyProgram(value) {
  return Object.hasOwn(BODY_PROGRAMS, value) ? value : null;
}

/** Record a player's programme for the coming offseason. */
export function setPlayerBodyProgram(player, program) {
  const id = normalizeBodyProgram(program);
  if (!player) return { ok: false, error: "Player not found." };
  if (!id) return { ok: false, error: `Unknown body programme: ${program}.` };
  if (player.position === "K" || player.position === "P") return { ok: false, error: "Specialists keep their own conditioning." };
  if (id === "maintain") delete player.bodyProgram;
  else player.bodyProgram = id;
  return { ok: true, program: id, policy: BODY_PROGRAMS[id] };
}

/**
 * Apply and clear a player's programme. Returns what changed, or null when he
 * had none. Ratings stay inside 40-99 and weight inside the position's limits;
 * a programme that would push weight past a limit moves it only to the limit.
 */
export function applyBodyProgram(player) {
  const id = normalizeBodyProgram(player?.bodyProgram);
  if (!id || id === "maintain") { if (player) delete player.bodyProgram; return null; }
  const program = BODY_PROGRAMS[id];
  const [lo, hi] = WEIGHT_LIMITS[player.position] || [160, 380];
  const before = Number(player.weightLbs);
  const weightBefore = Number.isFinite(before) ? before : (lo + hi) / 2;
  const weightAfter = Math.max(lo, Math.min(hi, Math.round(weightBefore + program.weightLbs)));
  // A body that cannot move further gets none of the rating trade either.
  const share = program.weightLbs ? (weightAfter - weightBefore) / program.weightLbs : 0;
  const changes = {};
  if (share > 0 && player.ratings) {
    for (const [key, delta] of Object.entries(program.ratings)) {
      if (!(key in player.ratings)) continue;
      const next = Math.max(40, Math.min(99, Math.round(Number(player.ratings[key]) + delta * share)));
      if (next !== player.ratings[key]) { changes[key] = next - player.ratings[key]; player.ratings[key] = next; }
    }
  }
  player.weightLbs = weightAfter;
  delete player.bodyProgram;
  return { program: id, weightBefore, weightAfter, ratingChanges: changes };
}
