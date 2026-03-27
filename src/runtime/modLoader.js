/**
 * Mod Loader — Public Plugin/Configuration API
 *
 * Allows users to supply a JSON mod definition at league creation time.
 * Mods can override: rule sets, stat weights, era profiles, team names,
 * cap limits, draft class sizes, and challenge presets.
 *
 * Schema version: 1
 *
 * Example mod JSON:
 * {
 *   "schemaVersion": 1,
 *   "name": "1990s Iron Defense Era",
 *   "description": "Brutal defensive era — low scoring, physical play, small passing game",
 *   "overrides": {
 *     "capHardLimit": 34000000,
 *     "seasonGames": 16,
 *     "draftClassSize": 336,
 *     "statWeights": { "passingTd": 0.7, "rushingYards": 1.3 },
 *     "simModifiers": { "passCompletionBase": -0.08, "rushYardsBase": 0.12 },
 *     "challengeFlags": { "noSalaryGuarantees": true }
 *   }
 * }
 */

const MOD_SCHEMA_VERSION = 1;

// ── Validation ────────────────────────────────────────────────────────────────

const ALLOWED_OVERRIDE_KEYS = new Set([
  "capHardLimit",
  "seasonGames",
  "draftClassSize",
  "draftRounds",
  "rosterSize",
  "practiceSquadSize",
  "statWeights",
  "simModifiers",
  "challengeFlags",
  "teamNameOverrides",
  "eraLabel",
  "eraDescription"
]);

export function validateMod(modJson) {
  const errors = [];
  if (!modJson || typeof modJson !== "object") {
    errors.push("Mod must be a JSON object.");
    return { valid: false, errors };
  }
  if (modJson.schemaVersion !== MOD_SCHEMA_VERSION) {
    errors.push(`Unsupported mod schema version: ${modJson.schemaVersion}. Expected: ${MOD_SCHEMA_VERSION}.`);
  }
  if (!modJson.name || typeof modJson.name !== "string") {
    errors.push("Mod must have a string 'name' field.");
  }
  if (modJson.overrides && typeof modJson.overrides !== "object") {
    errors.push("'overrides' must be an object.");
  }
  const overrides = modJson.overrides || {};
  for (const key of Object.keys(overrides)) {
    if (!ALLOWED_OVERRIDE_KEYS.has(key)) {
      errors.push(`Unknown override key: '${key}'. Allowed: ${[...ALLOWED_OVERRIDE_KEYS].join(", ")}.`);
    }
  }
  // Type checks on known numeric fields
  for (const field of ["capHardLimit", "seasonGames", "draftClassSize", "draftRounds", "rosterSize", "practiceSquadSize"]) {
    if (overrides[field] !== undefined && typeof overrides[field] !== "number") {
      errors.push(`Override '${field}' must be a number.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── Apply mod to league config ────────────────────────────────────────────────

export function applyMod(leagueConfig, mod) {
  if (!mod || !mod.overrides) return leagueConfig;
  const cfg = { ...leagueConfig };
  const o = mod.overrides;

  if (typeof o.capHardLimit === "number") cfg.capHardLimit = o.capHardLimit;
  if (typeof o.seasonGames === "number") cfg.seasonGames = o.seasonGames;
  if (typeof o.draftClassSize === "number") cfg.draftClassSize = o.draftClassSize;
  if (typeof o.draftRounds === "number") cfg.draftRounds = o.draftRounds;
  if (typeof o.rosterSize === "number") cfg.rosterSize = o.rosterSize;
  if (typeof o.practiceSquadSize === "number") cfg.practiceSquadSize = o.practiceSquadSize;
  if (o.eraLabel) cfg.eraLabel = o.eraLabel;
  if (o.eraDescription) cfg.eraDescription = o.eraDescription;
  if (o.statWeights) cfg.statWeights = { ...(cfg.statWeights || {}), ...o.statWeights };
  if (o.simModifiers) cfg.simModifiers = { ...(cfg.simModifiers || {}), ...o.simModifiers };
  if (o.challengeFlags) cfg.challengeFlags = { ...(cfg.challengeFlags || {}), ...o.challengeFlags };
  if (o.teamNameOverrides) cfg.teamNameOverrides = { ...(cfg.teamNameOverrides || {}), ...o.teamNameOverrides };

  cfg._activeMod = { name: mod.name, description: mod.description || "" };
  return cfg;
}

// ── Built-in reference mods ───────────────────────────────────────────────────

export const BUILTIN_MODS = {
  "custom-era-1990s": {
    schemaVersion: 1,
    name: "Iron Defense Era (1990s)",
    description: "Hard-nosed defensive football. Low cap, physical play, ground game dominates.",
    overrides: {
      capHardLimit: 34_000_000,
      seasonGames: 16,
      eraLabel: "1990s",
      eraDescription: "A defensive era before the pass-happy rules opened the game up.",
      simModifiers: { passCompletionBase: -0.08, rushYardsBase: 0.10, sackRateBase: 0.04 },
      statWeights: { passingTd: 0.7, rushingYards: 1.3 }
    }
  },
  "custom-era-2010s-pass": {
    schemaVersion: 1,
    name: "Air-Raid Era (2010s)",
    description: "Passing game rules. Spread concepts. YPA records every season.",
    overrides: {
      capHardLimit: 155_000_000,
      seasonGames: 16,
      eraLabel: "2010s",
      eraDescription: "Quarterback-driven era. Scheme complexity at its peak.",
      simModifiers: { passCompletionBase: 0.05, rushYardsBase: -0.06 },
      statWeights: { passingYards: 1.2, passingTd: 1.2, rushingYards: 0.85 }
    }
  },
  "custom-challenge-rebuild": {
    schemaVersion: 1,
    name: "Full Rebuild Challenge",
    description: "No free agent signings. Draft only. Can you build from scratch?",
    overrides: {
      challengeFlags: { noFreeAgency: true, noTradeForVeterans: true },
      eraLabel: "Rebuild",
      eraDescription: "Draft and develop. No shortcuts."
    }
  }
};

// ── Parse mod from user-supplied JSON string ──────────────────────────────────

export function parseModFromString(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const { valid, errors } = validateMod(parsed);
    if (!valid) return { mod: null, errors };
    return { mod: parsed, errors: [] };
  } catch (err) {
    return { mod: null, errors: [`Invalid JSON: ${err.message}`] };
  }
}
