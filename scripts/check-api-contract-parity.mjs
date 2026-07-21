#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { API_CONTRACT, apiContractKey } from "../public/lib/apiContract.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");

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
  const missingLocal = API_CONTRACT.filter((entry) => !localKeys.has(entry.key));
  const missingServer = API_CONTRACT.filter((entry) => !serverKeys.has(entry.key));
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
      "Missing local routes:\n" + missingLocal.map((entry) => "  " + entry.key).join("\n")
    );
    if (missingServer.length) sections.push(
      "Missing server routes:\n" + missingServer.map((entry) => "  " + entry.key).join("\n")
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
      + result.contracts + " contracts, 0 adapter gaps"
    ))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
