/**
 * gmArchetype.js — one classifier for the "League GM Archetypes" table (S113).
 *
 * The server and the in-browser runtime each carried a copy that read
 * `team.roster` and `team.capSummary`, two fields a league team never has, so
 * every club in every league fell through to "Loyalty". This version reads what
 * actually exists: the club's strategy profile (the same one that prices its
 * trades), active roster age, rating, cap usage and persistent negotiating
 * traits. The latter distinguish otherwise balanced clubs without a quota.
 */

import { getRivalGmPersona } from "./rivalGmPersona.js";

const ARCHETYPES = Object.freeze({
  "Win-Now": { label: "Win-Now", description: "Aggressive veteran acquisitions, mortgages the future.", icon: "🔥" },
  Moneyball: { label: "Moneyball", description: "Builds through analytics, cheap young talent, draft-first.", icon: "📊" },
  "Gut-Feel": { label: "Gut-Feel", description: "Pays for star names, trusts instinct over data.", icon: "🎲" },
  Loyalty: { label: "Loyalty", description: "Extends core players, rewards homegrown talent.", icon: "🤝" }
});

export function classifyGmArchetype({ strategyProfile = "balanced", avgAge = 27, overall = 75, usedCap = 0, salaryCap = 0, traits = [] } = {}) {
  const capUse = salaryCap > 0 ? usedCap / salaryCap : 0;
  if (strategyProfile === "win-now" || strategyProfile === "contender" || (avgAge > 28 && overall > 80)) return { ...ARCHETYPES["Win-Now"] };
  if (strategyProfile === "rebuild" || (avgAge < 25.5 && overall < 79)) return { ...ARCHETYPES.Moneyball };
  if (strategyProfile === "retool" || capUse >= 0.97) return { ...ARCHETYPES["Gut-Feel"] };
  // Balanced clubs still have persistent negotiating preferences. Read the
  // same persona traits used by trade valuation rather than giving every
  // similarly aged, affordable roster the same fallback personality.
  const preferences = new Set(Array.isArray(traits) ? traits : []);
  if (preferences.has("guards the cap like a vault") || preferences.has("won't move future firsts") || preferences.has("hunts contract-year bargains")) return { ...ARCHETYPES.Moneyball };
  if (preferences.has("overpays for proven playoff tape")) return { ...ARCHETYPES["Win-Now"] };
  if (preferences.has("treats the deadline like a holiday") || preferences.has("bids late and hard in free agency")) return { ...ARCHETYPES["Gut-Feel"] };
  return { ...ARCHETYPES.Loyalty };
}

/** Classify a league team from a GameSession, reading real roster and cap state. */
export function deriveSessionGmArchetype(session, team) {
  const roster = (session?.league?.players || []).filter((player) => player.teamId === team?.id && player.status === "active");
  const avgAge = roster.length ? roster.reduce((sum, player) => sum + Number(player.age || 26), 0) / roster.length : 27;
  const cap = typeof session?.getTeamCapSummary === "function" ? session.getTeamCapSummary(team.id) : null;
  return classifyGmArchetype({
    strategyProfile: team?.strategyProfile || "balanced",
    avgAge,
    overall: Number(team?.overallRating || 75),
    traits: getRivalGmPersona(session?.league, team?.id).traits,
    usedCap: Number(cap?.usedCap || 0),
    salaryCap: Number(cap?.salaryCap || 0)
  });
}
