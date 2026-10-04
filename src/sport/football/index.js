/**
 * Football sport pack (multi-sport Phase 1 step 2): the rules plus the match
 * engine, as one object the registry hands to the core. The rules stay in
 * rules.js so modules the engine itself imports can read them without pulling
 * the engine back in.
 */
import { FOOTBALL_RULES } from "./rules.js";
import { simulateMatch } from "../../engine/gameSimulator.js";

export const FOOTBALL_PACK = Object.freeze({
  ...FOOTBALL_RULES,
  // Returns a MatchOutput (src/sport/matchEngineContract.js); never writes stats.
  match: Object.freeze({ simulate: simulateMatch })
});
