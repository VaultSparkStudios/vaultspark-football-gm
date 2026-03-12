import fs from "node:fs";
import path from "node:path";
import { PFR_RECENT_WEIGHTED_PROFILE } from "../stats/profiles/pfrRecentWeightedProfile.js";
import { PFR_CAREER_WEIGHTED_PROFILE } from "../stats/profiles/pfrCareerWeightedProfile.js";

function loadProfile(profilePath, fallbackProfile) {
  if (!profilePath) return fallbackProfile;
  const resolved = path.resolve(profilePath);
  if (!fs.existsSync(resolved)) return fallbackProfile;
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
    return raw && raw.positions ? raw : fallbackProfile;
  } catch {
    return fallbackProfile;
  }
}

export function loadSeasonRealismProfile(profilePath = null) {
  return loadProfile(profilePath, PFR_RECENT_WEIGHTED_PROFILE);
}

export function loadCareerRealismProfile(profilePath = null) {
  return loadProfile(profilePath, PFR_CAREER_WEIGHTED_PROFILE);
}
