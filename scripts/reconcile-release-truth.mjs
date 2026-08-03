#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseTruthProse, validateReleaseEvidence, verifyReleaseEvidenceContract } from "./lib/release-truth.mjs";
import { updateProjectStatus } from "./lib/write-project-status.mjs";

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export function reconcileReleaseTruth({
  root,
  report,
  expectedRevision = null,
  stagingVerified = false,
  founderApproved = false,
  lifecycleVerified = false,
  checkOnly = false,
  now = Date.now()
}) {
  const statusPath = path.join(root, "context", "PROJECT_STATUS.json");
  const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  const validation = validateReleaseEvidence({
    report,
    projectStatus: status,
    expectedRevision,
    stagingVerified,
    founderApprovalVerified: founderApproved,
    lifecycleAuthorityVerified: lifecycleVerified,
    now
  });
  if (!validation.valid) throw new Error(`Release receipt rejected: ${validation.errors.join(", ")}`);
  if (checkOnly) {
    const existing = verifyReleaseEvidenceContract({ report, contract: status.releaseEvidence, projectStatus: status, now });
    if (!existing.valid) throw new Error(`Checked-in release contract drifted: ${existing.mismatches.join(", ")}`);
  }
  const prose = releaseTruthProse(validation.contract);
  if (!checkOnly) {
    updateProjectStatus(root, (current) => ({
      ...current,
      releaseEvidence: validation.contract,
      currentFocus: prose.currentFocus,
      nextMilestone: prose.nextMilestone,
      blockers: prose.blockers,
      lastVerificationAt: String(report.checkedAt).slice(0, 10)
    }));
  }
  return validation.contract;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const input = valueAfter(args, "--input");
    if (!input) throw new Error("Usage: node scripts/reconcile-release-truth.mjs --input <report.json> [--expected-revision <sha>] [--staging-verified] [--founder-approved] [--lifecycle-verified] [--check]");
    const report = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), input), "utf8"));
    const contract = reconcileReleaseTruth({
      root: process.cwd(),
      report,
      expectedRevision: valueAfter(args, "--expected-revision"),
      stagingVerified: args.includes("--staging-verified"),
      founderApproved: args.includes("--founder-approved"),
      lifecycleVerified: args.includes("--lifecycle-verified"),
      checkOnly: args.includes("--check")
    });
    console.log(JSON.stringify(contract, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
