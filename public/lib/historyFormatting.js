import { state } from "./appState.js";

export function formatAwardList(list = []) {
  return (list || []).map((entry) => `${entry.player} (${entry.team})`).join(", ");
}

export function hallOfFameCareerLine(entry) {
  const stats = entry.careerStats || {};
  if (entry.pos === "QB") return `${stats.passing?.yards || 0} pass yds, ${stats.passing?.td || 0} pass TD`;
  if (entry.pos === "RB") return `${stats.rushing?.yards || 0} rush yds, ${stats.rushing?.td || 0} rush TD`;
  if (entry.pos === "WR" || entry.pos === "TE") return `${stats.receiving?.yards || 0} rec yds, ${stats.receiving?.td || 0} rec TD`;
  if (entry.pos === "K") return `${stats.kicking?.fgm || 0} FGM, ${stats.kicking?.xpm || 0} XPM`;
  if (entry.pos === "P") return `${stats.punting?.punts || 0} punts, ${stats.punting?.in20 || 0} in20`;
  return `${stats.defense?.tackles || 0} tackles, ${stats.defense?.sacks || 0} sacks, ${stats.defense?.int || 0} INT`;
}

export function awardCountLine(awardCounts = {}) {
  const pairs = [
    ["MVP", awardCounts.MVP || 0], ["OPOY", awardCounts.OPOY || 0], ["DPOY", awardCounts.DPOY || 0],
    ["All-Pro 1", awardCounts.AllPro1 || 0], ["All-Pro 2", awardCounts.AllPro2 || 0],
    ["Pro Bowl", awardCounts.ProBowl || 0],
    ["ROY", (awardCounts.OROY || 0) + (awardCounts.DROY || 0) + (awardCounts.ROY || 0)],
    ["CPOY", awardCounts.CPOY || 0], ["Most Improved", awardCounts.MostImproved || 0]
  ].filter(([, value]) => value > 0);
  return pairs.length ? pairs.map(([label, value]) => `${label} ${value}`).join(" | ") : "No major awards logged";
}

export function hallOfFamePolicyLine(settings = state.leagueSettings || state.dashboard?.settings || {}) {
  return `Score ${settings.hallOfFameInductionScoreMin ?? 450} | Wait ${settings.hallOfFameYearsRetiredMin ?? 0}y | Class ${settings.hallOfFameMaxClassSize ?? 6}/yr`;
}

export function retiredNumberPolicyLine(settings = state.leagueSettings || state.dashboard?.settings || {}) {
  const parts = [settings.retiredNumberRequireRetiredPlayer !== false ? "Retired only" : "Active allowed"];
  if (settings.retiredNumberRequireHallOfFame === true) parts.push("Hall required");
  if (Number(settings.retiredNumberCareerAvMin || 0) > 0) parts.push(`AV ${settings.retiredNumberCareerAvMin}+`);
  return parts.join(" | ");
}
