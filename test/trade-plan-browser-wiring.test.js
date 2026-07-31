import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const contracts = readFileSync(new URL("../public/lib/tabContracts.js", import.meta.url), "utf8");
const state = readFileSync(new URL("../public/lib/appState.js", import.meta.url), "utf8");

test("browser commits the exact evaluated trade authority receipt", () => {
  assert.match(state, /tradePlanFingerprint:\s*null/);
  assert.match(app, /result\.plan\?\.fingerprint/);
  assert.match(app, /expectedPlanFingerprint:\s*state\.tradePlanFingerprint/);
  assert.match(app, /buildTradePayload\(\{\s*includeAuthority:\s*true\s*\}\)/);
});

test("changing or clearing trade assets invalidates the evaluation receipt", () => {
  const invalidations = contracts.match(/state\.tradePlanFingerprint\s*=\s*null/g) || [];
  assert.ok(invalidations.length >= 2);
  assert.match(app, /state\.tradePlanFingerprint\s*=\s*null[\s\S]*Use evaluate to see cap\/value impact/);
});
