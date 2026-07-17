import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

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
