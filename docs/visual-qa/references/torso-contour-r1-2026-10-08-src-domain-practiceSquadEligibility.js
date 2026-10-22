// NFL2026 amended eligibility. Service counts missing from historical saves
// use a disclosed simulation proxy; appearance/birthplace never enters here.
import { playerServiceCount } from './playerService.js';
export const PRACTICE_ELIGIBILITY_VERSION = "nfl-practice-groups-2026-v1";

export function practiceEligibilityGroup(player) {
  const service = playerServiceCount(player, 'accrued');
  const accruedSeasons = service.seasons;
  const activeGames = player.serviceHistory?.loneAccruedSeasonActiveGames;
  const group = accruedSeasons === 0 || (accruedSeasons === 1 && Number.isInteger(activeGames) && activeGames >= 0 && activeGames < 9)
    ? "inexperienced" : accruedSeasons <= 2 ? "restricted" : "unrestricted";
  return { group, accruedSeasons, provenance: service.provenance };
}

export function practiceEligibilityMode(settings = {}) {
  const experienceLimit = settings.practiceSquadExperienceLimit ?? 2;
  return { mode: (!settings.rulesPreset || settings.rulesPreset === "standard") && experienceLimit === 2
    ? PRACTICE_ELIGIBILITY_VERSION : "configured-experience-variant", experienceLimit };
}

export function validatePracticeSquadAddition({ players, player, settings = {}, capacity = 16 }) {
  const others = players.filter(existing => existing.id !== player.id);
  if (others.length >= capacity) return { ok: false, reasonCode: "PRACTICE_SQUAD_FULL", error: "Practice squad full." };
  const mode = practiceEligibilityMode(settings);
  const service = practiceEligibilityGroup(player);
  if (mode.mode === "configured-experience-variant") {
    if (Number(player.experience || 0) > mode.experienceLimit) return { ok: false,
      reasonCode: "PRACTICE_EXPERIENCE_VARIANT", error: `Configured practice-squad limit is ${mode.experienceLimit} years experience.` };
    return { ok: true, ...mode, service };
  }
  const groups = [...others, player].map(practiceEligibilityGroup);
  const experienced = groups.filter(entry => entry.group !== "inexperienced").length;
  const unrestricted = groups.filter(entry => entry.group === "unrestricted").length;
  if (unrestricted > 6) return { ok: false, reasonCode: "PRACTICE_VETERAN_LIMIT", error: "Practice squad permits at most six unrestricted-experience players." };
  if (experienced > 10) return { ok: false, reasonCode: "PRACTICE_EXPERIENCED_LIMIT", error: "Practice squad permits at most ten restricted and unrestricted experienced players combined." };
  return { ok: true, ...mode, service, experienced, unrestricted };
}

export function selectEligiblePracticeSquad(players, settings = {}) {
  const selected = [], rejected = [];
  for (const player of players) {
    if (validatePracticeSquadAddition({ players: selected, player, settings }).ok) selected.push(player);
    else rejected.push(player);
  }
  return { selected, rejected };
}
