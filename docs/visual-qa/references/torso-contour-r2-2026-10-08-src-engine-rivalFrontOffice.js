/**
 * One front-office identity, shaped for every seam a rival acts against you.
 *
 * S94 audit, narrowed twice by verification before it was built. The original
 * claim was "personas are invisible": false. `rivalTradeOffers` already attaches
 * `gmName` and `gmLine` to every inbound offer, and `beatReporter`'s free-agency
 * outbid receipt names the winning GM in both its memory entry and its headline.
 * Two real gaps survived that check:
 *
 *   1. `onClockTradeMarket` imports nothing from `rivalGmPersona`, so the single
 *      highest-pressure negotiation in the game — a rival calling while you are
 *      on the clock — arrives from a team id and a value delta. Draft day is the
 *      one place a front office should have a face, and it is the one place it
 *      has none.
 *   2. `buildPersonaIntel` — the tendency read that lets you form a model of an
 *      opponent BEFORE you negotiate — surfaces only through a "Load Archetypes"
 *      button in the Scouting tab. Intel you must remember to fetch is intel you
 *      do not have at the moment you need it.
 *
 * This module is the shared shape both seams render. It is strictly derived:
 * it reads persona and memory and returns presentation, and — like the persona
 * system it wraps (see rivalGmPersona.js) — it never grants or removes a single
 * point of on-field value. Nothing here can change an outcome.
 */

import { buildPersonaIntel } from "./rivalGmPersona.js";

/** How much of a rival's memory of you is worth showing at a negotiation. */
const RECENT_DEALINGS = 3;

/**
 * A rival club's front office as the player meets it.
 *
 * `dealings` is the honest count of receipted interactions, not a relationship
 * score: this system records what happened and declines to summarise it into a
 * number that would imply a mechanic that does not exist.
 */
export function buildFrontOfficeCard(league, teamId) {
  if (!league || !teamId) return null;
  const { persona, memory, line } = buildPersonaIntel(league, teamId);
  const team = (league.teams || []).find((row) => row.id === teamId);
  return {
    teamId,
    teamName: team?.name || teamId,
    gmName: persona.name,
    style: persona.style,
    traits: [...persona.traits],
    line,
    dealings: memory.length,
    recentDealings: memory.slice(-RECENT_DEALINGS).map((entry) => ({
      type: entry.type,
      year: entry.year,
      summary: entry.summary
    }))
  };
}

/**
 * Attach a front-office card to each row of an offer list, in place of the
 * caller having to know how personas work. Returns a new array; rows without a
 * resolvable team are passed through untouched rather than dropped, because an
 * offer you cannot attribute is still an offer you can accept.
 */
export function attachFrontOffices(league, offers = []) {
  if (!Array.isArray(offers)) return [];
  return offers.map((offer) => {
    if (!offer?.teamId) return offer;
    const frontOffice = buildFrontOfficeCard(league, offer.teamId);
    return frontOffice ? { ...offer, frontOffice } : offer;
  });
}
