import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ContractService,
  CoachingService,
  SERVICE_AUTHORITY_MANIFEST,
  createServices
} from "../src/runtime/services/index.js";

test("service bundle advertises only characterized production delegations", () => {
  const session = { currentYear: 2026, league: { teams: [], players: [], capLedger: {} } };
  const services = createServices(session);

  assert.deepEqual(Object.keys(services).sort(), ["coaching", "contracts"]);
  assert.ok(services.contracts instanceof ContractService);
  assert.ok(services.coaching instanceof CoachingService);
  assert.deepEqual(Object.keys(SERVICE_AUTHORITY_MANIFEST.services).sort(), ["coaching", "contracts"]);
  for (const entry of Object.values(SERVICE_AUTHORITY_MANIFEST.services)) {
    assert.equal(entry.delegated, true);
    assert.ok(entry.callSites.length > 0);
    assert.equal(Object.isFrozen(entry.callSites), true);
  }
});

test("authority manifest call sites remain live and scaffold-only services stay absent", () => {
  const gameSession = readFileSync(new URL("../src/runtime/GameSession.js", import.meta.url), "utf8");
  const serviceIndex = readFileSync(new URL("../src/runtime/services/index.js", import.meta.url), "utf8");

  assert.match(gameSession, /this\.services\.contracts\.getCapSummary/);
  assert.match(gameSession, /this\.services\.coaching\.processLifecycle/);
  assert.match(gameSession, /this\.services\.coaching\.getTeamView/);
  assert.doesNotMatch(serviceIndex, /ScoutingService|OwnerService|DraftService|StatsService/);
});
