/**
 * Sport registry (S116). The core asks for "the rules of this league's sport";
 * only this file knows which packs exist. A league without a sport id is
 * football, so every save made before the multi-sport work resolves exactly as
 * it did.
 */
import { FOOTBALL_RULES } from "./football/rules.js";

export const DEFAULT_SPORT_ID = "football";

const SPORTS = Object.freeze({ football: FOOTBALL_RULES });

export function getSportRules(sportId = DEFAULT_SPORT_ID) {
  const rules = SPORTS[sportId || DEFAULT_SPORT_ID];
  if (!rules) throw new Error(`Unknown sport "${sportId}". Registered: ${Object.keys(SPORTS).join(", ")}`);
  return rules;
}

export function listSports() {
  return Object.values(SPORTS).map(({ id, displayName }) => ({ id, displayName }));
}
