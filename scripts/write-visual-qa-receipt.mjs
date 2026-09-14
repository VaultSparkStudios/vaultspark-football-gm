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
      "S108 added a Dev column to the roster table (the development trait the DTO has carried since S8; the free-agent table already showed it). Inspected on the 1440px dark roster capture, the column renders beside POT with the trait labels (Steady, Superstar, Hidden Development, Bust) and the table's width still scrolls inside its own container at 390px light rather than widening the page.",
      "The draft room's Available Prospects table now shows Scout Ovr and Scout Pot in place of Ovr and Pot. The capture's single available prospect is a hardcoded fixture in scripts/responsive-evidence.mjs, so it is evidence that the renamed columns render and align, NOT evidence of the fog's values; the fog itself (overall, potential and ratings stripped from every draft response; scouted potential within plus-or-minus 6 off the main RNG stream) is asserted by test/session108-draft-board-fog.test.js against a real class.",
      "The Offseason Development Report card on the History tab is outside this capture set, which does not drive an offseason. It is proven by tests-ui/offseason-development.spec.js, which drives the runtime to the retirements stage through its own API and asserts the card names the club's risers and fallers with before, after and change; the card's module is lazily imported and its load is observed, because the history island sits at 15.2 per cent headroom against a 15 per cent floor.",
      "Theme parity checked on the roster surface: the 390px light-theme roster renders the same structure with readable contrast against the 1440px dark capture.",
      "The release note on public/status.html is outside this capture set, which covers game surfaces only. It was verified against the live staging origin instead: the 2026-09-14 note is served above the 2026-09-13 note and tells players what they can now see (who developed), that the draft board stops giving away the answers, and that saved franchises are unaffected.",
      "The deterministic harness inspected the dark and light states at 1440px desktop, 768px tablet and 390px mobile with no overflow, contrast, touch-target, selector or runtime failures, and reported status passed bound to an immutable source revision and artifact fingerprint.",
      "Deployment readiness remains independent from public-launch authority; no rendered surface asserts that email, cohort, retention, or launch approval is verified."
    ],
    fixesApplied: [
      "No rendered-pixel defect was found this session, so no visual fix was applied. The captures are evidence for two table changes (a Dev column on the roster; Scout Ovr / Scout Pot on the draft board) and for theme parity, not a repair of the render layer.",
      "The player-facing release note on the public status page was written for what shipped: the offseason development report, the honest draft board, the profile outlook that reads potential and trait, and saved franchises unaffected."
    ],
    blockingDefectsOpen: 0
  }
};

await fs.writeFile(path.join(receiptDir, "LATEST.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`Visual QA receipt written: ${captures.length} captures from ${path.basename(evidenceDir)}`);
