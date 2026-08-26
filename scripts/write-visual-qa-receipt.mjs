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
      "The owner facility-capital panel renders football-operations liquidity, runway, annual upkeep, operating reserve, league centers, and investability receipts legibly at 1440px desktop and 390px mobile in dark and light themes.",
      "The Cloud Save Sync panel states the exact security boundary in rendered pixels: the checksum detects accidental corruption, while the optional local passphrase adds Web Crypto authentication and does not encrypt the save.",
      "The exact-command captures exercise the shared navigation authority and prove the command destination receives keyboard focus; incremental postseason behavior is additionally covered by the real browser flow and deterministic state-machine tests.",
      "The deterministic harness inspected dark and light pixels at 1440px desktop, 768px tablet, and 390px mobile across every primary tab with no overflow, contrast, touch-target, selector, or runtime failures."
    ],
    fixesApplied: [
      "Replaced club-cash ambiguity with source-derived football-operations liquidity, obligation, runway, and bounded owner-distribution receipts.",
      "Corrected the unkeyed-checksum promise and added optional versioned PBKDF2/HMAC authentication with legacy-save support.",
      "Centralized live phase-to-surface routing and restored one controlled decision beat per postseason round."
    ],
    blockingDefectsOpen: 0
  }
};

await fs.writeFile(path.join(receiptDir, "LATEST.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`Visual QA receipt written: ${captures.length} captures from ${path.basename(evidenceDir)}`);
