import { clamp } from "../utils/rng.js";
import { recalculateAllTeamRatings } from "../domain/teamFactory.js";
import { CHALLENGE_MODES, DEFAULT_LEAGUE_SETTINGS, FRANCHISE_ARCHETYPES, getLeagueConfigSummary } from "../config/leagueSetup.js";

function teamById(league, teamId) {
  return league?.teams?.find((team) => team.id === teamId) || null;
}

function activeRosterPlayers(league, teamId) {
  return (league?.players || [])
    .filter((player) => player.teamId === teamId && (player.rosterSlot || "active") === "active")
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));
}

export function applyInitialLeagueSetup(session, teamId = session?.controlledTeamId) {
  if (!session?.league || !teamId) return null;
  const settings = session.getLeagueSettings();
  const archetype =
    FRANCHISE_ARCHETYPES[settings.franchiseArchetype] || FRANCHISE_ARCHETYPES[DEFAULT_LEAGUE_SETTINGS.franchiseArchetype];
  const challenge =
    CHALLENGE_MODES[settings.challengeMode] || CHALLENGE_MODES[DEFAULT_LEAGUE_SETTINGS.challengeMode];
  const team = teamById(session.league, teamId);
  if (!team) return null;

  if (archetype.strategyProfile) team.strategyProfile = archetype.strategyProfile;
  if (!Number.isFinite(team.chemistry)) team.chemistry = 70;
  team.chemistry = clamp(team.chemistry + Number(archetype.chemistryDelta || 0), 35, 99);

  team.owner = team.owner || {
    marketSize: 1,
    ticketPrice: 120,
    fanInterest: 70,
    cash: 150_000_000,
    staffBudget: 28_000_000,
    facilities: { training: 72, rehab: 72, analytics: 72 }
  };
  const owner = team.owner;
  const ownerAdjustments = archetype.ownerAdjustments || {};
  owner.fanInterest = clamp(Math.round((owner.fanInterest || 70) + Number(ownerAdjustments.fanInterest || 0)), 20, 100);
  owner.cash = Math.round((owner.cash || 0) + Number(ownerAdjustments.cash || 0));
  owner.staffBudget = Math.max(5_000_000, Math.round((owner.staffBudget || 0) + Number(ownerAdjustments.staffBudget || 0)));
  owner.ticketPrice = Math.max(25, Math.round((owner.ticketPrice || 0) + Number(ownerAdjustments.ticketPrice || 0)));
  owner.facilities = owner.facilities || { training: 72, rehab: 72, analytics: 72 };
  if (archetype.facilitiesAdjustments) {
    owner.facilities.training = clamp(
      Math.round((owner.facilities.training || 72) + Number(archetype.facilitiesAdjustments.training || 0)),
      40,
      99
    );
    owner.facilities.rehab = clamp(
      Math.round((owner.facilities.rehab || 72) + Number(archetype.facilitiesAdjustments.rehab || 0)),
      40,
      99
    );
    owner.facilities.analytics = clamp(
      Math.round((owner.facilities.analytics || 72) + Number(archetype.facilitiesAdjustments.analytics || 0)),
      40,
      99
    );
  }

  const challengePatience =
    typeof challenge.patch?.ownerPatience === "number" ? challenge.patch.ownerPatience : settings.ownerPatience;
  owner.patience = clamp(Number(challengePatience) + Number(archetype.ownerPatienceDelta || 0), 0.05, 0.95);
  owner.priorities = {
    championships: settings.ownerMandateWinNow === true || archetype.ownerMandateWinNow === true ? 92 : 76,
    loyalty: settings.enableOwnerMode ? 68 : 58,
    profit: settings.smallMarketMode ? 88 : 66,
    patience: Math.round(owner.patience * 100)
  };

  if (settings.smallMarketMode) {
    owner.marketSize = Number((Math.max(0.65, (owner.marketSize || 1) * 0.82)).toFixed(2));
    owner.cash = Math.round(owner.cash - 12_000_000);
    owner.staffBudget = Math.max(5_000_000, Math.round(owner.staffBudget - 4_000_000));
    owner.fanInterest = clamp(owner.fanInterest - 6, 20, 100);
  }

  const roster = activeRosterPlayers(session.league, teamId);
  for (const player of roster) {
    player.morale = clamp((player.morale || 72) + Number(archetype.moraleDelta || 0), 35, 99);
  }

  if (archetype.ageVeteransBy) {
    roster
      .slice()
      .sort((a, b) => (b.age || 0) - (a.age || 0))
      .slice(0, 10)
      .forEach((player) => {
        player.age = Math.min(41, (player.age || 26) + archetype.ageVeteransBy);
      });
  }

  if (archetype.qbOverallPenalty) {
    roster
      .filter((player) => player.position === "QB")
      .slice(0, 2)
      .forEach((player) => {
        player.overall = Math.max(45, (player.overall || 60) - archetype.qbOverallPenalty);
        if (player.ratings) {
          player.ratings.throwAccuracy = Math.max(40, (player.ratings.throwAccuracy || 60) - Math.round(archetype.qbOverallPenalty * 0.8));
          player.ratings.awareness = Math.max(40, (player.ratings.awareness || 60) - Math.round(archetype.qbOverallPenalty * 0.7));
        }
      });
  }

  if (archetype.deadCapCurrentYear || archetype.deadCapNextYear) {
    session.league.capLedger[teamId] = session.league.capLedger[teamId] || {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    session.league.capLedger[teamId].deadCapCurrentYear += Number(archetype.deadCapCurrentYear || 0);
    session.league.capLedger[teamId].deadCapNextYear += Number(archetype.deadCapNextYear || 0);
  }

  session.league.startScenario = {
    teamId,
    franchiseArchetype: settings.franchiseArchetype,
    difficultyPreset: settings.difficultyPreset,
    rulesPreset: settings.rulesPreset,
    challengeMode: settings.challengeMode,
    appliedAtYear: session.currentYear,
    appliedAtWeek: session.currentWeek,
    summary: getLeagueConfigSummary(settings)
  };

  session.logNews(`Scenario loaded: ${archetype.label}`, {
    teamId,
    franchiseArchetype: settings.franchiseArchetype,
    difficultyPreset: settings.difficultyPreset,
    challengeMode: settings.challengeMode
  });

  recalculateAllTeamRatings(session.league);
  return session.league.startScenario;
}
