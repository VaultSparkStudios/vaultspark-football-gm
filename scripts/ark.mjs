#!/usr/bin/env node
const [, , command] = process.argv;
const silent = process.argv.includes("--silent");

if (command === "drain") {
  if (!silent) console.log("ark: no project-local inbox configured; drain treated as empty");
  process.exit(0);
}

console.error(`ark: unsupported project-local command "${command || ""}"`);
process.exit(1);
