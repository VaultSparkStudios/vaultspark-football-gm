import fs from "node:fs";
import path from "node:path";
import { normalizePfrPlayers } from "../data/pfrAdapter.js";
import { RNG } from "../utils/rng.js";
import { RNGStreams } from "../utils/rngStreams.js";
import { GameSession } from "./GameSession.js";
import { loadCareerRealismProfile, loadSeasonRealismProfile } from "./profileLoader.js";
import { migrateSnapshot } from "./snapshotMigration.js";

export function loadImportedPlayersFromPfrPath(pfrPath, rng, startYear) {
  if (!pfrPath) return [];
  const absolute = path.resolve(pfrPath);
  if (!fs.existsSync(absolute)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
    return normalizePfrPlayers(raw, rng, startYear);
  } catch {
    return [];
  }
}

export function createSession({
  seed = Date.now(),
  startYear = new Date().getFullYear(),
  mode = "drive",
  pfrPath = null,
  realismProfilePath = null,
  careerRealismProfilePath = null,
  controlledTeamId = "BUF"
} = {}) {
  const rng = new RNG(seed);
  const rngStreams = new RNGStreams(seed, RNG);
  const importedPlayers = loadImportedPlayersFromPfrPath(pfrPath, rng, startYear);
  const realismProfile = loadSeasonRealismProfile(realismProfilePath);
  const careerRealismProfile = loadCareerRealismProfile(careerRealismProfilePath);
  return new GameSession({
    rng,
    rngStreams,
    startYear,
    mode,
    importedPlayers,
    controlledTeamId,
    realismProfile,
    careerRealismProfile
  });
}

export function createSessionFromSnapshot(snapshot) {
  return GameSession.fromSnapshot(migrateSnapshot(snapshot), (seed) => new RNG(seed));
}
