export const START_SCENARIO_SCHEMA_VERSION = 1;

export const START_SCENARIO_CHOICES = Object.freeze({
  identity: Object.freeze(["air-raid", "ground-control", "balanced"]),
  pressure: Object.freeze(["win-now", "rebuild", "balanced-mandate"]),
  firstCall: Object.freeze(["trust-scout", "wait-more-info", "ignore"])
});

const IDENTITY_PLANS = Object.freeze({
  "air-raid": Object.freeze({
    label: "Air Raid Offense",
    passRate: 0.66,
    aggression: 0.62,
    description: "Pass rate 66% and aggression 62% now drive scheme fit and play calling."
  }),
  "ground-control": Object.freeze({
    label: "Ground Control",
    passRate: 0.42,
    aggression: 0.58,
    description: "Pass rate 42% and aggression 58% now drive scheme fit and play calling."
  }),
  balanced: Object.freeze({
    label: "Balanced Attack",
    passRate: 0.54,
    aggression: 0.5,
    description: "Pass rate 54% and aggression 50% preserve a flexible scheme."
  })
});

const PRESSURE_PLANS = Object.freeze({
  "win-now": Object.freeze({
    label: "Win Now",
    patience: 0.28,
    personality: "win-now",
    strategyProfile: "win-now",
    priorities: Object.freeze({ championships: 94, loyalty: 38, patience: 28 }),
    description: "Year-one owner patience is 28%; expectations and hot-seat math use that value."
  }),
  rebuild: Object.freeze({
    label: "Full Rebuild",
    patience: 0.78,
    personality: "legacy-builder",
    strategyProfile: "rebuild",
    priorities: Object.freeze({ championships: 76, loyalty: 84, patience: 78 }),
    description: "Year-one owner patience is 78%; the roster strategy begins in rebuild mode."
  }),
  "balanced-mandate": Object.freeze({
    label: "Measured Progress",
    patience: 0.55,
    personality: "legacy-builder",
    strategyProfile: "balanced",
    priorities: Object.freeze({ championships: 84, loyalty: 66, patience: 55 }),
    description: "Year-one owner patience is 55%; the roster strategy begins balanced."
  })
});

const SCOUTING_PLANS = Object.freeze({
  "trust-scout": Object.freeze({
    label: "Trust the Report",
    mode: "pin-director-first",
    pointsReserved: 0,
    description: "The first real prospect flagged by the director will be pinned when a draft class exists."
  }),
  "wait-more-info": Object.freeze({
    label: "Request More Scouting",
    mode: "invest-director-first",
    pointsReserved: 6,
    description: "Six scouting points are reserved and will be invested in the first real director flag."
  }),
  ignore: Object.freeze({
    label: "Pass on the First Flag",
    mode: "decline-director-first",
    pointsReserved: 0,
    description: "No prospect is pinned and no scouting points are spent on the opening flag."
  })
});

export function buildStartScenarioRequest(selections = {}) {
  return {
    schemaVersion: START_SCENARIO_SCHEMA_VERSION,
    selections: {
      identity: selections.identity,
      pressure: selections.pressure,
      firstCall: selections["first-call"] || selections.firstCall
    }
  };
}

export function validateStartScenario(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reasonCode: "START_SCENARIO_INVALID", error: "Start scenario payload is required." };
  }
  if (Number(payload.schemaVersion) !== START_SCENARIO_SCHEMA_VERSION) {
    return {
      ok: false,
      reasonCode: "START_SCENARIO_VERSION_UNSUPPORTED",
      error: "Unsupported start scenario schema version."
    };
  }
  const selections = payload.selections || {};
  const normalized = {
    identity: String(selections.identity || ""),
    pressure: String(selections.pressure || ""),
    firstCall: String(selections.firstCall || selections["first-call"] || "")
  };
  for (const [field, allowed] of Object.entries(START_SCENARIO_CHOICES)) {
    if (!allowed.includes(normalized[field])) {
      return {
        ok: false,
        reasonCode: "START_SCENARIO_UNKNOWN_CHOICE",
        error: "Unknown " + field + " choice.",
        field
      };
    }
  }
  return { ok: true, value: { schemaVersion: START_SCENARIO_SCHEMA_VERSION, selections: normalized } };
}

export function getStartScenarioPlan(selections) {
  return {
    identity: { id: selections.identity, ...IDENTITY_PLANS[selections.identity] },
    pressure: { id: selections.pressure, ...PRESSURE_PLANS[selections.pressure] },
    scouting: { id: selections.firstCall, ...SCOUTING_PLANS[selections.firstCall] }
  };
}
