#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseDate(value) {
  const parsed = value ? new Date(`${value}T00:00:00Z`) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function evaluateBriefFreshness({ briefText = "", status = null, now = new Date() } = {}) {
  const generatedAt = briefText.match(/generated-at:\s*([0-9-]+)/)?.[1] || null;
  const generated = parseDate(generatedAt);
  const ageDays = generated ? Math.floor((now - generated) / 86400000) : 999;
  const closeoutSession = Number(briefText.match(/generated-at:[^\n]*\(Session\s+(\d+)\s+closeout\)/i)?.[1] || NaN);
  const renderedSession = Number(briefText.match(/║\s+Session\s+(\d+)\s+·/i)?.[1] || NaN);
  const statusSession = Number(status?.currentSession);
  const coherent = /<!--\s*brief-coherent:\s*true\s*-->/i.test(briefText);
  const reasons = [];

  if (ageDays > 1) reasons.push(`brief is ${ageDays} days old`);
  if (!coherent) reasons.push("brief coherence marker is missing or false");
  if (!Number.isInteger(statusSession)) reasons.push("PROJECT_STATUS.currentSession is missing");
  if (!Number.isInteger(closeoutSession)) reasons.push("generated closeout session is missing");
  if (!Number.isInteger(renderedSession)) reasons.push("rendered session is missing");
  if (Number.isInteger(statusSession) && Number.isInteger(closeoutSession) && closeoutSession !== statusSession) {
    reasons.push(`generated closeout S${closeoutSession} != status S${statusSession}`);
  }
  if (Number.isInteger(statusSession) && Number.isInteger(renderedSession) && renderedSession !== statusSession + 1) {
    reasons.push(`rendered session S${renderedSession} != expected S${statusSession + 1}`);
  }

  return {
    fresh: reasons.length === 0,
    reasons,
    generatedAt,
    ageDays,
    closeoutSession: Number.isInteger(closeoutSession) ? closeoutSession : null,
    renderedSession: Number.isInteger(renderedSession) ? renderedSession : null,
    statusSession: Number.isInteger(statusSession) ? statusSession : null,
    coherent
  };
}

function main() {
  const root = process.cwd();
  const briefPath = path.join(root, "docs", "STARTUP_BRIEF.md");
  const statusPath = path.join(root, "context", "PROJECT_STATUS.json");
  if (!fs.existsSync(briefPath)) {
    console.error("STALE: STARTUP_BRIEF.md missing");
    process.exitCode = 1;
    return;
  }
  let status = null;
  try {
    status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch {
    status = null;
  }
  const result = evaluateBriefFreshness({ briefText: fs.readFileSync(briefPath, "utf8"), status });
  if (!result.fresh) {
    console.error(`STALE: ${result.reasons.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`FRESH: startup brief is ${result.ageDays} days old and coherent for Session ${result.renderedSession}`);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main();
