const GET_PATHS = [
  "/api/agent/roster",
  "/api/analytics",
  "/api/backups",
  "/api/boxscore",
  "/api/calendar",
  "/api/calibration/jobs",
  "/api/combine/results",
  "/api/commissioner/lobby",
  "/api/compare/players",
  "/api/contracts/expiring",
  "/api/contracts/negotiations",
  "/api/depth-chart",
  "/api/draft",
  "/api/fan-sentiment",
  "/api/franchise-moment",
  "/api/free-agents",
  "/api/gm-decision",
  "/api/gm-legacy",
  "/api/history/player",
  "/api/history/team",
  "/api/jobs/simulate",
  "/api/mentorship",
  "/api/news",
  "/api/observability",
  "/api/offseason/pipeline",
  "/api/owner",
  "/api/picks",
  "/api/player",
  "/api/players/search",
  "/api/qa/season",
  "/api/realism/verify",
  "/api/records/franchise",
  "/api/retired",
  "/api/rewind",
  "/api/rivalry",
  "/api/roster",
  "/api/saves",
  "/api/schedule",
  "/api/scouting",
  "/api/season-arcs",
  "/api/settings",
  "/api/setup/init",
  "/api/snapshot/export",
  "/api/speedrun/leaderboard",
  "/api/speedrun/status",
  "/api/staff",
  "/api/stat-leaders",
  "/api/state",
  "/api/system/persistence",
  "/api/tables/player-career",
  "/api/tables/player-season",
  "/api/tables/team-season",
  "/api/team-archetypes",
  "/api/time-capsule",
  "/api/transactions"
];

const POST_PATHS = [
  "/api/advance-week",
  "/api/agent/competing-offer",
  "/api/agent/offer",
  "/api/backups/delete",
  "/api/backups/load",
  "/api/brand-identity",
  "/api/calibration/jobs",
  "/api/combine/run",
  "/api/commissioner/advance",
  "/api/commissioner/create",
  "/api/commissioner/intent",
  "/api/commissioner/join",
  "/api/commissioner/ready",
  "/api/contracts/fifth-year-option",
  "/api/contracts/franchise-tag",
  "/api/contracts/negotiate",
  "/api/contracts/resign",
  "/api/contracts/restructure",
  "/api/control-team",
  "/api/depth-chart",
  "/api/draft/cpu",
  "/api/draft/prepare",
  "/api/draft/user-pick",
  "/api/free-agency/offer",
  "/api/history/retire-jersey",
  "/api/injuries/rehab-plan",
  "/api/jobs/simulate",
  "/api/new-league",
  "/api/offseason/advance",
  "/api/onboarding/start-scenario",
  "/api/owner",
  "/api/practice-squad",
  "/api/release",
  "/api/retirement/override",
  "/api/rewind/delete",
  "/api/rewind/restore",
  "/api/rewind/snapshot",
  "/api/roster/designation",
  "/api/saves/delete",
  "/api/saves/load",
  "/api/saves/save",
  "/api/scouting/allocate",
  "/api/scouting/lock-board",
  "/api/settings",
  "/api/sign",
  "/api/snapshot/import",
  "/api/snapshot/inspect",
  "/api/speedrun/abandon",
  "/api/speedrun/check",
  "/api/speedrun/start",
  "/api/speedrun/submit",
  "/api/staff",
  "/api/trade",
  "/api/trade/evaluate",
  "/api/waiver-claim"
];

const DELETE_PATHS = ["/api/commissioner/lobby"];
const ADAPTER_STORAGE_PREFIXES = ["/api/backups", "/api/commissioner", "/api/rewind", "/api/saves", "/api/speedrun"];
const RUNTIME_PREFIXES = ["/api/setup", "/api/system"];

const SUCCESS_SHAPES = Object.freeze({
  "GET /api/agent/roster": { required: ["ok", "agents"] },
  "POST /api/agent/offer": { required: ["ok", "result", "agentState"] },
  "POST /api/agent/competing-offer": { required: ["ok", "result", "agentState"] },
  "GET /api/gm-legacy": { required: ["ok", "legacy", "raw"] },
  "POST /api/onboarding/start-scenario": { required: ["ok", "receipt", "state"] },
  "GET /api/rivalry": { required: ["ok"], anyOf: ["rivalry", "rivalries"] },
  "POST /api/combine/run": { required: ["ok", "results", "count"] },
  "GET /api/combine/results": { required: ["ok", "summary", "hasResults"] },
  "POST /api/commissioner/create": { required: ["ok", "lobby"] },
  "GET /api/commissioner/lobby": { required: ["ok", "lobby"] },
  "POST /api/commissioner/join": { required: ["ok", "lobby"] },
  "POST /api/commissioner/ready": { required: ["ok", "allReady", "lobby"] },
  "POST /api/commissioner/intent": { required: ["ok", "intent", "lobby"] },
  "POST /api/commissioner/advance": { required: ["ok", "intentResults", "state", "lobby"] },
  "DELETE /api/commissioner/lobby": { required: ["ok"] },
  "GET /api/fan-sentiment": { required: ["ok", "teamId", "fanSentiment"] },
  "GET /api/stat-leaders": { required: ["ok", "year", "leaders"] },
  "GET /api/mentorship": { required: ["ok", "teamId", "pairs", "history"] },
  "POST /api/brand-identity": { required: ["ok", "teamId", "brandOverride", "state"] },
  "GET /api/rewind": { required: ["ok", "snapshots"] },
  "POST /api/rewind/snapshot": { required: ["ok", "entry", "snapshots"] },
  "POST /api/rewind/restore": { required: ["ok", "state"] },
  "POST /api/rewind/delete": { required: ["ok", "snapshots"] },
  "POST /api/speedrun/start": { required: ["ok", "challenge"] },
  "GET /api/speedrun/status": { required: ["ok", "challenge", "leagueMeta"] },
  "POST /api/speedrun/check": { required: ["ok", "complete", "challenge"] },
  "POST /api/speedrun/abandon": { required: ["ok"] },
  "GET /api/speedrun/leaderboard": { required: ["ok", "entries"] },
  "POST /api/speedrun/submit": { required: ["ok", "rank", "totalEntries", "entry"] }
});

export function normalizeApiContractPath(value) {
  const path = String(value || "").split("?")[0].replace(/\/+$/, "");
  return path || "/";
}

export function apiContractKey(method, path) {
  return String(method || "GET").toUpperCase() + " " + normalizeApiContractPath(path);
}

function authorityFor(path) {
  if (ADAPTER_STORAGE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "adapter-storage";
  if (RUNTIME_PREFIXES.some((prefix) => path.startsWith(prefix))) return "runtime";
  return "game-session";
}

function responseShapeFor(method, path) {
  const resource = path.replace(/^\/api\/?/, "").replace(/\//g, ".") || "root";
  const operation = method === "GET" ? "read" : method === "DELETE" ? "delete" : "mutation";
  return resource + "." + operation;
}

function makeContract(method, path) {
  const key = apiContractKey(method, path);
  return Object.freeze({
    method,
    path,
    key,
    authority: authorityFor(path),
    mutability: method === "GET" ? "read" : "write",
    responseShapeId: responseShapeFor(method, path),
    successShape: Object.freeze({
      required: Object.freeze([...(SUCCESS_SHAPES[key]?.required || [])]),
      anyOf: Object.freeze([...(SUCCESS_SHAPES[key]?.anyOf || [])])
    })
  });
}

export const API_CONTRACT = Object.freeze([
  ...GET_PATHS.map((path) => makeContract("GET", path)),
  ...POST_PATHS.map((path) => makeContract("POST", path)),
  ...DELETE_PATHS.map((path) => makeContract("DELETE", path))
].sort((left, right) => left.key.localeCompare(right.key)));

const API_CONTRACT_BY_KEY = new Map(API_CONTRACT.map((entry) => [entry.key, entry]));

export function getApiContract(method, path) {
  return API_CONTRACT_BY_KEY.get(apiContractKey(method, path)) || null;
}

export function assertApiContract(method, path) {
  const contract = getApiContract(method, path);
  if (!contract) {
    throw new Error("Undeclared browser API contract: " + apiContractKey(method, path));
  }
  return contract;
}

export function assertApiContractResponse(method, path, payload) {
  const contract = assertApiContract(method, path);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid API response for " + contract.key + ": expected a JSON object.");
  }
  if (payload.ok === false) return payload;
  const missing = contract.successShape.required.filter((field) => !(field in payload));
  if (missing.length) {
    throw new Error(
      "Invalid API response for " + contract.key + " (" + contract.responseShapeId
      + "): missing " + missing.join(", ") + "."
    );
  }
  if (contract.successShape.anyOf.length && !contract.successShape.anyOf.some((field) => field in payload)) {
    throw new Error(
      "Invalid API response for " + contract.key + " (" + contract.responseShapeId
      + "): expected one of " + contract.successShape.anyOf.join(", ") + "."
    );
  }
  return payload;
}
