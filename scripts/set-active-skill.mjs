#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const skill = process.argv[2] || "unknown";
const cacheDir = path.join(root, ".cache");
fs.mkdirSync(cacheDir, { recursive: true });
fs.writeFileSync(
  path.join(cacheDir, "active-skill.json"),
  JSON.stringify({ skill, agent: "codex", updatedAt: new Date().toISOString() }, null, 2) + "\n"
);
console.log(`active skill: ${skill}`);
