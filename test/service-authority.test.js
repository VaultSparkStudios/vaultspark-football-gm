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
    assert.ok(Object.keys(entry.methods).length > 0);
    for (const method of Object.values(entry.methods)) {
      assert.ok(method.callSites.length > 0);
      assert.equal(Object.isFrozen(method.callSites), true);
    }
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

test("ContractService public surface equals its exact delegated manifest", () => {
  const publicMethods = Object.getOwnPropertyNames(ContractService.prototype)
    .filter((name) => name !== "constructor" && !name.startsWith("_"))
    .sort();
  const declaredMethods = Object.keys(SERVICE_AUTHORITY_MANIFEST.services.contracts.methods).sort();
  assert.deepEqual(publicMethods, ["getCapSummary"]);
  assert.deepEqual(publicMethods, declaredMethods);
});
