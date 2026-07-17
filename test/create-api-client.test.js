import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    }
  };
}

function createMetaDocument(metaMap) {
  return {
    querySelector(selector) {
      const match = selector.match(/meta\[name="([^"]+)"\]/);
      if (!match) return null;
      const content = metaMap[match[1]];
      return content == null ? null : { content };
    }
  };
}

async function importClientModule() {
  const modulePath = pathToFileURL(path.resolve("public/lib/api/createApiClient.js")).toString();
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

test("api client falls back to client runtime when server connection fails", async () => {
  const storage = createMemoryStorage();
  const dispatched = [];

  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    localStorage: storage,
    location: { protocol: "http:" },
    dispatchEvent(event) {
      dispatched.push(event);
      return true;
    }
  };
  globalThis.document = createMetaDocument({
    "vsfgm-runtime-default": "server",
    "vsfgm-server-available": "true",
    "vsfgm-server-base-url": ""
  });
  globalThis.fetch = async () => {
    throw new Error("ECONNREFUSED");
  };

  const { createApiClient, getRuntimeMode } = await importClientModule();
  const api = createApiClient();
  const payload = await api("/api/setup/init");

  assert.equal(payload.ok, true);
  assert.equal(payload.diagnostics?.setup?.runtime, "browser");
  assert.equal(getRuntimeMode(), "client");
  assert.equal(storage.getItem("vsfgm:runtime-mode"), "client");
  assert.equal(dispatched[0]?.type, "vsfgm:runtime-fallback");
  assert.match(dispatched[0]?.detail?.reason || "", /cannot reach the server/i);

  delete globalThis.fetch;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

test("api client preserves an established server authority after a transient connection failure", async () => {
  const storage = createMemoryStorage();
  const dispatched = [];
  let requestCount = 0;

  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    localStorage: storage,
    location: { protocol: "http:" },
    dispatchEvent(event) {
      dispatched.push(event);
      return true;
    }
  };
  globalThis.document = createMetaDocument({
    "vsfgm-runtime-default": "server",
    "vsfgm-server-available": "true",
    "vsfgm-server-base-url": ""
  });
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ ok: true, authority: "server" });
        }
      };
    }
    throw new Error("ECONNRESET");
  };

  const { createApiClient, getRuntimeMode } = await importClientModule();
  const api = createApiClient();
  assert.equal((await api("/api/state")).authority, "server");
  await assert.rejects(() => api("/api/jobs/simulate"), /cannot reach the server/i);
  assert.equal(getRuntimeMode(), "server");
  assert.equal(storage.getItem("vsfgm:runtime-mode"), null);
  assert.equal(dispatched.length, 0);

  delete globalThis.fetch;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.CustomEvent;
});
