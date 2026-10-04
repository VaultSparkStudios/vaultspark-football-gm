/**
 * Football sport pack (multi-sport Phase 1 steps 2-3): the rules, the match
 * engine and the stat schema, as one object the registry hands to the core.
 * The rules and the stat schema stay in their own modules so code the engine
 * itself imports can read them without pulling the engine back in.
 */
import { FOOTBALL_RULES } from "./rules.js";
import { FOOTBALL_STAT_SCHEMA } from "./statSchema.js";
import { simulateMatch } from "../../engine/gameSimulator.js";

export const FOOTBALL_PACK = Object.freeze({
  ...FOOTBALL_RULES,
  // The stat shape, table categories, derived rates and labels (statSchema.js).
  stats: FOOTBALL_STAT_SCHEMA,
  // Returns a MatchOutput (src/sport/matchEngineContract.js); never writes stats.
  match: Object.freeze({ simulate: simulateMatch })
});
