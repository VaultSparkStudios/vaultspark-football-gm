import { clamp, derivedRng } from "../utils/rng.js";
import { resolvePlayerMeasurements } from "./playerMeasurements.js";

// Explicit fictional physical-testing priors, not fitted NFL regressions.
// Ratings describe separate physical capacities; technique/endurance and an
// event-day residual prevent a workout from revealing an exact hidden rating.
export const WORKOUT_MODEL_VERSION = "fictional-athletic-workouts-v1";
export const WORKOUT_UNITS = Object.freeze({ forty: "seconds", tenYardSplit: "seconds",
  shuttle: "seconds", cone: "seconds", vertical: "inches", broad: "inches", bench: "repetitions" });
const round = (value, precision = 100) => Math.round(value * precision) / precision;
const physical = (player, key) => {
  const value = player?.ratings?.[key];
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? clamp(Number(value), 40, 99) : null;
};

export function generatePlayerWorkout(player, { year = null, kind = "combine", date = null, missing = [] } = {}) {
  // Stable player ID, never race, birthplace, name, complexion or facial seed.
  const seed = `${player?.id || "anonymous"}:${year ?? "unknown"}:${kind}:${date ?? "undated"}`;
  const channel = key => derivedRng(`workout:${seed}:${key}`);
  const deviation = (key, spread) => channel(key).float(-spread, spread);
  const speed = physical(player, "speed"), acceleration = physical(player, "acceleration");
  const agility = physical(player, "agility"), jumping = physical(player, "jumping"), strength = physical(player, "strength");
  const measurements = resolvePlayerMeasurements(player);
  const launch = deviation("launch", .045), power = deviation("jump-technique", 1.5);
  const forty = speed === null || acceleration === null ? null
    : round(clamp(6.30 - .016 * speed - .005 * acceleration + launch + deviation("sprint", .075), 4.20, 6.10));
  const arm = measurements.values.armLengthInches;
  const leverage = arm === null ? 0 : clamp((arm - 33) * .6, -2, 2);
  const results = {
    forty,
    tenYardSplit: forty === null ? null
      : round(clamp(.65 + .22 * forty + .004 * (70 - acceleration) + launch + deviation("split", .035), 1.40, Math.min(2.20, forty * .48))),
    shuttle: agility === null || acceleration === null ? null
      : round(clamp(5.50 - .016 * agility - .002 * acceleration + launch + deviation("shuttle", .10), 3.75, 5.50)),
    cone: agility === null || acceleration === null ? null
      : round(clamp(9.45 - .023 * agility - .004 * acceleration + launch + deviation("cone", .15), 6.30, 9.00)),
    vertical: jumping === null || acceleration === null ? null
      : round(clamp(11 + .29 * jumping + .045 * acceleration + power + deviation("vertical", 1), 20, 46), 2),
    broad: jumping === null || acceleration === null ? null
      : Math.round(clamp(64 + .65 * jumping + .14 * acceleration + power * 2 + deviation("broad", 2), 90, 146)),
    bench: strength === null ? null
      : Math.round(clamp(-14 + .52 * strength - leverage + deviation("endurance-training", 5) + deviation("bench", 2), 0, 49))
  };
  for (const key of missing) if (Object.hasOwn(results, key)) results[key] = null;
  // A split cannot be reported when the sprint was not performed.
  if (results.forty === null) results.tenYardSplit = null;
  return { ...results, version: WORKOUT_MODEL_VERSION,
    event: { kind, year, date, provenance: "fictional-generated", coefficients: "creative-priors-not-empirically-fitted" },
    units: WORKOUT_UNITS, measurements,
    participation: Object.fromEntries(Object.keys(WORKOUT_UNITS).map(key => [key, results[key] === null ? "not-recorded" : "recorded"])) };
}
