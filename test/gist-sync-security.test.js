import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

/**
 * These tests replace `globalThis.fetch` with stubs. The runtime shard runs every
 * file in a single process (`--test-isolation=none`), so a stub left installed
 * leaks into every file that loads afterwards — it silently broke the live server
 * tests in test/server-routes.test.js, which need the real implementation.
 * Restoring it after this file's tests keeps the shared global honest.
 */
const REAL_FETCH = globalThis.fetch;
after(() => { globalThis.fetch = REAL_FETCH; });


function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    has(key) { return data.has(String(key)); }
  };
}

async function freshModule(label) {
  const url = pathToFileURL(path.resolve("public/lib/gistSync.js"));
  url.searchParams.set("case", label);
  return import(url.href);
}

test("legacy persistent token migrates into tab storage and is deleted", async () => {
  const local = storage({ vsfgm_gist_token: "legacy-secret" });
  const session = storage();
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  const gist = await freshModule("migration");
  assert.equal(gist.getSavedToken(), "legacy-secret");
  assert.equal(local.getItem("vsfgm_gist_token"), null);
  assert.equal(session.getItem("vsfgm_gist_token"), "legacy-secret");
});

test("token custody is tab-scoped and masked display text cannot corrupt it", async () => {
  const local = storage();
  const session = storage();
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  const gist = await freshModule("custody");
  assert.deepEqual(gist.saveToken("github-token-value"), { ok: true, stored: true, scope: "tab-session" });
  assert.equal(gist.getSavedToken(), "github-token-value");
  assert.equal(local.getItem("vsfgm_gist_token"), null);
  assert.equal(session.getItem("vsfgm_gist_token"), "github-token-value");
  assert.equal(gist.saveToken("••••••••••••••••1234").ok, false);
  assert.equal(gist.getSavedToken(), "github-token-value");
});

test("Gist import prefers bounded inline content without an unnecessary raw fetch", async () => {
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      description: "inline save",
      files: { "vsfgm-save.json": { content: JSON.stringify({ league: { year: 2032 } }) } }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const gist = await freshModule("inline");
  const result = await gist.importFromGist("abc123", "");
  assert.equal(result.snapshot.league.year, 2032);
  assert.deepEqual(calls, ["https://api.github.com/gists/abc123"]);
});

test("remote integrity sidecars are fetched and corrupt cloud saves are rejected", async () => {
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value === "https://api.github.com/gists/remote") {
      return new Response(JSON.stringify({
        files: {
          "vsfgm-save.json": { raw_url: "https://raw.example/save" },
          "vsfgm-save.integrity.json": { raw_url: "https://raw.example/integrity" }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value === "https://raw.example/save") {
      return new Response(JSON.stringify({ league: { year: 2040 } }), { status: 200 });
    }
    if (value === "https://raw.example/integrity") {
      return new Response(JSON.stringify({ algo: "fnv1a32", checksum: "deadbeef", length: 1 }), { status: 200 });
    }
    return new Response("", { status: 404 });
  };
  const gist = await freshModule("remote-integrity");
  await assert.rejects(() => gist.importFromGist("remote", "token"), /failed integrity verification/);
});

// ── S62: remote-import integrity fails closed, in parity with the canonical store ──

import {
  buildIntegrityStamp,
  verifyIntegrityStamp as storeVerify
} from "../src/adapters/persistence/saveStoreShared.js";

function gistFetchFor(save, sidecar) {
  return async (url) => {
    const value = String(url);
    if (value === "https://api.github.com/gists/parity") {
      const files = { "vsfgm-save.json": { content: save } };
      if (sidecar !== undefined) {
        files["vsfgm-save.integrity.json"] = { content: sidecar };
      }
      return new Response(JSON.stringify({ files }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response("", { status: 404 });
  };
}

const PARITY_SAVE = JSON.stringify({ league: { year: 2051 } });

test("gist import verdicts are in exact parity with the canonical fail-closed store", async () => {
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();

  const validStamp = buildIntegrityStamp(PARITY_SAVE);
  const forgedAlgo = { ...validStamp, algo: "totally-legit" };
  const corrupt = { ...validStamp, checksum: "00000000" };

  // Canonical store verdicts (the contract gistSync claims to mirror).
  assert.equal(storeVerify(PARITY_SAVE, null), true, "store: absent stamp = legacy accept");
  assert.equal(storeVerify(PARITY_SAVE, validStamp), true, "store: valid stamp verifies");
  assert.equal(storeVerify(PARITY_SAVE, forgedAlgo), false, "store: unknown algo fails closed");
  assert.equal(storeVerify(PARITY_SAVE, corrupt), false, "store: checksum mismatch fails closed");

  // gistSync verdicts, exercised through the real import gate.
  globalThis.fetch = gistFetchFor(PARITY_SAVE, JSON.stringify(validStamp));
  const verified = await (await freshModule("parity-valid")).importFromGist("parity", "");
  assert.equal(verified.integrity, "verified");

  globalThis.fetch = gistFetchFor(PARITY_SAVE, undefined);
  const legacy = await (await freshModule("parity-legacy")).importFromGist("parity", "");
  assert.equal(legacy.integrity, "legacy-unverified");

  globalThis.fetch = gistFetchFor(PARITY_SAVE, JSON.stringify(forgedAlgo));
  await assert.rejects(
    () => freshModule("parity-forged").then((m) => m.importFromGist("parity", "")),
    /failed integrity verification/,
    "forged algo must reject, not bypass"
  );

  globalThis.fetch = gistFetchFor(PARITY_SAVE, JSON.stringify(corrupt));
  await assert.rejects(
    () => freshModule("parity-corrupt").then((m) => m.importFromGist("parity", "")),
    /failed integrity verification/
  );

  globalThis.fetch = gistFetchFor(PARITY_SAVE, "{not json");
  await assert.rejects(
    () => freshModule("parity-unreadable").then((m) => m.importFromGist("parity", "")),
    /failed integrity verification/,
    "a present-but-unreadable sidecar is corruption evidence, never absence"
  );
});
