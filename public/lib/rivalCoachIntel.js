// Rival coach intelligence — 3 pre-game tendency lines keyed to opponent GM archetype.
// Works browser-side with archetype labels from /api/team-archetypes.

const ARCHETYPE_INTEL = {
  Moneyball: {
    icon: "📊",
    tendencies: [
      "Scheme-first offense — exploits zone coverages with route combinations over raw athleticism.",
      "Disciplined rotations — sub-package chess keeps their defensive talent gaps hidden.",
      "Cap-conscious GM — rarely bids against themselves; trades are patient, not panic-driven."
    ]
  },
  "Win-Now": {
    icon: "🔥",
    tendencies: [
      "Veteran-stacked roster — physicality at premium positions, especially on the offensive line.",
      "Fast-start offense — engineered to win the first two drives and force you to chase.",
      "Depth thins in the fourth — make it a grind and the rotational dropoff becomes a factor."
    ]
  },
  "Gut-Feel": {
    icon: "🎲",
    tendencies: [
      "Cap-stretched depth — elite skill position talent, but the third string will show it.",
      "Star-reliant offense — neutralize their top weapon and the play-design options shrink fast.",
      "Week-to-week scheme variance — don't trust last week's film as the full story."
    ]
  },
  Loyalty: {
    icon: "🤝",
    tendencies: [
      "Homegrown chemistry — players anticipate each other's reads; miscommunication is rare.",
      "Conservative base scheme — film is reliable; what they ran last week they'll run again.",
      "Slow mid-game adjustments — exploit a mismatch in the first half, expect it to stay open."
    ]
  }
};

const HEAT_NOTES = {
  high: "Rivalry heat is elevated — they will treat this like a playoff game regardless of record.",
  medium: "Some history between these franchises — expect extra emotional motivation.",
  low: null
};

export function buildRivalCoachIntel(archetypeLabel, rivalryHeat, teamOvr) {
  const intel = ARCHETYPE_INTEL[archetypeLabel] || ARCHETYPE_INTEL["Loyalty"];
  const heat = Math.max(0, Math.min(100, rivalryHeat || 0));
  const heatNote = heat >= 70 ? HEAT_NOTES.high : heat >= 40 ? HEAT_NOTES.medium : HEAT_NOTES.low;
  const ovrNote = (teamOvr || 0) >= 82 ? "Elite roster — no single scheme fully neutralizes all weapons." : null;

  return {
    archetype: archetypeLabel || "Unknown",
    icon: intel.icon,
    tendencies: intel.tendencies,
    heatNote,
    ovrNote,
    alertLevel: heat >= 70 ? "high" : heat >= 40 ? "medium" : "low"
  };
}
