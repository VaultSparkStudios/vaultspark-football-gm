import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectSimulationClaims } from "./lib/simulation-methodology.mjs";

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

// S94: a claim can be false by going stale, and nothing above can see that.
// Every check in this file compares a published value to a derived one, so the
// gate stays green for a page whose newest release note predates the newest
// shipped session by any margin at all -- which is how status.html came to tell
// visitors the game had been idle for three weeks while four of the project's
// most significant arcs shipped unannounced. One session is the honest
// tolerance: the note lands at closeout, so being one behind is in-flight and
// being two behind is a page that stopped tracking the product.
const RELEASE_NOTE_SESSION_TOLERANCE = 1;

function newestReleaseNoteDate(html) {
  const dates = [...html.matchAll(/<h3>\s*(\d{4}-\d{2}-\d{2})\s*[—-]/g)].map((match) => match[1]).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

export function inspectReleaseNoteFreshness(root = rootDir) {
  const statusPath = path.join(root, "public", "status.html");
  const statusPath_exists = fs.existsSync(statusPath);
  if (!statusPath_exists) return { ok: true, problems: [], skipped: "status.html absent" };
  const published = newestReleaseNoteDate(stripComments(fs.readFileSync(statusPath, "utf8")));
  if (!published) {
    return {
      ok: false,
      problems: ["status.html no longer carries a dated release note; the freshness gate cannot see the page"],
      published: null
    };
  }
  const status = JSON.parse(fs.readFileSync(path.join(root, "context", "PROJECT_STATUS.json"), "utf8"));
  const shippedAt = String(status.lastUpdated || "").slice(0, 10);
  const lastSession = Number(status.lastSession || status.currentSession || 0);
  if (!shippedAt || !lastSession) return { ok: true, problems: [], skipped: "no shipped session recorded" };

  // Count sessions, not days. Days punish a quiet week; sessions measure the
  // thing that actually goes unannounced.
  const publishedSession = sessionForDate(root, published);
  const behind = publishedSession === null ? null : lastSession - publishedSession;
  const problems = [];
  if (behind !== null && behind > RELEASE_NOTE_SESSION_TOLERANCE) {
    problems.push(
      `status.html newest release note is ${published} (session ${publishedSession}); ` +
      `PROJECT_STATUS lastSession is ${lastSession} dated ${shippedAt} — ${behind} sessions unpublished ` +
      `(tolerance ${RELEASE_NOTE_SESSION_TOLERANCE}). Write the player-facing note for what shipped.`
    );
  }
  return { ok: problems.length === 0, problems, published, publishedSession, lastSession, behind };
}

// Resolve a published date to the newest session recorded on or before it, so
// the gate tracks a moving target instead of a one-time literal.
function sessionForDate(root, isoDate) {
  const statePath = path.join(root, "context", "CURRENT_STATE.md");
  if (!fs.existsSync(statePath)) return null;
  const entries = [...fs.readFileSync(statePath, "utf8").matchAll(/^- (\d{4}-\d{2}-\d{2}): Session (\d+)/gm)]
    .map((match) => ({ date: match[1], session: Number(match[2]) }))
    .filter((entry) => entry.date <= isoDate)
    .sort((a, b) => b.session - a.session);
  return entries.length ? entries[0].session : null;
}

export function inspectPublicTruth(root = rootDir) {
  const publicDir = path.join(root, "public");
  const problems = [];
  problems.push(...inspectReleaseNoteFreshness(root).problems);

  // S94: the methodology page publishes the engine's own gate constants. If the
  // engine's ceiling moves and the page does not, the page becomes a confident
  // lie about a number the build is simultaneously enforcing.
  // Checked on the SOURCE page, not only the built one: the block lives in
  // source so the dev server and the browser suite see real figures, which means
  // source is also where a hand-edit would land. Checking only the build output
  // would let a drifted source pass until someone happened to run a build.
  for (const candidate of [
    path.join(root, "public", "simulation.html"),
    path.join(root, "static", "simulation.html")
  ]) {
    if (fs.existsSync(candidate)) {
      problems.push(...inspectSimulationClaims(fs.readFileSync(candidate, "utf8")).problems);
    }
  }

  const engineCount = fs.readdirSync(path.join(root, "src", "engine")).filter((name) => name.endsWith(".js")).length;
  // S94: landing.html was merged into index.html and is now an edge 301. The
  // engine-system and rival-club claims moved with it, so this gate follows
  // them rather than silently losing its subject.
  const landing = stripComments(fs.readFileSync(path.join(publicDir, "index.html"), "utf8"));

  const statedEngineCounts = [...landing.matchAll(/(\d+) Engine Systems|class="stat-num">(\d+)<\/strong><span class="stat-label">Engine Systems/g)]
    .map((m) => Number(m[1] ?? m[2]));
  if (!statedEngineCounts.length) {
    problems.push("index.html no longer states the engine-system count; update check-public-truth.mjs if that is intentional");
  }
  for (const stated of statedEngineCounts) {
    if (stated !== engineCount) {
      problems.push(`index.html claims ${stated} engine systems but src/engine contains ${engineCount} modules`);
    }
  }

  const rivalMatch = landing.match(/class="stat-num">(\d+)<\/strong><span class="stat-label">Rival Front Offices/);
  if (rivalMatch && Number(rivalMatch[1]) !== TEAM_COUNT - 1) {
    problems.push(`index.html claims ${rivalMatch[1]} rival front offices but the league has ${TEAM_COUNT - 1}`);
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
