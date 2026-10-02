import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SERVER_SOURCE_FILES, readServerSource } from "../scripts/lib/server-source.mjs";

/**
 * src/server.js once held every API route in one handleApi function. The routes
 * now live in domain modules under src/server/routes/ and server.js dispatches
 * to them. This pins the split: no route was lost, none is registered twice
 * (so first-match dispatch order cannot change which handler answers), and the
 * bootstrap file stays a bootstrap.
 */

// Every method+path route discovered in src/server.js immediately BEFORE the
// split, in original handleApi order. Generated from the pre-split source; do
// not edit to make a red go green — a missing entry is a lost route.
const PRE_SPLIT_ROUTES = Object.freeze([
  "GET /api/setup/init",
  "GET /api/state",
  "POST /api/onboarding/start-scenario",
  "POST /api/new-league",
  "POST /api/control-team",
  "POST /api/advance-season",
  "POST /api/advance-week",
  "GET /api/roster",
  "POST /api/roster/designation",
  "GET /api/free-agents",
  "GET /api/retired",
  "GET /api/players/search",
  "GET /api/free-agency/market",
  "POST /api/free-agency/offer",
  "POST /api/sign",
  "POST /api/retirement/override",
  "POST /api/release",
  "POST /api/practice-squad",
  "GET /api/depth-chart",
  "POST /api/depth-chart",
  "POST /api/waiver-claim",
  "POST /api/trade",
  "POST /api/trade/evaluate",
  "GET /api/picks",
  "GET /api/contracts/expiring",
  "GET /api/contracts/negotiations",
  "POST /api/contracts/resign",
  "POST /api/contracts/restructure",
  "POST /api/contracts/franchise-tag",
  "POST /api/contracts/fifth-year-option",
  "POST /api/contracts/negotiate",
  "GET /api/draft",
  "GET /api/schedule",
  "GET /api/boxscores",
  "GET /api/boxscore",
  "GET /api/what-if-replay",
  "GET /api/calendar",
  "GET /api/player",
  "GET /api/transactions",
  "POST /api/draft/prepare",
  "GET /api/scouting",
  "POST /api/scouting/allocate",
  "POST /api/scouting/lock-board",
  "POST /api/draft/user-pick",
  "POST /api/draft/on-clock-trade",
  "POST /api/draft/cpu",
  "GET /api/tables/player-season",
  "GET /api/tables/player-career",
  "GET /api/tables/team-season",
  "GET /api/records",
  "GET /api/champions",
  "GET /api/calibration",
  "GET /api/staff",
  "POST /api/staff",
  "GET /api/settings",
  "POST /api/settings",
  "GET /api/offseason/pipeline",
  "POST /api/offseason/advance",
  "GET /api/owner",
  "POST /api/owner",
  "GET /api/facilities",
  "POST /api/facilities/invest",
  "POST /api/injuries/rehab-plan",
  "GET /api/events",
  "GET /api/warehouse",
  "GET /api/calibration/jobs",
  "POST /api/calibration/jobs",
  "GET /api/observability",
  "GET /api/system/persistence",
  "POST /api/jobs/simulate",
  "GET /api/jobs/simulate",
  "GET /api/compare/players",
  "GET /api/news",
  "GET /api/analytics",
  "GET /api/qa/season",
  "GET /api/realism/verify",
  "GET /api/history/team",
  "GET /api/history/player",
  "POST /api/history/retire-jersey",
  "GET /api/saves",
  "GET /api/snapshot/export",
  "POST /api/snapshot/import",
  "POST /api/snapshot/inspect",
  "GET /api/backups",
  "POST /api/saves/save",
  "POST /api/saves/load",
  "POST /api/backups/load",
  "POST /api/saves/delete",
  "POST /api/backups/delete",
  "GET /api/rewind",
  "POST /api/rewind/snapshot",
  "POST /api/rewind/restore",
  "POST /api/rewind/delete",
  "GET /api/gm-legacy",
  "GET /api/architect-thesis",
  "POST /api/architect-thesis",
  "GET /api/trade-offers",
  "POST /api/trade-offers",
  "GET /api/rivalry",
  "POST /api/combine/run",
  "GET /api/combine/results",
  "POST /api/commissioner/create",
  "GET /api/commissioner/lobby",
  "POST /api/commissioner/join",
  "POST /api/commissioner/ready",
  "POST /api/commissioner/intent",
  "POST /api/commissioner/advance",
  "DELETE /api/commissioner/lobby",
  "GET /api/fan-sentiment",
  "GET /api/stat-leaders",
  "GET /api/mentorship",
  "POST /api/mentorship",
  "POST /api/brand-identity",
  "POST /api/speedrun/start",
  "GET /api/speedrun/status",
  "POST /api/speedrun/check",
  "POST /api/speedrun/abandon",
  "GET /api/speedrun/leaderboard",
  "POST /api/speedrun/submit",
  "GET /api/season-arcs",
  "GET /api/time-capsule",
  "GET /api/gm-decision",
  "GET /api/records/franchise",
  "GET /api/team-archetypes",
  "GET /api/franchise-moment",
  "GET /api/coaching-market",
  "POST /api/coaching-market",
  "GET /api/press-conference",
  "POST /api/press-conference"
]);

const ROUTE_PATTERN = /if\s*\(\s*req\.method\s*===\s*["'](GET|POST|DELETE|PUT|PATCH)["']\s*&&\s*url\.pathname\s*===\s*["'](\/api\/[^"']+)["']/g;

function routesIn(source) {
  return [...source.matchAll(ROUTE_PATTERN)].map((match) => `${match[1]} ${match[2]}`);
}

const root = path.resolve(import.meta.dirname, "..");

test("every pre-split route is still registered in the combined server source", () => {
  assert.equal(PRE_SPLIT_ROUTES.length, 129);
  const live = new Set(routesIn(readServerSource(root)));
  const missing = PRE_SPLIT_ROUTES.filter((key) => !live.has(key));
  assert.deepEqual(missing, [], `routes lost in the split: ${missing.join(", ")}`);
});

test("no route path is registered twice across server.js and the route modules", () => {
  const all = routesIn(readServerSource(root));
  const duplicates = all.filter((key, index) => all.indexOf(key) !== index);
  assert.deepEqual(duplicates, []);
  assert.ok(all.length >= PRE_SPLIT_ROUTES.length);
});

test("the route surface lives in the route modules and server.js stays under 900 lines", () => {
  const serverJs = fs.readFileSync(path.join(root, "src", "server.js"), "utf8");
  const lineCount = serverJs.split("\n").length;
  assert.ok(lineCount < 900, `src/server.js is ${lineCount} lines`);
  assert.deepEqual(routesIn(serverJs), [], "routes belong in src/server/routes/*.js");
  const routeModules = SERVER_SOURCE_FILES(root).filter((file) => file.includes(`${path.sep}routes${path.sep}`));
  assert.ok(routeModules.length >= 5, "route modules are part of the combined server source");
  for (const file of routeModules) {
    const name = path.basename(file);
    assert.match(serverJs, new RegExp(`from "\\./server/routes/${name.replace(".", "\\.")}"`), `${name} must be dispatched by server.js`);
  }
});

test("route modules take server state through the explicit context, never a module global", () => {
  for (const file of SERVER_SOURCE_FILES(root).filter((entry) => entry.includes(`${path.sep}routes${path.sep}`))) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /export async function handle\w+Routes\(req, res, url, ctx\)/, path.basename(file));
    assert.doesNotMatch(source, /^(?:let|var) /m, `${path.basename(file)} must not own mutable module state`);
  }
});
