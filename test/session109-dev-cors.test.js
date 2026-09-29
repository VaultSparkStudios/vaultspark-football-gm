import test from "node:test";
import assert from "node:assert/strict";
import { corsHeadersFor, DEFAULT_DEV_ORIGINS, resolveAllowedOrigins } from "../src/app/devCors.js";

// S109 — the dev server reflected any Origin when nothing was configured.
// Empty configuration now means the local dev origins, and nothing else.

const headers = (origin, allowed) => {
  const pairs = corsHeadersFor(origin, allowed);
  return pairs ? Object.fromEntries(pairs) : null;
};

test("an empty configuration allows the local dev origins only", () => {
  const allowed = resolveAllowedOrigins({});
  assert.deepEqual([...allowed], [...DEFAULT_DEV_ORIGINS]);
  assert.equal(headers("https://evil.example", allowed), null);
  assert.equal(headers("", allowed), null);
  assert.equal(headers("http://localhost:3000/", allowed)["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.match(headers("http://localhost:3000", allowed)["Access-Control-Allow-Methods"], /\bDELETE\b/);
});

test("a configured origin replaces the defaults rather than adding to them", () => {
  const allowed = resolveAllowedOrigins({ APP_ORIGIN: "https://play.example/" });
  assert.deepEqual([...allowed], ["https://play.example"]);
  assert.equal(headers("http://localhost:3000", allowed), null);
  assert.equal(headers("https://play.example", allowed).Vary, "Origin");
});

test("NEGATIVE CONTROL: the pre-S109 rule reflected any origin on an empty allowlist", () => {
  const empty = new Set();
  const preFix = (origin) => (!empty.size || empty.has(origin) ? origin : null);
  assert.equal(preFix("https://evil.example"), "https://evil.example", "the old rule opened the door");
  assert.equal(headers("https://evil.example", resolveAllowedOrigins({})), null, "the new rule keeps it shut");
});
