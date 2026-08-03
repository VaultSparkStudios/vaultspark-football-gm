#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";
import { buildStagingReceiptReport } from "./verify-staging-receipt.mjs";

export const STAGING_PROJECT = "franchise-architect-staging";
export const STAGING_BRANCH = "staging";
export const STAGING_DOMAIN = "staging.playfranchisearchitect.com";
export const STAGING_URL = `https://${STAGING_DOMAIN}`;

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function assertOk(result, action, accepted = []) {
  if (result?.ok || accepted.includes(result?.status)) return result;
  const messages = (result?.body?.errors || []).map((error) => error.message).filter(Boolean);
  throw new Error(`${action} failed (HTTP ${result?.status ?? "unknown"})${messages.length ? `: ${messages.join("; ")}` : ""}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, env: options.env, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${String(result.stderr || result.stdout || "").trim()}`);
  return String(result.stdout || "").trim();
}

function wranglerInvocation() {
  if (process.platform !== "win32") return { command: "wrangler", prefix: [] };
  const cli = path.join(process.env.APPDATA || "", "npm", "node_modules", "wrangler", "bin", "wrangler.js");
  if (!fs.existsSync(cli)) throw new Error("Global Wrangler CLI entry point not found.");
  return { command: process.execPath, prefix: [cli] };
}

export function selectDeployment(deployments, sourceRevision) {
  return (deployments || []).find((entry) => entry?.deployment_trigger?.metadata?.commit_hash === sourceRevision) || null;
}

export function buildStagingAuthorityReceipt({ sourceRevision, artifactFingerprint, deployment, previousDeployment = null, domainState, provenanceReport = null }) {
  const domainStatus = String(domainState?.status || "unknown").toLowerCase();
  const exactRevision = deployment?.deployment_trigger?.metadata?.commit_hash === sourceRevision;
  const exactArtifact = /^[a-f0-9]{64}$/i.test(artifactFingerprint?.digest || "");
  const provenanceVerified = provenanceReport?.summary?.status === "verified";
  return {
    schemaVersion: "1.1",
    kind: "independent-staging-authority",
    project: STAGING_PROJECT,
    branch: STAGING_BRANCH,
    sourceRevision,
    artifactFingerprint,
    promotionIdentity: exactArtifact ? `${sourceRevision}:${artifactFingerprint.digest}` : null,
    deploymentId: deployment?.id || null,
    deploymentUrl: deployment?.url || null,
    stableUrl: STAGING_URL,
    domainStatus,
    independent: true,
    exactRevision,
    exactArtifact,
    provenance: provenanceReport ? { status: provenanceReport.summary.status, checksPassed: provenanceReport.summary.checksPassed, checksTotal: provenanceReport.summary.checksTotal, checkedAt: provenanceReport.checkedAt } : null,
    rollback: { previousDeploymentId: previousDeployment?.id || null, available: Boolean(previousDeployment?.id) },
    verified: domainStatus === "active" && exactRevision && exactArtifact && provenanceVerified,
    observedAt: new Date().toISOString()
  };
}

async function loadCloudflarePlane(root) {
  const helper = path.resolve(root, "..", "vaultspark-studio-ops", "scripts", "lib", "cf-deploy.mjs");
  if (!fs.existsSync(helper)) throw new Error("Studio Cloudflare deploy plane not found; staging mutation cannot bypass the broker.");
  return import(pathToFileURL(helper).href);
}

async function projectState(cfDeploy, accountId) {
  return cfDeploy("franchise-staging-project-get", `/accounts/${accountId}/pages/projects/${STAGING_PROJECT}`);
}

async function ensureProject(cfDeploy, accountId) {
  const existing = await projectState(cfDeploy, accountId);
  if (existing.ok) return existing.body.result;
  if (existing.status !== 404) assertOk(existing, "read Pages project");
  const created = await cfDeploy("franchise-staging-project-create", `/accounts/${accountId}/pages/projects`, {
    method: "POST",
    body: JSON.stringify({ name: STAGING_PROJECT, production_branch: STAGING_BRANCH })
  });
  return assertOk(created, "create Pages project").body.result;
}

async function ensureDomain(cfDeploy, accountId) {
  const domainPath = `/accounts/${accountId}/pages/projects/${STAGING_PROJECT}/domains/${STAGING_DOMAIN}`;
  const existing = await cfDeploy("franchise-staging-domain-get", domainPath);
  if (existing.ok) return existing.body.result;
  if (existing.status !== 404) assertOk(existing, "read Pages custom domain");
  const created = await cfDeploy("franchise-staging-domain-create", `/accounts/${accountId}/pages/projects/${STAGING_PROJECT}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: STAGING_DOMAIN })
  });
  return assertOk(created, "associate Pages custom domain", [409]).body.result || { status: "pending" };
}

async function readDomain(cfDeploy, accountId) {
  const result = await cfDeploy("franchise-staging-domain-verify", `/accounts/${accountId}/pages/projects/${STAGING_PROJECT}/domains/${STAGING_DOMAIN}`);
  return assertOk(result, "verify Pages custom domain").body.result;
}

export async function inspectStaging({ root = process.cwd() } = {}) {
  const { cfDeploy, cfAccountId, withPagesDeployEnv } = await loadCloudflarePlane(root);
  const accountId = await cfAccountId();
  const auth = await withPagesDeployEnv("franchise-staging-wrangler-auth", (deployEnv) => {
    const { command, prefix } = wranglerInvocation();
    return spawnSync(command, [...prefix, "whoami"], { cwd: root, env: { ...process.env, ...deployEnv }, encoding: "utf8", windowsHide: true });
  });
  if (auth.status !== 0) throw new Error(`Wrangler authentication failed (${auth.status}): ${auth.error?.message || String(auth.stderr || auth.stdout || "").trim() || "unknown error"}`);
  const project = await projectState(cfDeploy, accountId);
  const domain = project.ok ? await cfDeploy("franchise-staging-domain-inspect", `/accounts/${accountId}/pages/projects/${STAGING_PROJECT}/domains/${STAGING_DOMAIN}`) : null;
  return { authenticated: true, accountIdPresent: Boolean(accountId), projectExists: project.ok, domainStatus: domain?.body?.result?.status || null, stableUrl: STAGING_URL };
}

export async function deployStaging({ root = process.cwd(), sourceRevision } = {}) {
  if (!/^[a-f0-9]{7,64}$/i.test(sourceRevision || "")) throw new Error("--source-revision must be a candidate commit SHA.");
  const dirty = run("git", ["status", "--porcelain"], { cwd: root });
  if (dirty) throw new Error("Staging deploy requires a clean candidate worktree; commit the exact candidate first.");
  const head = run("git", ["rev-parse", "HEAD"], { cwd: root });
  if (head !== sourceRevision) throw new Error(`Candidate revision ${sourceRevision} is not current HEAD ${head}.`);

  const { cfDeploy, cfAccountId, withPagesDeployEnv } = await loadCloudflarePlane(root);
  const accountId = await cfAccountId();
  await ensureProject(cfDeploy, accountId);

  run(process.execPath, ["scripts/build-pages.mjs"], { cwd: root, env: { ...process.env, SOURCE_REVISION: sourceRevision } });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "static", "deploy-manifest.json"), "utf8"));
  if (manifest.sourceRevision !== sourceRevision) throw new Error("Built artifact revision does not match the candidate.");

  await withPagesDeployEnv("franchise-staging-pages-deploy", (deployEnv) => {
    const { command, prefix } = wranglerInvocation();
    return run(command, [...prefix, "pages", "deploy", "static", `--project-name=${STAGING_PROJECT}`, `--branch=${STAGING_BRANCH}`, `--commit-hash=${sourceRevision}`, "--commit-message=verified staging candidate", "--commit-dirty=false"], { cwd: root, env: { ...process.env, ...deployEnv } });
  });

  await ensureDomain(cfDeploy, accountId);
  let domainState = await readDomain(cfDeploy, accountId);
  for (let attempt = 0; attempt < 48 && String(domainState?.status).toLowerCase() !== "active"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    domainState = await readDomain(cfDeploy, accountId);
  }

  const deploymentsResult = await cfDeploy("franchise-staging-deployments-list", `/accounts/${accountId}/pages/projects/${STAGING_PROJECT}/deployments?per_page=25`);
  const deployments = assertOk(deploymentsResult, "list Pages deployments").body.result;
  const deployment = selectDeployment(deployments, sourceRevision);
  const previousDeployment = (deployments || []).find((entry) => entry?.id && entry.id !== deployment?.id) || null;
  const provenanceReport = await buildStagingReceiptReport({ expected: manifest, baseUrl: STAGING_URL });
  const receipt = buildStagingAuthorityReceipt({ sourceRevision, artifactFingerprint: manifest.artifactFingerprint, deployment, previousDeployment, domainState, provenanceReport });
  if (!receipt.verified) throw new Error(`Staging authority is not verified (domain=${receipt.domainStatus}, exactRevision=${receipt.exactRevision}).`);
  return receipt;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  try {
    const result = args.includes("--deploy")
      ? await deployStaging({ sourceRevision: valueAfter(args, "--source-revision") })
      : await inspectStaging();
    const output = valueAfter(args, "--output");
    if (output) fs.writeFileSync(path.resolve(process.cwd(), output), `${JSON.stringify(result, null, 2)}
`, "utf8");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}