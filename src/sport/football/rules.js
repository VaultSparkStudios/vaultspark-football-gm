/**
 * Football's sport rules (S116, multi-sport Phase 1 step 1).
 *
 * The values are the existing football constants, re-exported through one
 * object so the core reads "the active sport's rules" instead of NFL
 * literals. Moving a constant here changes nothing about how football plays;
 * the golden master (scripts/golden-master.mjs) is the proof.
 */
import { NFL_STRUCTURE, TEAM_METADATA } from "../../config.js";

export const FOOTBALL_RULES = Object.freeze({
  id: "football",
  displayName: "Football",
  structure: NFL_STRUCTURE,
  teams: TEAM_METADATA,
  draft: Object.freeze({ rounds: 7 })
});
