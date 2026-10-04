/**
 * Football's competition format (multi-sport Phase 1 steps 5-6). See
 * src/sport/competitionContract.js for the shape the core calls.
 *
 * The regular season is the NFL scheduling formula (src/engine/schedule.js);
 * the postseason is the seven-seed conference bracket and neutral-site final
 * (postseason.js).
 */
import { buildSeasonSchedule } from "../../engine/schedule.js";
import { FOOTBALL_POSTSEASON } from "./postseason.js";

export const FOOTBALL_COMPETITION = Object.freeze({
  buildSchedule: buildSeasonSchedule,
  postseason: FOOTBALL_POSTSEASON
});