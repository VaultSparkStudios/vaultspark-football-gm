#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { API_CONTRACT, apiContractKey } from "../public/lib/apiContract.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");

// Adapter-only routes are exceptional transport capabilities, never an implicit
// escape hatch. Every entry must be reviewed here with a stable reason before the
// parity report may exclude it from the shared browser/server/local contract.
export const ADAPTER_ONLY_CONTRACTS = Object.freeze({
  local: Object.freeze([]),
  server: Object.freeze([])
});

// These routes are deliberately outside the browser-call manifest but remain a
// supported shared runtime surface (CLI, test harness, or operator inspection).
// Classification is exact: each route must exist in BOTH adapters or parity fails.
export const SHARED_NON_BROWSER_CONTRACTS = Object.freeze([
  { key: "POST /api/advance-season", reason: "explicit simulation harness command" },
  { key: "GET /api/boxscores", reason: "direct API archive query used by runtime tests" },
  { key: "GET /api/what-if-replay", reason: "explicit non-canon replay API" },
  { key: "GET /api/events", reason: "operator event-ledger inspection" },
  { key: "GET /api/warehouse", reason: "operator warehouse snapshot inspection" },
  { key: "GET /api/records", reason: "legacy aggregate records API" },
  { key: "GET /api/champions", reason: "legacy champions archive API" },
  { key: "GET /api/calibration", reason: "operator calibration snapshot API" }
]);

async function walkJavaScript(rootDir) {
  const files = [];
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(target);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
    }
  }
  return files;
}

export function extractBrowserApiCalls(source) {
  const calls = [];
  const pattern = /\bapi\s*\(\s*["'\x60](\/api\/[a-z0-9/_-]+)/gi;
  let match = pattern.exec(source);
  while (match) {
    const openIndex = source.indexOf("(", match.index);
    let depth = 0;
    let quote = null;
    let escaped = false;
    let endIndex = Math.min(source.length, openIndex + 4000);
    for (let index = openIndex; index < endIndex; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "\"" || char === "'" || char.charCodeAt(0) === 96) {
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          endIndex = index + 1;
          break;
        }
      }
    }
    const nearby = source.slice(openIndex, endIndex);
    const explicitMethod = nearby.match(/\bmethod\s*:\s*["'](GET|POST|DELETE|PATCH|PUT)["']/i);
    const method = explicitMethod ? explicitMethod[1].toUpperCase() : "GET";
    calls.push({ method, path: match[1], key: apiContractKey(method, match[1]) });
    match = pattern.exec(source);
  }
  return calls;
}

export function extractAdapterContracts(source, adapter) {
  const conditionName = adapter === "server" ? "req\\.method" : "method";
  const pathName = adapter === "server" ? "url\\.pathname" : "pathname";
  const pattern = new RegExp(
    "if\\s*\\(\\s*" + conditionName + "\\s*===\\s*[\"'](GET|POST|DELETE)[\"']\\s*&&\\s*"
      + pathName + "\\s*===\\s*[\"'](\\/api\\/[a-z0-9/_-]+)[\"']",
    "gi"
  );
  const keys = new Set();
  let match = pattern.exec(source);
  while (match) {
    keys.add(apiContractKey(match[1], match[2]));
    match = pattern.exec(source);
  }
  return keys;
}

export function compareAdapterContracts({ manifestKeys, localKeys, serverKeys } = {}) {
  const manifest = manifestKeys instanceof Set ? manifestKeys : new Set(manifestKeys || []);
  const local = localKeys instanceof Set ? localKeys : new Set(localKeys || []);
  const server = serverKeys instanceof Set ? serverKeys : new Set(serverKeys || []);
  const allowedLocal = new Set(ADAPTER_ONLY_CONTRACTS.local.map((entry) => entry.key));
  const allowedServer = new Set(ADAPTER_ONLY_CONTRACTS.server.map((entry) => entry.key));
  const sharedNonBrowser = new Set(SHARED_NON_BROWSER_CONTRACTS.map((entry) => entry.key));
  return {
    missingLocal: [...manifest].filter((key) => !local.has(key)),
    missingServer: [...manifest].filter((key) => !server.has(key)),
    missingSharedLocal: [...sharedNonBrowser].filter((key) => !local.has(key)),
    missingSharedServer: [...sharedNonBrowser].filter((key) => !server.has(key)),
    unexpectedLocal: [...local].filter((key) => !manifest.has(key) && !sharedNonBrowser.has(key) && !allowedLocal.has(key)),
    unexpectedServer: [...server].filter((key) => !manifest.has(key) && !sharedNonBrowser.has(key) && !allowedServer.has(key))
  };
}

export async function assertApiContractParity({ rootDir = defaultRoot } = {}) {
  const publicDir = path.join(rootDir, "public");
  const browserCalls = [];
  for (const file of await walkJavaScript(publicDir)) {
    const source = await fs.readFile(file, "utf8");
    browserCalls.push(...extractBrowserApiCalls(source).map((call) => ({
      ...call,
      file: path.relative(rootDir, file)
    })));
  }
  const manifestKeys = new Set(API_CONTRACT.map((entry) => entry.key));
  const malformedContracts = API_CONTRACT.filter((entry) =>
    !entry.method
    || !entry.path
    || !entry.key
    || !entry.authority
    || !entry.mutability
    || !entry.responseShapeId
    || !Array.isArray(entry.successShape?.required)
    || !Array.isArray(entry.successShape?.anyOf)
  );
  const duplicateContracts = API_CONTRACT.filter((entry, index) =>
    API_CONTRACT.findIndex((candidate) => candidate.key === entry.key) !== index
  );
  const undeclared = browserCalls.filter((call) => !manifestKeys.has(call.key));
  const localSource = await fs.readFile(path.join(rootDir, "src", "app", "api", "localApiRuntime.js"), "utf8");
  const serverSource = await fs.readFile(path.join(rootDir, "src", "server.js"), "utf8");
  const localKeys = extractAdapterContracts(localSource, "local");
  const serverKeys = extractAdapterContracts(serverSource, "server");
  const adapterDiff = compareAdapterContracts({ manifestKeys, localKeys, serverKeys });
  const missingLocal = adapterDiff.missingLocal;
  const missingServer = adapterDiff.missingServer;
  const missingSharedLocal = adapterDiff.missingSharedLocal;
  const missingSharedServer = adapterDiff.missingSharedServer;
  const unexpectedLocal = adapterDiff.unexpectedLocal;
  const unexpectedServer = adapterDiff.unexpectedServer;
  const missingCorsMethods = API_CONTRACT.some((entry) => entry.method === "DELETE")
    && !/Access-Control-Allow-Methods["'],\s*["'][^"']*\bDELETE\b/i.test(serverSource)
    ? ["DELETE"]
    : [];
  if (
    malformedContracts.length
    || duplicateContracts.length
    || undeclared.length
    || missingLocal.length
    || missingServer.length
    || missingSharedLocal.length
    || missingSharedServer.length
    || unexpectedLocal.length
    || unexpectedServer.length
    || missingCorsMethods.length
  ) {
    const sections = [];
    if (malformedContracts.length) sections.push(
      "Malformed contracts:\n" + malformedContracts.map((entry) => "  " + (entry.key || JSON.stringify(entry))).join("\n")
    );
    if (duplicateContracts.length) sections.push(
      "Duplicate contracts:\n" + duplicateContracts.map((entry) => "  " + entry.key).join("\n")
    );
    if (undeclared.length) sections.push(
      "Undeclared browser calls:\n" + undeclared.map((entry) => "  " + entry.key + " (" + entry.file + ")").join("\n")
    );
    if (missingLocal.length) sections.push(
      "Missing local routes:\n" + missingLocal.map((key) => "  " + key).join("\n")
    );
    if (missingServer.length) sections.push(
      "Missing server routes:\n" + missingServer.map((key) => "  " + key).join("\n")
    );
    if (missingSharedLocal.length) sections.push(
      "Missing classified shared local routes:\n" + missingSharedLocal.map((key) => "  " + key).join("\n")
    );
    if (missingSharedServer.length) sections.push(
      "Missing classified shared server routes:\n" + missingSharedServer.map((key) => "  " + key).join("\n")
    );
    if (unexpectedLocal.length) sections.push(
      "Unexpected local routes:\n" + unexpectedLocal.map((key) => "  " + key).join("\n")
    );
    if (unexpectedServer.length) sections.push(
      "Unexpected server routes:\n" + unexpectedServer.map((key) => "  " + key).join("\n")
    );
    if (missingCorsMethods.length) sections.push(
      "Missing server CORS methods:\n" + missingCorsMethods.map((method) => "  " + method).join("\n")
    );
    throw new Error(sections.join("\n"));
  }
  return {
    browserCallSites: browserCalls.length,
    contracts: API_CONTRACT.length,
    localRoutes: localKeys.size,
    serverRoutes: serverKeys.size,
    sharedNonBrowserRoutes: SHARED_NON_BROWSER_CONTRACTS.length,
    responseShapes: new Set(API_CONTRACT.map((entry) => entry.responseShapeId)).size,
    gaps: 0
  };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  assertApiContractParity()
    .then((result) => console.log(
      "api contract parity: "
      + result.browserCallSites + " calls, "
      + result.contracts + " browser contracts + "
      + result.sharedNonBrowserRoutes + " classified shared routes, 0 adapter gaps"
      + " (local " + result.localRoutes + ", server " + result.serverRoutes + ")"
    ))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
