// The three weekly game-plan dials that sit under the tactic choice. This file
// is the one declaration of their ids and player-facing copy: the plan modal,
// the command boundary and the drive engine (src/engine/gamePlanDepth.js) all
// read it. Each dial has three positions and a neutral middle; the neutral
// position is never sent, staged or stored, so it cannot change a game.
export const GAME_PLAN_DIMENSIONS = Object.freeze([
  Object.freeze({
    key: "pace",
    label: "Pace",
    neutral: "normal",
    options: Object.freeze([
      Object.freeze({ id: "slow", label: "Slow it down", trade: "Fewer drives for both teams and better ball security — but fewer chances to score." }),
      Object.freeze({ id: "normal", label: "Normal", trade: "The staff's usual tempo. Nothing gained, nothing given up." }),
      Object.freeze({ id: "hurry-up", label: "Hurry-up", trade: "More drives for both teams — but a rushed offense gives the ball away more." })
    ])
  }),
  Object.freeze({
    key: "lean",
    label: "Run-pass lean",
    neutral: "balanced",
    options: Object.freeze([
      Object.freeze({ id: "lean-run", label: "Lean run", trade: "More carries and fewer throws — a steadier offense, but fewer big gains." }),
      Object.freeze({ id: "balanced", label: "Balanced", trade: "The staff's usual mix. Nothing gained, nothing given up." }),
      Object.freeze({ id: "lean-pass", label: "Lean pass", trade: "More throws and fewer carries — more big gains, but more sacks." })
    ])
  }),
  Object.freeze({
    key: "coverage",
    label: "Coverage",
    neutral: "balanced",
    options: Object.freeze([
      Object.freeze({ id: "safe", label: "Play it safe", trade: "Fewer deep completions allowed — but fewer interceptions and easier short throws." }),
      Object.freeze({ id: "balanced", label: "Balanced", trade: "The staff's usual coverage. Nothing gained, nothing given up." }),
      Object.freeze({ id: "take-chances", label: "Take chances", trade: "More interceptions and tighter short coverage — but more deep completions allowed." })
    ])
  })
]);

export const GAME_PLAN_KEYS = Object.freeze(GAME_PLAN_DIMENSIONS.map((dimension) => dimension.key));

function dimensionFor(key) {
  return GAME_PLAN_DIMENSIONS.find((dimension) => dimension.key === key) || null;
}

/** The option row for a dial position, or null when either is unknown. */
export function gamePlanOption(key, id) {
  return dimensionFor(key)?.options.find((option) => option.id === id) || null;
}

/** Every dial at its neutral middle. */
export function neutralGamePlan() {
  return Object.fromEntries(GAME_PLAN_DIMENSIONS.map((dimension) => [dimension.key, dimension.neutral]));
}

/**
 * Lenient reader for stored or in-memory values: anything missing or unknown
 * reads as neutral, so an old save or a malformed plan is exactly a no-op.
 * Pure; never touches an RNG.
 */
export function normalizeGamePlan(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(GAME_PLAN_DIMENSIONS.map((dimension) => [
    dimension.key,
    dimension.options.some((option) => option.id === source[dimension.key]) ? source[dimension.key] : dimension.neutral
  ]));
}

/**
 * Only the dials moved off neutral, or null when none were. This is the shape
 * that is sent, staged and written onto a weekly plan — a neutral plan leaves
 * no trace at all.
 */
export function activeGamePlan(value) {
  const plan = normalizeGamePlan(value);
  const active = {};
  for (const dimension of GAME_PLAN_DIMENSIONS) {
    if (plan[dimension.key] !== dimension.neutral) active[dimension.key] = plan[dimension.key];
  }
  return Object.keys(active).length ? active : null;
}

/**
 * Strict reader for the command boundary: a value the game does not know is
 * refused rather than quietly read as neutral.
 *
 * @returns {{ok: true, gamePlan: object|null} | {ok: false, error: string}}
 */
export function parseGamePlanRequest(value) {
  if (value == null) return { ok: true, gamePlan: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "The game plan must be a set of pace, lean and coverage choices." };
  }
  for (const [key, id] of Object.entries(value)) {
    if (!dimensionFor(key)) return { ok: false, error: `Unknown game plan setting: ${String(key).slice(0, 40)}.` };
    if (id == null) continue;
    if (typeof id !== "string" || !gamePlanOption(key, id)) {
      return { ok: false, error: `Unknown ${dimensionFor(key).label.toLowerCase()} choice: ${String(id).slice(0, 40)}.` };
    }
  }
  return { ok: true, gamePlan: activeGamePlan(value) };
}

/** "Hurry-up · Lean pass" — the non-neutral dials in plain words, or "". */
export function describeGamePlan(value) {
  const active = activeGamePlan(value);
  if (!active) return "";
  return GAME_PLAN_DIMENSIONS
    .filter((dimension) => active[dimension.key])
    .map((dimension) => `${dimension.label.toLowerCase()}: ${gamePlanOption(dimension.key, active[dimension.key]).label.toLowerCase()}`)
    .join(" · ");
}
