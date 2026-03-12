function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeBool(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function normalizeChoice(value, catalog, fallback) {
  return value && catalog[value] ? value : fallback;
}

export const DEFAULT_LEAGUE_SETTINGS = {
  allowInjuries: true,
  injuryRateMultiplier: 1,
  capGrowthRate: 0.045,
  cpuTradeAggression: 0.5,
  autoProgressOffseason: false,
  eraProfile: "modern",
  enableOwnerMode: true,
  enableNarratives: true,
  enableCompPicks: true,
  enableChemistry: true,
  retirementWinningRetention: true,
  retirementOverrideMinWinningPct: 0.55,
  waiverClaimWindowWeeks: 1,
  practiceSquadExperienceLimit: 2,
  onboardingCompleted: false,
  franchiseArchetype: "balanced",
  rulesPreset: "standard",
  difficultyPreset: "standard",
  challengeMode: "open",
  scoutingWeeklyPoints: 12,
  ownerPatience: 0.55,
  contractDemandMultiplier: 1,
  suspensionRateMultiplier: 1,
  allowUserFreeAgency: true,
  allowTop10PickTrading: true,
  smallMarketMode: false,
  ownerMandateWinNow: false
};

export const ERA_PROFILES = {
  modern: {
    label: "Modern Pass Era",
    summary: "Higher passing volume with slightly more offense and weekly injury churn.",
    passRateDelta: 0.02,
    offenseBoost: 1.5,
    injuryDelta: 0.04
  },
  balanced: {
    label: "Balanced",
    summary: "League-average offense and roster volatility.",
    passRateDelta: 0,
    offenseBoost: 0,
    injuryDelta: 0
  },
  legacy: {
    label: "Legacy Run Era",
    summary: "Lower-tempo, run-heavier environment with slightly less injury pressure.",
    passRateDelta: -0.05,
    offenseBoost: -1,
    injuryDelta: -0.02
  }
};

export const FRANCHISE_ARCHETYPES = {
  balanced: {
    label: "Balanced",
    summary: "Stable baseline start with no major roster or ownership pressure distortions.",
    strategyProfile: "balanced"
  },
  rebuild: {
    label: "Rebuild",
    summary: "Lower chemistry and fan urgency, but ownership gives more runway to retool.",
    strategyProfile: "rebuild",
    chemistryDelta: -5,
    moraleDelta: -3,
    ownerAdjustments: { fanInterest: -8, cash: 18000000, staffBudget: -2000000, ticketPrice: -12 },
    ownerPatienceDelta: 0.18
  },
  contender: {
    label: "Contender",
    summary: "Strong fan pressure, better chemistry, and a more aggressive win-now identity.",
    strategyProfile: "contender",
    chemistryDelta: 4,
    moraleDelta: 3,
    ownerAdjustments: { fanInterest: 8, cash: 12000000, staffBudget: 3000000, ticketPrice: 8 },
    ownerPatienceDelta: -0.04
  },
  "cap-hell": {
    label: "Cap Hell",
    summary: "Dead cap and cash strain create a harder short-term roster puzzle.",
    strategyProfile: "win-now",
    chemistryDelta: -2,
    moraleDelta: -2,
    ownerAdjustments: { cash: -35000000, fanInterest: 2, staffBudget: -3000000 },
    deadCapCurrentYear: 28000000,
    deadCapNextYear: 18000000,
    ownerPatienceDelta: -0.08
  },
  "aging-core": {
    label: "Aging Core",
    summary: "Veteran-heavy locker room with short-term cohesion but more fragility.",
    strategyProfile: "win-now",
    chemistryDelta: 3,
    moraleDelta: 1,
    ownerAdjustments: { fanInterest: 5, cash: 6000000 },
    facilitiesAdjustments: { rehab: 6, analytics: -3 },
    ageVeteransBy: 1,
    ownerPatienceDelta: -0.06
  },
  "no-qb": {
    label: "No QB",
    summary: "The roster is built to compete everywhere except the most important position.",
    strategyProfile: "rebuild",
    chemistryDelta: -3,
    moraleDelta: -4,
    ownerAdjustments: { fanInterest: -6, cash: 10000000, ticketPrice: -6 },
    qbOverallPenalty: 12,
    ownerPatienceDelta: -0.02
  },
  "playoff-push": {
    label: "Owner Mandate",
    summary: "Ownership expects immediate playoff contention and invests for short-term pressure.",
    strategyProfile: "win-now",
    chemistryDelta: 2,
    moraleDelta: 2,
    ownerAdjustments: { fanInterest: 10, cash: 18000000, staffBudget: 4000000, ticketPrice: 10 },
    ownerPatienceDelta: -0.2,
    ownerMandateWinNow: true
  }
};

export const RULES_PRESETS = {
  standard: {
    label: "Standard",
    summary: "Current studio baseline with injuries, comp picks, and normal roster constraints.",
    patch: {
      allowInjuries: true,
      enableCompPicks: true,
      waiverClaimWindowWeeks: 1,
      practiceSquadExperienceLimit: 2,
      capGrowthRate: 0.045,
      suspensionRateMultiplier: 1,
      autoProgressOffseason: false
    }
  },
  simulation: {
    label: "Simulation",
    summary: "Leans into attrition and tighter roster rules for a harsher long-horizon sim.",
    patch: {
      allowInjuries: true,
      enableCompPicks: true,
      waiverClaimWindowWeeks: 2,
      practiceSquadExperienceLimit: 1,
      capGrowthRate: 0.04,
      suspensionRateMultiplier: 1.15,
      autoProgressOffseason: false
    }
  },
  sandbox: {
    label: "Sandbox",
    summary: "Looser roster management and more forgiving league economics for experimentation.",
    patch: {
      allowInjuries: true,
      enableCompPicks: true,
      waiverClaimWindowWeeks: 1,
      practiceSquadExperienceLimit: 4,
      capGrowthRate: 0.06,
      suspensionRateMultiplier: 0.7,
      autoProgressOffseason: true
    }
  }
};

export const DIFFICULTY_PRESETS = {
  relaxed: {
    label: "Relaxed",
    summary: "More scouting bandwidth and slightly gentler economy pressure.",
    patch: {
      cpuTradeAggression: 0.42,
      injuryRateMultiplier: 0.9,
      scoutingWeeklyPoints: 15,
      ownerPatience: 0.72,
      contractDemandMultiplier: 0.94
    }
  },
  standard: {
    label: "Standard",
    summary: "Current default balance for AI pressure, injuries, and owner expectations.",
    patch: {
      cpuTradeAggression: 0.5,
      injuryRateMultiplier: 1,
      scoutingWeeklyPoints: 12,
      ownerPatience: 0.55,
      contractDemandMultiplier: 1
    }
  },
  hard: {
    label: "Hard",
    summary: "Tighter scouting, more assertive AI teams, and less patient ownership.",
    patch: {
      cpuTradeAggression: 0.62,
      injuryRateMultiplier: 1.08,
      scoutingWeeklyPoints: 10,
      ownerPatience: 0.42,
      contractDemandMultiplier: 1.08
    }
  },
  brutal: {
    label: "Brutal",
    summary: "Maximum pressure: expensive contracts, thin scouting, and very little patience.",
    patch: {
      cpuTradeAggression: 0.72,
      injuryRateMultiplier: 1.18,
      scoutingWeeklyPoints: 8,
      ownerPatience: 0.32,
      contractDemandMultiplier: 1.16
    }
  }
};

export const CHALLENGE_MODES = {
  open: {
    label: "Open Sandbox",
    summary: "No extra restrictions beyond the chosen rules and difficulty.",
    patch: {
      allowUserFreeAgency: true,
      allowTop10PickTrading: true,
      smallMarketMode: false,
      ownerMandateWinNow: false
    }
  },
  "no-free-agency": {
    label: "No Free Agency",
    summary: "User-run teams must build through the draft, trades, and internal development.",
    patch: {
      allowUserFreeAgency: false,
      allowTop10PickTrading: true,
      smallMarketMode: false
    }
  },
  "no-top-10-picks": {
    label: "No Top-10 Picks",
    summary: "No easy reset button: the rebuild cannot rely on early draft capital.",
    patch: {
      allowUserFreeAgency: true,
      allowTop10PickTrading: false,
      smallMarketMode: false
    }
  },
  "small-market": {
    label: "Small Market",
    summary: "Lower market leverage and tighter budgets make retention and staff spend harder.",
    patch: {
      allowUserFreeAgency: true,
      allowTop10PickTrading: true,
      smallMarketMode: true
    }
  },
  "hot-seat": {
    label: "Hot Seat",
    summary: "Ownership expects quick improvement and has almost no patience.",
    patch: {
      allowUserFreeAgency: true,
      allowTop10PickTrading: true,
      smallMarketMode: false,
      ownerMandateWinNow: true,
      ownerPatience: 0.22
    }
  }
};

export const SETUP_QUICK_STARTS = {
  modern: {
    label: "Quick Start: Modern",
    selections: {
      mode: "play",
      eraProfile: "modern",
      franchiseArchetype: "contender",
      rulesPreset: "standard",
      difficultyPreset: "standard",
      challengeMode: "open",
      enableOwnerMode: true,
      enableNarratives: true,
      enableCompPicks: true,
      enableChemistry: true
    }
  },
  balanced: {
    label: "Quick Start: Balanced",
    selections: {
      mode: "drive",
      eraProfile: "balanced",
      franchiseArchetype: "balanced",
      rulesPreset: "standard",
      difficultyPreset: "standard",
      challengeMode: "open",
      enableOwnerMode: true,
      enableNarratives: true,
      enableCompPicks: true,
      enableChemistry: true
    }
  },
  legacy: {
    label: "Quick Start: Legacy",
    selections: {
      mode: "drive",
      eraProfile: "legacy",
      franchiseArchetype: "aging-core",
      rulesPreset: "simulation",
      difficultyPreset: "hard",
      challengeMode: "open",
      enableOwnerMode: true,
      enableNarratives: false,
      enableCompPicks: true,
      enableChemistry: true
    }
  }
};

function toCatalogList(catalog) {
  return Object.entries(catalog).map(([id, value]) => ({ id, ...value }));
}

export function getLeagueConfigCatalog() {
  return {
    eraProfiles: toCatalogList(ERA_PROFILES),
    franchiseArchetypes: toCatalogList(FRANCHISE_ARCHETYPES),
    rulesPresets: toCatalogList(RULES_PRESETS),
    difficultyPresets: toCatalogList(DIFFICULTY_PRESETS),
    challengeModes: toCatalogList(CHALLENGE_MODES),
    quickStarts: toCatalogList(SETUP_QUICK_STARTS)
  };
}

export function resolveLeagueSettings(patch = {}, current = DEFAULT_LEAGUE_SETTINGS) {
  const next = {
    ...DEFAULT_LEAGUE_SETTINGS,
    ...(current || {})
  };

  const eraProfile = normalizeChoice(patch.eraProfile, ERA_PROFILES, next.eraProfile);
  const franchiseArchetype = normalizeChoice(patch.franchiseArchetype, FRANCHISE_ARCHETYPES, next.franchiseArchetype);
  const rulesPreset = normalizeChoice(patch.rulesPreset, RULES_PRESETS, next.rulesPreset);
  const difficultyPreset = normalizeChoice(patch.difficultyPreset, DIFFICULTY_PRESETS, next.difficultyPreset);
  const challengeMode = normalizeChoice(patch.challengeMode, CHALLENGE_MODES, next.challengeMode);

  Object.assign(next, RULES_PRESETS[rulesPreset].patch);
  Object.assign(next, DIFFICULTY_PRESETS[difficultyPreset].patch);
  Object.assign(next, CHALLENGE_MODES[challengeMode].patch);

  next.eraProfile = eraProfile;
  next.franchiseArchetype = franchiseArchetype;
  next.rulesPreset = rulesPreset;
  next.difficultyPreset = difficultyPreset;
  next.challengeMode = challengeMode;

  if (patch.allowInjuries != null) next.allowInjuries = normalizeBool(patch.allowInjuries, next.allowInjuries);
  if (patch.autoProgressOffseason != null) {
    next.autoProgressOffseason = normalizeBool(patch.autoProgressOffseason, next.autoProgressOffseason);
  }
  if (patch.injuryRateMultiplier != null) next.injuryRateMultiplier = clampNumber(patch.injuryRateMultiplier, 0.1, 3, 1);
  if (patch.capGrowthRate != null) next.capGrowthRate = clampNumber(patch.capGrowthRate, 0, 0.2, 0.045);
  if (patch.cpuTradeAggression != null) next.cpuTradeAggression = clampNumber(patch.cpuTradeAggression, 0, 1, 0.5);
  if (patch.enableOwnerMode != null) next.enableOwnerMode = normalizeBool(patch.enableOwnerMode, next.enableOwnerMode);
  if (patch.enableNarratives != null) next.enableNarratives = normalizeBool(patch.enableNarratives, next.enableNarratives);
  if (patch.enableCompPicks != null) next.enableCompPicks = normalizeBool(patch.enableCompPicks, next.enableCompPicks);
  if (patch.enableChemistry != null) next.enableChemistry = normalizeBool(patch.enableChemistry, next.enableChemistry);
  if (patch.retirementWinningRetention != null) {
    next.retirementWinningRetention = normalizeBool(patch.retirementWinningRetention, next.retirementWinningRetention);
  }
  if (patch.retirementOverrideMinWinningPct != null) {
    next.retirementOverrideMinWinningPct = clampNumber(patch.retirementOverrideMinWinningPct, 0.3, 0.9, 0.55);
  }
  if (patch.waiverClaimWindowWeeks != null) next.waiverClaimWindowWeeks = clampInt(patch.waiverClaimWindowWeeks, 1, 4, 1);
  if (patch.practiceSquadExperienceLimit != null) {
    next.practiceSquadExperienceLimit = clampInt(patch.practiceSquadExperienceLimit, 0, 5, 2);
  }
  if (patch.scoutingWeeklyPoints != null) next.scoutingWeeklyPoints = clampInt(patch.scoutingWeeklyPoints, 4, 24, 12);
  if (patch.ownerPatience != null) next.ownerPatience = clampNumber(patch.ownerPatience, 0.05, 0.95, 0.55);
  if (patch.contractDemandMultiplier != null) {
    next.contractDemandMultiplier = clampNumber(patch.contractDemandMultiplier, 0.75, 1.5, 1);
  }
  if (patch.suspensionRateMultiplier != null) {
    next.suspensionRateMultiplier = clampNumber(patch.suspensionRateMultiplier, 0, 3, 1);
  }
  if (patch.allowUserFreeAgency != null) {
    next.allowUserFreeAgency = normalizeBool(patch.allowUserFreeAgency, next.allowUserFreeAgency);
  }
  if (patch.allowTop10PickTrading != null) {
    next.allowTop10PickTrading = normalizeBool(patch.allowTop10PickTrading, next.allowTop10PickTrading);
  }
  if (patch.smallMarketMode != null) next.smallMarketMode = normalizeBool(patch.smallMarketMode, next.smallMarketMode);
  if (patch.ownerMandateWinNow != null) {
    next.ownerMandateWinNow = normalizeBool(patch.ownerMandateWinNow, next.ownerMandateWinNow);
  }
  if (patch.onboardingCompleted != null) {
    next.onboardingCompleted = normalizeBool(patch.onboardingCompleted, next.onboardingCompleted);
  }

  return next;
}

export function getLeagueConfigSummary(settings = DEFAULT_LEAGUE_SETTINGS) {
  const resolved = resolveLeagueSettings(settings, settings);
  return {
    eraProfile: { id: resolved.eraProfile, ...(ERA_PROFILES[resolved.eraProfile] || ERA_PROFILES.modern) },
    franchiseArchetype: {
      id: resolved.franchiseArchetype,
      ...(FRANCHISE_ARCHETYPES[resolved.franchiseArchetype] || FRANCHISE_ARCHETYPES.balanced)
    },
    rulesPreset: { id: resolved.rulesPreset, ...(RULES_PRESETS[resolved.rulesPreset] || RULES_PRESETS.standard) },
    difficultyPreset: {
      id: resolved.difficultyPreset,
      ...(DIFFICULTY_PRESETS[resolved.difficultyPreset] || DIFFICULTY_PRESETS.standard)
    },
    challengeMode: {
      id: resolved.challengeMode,
      ...(CHALLENGE_MODES[resolved.challengeMode] || CHALLENGE_MODES.open)
    }
  };
}
