import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { parseArtifactHeaderRules, resolveArtifactHeaders } from "../../scripts/lib/edge-security-policy.mjs";

const artifact = path.resolve(fileURLToPath(new URL("../../static/", import.meta.url)));
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
export const CHECKPOINT_KEY = "vsfgm:client-session:v1";
export const PENDING_KEY = "vsfgm:client-session:pending:v1";
export const CLIENT_SCENARIO = Object.freeze({ seed: 20260306, year: 2024, team: "CHI", mode: "play" });

// Same artifact/header parser as responsive-evidence; there is no API server
// or HTML runtime-meta rewrite. Emulate Pages' canonical .html redirects too.
export async function startStaticClientHost() {
  await fs.access(path.join(artifact, "lib/api/clientSessionRecovery.js"));
  const headers = parseArtifactHeaderRules(await fs.readFile(path.join(artifact, "_headers"), "utf8"));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/index.html" || url.pathname === "/game.html") {
        res.writeHead(308, { location: `${url.pathname === "/index.html" ? "/" : "/game"}${url.search}` });
        res.end();
        return;
      }
      const relative = url.pathname === "/" ? "index.html" : url.pathname === "/game" ? "game.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const target = path.resolve(artifact, relative);
      if (!target.startsWith(`${artifact}${path.sep}`) && target !== path.join(artifact, "index.html")) {
        res.writeHead(403).end();
        return;
      }
      const body = await fs.readFile(target);
      res.writeHead(200, { ...resolveArtifactHeaders(headers, url.pathname), "content-type": types[path.extname(target)] || "application/octet-stream" });
      res.end(body);
    } catch (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain" });
      res.end("Static artifact unavailable");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  } };
}

export async function configureClient(page, worker) {
  await page.addInitScript((useWorker) => {
    localStorage.setItem("vsfgm:runtime-mode", "client");
    if (useWorker) localStorage.removeItem("vsfgm:runtime-worker");
    else localStorage.setItem("vsfgm:runtime-worker", "off");
    const postMessage = Worker.prototype.postMessage;
    const addListener = Worker.prototype.addEventListener;
    const removeListener = Worker.prototype.removeEventListener;
    const observed = new WeakSet();
    const requests = new WeakMap();
    const listeners = new WeakMap();
    const count = (field) => {
      const key = "test:worker-recovery-wire";
      const totals = JSON.parse(sessionStorage.getItem(key) || "{}");
      totals[field] = (totals[field] || 0) + 1;
      sessionStorage.setItem(key, JSON.stringify(totals));
    };
    Worker.prototype.addEventListener = function (type, listener, options) {
      if (type !== "message" || typeof listener !== "function") return addListener.call(this, type, listener, options);
      let callbacks = listeners.get(this);
      if (!callbacks) { callbacks = new WeakMap(); listeners.set(this, callbacks); }
      let wrapped = callbacks.get(listener);
      if (!wrapped) {
        wrapped = (event) => {
          const gate = globalThis.__checkpointGate;
          const request = requests.get(this)?.get(event.data?.id);
          if (gate?.active && event.data?.type === "response" && request?.type === "recovery-capture") {
            // Keep the actual completed worker response. Release delivers it
            // exactly once to the real page transport, with no fabricated data.
            gate.held += 1;
            gate.deliveries.push(() => listener.call(this, event));
            return;
          }
          return listener.call(this, event);
        };
        callbacks.set(listener, wrapped);
      }
      return addListener.call(this, type, wrapped, options);
    };
    Worker.prototype.removeEventListener = function (type, listener, options) {
      return removeListener.call(this, type, type === "message" ? listeners.get(this)?.get(listener) || listener : listener, options);
    };
    Worker.prototype.postMessage = function (message, ...rest) {
      if (!observed.has(this)) {
        observed.add(this);
        requests.set(this, new Map());
        addListener.call(this, "message", (event) => {
          const data = event.data;
          if (!["response", "response-error"].includes(data?.type)) return;
          requests.get(this).delete(data.id);
          const snapshot = data.response?.payload?.snapshot || data.response?.snapshot;
          if (snapshot && typeof snapshot === "object") count("rawSnapshotResponses");
        });
      }
      if (["request", "recovery-capture", "recovery-restore"].includes(message?.type)) requests.get(this).set(message.id, { type: message.type, path: message.path });
      if (message?.type === "recovery-capture") count("captureRequests");
      if (message?.type === "recovery-restore") count("restoreRequests");
      if ((message?.snapshot && typeof message.snapshot === "object") ||
          (message?.body?.snapshot && typeof message.body.snapshot === "object")) count("rawSnapshotRequests");
      if (message?.type === "request" && message.path === "/api/snapshot/export") count("snapshotExportRequests");
      if (message?.type === "request" && message.path === "/api/snapshot/import") count("snapshotImportRequests");
      if (message?.type === "request" && message.method === "POST") {
        const key = "test:observed-client-commands";
        const rows = JSON.parse(sessionStorage.getItem(key) || "[]");
        // Recovery imports contain a full snapshot. Observability must not
        // duplicate that payload into the very storage whose quota we test.
        rows.push({ path: message.path });
        sessionStorage.setItem(key, JSON.stringify(rows));
      }
      return postMessage.call(this, message, ...rest);
    };
  }, worker);
}

export async function waitSetupReady(page) {
  // The source HTML says Ready before its module starts; only populated client
  // diagnostics prove that setup initialization has settled.
  await expect(page.locator("#setupStatus")).toHaveAttribute("data-diagnostics", /^Ready \| client/, { timeout: 30_000 });
  await expect(page.locator("#activeLeagueText")).not.toContainText("Checking");
  await expect(page.locator("#runtimeModeSelect")).toHaveValue("client");
}

export async function prepareClientSetup(page, origin, scenario = CLIENT_SCENARIO) {
  await page.goto(origin);
  await waitSetupReady(page);
  const details = page.locator("details:has(#seedInput)");
  if (await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
  await page.locator("#seedInput").fill(String(scenario.seed));
  await page.locator("#startYearInput").fill(String(scenario.year));
  await page.locator("#teamSelect").selectOption(scenario.team);
  await page.locator("#modeInput").selectOption(scenario.mode);
  await expect(page.locator("#seedInput")).toHaveValue(String(scenario.seed));
  await expect(page.locator("#teamSelect")).toHaveValue(scenario.team);
  await expect(page.locator("#startYearInput")).toHaveValue(String(scenario.year));
  await expect(page.locator("#modeInput")).toHaveValue(scenario.mode);
}

export async function waitGameReady(page) {
  await expect(page).toHaveURL(/\/game(?:\?.*)?$/, { timeout: 60_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  await expect(page.locator("#gameBootOverlay")).toHaveCount(0);
}

export async function readClient(page, route) {
  return page.evaluate(async (route) => {
    const { createApiClient } = await import("./lib/api/createApiClient.js");
    return createApiClient()(route);
  }, route);
}

export async function readIdentity(page) {
  return page.evaluate(async () => {
    const { createApiClient } = await import("./lib/api/createApiClient.js");
    const api = createApiClient();
    const dashboard = await api("/api/state");
    const key = "test:worker-recovery-wire";
    const totals = JSON.parse(sessionStorage.getItem(key) || "{}");
    totals.explicitSnapshotReads = (totals.explicitSnapshotReads || 0) + 1;
    sessionStorage.setItem(key, JSON.stringify(totals));
    const { snapshot } = await api("/api/snapshot/export");
    return { franchiseId: dashboard.franchiseId, team: snapshot.controlledTeamId,
      startYear: snapshot.startYear, year: snapshot.currentYear, week: snapshot.currentWeek,
      mode: snapshot.mode, rngSeed: snapshot.rngSeed };
  });
}

export async function assertRuntime(page, worker) {
  expect(await page.evaluate(async () => {
    const runtime = await import("./lib/api/createApiClient.js");
    await runtime.warmLocalRuntime();
    return { mode: runtime.getRuntimeMode(), kind: runtime.getLocalRuntimeKind() };
  })).toEqual({ mode: "client", kind: worker ? "worker" : "in-page" });
}

export async function createClientLeague(page, origin, scenario = CLIENT_SCENARIO) {
  await prepareClientSetup(page, origin, scenario);
  await page.locator("#createLeagueBtn").click();
  await waitGameReady(page);
  const identity = await readIdentity(page);
  expect(identity).toMatchObject({ franchiseId: `fa-${scenario.seed}-${scenario.team}`, team: scenario.team, startYear: scenario.year, year: scenario.year, week: 1, mode: scenario.mode });
  await expect(page.locator("#tutSkipBtn")).toBeVisible();
  await page.locator("#tutSkipBtn").click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  return identity;
}

export async function advanceClientWeek(page) {
  const dashboard = await readClient(page, "/api/state");
  await page.locator("#advanceWeekBtn").click();
  if (dashboard.gmDecisionQueue.length) {
    const choice = page.locator("#gmDecisionOptions .gm-decision-option").first();
    await expect(choice).toBeVisible();
    await choice.click();
  }
  if (!dashboard.controlledOnBye) {
    await expect(page.locator("#halftimeAdjustModal .tactic-skip-btn")).toBeVisible();
    await page.locator("#halftimeAdjustModal .tactic-skip-btn").click();
    await expect(page.locator("#commitArchitectPlanBtn")).toBeVisible();
    await page.locator("#commitArchitectPlanBtn").click();
  }
  await expect.poll(async () => (await readIdentity(page)).week, { timeout: 30_000 }).toBe(dashboard.currentWeek + 1);
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 30_000 });
  const decline = page.locator("#firstDebriefDecline");
  if (await decline.isVisible()) await decline.click();
  return readIdentity(page);
}

export async function saveSlot(page, slot) {
  await page.locator('[data-testid="tab-settings"]').click();
  await expect(page.locator("#settingsTab")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#saveListText")).toBeVisible();
  // Settings hydration replaces the default field once; wait for its data
  // load before choosing the explicit slot the test means to save.
  await expect(page.locator("#saveSlotInput")).toBeVisible();
  await page.locator("#saveSlotInput").fill(slot);
  await expect(page.locator("#saveSlotInput")).toHaveValue(slot);
  await page.locator("#saveBtn").click();
  await expect.poll(async () => (await readClient(page, "/api/saves")).slots.some((save) => save.slot === slot)).toBe(true);
  await expect(page.locator("#statusChip")).toContainText("Ready");
}

export async function openSetup(page) {
  await page.locator("#backSetupBtn").click();
  await expect(page).toHaveURL(/\/$/);
  await waitSetupReady(page);
}

export async function revealTable(page, table) {
  const details = page.locator(`details:has(${table})`);
  if (await details.count() && await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
}

export async function installCheckpointFault(page) {
  await page.evaluate(({ checkpointKey, pendingKey }) => {
    const setItem = Storage.prototype.setItem;
    globalThis.__checkpointFault = { reject: false, rejectPending: false, rejected: 0 };
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage && ((key === checkpointKey && globalThis.__checkpointFault.reject) ||
          (key === pendingKey && globalThis.__checkpointFault.rejectPending))) {
        globalThis.__checkpointFault.rejected += 1;
        throw new DOMException("Injected checkpoint quota failure", "QuotaExceededError");
      }
      return setItem.call(this, key, value);
    };
  }, { checkpointKey: CHECKPOINT_KEY, pendingKey: PENDING_KEY });
}

// Real snapshots remain intact; only the checkpoint write is quota constrained.
// Keep this active across navigation so a tiny named-save reference must work
// in a fresh runtime as well as in the page which selected it.
export async function installCheckpointQuota(page, maxLength = 2048) {
  const install = ({ checkpointKey, maxLength }) => {
    if (globalThis.__checkpointQuota) return;
    const setItem = Storage.prototype.setItem;
    globalThis.__checkpointQuota = { maxLength, rejected: 0 };
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage && key === checkpointKey && String(value).length > maxLength) {
        globalThis.__checkpointQuota.rejected += 1;
        throw new DOMException("Injected checkpoint size quota", "QuotaExceededError");
      }
      return setItem.call(this, key, value);
    };
  };
  const options = { checkpointKey: CHECKPOINT_KEY, maxLength };
  await page.addInitScript(install, options);
  await page.evaluate(install, options);
}

export async function installCompressionGate(page) {
  await page.evaluate(() => {
    const NativeCompressionStream = CompressionStream;
    const gate = { held: 0, release: null };
    const released = new Promise((resolve) => { gate.release = resolve; });
    globalThis.__checkpointGate = gate;
    globalThis.CompressionStream = class {
      constructor(format) {
        const native = new NativeCompressionStream(format);
        this.writable = native.writable;
        this.readable = native.readable.pipeThrough(new TransformStream({ async transform(chunk, controller) {
          gate.held += 1;
          await released;
          controller.enqueue(chunk);
        } }));
      }
    };
  });
}

export async function installWorkerCheckpointGate(page) {
  await page.evaluate(() => {
    const gate = { active: true, held: 0, deliveries: [] };
    gate.release = () => {
      gate.active = false;
      for (const deliver of gate.deliveries.splice(0)) deliver();
    };
    globalThis.__checkpointGate = gate;
  });
}

export async function assertWorkerCheckpointWire(page) {
  const totals = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test:worker-recovery-wire") || "{}"));
  expect(totals.captureRequests).toBeGreaterThan(0);
  expect(totals.restoreRequests).toBeGreaterThan(0);
  expect(totals.snapshotImportRequests || 0).toBe(0);
  expect(totals.rawSnapshotRequests || 0).toBe(0);
  expect(totals.snapshotExportRequests || 0).toBe(totals.explicitSnapshotReads);
  expect(totals.rawSnapshotResponses || 0).toBe(totals.explicitSnapshotReads);
}
