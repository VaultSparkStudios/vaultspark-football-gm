#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";
import { evaluatePublicationDelta } from "./lib/release-authority.mjs";

function revision(value) {
  const text = String(value || "").trim();
  return /^[a-f0-9]{40}$/i.test(text) ? text.toLowerCase() : null;
}

function identity(sourceRevision = null, artifactFingerprint = null) {
  return {
    sourceRevision: revision(sourceRevision),
    artifactDigest: String(artifactFingerprint?.digest || "").toLowerCase() || null
  };
}

export function evaluateReleaseAuthorityCurrency({
  headRevision = null,
  headChangedFiles = [],
  status = {},
  stagingHealth = null,
  productionHealth = null,
  stagingError = null,
  productionError = null
} = {}) {
  const checked = {
    staging: identity(status.stagingAuthority?.sourceRevision, status.stagingAuthority?.artifactFingerprint),
    releaseSource: identity(status.releaseAuthority?.sourceRevision, status.releaseAuthority?.artifactFingerprint),
    publication: identity(status.releaseAuthority?.publicationRevision, status.releaseAuthority?.artifactFingerprint)
  };
  const live = {
    staging: identity(stagingHealth?.sourceRevision, stagingHealth?.artifactFingerprint),
    production: identity(productionHealth?.sourceRevision, productionHealth?.artifactFingerprint)
  };
  const head = revision(headRevision);
  const claimsCurrent = status.releaseAuthority?.status === "verified" && status.releaseAuthority?.evidenceVerified === true;
  const receiptOnlyHead = head && live.production.sourceRevision && head !== live.production.sourceRevision
    ? evaluatePublicationDelta({ from: live.production.sourceRevision, to: head, changedFiles: headChangedFiles })
    : null;
  const headCovered = Boolean(head && live.production.sourceRevision && (
    head === live.production.sourceRevision || receiptOnlyHead?.verified === true
  ));

  const checks = [
    {
      id: "live-staging-observed",
      ok: Boolean(live.staging.sourceRevision),
      unknown: Boolean(stagingError),
      detail: stagingError || live.staging.sourceRevision || "stable staging returned no source revision"
    },
    {
      id: "live-production-observed",
      ok: Boolean(live.production.sourceRevision),
      unknown: Boolean(productionError),
      detail: productionError || live.production.sourceRevision || "production returned no source revision"
    },
    {
      id: "checked-staging-current",
      ok: Boolean(checked.staging.sourceRevision && checked.staging.sourceRevision === live.staging.sourceRevision && checked.staging.artifactDigest === live.staging.artifactDigest),
      contradiction: Boolean(checked.staging.sourceRevision && live.staging.sourceRevision && checked.staging.sourceRevision !== live.staging.sourceRevision),
      detail: `checked ${checked.staging.sourceRevision || "unknown"} · live ${live.staging.sourceRevision || "unknown"}`
    },
    {
      id: "checked-publication-current",
      ok: Boolean(checked.publication.sourceRevision && checked.publication.sourceRevision === live.production.sourceRevision && checked.publication.artifactDigest === live.production.artifactDigest),
      contradiction: Boolean(checked.publication.sourceRevision && live.production.sourceRevision && checked.publication.sourceRevision !== live.production.sourceRevision),
      detail: `checked ${checked.publication.sourceRevision || "unknown"} · live ${live.production.sourceRevision || "unknown"}`
    },
    {
      id: "release-source-current",
      ok: Boolean(checked.releaseSource.sourceRevision && checked.releaseSource.sourceRevision === live.staging.sourceRevision),
      contradiction: Boolean(checked.releaseSource.sourceRevision && live.staging.sourceRevision && checked.releaseSource.sourceRevision !== live.staging.sourceRevision),
      detail: `release source ${checked.releaseSource.sourceRevision || "unknown"} · live staging ${live.staging.sourceRevision || "unknown"}`
    },
    {
      id: "git-head-covered-by-publication",
      ok: headCovered,
      contradiction: false,
      detail: headCovered
        ? head === live.production.sourceRevision ? `HEAD ${head} is live` : `HEAD ${head} is a verified receipt-only descendant of ${live.production.sourceRevision}`
        : `HEAD ${head || "unknown"} is not covered by live production ${live.production.sourceRevision || "unknown"}`
    }
  ];

  const items = checks.filter((check) => !check.ok).map((check) => {
    const blocking = claimsCurrent && check.contradiction === true;
    return {
      id: `release-authority-${check.id}`,
      status: blocking ? "failing" : "warning",
      blocking,
      detail: check.detail
    };
  });
  const blockingFailing = items.filter((item) => item.blocking).length;
  return {
    schemaVersion: "1.0",
    kind: "release-authority-currency",
    status: blockingFailing ? "contradicted" : items.length ? "drift" : "current",
    claimsCurrent,
    blockingFailing,
    warning: items.filter((item) => !item.blocking).length,
    passing: checks.filter((check) => check.ok).length,
    identities: { head, checked, live },
    receiptOnlyHead,
    checks,
    items
  };
}

async function fetchHealth(url) {
  const response = await fetch(new URL("_health", `${String(url).replace(/\/+$/, "")}/`), {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || "git failed").trim());
  return String(result.stdout || "").trim();
}

export async function inspectReleaseAuthorityCurrency({ root = process.cwd(), fetchHealthFn = fetchHealth } = {}) {
  const status = JSON.parse(fs.readFileSync(path.join(root, "context", "PROJECT_STATUS.json"), "utf8"));
  const headRevision = git(root, ["rev-parse", "HEAD"]);
  const [stagingResult, productionResult] = await Promise.allSettled([
    fetchHealthFn(status.stagingUrl),
    fetchHealthFn(status.runtimeUrl)
  ]);
  const stagingHealth = stagingResult.status === "fulfilled" ? stagingResult.value : null;
  const productionHealth = productionResult.status === "fulfilled" ? productionResult.value : null;
  const liveProductionRevision = revision(productionHealth?.sourceRevision);
  let headChangedFiles = [];
  if (liveProductionRevision && liveProductionRevision !== revision(headRevision)) {
    try {
      headChangedFiles = git(root, ["diff", "--name-only", `${liveProductionRevision}..${headRevision}`]).split(/\r?\n/).filter(Boolean);
    } catch {
      headChangedFiles = ["<git-diff-unavailable>"];
    }
  }
  return evaluateReleaseAuthorityCurrency({
    headRevision,
    headChangedFiles,
    status,
    stagingHealth,
    productionHealth,
    stagingError: stagingResult.status === "rejected" ? `stable staging unknown: ${stagingResult.reason?.message || stagingResult.reason}` : null,
    productionError: productionResult.status === "rejected" ? `production unknown: ${productionResult.reason?.message || productionResult.reason}` : null
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const report = await inspectReleaseAuthorityCurrency();
    console.log(JSON.stringify(report, null, 2));
    if (report.blockingFailing) process.exitCode = 2;
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}
