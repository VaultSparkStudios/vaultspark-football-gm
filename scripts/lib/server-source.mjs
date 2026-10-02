// The Node server's route surface lives in src/server.js plus the modules under
// src/server/ (route modules in src/server/routes/, helpers beside them). Any
// gate or test that reads the server as source text reads all of it through
// here, so moving a route between files can never hide it from a text check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * Every file that makes up the server source, as absolute paths: src/server.js
 * first, then each src/server/**\/*.js in sorted repo-relative order.
 */
export function SERVER_SOURCE_FILES(rootDir = REPO_ROOT) {
  const root = path.resolve(rootDir);
  const modules = listJsFiles(path.join(root, "src", "server"))
    .map((file) => path.relative(root, file).split(path.sep).join("/"))
    .sort()
    .map((relative) => path.join(root, ...relative.split("/")));
  return [path.join(root, "src", "server.js"), ...modules];
}

/** The combined server source text, in SERVER_SOURCE_FILES order. */
export function readServerSource(rootDir = REPO_ROOT) {
  return SERVER_SOURCE_FILES(rootDir)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}
