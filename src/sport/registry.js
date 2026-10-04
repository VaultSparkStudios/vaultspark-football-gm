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

export function getSportRules(sportId = DEFAULT_SPORT_ID) {
  const rules = sports()[sportId || DEFAULT_SPORT_ID];
  if (!rules) throw new Error(`Unknown sport "${sportId}". Registered: ${Object.keys(sports()).join(", ")}`);
  return rules;
}

export function listSports() {
  return Object.values(sports()).map(({ id, displayName }) => ({ id, displayName }));
}
