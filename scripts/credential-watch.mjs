#!/usr/bin/env node
const silent = process.argv.includes("--silent");
if (!silent) {
  console.log("credential-watch: no project-local credential transitions to process");
}
