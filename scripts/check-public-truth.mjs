import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Public-truth gate (S70): every numeric or architectural claim on a public
// page must match derived source truth, and internal Studio governance
// vocabulary may never ship on a public surface. Fails closed at build.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const TEAM_COUNT = 32;

// Claims that were previously published and proven false or dev-facing.
// Comments are stripped before matching, so this guards shipped text.
const FORBIDDEN_PUBLIC_CLAIMS = [
  /IndexedDB \(250MB\)/i,
  /API Routes/,
  /last 10 major decisions/i,
  /Three Persistence Layers/i
];

// Internal lifecycle/governance vocabulary that must stay in the ops plane.
const FORBIDDEN_INTERNAL_VOCAB = [
  /\bSPARKED\b/,
  /\bFORGE\b/,
  /founder/i,
  /Vault Salvage/i,
  /Studio OS/
];

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

export function inspectPublicTruth(root = rootDir) {
  const publicDir = path.join(root, "public");
  const problems = [];

  const engineCount = fs.readdirSync(path.join(root, "src", "engine")).filter((name) => name.endsWith(".js")).length;
  const landing = stripComments(fs.readFileSync(path.join(publicDir, "landing.html"), "utf8"));

  const statedEngineCounts = [...landing.matchAll(/(\d+) Engine Systems|<div class="stat-num">(\d+)<\/div><div class="stat-label">Engine Systems/g)]
    .map((m) => Number(m[1] ?? m[2]));
  if (!statedEngineCounts.length) {
    problems.push("landing.html no longer states the engine-system count; update check-public-truth.mjs if that is intentional");
  }
  for (const stated of statedEngineCounts) {
    if (stated !== engineCount) {
      problems.push(`landing.html claims ${stated} engine systems but src/engine contains ${engineCount} modules`);
    }
  }

  const rivalMatch = landing.match(/<div class="stat-num">(\d+)<\/div><div class="stat-label">Rival Front Offices/);
  if (rivalMatch && Number(rivalMatch[1]) !== TEAM_COUNT - 1) {
    problems.push(`landing.html claims ${rivalMatch[1]} rival front offices but the league has ${TEAM_COUNT - 1}`);
  }

  const htmlFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    const source = stripComments(fs.readFileSync(path.join(publicDir, name), "utf8"));
    for (const pattern of FORBIDDEN_PUBLIC_CLAIMS) {
      if (pattern.test(source)) problems.push(`${name} ships a retired/false claim matching ${pattern}`);
    }
    for (const pattern of FORBIDDEN_INTERNAL_VOCAB) {
      if (pattern.test(source)) problems.push(`${name} leaks internal vocabulary matching ${pattern}`);
    }
  }

  for (const jsonName of ["public-identity.json", "agents.json", "footer-manifest.json"]) {
    const source = fs.readFileSync(path.join(publicDir, jsonName), "utf8");
    for (const pattern of FORBIDDEN_INTERNAL_VOCAB) {
      if (pattern.test(source)) problems.push(`${jsonName} leaks internal vocabulary matching ${pattern}`);
    }
  }

  const ogImage = path.join(publicDir, "images", "cover.png");
  const referencesCover = htmlFiles.some((name) =>
    fs.readFileSync(path.join(publicDir, name), "utf8").includes("images/cover.png")
  );
  if (referencesCover && !fs.existsSync(ogImage)) {
    problems.push("public pages reference images/cover.png but the file does not exist (broken social shares)");
  }

  return { problems, engineCount, ok: problems.length === 0 };
}

export function assertPublicTruth(root = rootDir) {
  const report = inspectPublicTruth(root);
  if (!report.ok) {
    throw new Error(`public-truth gate failed:\n- ${report.problems.join("\n- ")}`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = assertPublicTruth();
    console.log(`public-truth gate: OK (${report.engineCount} engine systems verified)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
