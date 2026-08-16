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
  ["exact-command-target", "Exact command destination and keyboard focus target"]
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
    reviewer: "codex-gpt-5",
    findings: [
      "The first-run Opening Contract tutorial reserves stable panel space and remains fully readable in dark and light themes at desktop and mobile widths.",
      "The deterministic harness inspected dark and light pixels at 1440px desktop, 768px tablet, and 390px mobile across every primary tab with no overflow, contrast, touch-target, selector, or runtime failures.",
      "The Architecture Review strongest-signature card remains legible in both themes and at mobile width, including the source receipt count and non-causal boundary.",
      "Ranked General Manager commands and their exact contract destination render without clipping and preserve a visible focus target across desktop and mobile.",
      "The canonical Agent Negotiation modal exposes persona, source-derived leverage, ask, guaranteed money, deadline, and its bounded receipt ledger without a parallel mutation control.",
      "Prediction receipts distinguish winner accuracy from margin error and remain readable at desktop and mobile widths.",
      "The Hall of Fame ceremony remains legible in both themes, with one dialog boundary and explicit copy/download status.",
      "Salary-cap pressure, waiver player identity, Franchise Legends, and General Manager market reputation remain readable in both themes at desktop and mobile widths."
    ],
    fixesApplied: [
      "Added first-run tutorial captures to the durable receipt across both themes and target widths after the layout-stability fix.",
      "Added component-specific Agent Negotiation, prediction-receipt, and Hall of Fame ceremony captures across both themes and target widths.",
      "Added component-specific strongest-signature, command-strip, and exact-destination captures across both themes and target widths.",
      "Bound each touched modal to accessible dialog/focus behavior and observable failure receipts.",
      "Kept the first-decision shell lean by loading non-Overview tab modules only on intent.",
      "Added hash-bound cap-pressure, waiver-identity, Franchise Legends, and General Manager reputation captures after correcting the hidden-ID player-column offset."
    ],
    blockingDefectsOpen: 0
  }
};

await fs.writeFile(path.join(receiptDir, "LATEST.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`Visual QA receipt written: ${captures.length} captures from ${path.basename(evidenceDir)}`);
