/**
 * Sport registry (S116). The core asks for "the rules of this league's sport";
 * only this file knows which packs exist. A league without a sport id is
 * football, so every save made before the multi-sport work resolves exactly as
 * it did.
 */
import { FOOTBALL_PACK } from "./football/index.js";

export const DEFAULT_SPORT_ID = "football";

// Built on first use, not at load: the football pack carries the match engine,
// and the engine's own imports reach modules that read this registry, so an
// eager table would be read before the pack finished loading.
let SPORTS = null;
function sports() {
  if (!SPORTS) SPORTS = Object.freeze({ football: FOOTBALL_PACK });
  return SPORTS;
}

// Packs added at runtime (a second sport under development, or a test's toy
// pack). Built-in packs cannot be replaced.
const REGISTERED = new Map();

export function getSportRules(sportId = DEFAULT_SPORT_ID) {
  const id = sportId || DEFAULT_SPORT_ID;
  const rules = sports()[id] || REGISTERED.get(id);
  if (!rules) throw new Error(`Unknown sport "${sportId}". Registered: ${listSports().map((sport) => sport.id).join(", ")}`);
  return rules;
}

export function listSports() {
  return [...Object.values(sports()), ...REGISTERED.values()].map(({ id, displayName }) => ({ id, displayName }));
}

/**
 * Registers a sport pack under `pack.id` and returns a function that removes
 * it again (tests share one process, so they must unregister what they add).
 */
export function registerSport(pack) {
  const id = pack?.id;
  if (typeof id !== "string" || !id) throw new Error("A sport pack needs a string id");
  if (sports()[id] || REGISTERED.has(id)) throw new Error(`Sport "${id}" is already registered`);
  REGISTERED.set(id, pack);
  return () => {
    if (REGISTERED.get(id) === pack) REGISTERED.delete(id);
  };
}
