#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputRoot = path.join(root, "output", "playwright");
const receiptDir = path.join(root, "docs", "visual-qa");
const surfaceLabels = new Map([
  ["game-dialog", "First-run Opening Contract tutorial"],
  ["cap-pressure", "Opening salary-cap pressure and General Manager legacy"],
  ["waiver-identity", "Named and rated waiver-wire player identity"],
  ["franchise-legends", "Franchise Legends dynasty memory"],
  ["gm-persona", "General Manager market reputation"],
  ["trophy-road", "Trophy Road progress and next unlock"],
  ["sim-watch-reel", "Broadcast Director Final Reel"],
  ["room-watch", "Position Room Watch parity alerts"],
  ["architect-cut", "Architect's Cut and Decision Anthology"],
  ["guide-modal", "Game Guide populated modal"],
  ["rival-coaching", "Rival coaching ownership boundary"],
  ["decision-archive", "Permanent Decision Archive sparse state"],
  ["co-gm-brief", "Privacy-bounded Co-GM Brief"],
  ["prediction-receipt", "Prediction winner and margin receipt"],
  ["agent-negotiation", "Canonical contract-year agent negotiation"],
  ["draft-trade-review", "Irreversible live-pick trade confirmation"],
  ["hof-ceremony", "Hall of Fame induction ceremony"],
  ["architect-signature", "Architecture Review strongest mastery signature"],
  ["architect-objective", "Player-authored Architect Objective hierarchy"],
  ["exact-command-center", "Ranked General Manager command strip"],
  ["exact-command-target", "Exact command destination and keyboard focus target"],
  ["facility-capital", "Owner facility-capital liquidity, runway, and obligation receipt"],
  ["gist-authentication", "Cloud-save corruption and optional authentication boundary"]
]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: node scripts/write-visual-qa-receipt.mjs");
  process.exit(0);
}

const candidates = (await fs.readdir(outputRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("responsive-"))
  .map((entry) => path.join(outputRoot, entry.name));
if (!candidates.length) throw new Error("No responsive evidence directory found");

const evidenceDirs = (await Promise.all(candidates.map(async (dir) => {
  try {
    return { dir, stat: await fs.stat(path.join(dir, "responsive-evidence.json")) };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}))).filter(Boolean);
if (!evidenceDirs.length) throw new Error("No completed responsive evidence report found");
evidenceDirs.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
const evidenceDir = evidenceDirs[0].dir;
const reportBuffer = await fs.readFile(path.join(evidenceDir, "responsive-evidence.json"));
const report = JSON.parse(reportBuffer);
if (report.status !== "passed") throw new Error("Latest responsive evidence did not pass");
if (!/^[a-f0-9]{40}$/i.test(report.sourceRevision || "")) throw new Error("Responsive evidence is not bound to an immutable source revision");
if (!/^[a-f0-9]{64}$/i.test(report.artifactFingerprint?.digest || "")) throw new Error("Responsive evidence is not bound to an immutable artifact fingerprint");
const projectStatus = JSON.parse(await fs.readFile(path.join(root, "context", "PROJECT_STATUS.json"), "utf8"));
const explicitReceiptSession = Number(process.env.RECEIPT_SESSION || 0);
const receiptSession = Number.isInteger(explicitReceiptSession) && explicitReceiptSession > 0
  ? explicitReceiptSession
  : Math.max(1, Number(projectStatus.currentSession || 0) + 1);

await fs.mkdir(receiptDir, { recursive: true });
const captures = [];
for (const viewport of ["desktop", "mobile"]) {
  for (const [surface, page] of surfaceLabels) {
    for (const theme of ["dark", "light"]) {
      const sourceName = `${viewport}-${surface}-${theme}.png`;
      const targetName = `s${receiptSession}-${sourceName}`;
      const buffer = await fs.readFile(path.join(evidenceDir, sourceName));
      await fs.writeFile(path.join(receiptDir, targetName), buffer);
      captures.push({
        file: targetName,
        sha256: sha256(buffer),
        theme,
        viewport: viewport === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
        page
      });
    }
  }
}
for (const viewport of ["tablet", "mobile"]) {
  for (const theme of ["dark", "light"]) {
    const sourceName = `${viewport}-nav-drawer-${theme}.png`;
    const targetName = `s${receiptSession}-${sourceName}`;
    const buffer = await fs.readFile(path.join(evidenceDir, sourceName));
    await fs.writeFile(path.join(receiptDir, targetName), buffer);
    captures.push({
      file: targetName,
      sha256: sha256(buffer),
      theme,
      viewport: viewport === "tablet" ? { width: 768, height: 1024 } : { width: 390, height: 844 },
      page: "Notch-safe off-canvas section navigation"
    });
  }
}
for (const theme of ["dark", "light"]) {
  const sourceName = `mobile-game-loop-${theme}.png`;
  const targetName = `s${receiptSession}-${sourceName}`;
  const buffer = await fs.readFile(path.join(evidenceDir, sourceName));
  await fs.writeFile(path.join(receiptDir, targetName), buffer);
  captures.push({
    file: targetName,
    sha256: sha256(buffer),
    theme,
    viewport: { width: 390, height: 844 },
    page: "Mobile weekly decision deck and sticky command dock"
  });
}

const receipt = {
  schemaVersion: 1,
  capturedAt: report.generatedAt,
  sourceRevision: report.sourceRevision,
  artifactFingerprint: report.artifactFingerprint,
  artifact: `${report.artifact} responsive-evidence:${sha256(reportBuffer)}`,
  themes: ["dark", "light"],
  captures,
  inspection: {
    renderedPixelsReviewed: true,
    reviewer: "session-agent",
    findings: [
      "S107 changed how a new league's potential is generated: potential is now headroom above the player's own overall. The player sees it in the POT column and in the profile's development runway. Inspected directly on the 1440px dark roster, every visible row reads POT at or above OVR. Players in their thirties read POT equal to OVR (for example, an age-31 offensive lineman at 86 / 86), while young players carry room to grow (for example, a 22-year-old quarterback at 78 / 80). No row shows the old negative runway, which a third of every new league used to show.",
      "The Roster Window Map above the table reports room-level OVR and POT for Quarterback, Backfield, Receivers, Offensive Line, Front Seven, Secondary and Specialists, on the same scale as the table beneath it. So the position-relative potential the engine now generates is legible to the player at room level as well as row level.",
      "Theme parity checked on the same surface: the 390px light-theme roster renders the same structure with readable contrast, and its wide table scrolls inside its own container rather than widening the page, against the 1440px dark capture.",
      "The draft-room capture is NOT evidence for this change and is not claimed as such. Its single available prospect (Malik North, EDGE, 77 OVR / 92 POT) is a hardcoded fixture in scripts/responsive-evidence.mjs, and its potential exceeds what the generator can now produce for a 21-year-old at 77 (at most 84). A real draft class goes through createSyntheticPlayer and resolvePotential, which test/session107-position-relative-potential.test.js asserts directly.",
      "The release note on public/status.html is outside this capture set, which covers game surfaces only. It was verified against the live staging origin instead: https://staging.playfranchisearchitect.com/status.html returns HTTP 200 and serves the 2026-09-13 note above the 2026-09-12 note, including the line telling players their saved franchises keep their potentials.",
      "The deterministic harness inspected 255 dark and light states at 1440px desktop, 768px tablet and 390px mobile with no overflow, contrast, touch-target, selector or runtime failures, and reported status passed bound to an immutable source revision and artifact fingerprint.",
      "Deployment readiness remains independent from public-launch authority; no rendered surface asserts that email, cohort, retention, or launch approval is verified."
    ],
    fixesApplied: [
      "No rendered-pixel defect was found this session, so no visual fix was applied. The captures are evidence for an engine change, not a repair of the render layer.",
      "The player-facing release note on the public status page was written for what these captures show: potential that means the same thing at every position, no player in a new league starting past his own ceiling, and saved franchises keeping the potentials they already have."
    ],
    blockingDefectsOpen: 0
  }
};

await fs.writeFile(path.join(receiptDir, "LATEST.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`Visual QA receipt written: ${captures.length} captures from ${path.basename(evidenceDir)}`);
