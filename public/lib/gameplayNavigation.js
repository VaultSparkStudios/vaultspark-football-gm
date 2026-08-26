/**
 * Exact gameplay navigation authority.
 *
 * Season chapters, decision promises, inbox links, and return-session actions
 * must all point at a real player-action surface. Keeping those routes here
 * prevents a gameplay domain from drifting back into Settings when the UI is
 * reorganized (the Boardroom extraction is the motivating example).
 */

export const GAMEPLAY_NAVIGATION_VERSION = "1.0";

const ROUTES = Object.freeze({
  overview: Object.freeze({ targetTab: "overviewTab", targetId: "franchiseCommandCenter" }),
  postseason: Object.freeze({ targetTab: "overviewTab", targetId: "franchiseCommandCenter" }),
  contracts: Object.freeze({ targetTab: "contractsTab", targetId: "contractsSpotlight" }),
  trades: Object.freeze({ targetTab: "transactionsTab", targetId: "tradeTeamARosterTable" }),
  freeAgency: Object.freeze({ targetTab: "faTab", targetId: "faTable" }),
  roster: Object.freeze({ targetTab: "rosterTab", targetId: "rosterTable" }),
  depthChart: Object.freeze({ targetTab: "depthTab", targetId: "depthTable" }),
  scouting: Object.freeze({ targetTab: "scoutingTab", targetId: "scoutingSpotlight" }),
  combine: Object.freeze({ targetTab: "draftTab", targetId: "combineResultsTable" }),
  draft: Object.freeze({ targetTab: "draftTab", targetId: "draftWarRoomPanel" }),
  boardroom: Object.freeze({ targetTab: "boardroomTab", targetId: "ownerSpotlight" }),
  staff: Object.freeze({ targetTab: "boardroomTab", targetId: "coachingMarketPanel" }),
  history: Object.freeze({ targetTab: "historyTab", targetId: "historySpotlight" })
});

const OFFSEASON_ROUTE_KEYS = Object.freeze({
  retirements: "history",
  staff: "staff",
  combine: "combine",
  "pro-days": "scouting",
  "free-agency": "freeAgency",
  draft: "draft",
  udfa: "freeAgency",
  "roster-cuts": "roster",
  "offseason-complete": "overview"
});

const GM_DECISION_ROUTE_KEYS = Object.freeze({
  buy: "trades",
  sell: "trades",
  hold: "overview",
  "fa-qb": "freeAgency",
  "start-backup": "depthChart",
  "trade-qb": "trades",
  restructure: "contracts",
  release: "contracts",
  wait: "contracts",
  shop: "trades",
  extend: "contracts",
  deny: "roster",
  "address-room": "overview",
  "back-staff": "staff",
  "shake-up": "trades",
  ceremony: "history",
  "feature-role": "depthChart",
  "quiet-exit": "overview"
});

export const GAMEPLAY_SURFACE_ROUTES = ROUTES;

export function gameplaySurface(routeKey = "overview") {
  return ROUTES[routeKey] || ROUTES.overview;
}

export function offseasonStageSurface(stage = "") {
  return gameplaySurface(OFFSEASON_ROUTE_KEYS[String(stage).toLowerCase()] || "overview");
}

export function gmDecisionSurface(choiceId = "") {
  return gameplaySurface(GM_DECISION_ROUTE_KEYS[String(choiceId).toLowerCase()] || "overview");
}
