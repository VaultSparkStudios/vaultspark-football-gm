import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { spawn } from "../scripts/lib/safe-spawn.mjs";
import {
  API_CONTRACT,
  assertApiContract,
  assertApiContractResponse,
  getApiContract
} from "../public/lib/apiContract.js";
import {
  assertApiContractParity,
  extractBrowserApiCalls
} from "../scripts/check-api-contract-parity.mjs";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

function valueKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function topLevelShape(payload) {
  return Object.fromEntries(
    Object.keys(payload || {}).sort().map((key) => [key, valueKind(payload[key])])
  );
}
function scheduleUnref(callback, delay) {
  const timer = setTimeout(callback, delay);
  timer.unref?.();
  return timer;
}


async function reservePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer() {
  const port = await reservePort();
  const saveDir = await fs.mkdtemp(path.join(os.tmpdir(), "franchise-api-contract-"));
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      VSFGM_RATE_LIMIT_PER_MIN: "1000",
      VSFGM_SAVE_DIR: saveDir
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  await Promise.race([
    new Promise((resolve, reject) => {
      const inspect = () => {
        if (output.includes("running at http://localhost:")) resolve();
        else if (child.exitCode != null) reject(new Error("server exited early: " + output));
        else setTimeout(inspect, 20);
      };
      inspect();
    }),
    new Promise((_, reject) => scheduleUnref(() => reject(new Error("server start timeout: " + output)), 30_000))
  ]);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      if (child.exitCode == null) child.kill();
      if (child.exitCode == null) {
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => scheduleUnref(resolve, 5_000))
        ]);
      }
      if (child.exitCode == null) child.kill("SIGKILL");
      await fs.rm(saveDir, { recursive: true, force: true });
    }
  };
}

async function requestServer(baseUrl, route, options = {}) {
  const response = await fetch(baseUrl + route, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: response.status, payload: await response.json() };
}

async function requestPair(runtime, server, route, options = {}) {
  const [local, remote] = await Promise.all([
    runtime.request(route, options),
    requestServer(server.baseUrl, route, options)
  ]);
  assert.equal(remote.status, local.status, route + " status parity");
  assert.deepEqual(topLevelShape(remote.payload), topLevelShape(local.payload), route + " response shape parity");
  return { local, remote };
}

test("API contract covers browser calls, both adapters, CORS, and response identities", async () => {
  const result = await assertApiContractParity({ rootDir: root });
  assert.equal(result.gaps, 0);
  assert.ok(result.browserCallSites >= 100);
  assert.ok(result.contracts >= 100);
  assert.equal(result.responseShapes, result.contracts);
  assert.equal(new Set(API_CONTRACT.map((entry) => entry.key)).size, API_CONTRACT.length);
  assert.equal(getApiContract("GET", "/api/rivalry?teamA=BUF&teamB=MIA")?.key, "GET /api/rivalry");
  assert.equal(assertApiContract("DELETE", "/api/commissioner/lobby").authority, "adapter-storage");
  assert.throws(() => assertApiContract("GET", "/api/not-declared"), /Undeclared browser API contract/);

  const calls = extractBrowserApiCalls(`
    await api("/api/state");
    await api('/api/commissioner/lobby', { method: "DELETE" });
  `);
  assert.deepEqual(calls.map((entry) => entry.key), [
    "GET /api/state",
    "DELETE /api/commissioner/lobby"
  ]);
});

test("response contracts fail closed on malformed success envelopes", () => {
  assert.doesNotThrow(() => assertApiContractResponse("GET", "/api/state", { currentWeek: 1 }));
  assert.doesNotThrow(() => assertApiContractResponse("GET", "/api/rivalry", { ok: true, rivalries: [] }));
  assert.throws(
    () => assertApiContractResponse("POST", "/api/rewind/snapshot", { ok: true, entry: {} }),
    /missing snapshots/
  );
  assert.throws(
    () => assertApiContractResponse("GET", "/api/rivalry", { ok: true }),
    /expected one of rivalry, rivalries/
  );
});

test("server and static runtimes preserve representative route shapes and state transitions", { timeout: 120_000 }, async () => {
  const runtime = createLocalApiRuntime({
    storage: memoryStorage(),
    scheduler: (fn) => fn(),
    now: (() => { let tick = 0; return () => 1_800_000_000_000 + tick++; })()
  });
  const server = await startServer();
  try {
    const league = {
      method: "POST",
      body: { seed: 5151, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
    };
    const created = await requestPair(runtime, server, "/api/new-league", league);
    assert.equal(created.local.payload.ok, true);
    const openingContract = await requestPair(runtime, server, "/api/onboarding/start-scenario", {
      method: "POST",
      body: {
        schemaVersion: 1,
        selections: { identity: "balanced", pressure: "balanced-mandate", firstCall: "ignore" }
      }
    });
    assert.deepEqual(openingContract.remote.payload.receipt.selections, openingContract.local.payload.receipt.selections);
    assertApiContractResponse("POST", "/api/onboarding/start-scenario", openingContract.local.payload);
    assertApiContractResponse("POST", "/api/onboarding/start-scenario", openingContract.remote.payload);


    const reads = [
      "/api/agent/roster",
      "/api/fan-sentiment?team=BUF",
      "/api/gm-legacy",
      "/api/mentorship?team=BUF",
      "/api/rivalry?teamA=BUF&teamB=MIA",
      "/api/stat-leaders?year=2026",
      "/api/speedrun/status",
      "/api/speedrun/leaderboard",
      "/api/rewind"
    ];
    for (const route of reads) {
      const pair = await requestPair(runtime, server, route);
      assertApiContractResponse("GET", route, pair.local.payload);
      assertApiContractResponse("GET", route, pair.remote.payload);
    }

    const invalidOffer = await requestPair(runtime, server, "/api/agent/offer", { method: "POST", body: {} });
    assert.equal(invalidOffer.local.status, 400);
    assert.equal(invalidOffer.local.payload.ok, false);

    const brand = await requestPair(runtime, server, "/api/brand-identity", {
      method: "POST",
      body: { teamId: "BUF", customName: "Architects", primaryColor: "#112233", secondaryColor: "#ddeeff" }
    });
    assert.deepEqual(brand.remote.payload.brandOverride, brand.local.payload.brandOverride);
    assertApiContractResponse("POST", "/api/brand-identity", brand.remote.payload);

    const badBrand = await requestPair(runtime, server, "/api/brand-identity", {
      method: "POST",
      body: { teamId: "BUF", primaryColor: "not-a-color" }
    });
    assert.equal(badBrand.local.status, 400);

    const localSnapshot = await runtime.request("/api/rewind/snapshot", {
      method: "POST", body: { label: "Parity checkpoint" }
    });
    const remoteSnapshot = await requestServer(server.baseUrl, "/api/rewind/snapshot", {
      method: "POST", body: { label: "Parity checkpoint" }
    });
    assert.equal(remoteSnapshot.status, localSnapshot.status);
    assert.deepEqual(topLevelShape(remoteSnapshot.payload), topLevelShape(localSnapshot.payload));
    assert.deepEqual(topLevelShape(remoteSnapshot.payload.entry), topLevelShape(localSnapshot.payload.entry));
    assertApiContractResponse("POST", "/api/rewind/snapshot", remoteSnapshot.payload);
    const localRewind = await runtime.request("/api/rewind");
    const remoteRewind = await requestServer(server.baseUrl, "/api/rewind");
    assert.equal(localRewind.payload.snapshots.length, 1);
    assert.equal(remoteRewind.payload.snapshots.length, 1);
    const deletedLocal = await runtime.request("/api/rewind/delete", {
      method: "POST", body: { id: localSnapshot.payload.entry.id }
    });
    const deletedRemote = await requestServer(server.baseUrl, "/api/rewind/delete", {
      method: "POST", body: { id: remoteSnapshot.payload.entry.id }
    });
    assert.deepEqual(topLevelShape(deletedRemote.payload), topLevelShape(deletedLocal.payload));
    assert.equal(deletedRemote.payload.snapshots.length, 0);

    const speedrun = await requestPair(runtime, server, "/api/speedrun/start", {
      method: "POST", body: { teamId: "BUF" }
    });
    assert.deepEqual(topLevelShape(speedrun.remote.payload.challenge), topLevelShape(speedrun.local.payload.challenge));
    await requestPair(runtime, server, "/api/speedrun/status");
    await requestPair(runtime, server, "/api/speedrun/abandon", { method: "POST" });

    const lobby = await requestPair(runtime, server, "/api/commissioner/create", {
      method: "POST", body: { commissionerId: "commish", controlledTeamId: "BUF", maxPlayers: 3 }
    });
    assert.equal(lobby.local.payload.lobby.totalPlayers, 1);
    const joined = await requestPair(runtime, server, "/api/commissioner/join", {
      method: "POST", body: { userId: "guest", displayName: "Guest", controlledTeamId: "MIA" }
    });
    assert.equal(joined.remote.payload.lobby.totalPlayers, joined.local.payload.lobby.totalPlayers);
    const ready = await requestPair(runtime, server, "/api/commissioner/ready", {
      method: "POST", body: { userId: "guest" }
    });
    assert.equal(ready.remote.payload.lobby.readyPlayers, ready.local.payload.lobby.readyPlayers);
    await requestPair(runtime, server, "/api/commissioner/lobby", { method: "DELETE" });

    await requestPair(runtime, server, "/api/draft/prepare", { method: "POST", body: {} });
    const combine = await requestPair(runtime, server, "/api/combine/run", { method: "POST", body: {} });
    assert.equal(combine.remote.payload.count, combine.local.payload.count);
    const combineResults = await requestPair(runtime, server, "/api/combine/results");
    assert.equal(combineResults.remote.payload.summary.length, combineResults.local.payload.summary.length);
  } finally {
    await server.close();
  }
});
