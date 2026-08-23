import { attachFrontOffices } from "./rivalFrontOffice.js";

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function pickValue(pick) {
  const yearPenalty = Math.max(0, Number(pick.year || 0) - Number(pick.baseYear || pick.year || 0));
  return Math.max(20, Math.round(420 - Number(pick.round || 7) * 48 - Number(pick.originalPickIndex || 16) * 2 - yearPenalty * 44));
}

export function buildOnClockFingerprint({ draft, slot, pick, scoutingBoard = [] } = {}) {
  if (!draft || !slot) return null;
  const payload = [
    draft.year,
    draft.currentPick,
    slot.pickId || "fallback",
    slot.teamId,
    pick?.ownerTeamId || slot.teamId,
    ...(draft.available || []).map((prospect) => prospect.id),
    "board",
    ...scoutingBoard
  ].join("|");
  return `oc-${stableHash(payload)}`;
}

export function buildOnClockTradeOffers({
  league = null,
  draft,
  slot,
  livePick,
  controlledTeamId,
  teams = [],
  futurePicks = [],
  scoutingBoard = [],
  rosterNeeds = () => [],
  limit = 3
} = {}) {
  if (!draft || draft.completed || slot?.teamId !== controlledTeamId || !livePick) return [];
  const fingerprint = buildOnClockFingerprint({ draft, slot, pick: livePick, scoutingBoard });
  const topProspects = (draft.available || []).slice(0, 12);
  const liveValue = pickValue(livePick);
  const declined = new Set(draft.declinedOnClockOffers?.[fingerprint] || []);

  const ranked = teams
    .filter((team) => team.id !== controlledTeamId)
    .map((team) => {
      const needs = rosterNeeds(team.id).filter((need) => Number(need.delta) < 0);
      const needByPosition = new Map(needs.map((need) => [need.position, Math.abs(Number(need.delta))]));
      const target = topProspects
        .map((prospect, index) => ({
          prospect,
          score: (needByPosition.get(prospect.position) || 0) * 100 + Math.max(0, 12 - index)
        }))
        .sort((a, b) => b.score - a.score || String(a.prospect.id).localeCompare(String(b.prospect.id)))[0];
      const assets = futurePicks
        .filter((pick) => pick.ownerTeamId === team.id && pick.consumed !== true && Number(pick.year) > Number(draft.year))
        .sort((a, b) => pickValue(b) - pickValue(a) || String(a.id).localeCompare(String(b.id)));
      const incoming = [];
      let value = 0;
      for (const asset of assets) {
        if (incoming.length >= 3 || value >= liveValue * 0.82) break;
        incoming.push(asset);
        value += pickValue(asset);
      }
      if (!incoming.length || value < liveValue * 0.62) return null;
      const need = target?.prospect?.position || "BPA";
      const id = `offer-${stableHash(`${fingerprint}|${team.id}|${incoming.map((pick) => pick.id).join("|")}`)}`;
      return {
        id,
        fingerprint,
        teamId: team.id,
        teamName: team.name || team.id,
        targetProspectId: target?.prospect?.id || null,
        targetPosition: need,
        livePick: { id: livePick.id, year: livePick.year, round: livePick.round, overall: draft.currentPick, value: liveValue },
        incomingPicks: incoming.map((pick) => ({ id: pick.id, year: pick.year, round: pick.round, originalTeamId: pick.originalTeamId, value: pickValue(pick) })),
        incomingValue: value,
        valueDelta: value - liveValue,
        rationale: `${team.name || team.id} is pursuing ${need} help while your room converts pick ${draft.currentPick} into future capital.`,
        counterAvailable: assets.length > incoming.length
      };
    })
    .filter((offer) => offer && !declined.has(offer.id))
    .sort((a, b) => {
      const aNeed = a.targetPosition === "BPA" ? 0 : 1;
      const bNeed = b.targetPosition === "BPA" ? 0 : 1;
      return bNeed - aNeed || Math.abs(a.valueDelta) - Math.abs(b.valueDelta) || a.teamId.localeCompare(b.teamId);
    })
    .slice(0, Math.max(0, Math.min(3, Number(limit) || 3)));

  // S94: draft day was the one negotiation with no face on the other side of it.
  // The offers are unchanged — this attaches WHO is calling, never what they are
  // willing to pay.
  return league ? attachFrontOffices(league, ranked) : ranked;
}

export function appendCounterPick(offer, futurePicks = []) {
  if (!offer?.counterAvailable) return null;
  const used = new Set(offer.incomingPicks.map((pick) => pick.id));
  const extra = futurePicks
    .filter((pick) => pick.ownerTeamId === offer.teamId && pick.consumed !== true && !used.has(pick.id) && Number(pick.year) > Number(offer.livePick.year))
    .sort((a, b) => pickValue(a) - pickValue(b) || String(a.id).localeCompare(String(b.id)))[0];
  if (!extra) return null;
  const extraView = { id: extra.id, year: extra.year, round: extra.round, originalTeamId: extra.originalTeamId, value: pickValue(extra) };
  return {
    ...offer,
    incomingPicks: [...offer.incomingPicks, extraView],
    incomingValue: offer.incomingValue + extraView.value,
    valueDelta: offer.valueDelta + extraView.value,
    countered: true,
    counterAvailable: false
  };
}
