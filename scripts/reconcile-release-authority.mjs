#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveReleaseAuthority } from "./lib/release-authority.mjs";
import { updateProjectStatus } from "./lib/write-project-status.mjs";

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}
function read(file) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), "utf8"));
}

export function reconcileReleaseAuthority({ root, stagingReport, productionReport, visualReceipt, performanceReceipt, write = false }) {
  const status = JSON.parse(fs.readFileSync(path.join(root, "context", "PROJECT_STATUS.json"), "utf8"));
  const authority = deriveReleaseAuthority({
    stagingReport,
    productionReport,
    visualReceipt,
    performanceReceipt,
    backendDeployment: status.backendDeployment,
    emailVerified: status.releaseEvidence?.emailDelivery?.verified === true,
    founderApproved: status.releaseEvidence?.founderApproval?.verified === true,
    lifecycleVerified: status.releaseEvidence?.lifecycleAuthority?.verified === true
  });
  if (write) {
    updateProjectStatus(root, (current) => ({
      ...current,
      releaseAuthority: authority,
      launchReady: authority.launchReady
    }));
  }
  return authority;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const required = ["--staging-report", "--production-report", "--visual-receipt", "--performance-receipt"];
    for (const flag of required) if (!valueAfter(args, flag)) throw new Error("Missing " + flag + ".");
    const authority = reconcileReleaseAuthority({
      root: process.cwd(),
      stagingReport: read(valueAfter(args, "--staging-report")),
      productionReport: read(valueAfter(args, "--production-report")),
      visualReceipt: read(valueAfter(args, "--visual-receipt")),
      performanceReceipt: read(valueAfter(args, "--performance-receipt")),
      write: args.includes("--write")
    });
    console.log(JSON.stringify(authority, null, 2));
    process.exitCode = authority.status === "verified" ? 0 : 2;
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}
