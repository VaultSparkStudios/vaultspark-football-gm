import assert from "node:assert/strict";
import test from "node:test";
import { buildStagingReceiptReport } from "../scripts/verify-staging-receipt.mjs";
import { buildStagingAuthorityReceipt, ensureStagingDns, selectDeployment, STAGING_DOMAIN, STAGING_PROJECT } from "../scripts/deploy-staging.mjs";

const baseUrl = "https://staging.example.test/preview/";
const expected = {
  canonicalOrigin: "https://playfranchisearchitect.com",
  repository: "VaultSparkStudios/vaultspark-football-gm",
  sourceRevision: "session52",
  artifactFingerprint: { algorithm: "sha256", digest: "a".repeat(64), files: 42, exclusions: ["_health", "deploy-manifest.json"] },
  styleAsset: "styles.session52.css"
};

function response(route, body, { origin = "https://staging.example.test", redirect = false } = {}) {
  const start = `${baseUrl.replace(/\/$/, "")}${route}`;
  const final = `${origin}${route}`;
  return {
    ok: true,
    statusCode: 200,
    body: JSON.stringify(body),
    chain: redirect
      ? [{ url: start, statusCode: 302 }, { url: final, statusCode: 200 }]
      : [{ url: start, statusCode: 200 }]
  };
}

function fixture({ crossOriginHealth = false } = {}) {
  return { routes: {
    "/_health": response("/_health", {
      status: "ok",
      sourceRevision: expected.sourceRevision,
      artifactFingerprint: expected.artifactFingerprint,
      styleAsset: expected.styleAsset,
      launchReady: false
    }, crossOriginHealth ? { origin: "https://production.example.test", redirect: true } : {}),
    "/deploy-manifest.json": response("/deploy-manifest.json", expected),
    "/styles.session52.css": {
      ok: true,
      statusCode: 200,
      body: "body{}",
      chain: [{ url: `${baseUrl}styles.session52.css`, statusCode: 200 }]
    }
  } };
}

test("same-origin staging receipts prove exact health, revision, asset, and repository identity", async () => {
  const report = await buildStagingReceiptReport({ expected, baseUrl, fixture: fixture() });
  assert.equal(report.summary.status, "verified");
  assert.equal(report.summary.checksPassed, report.summary.checksTotal);
});

test("cross-origin redirect is HOLD even when the final body looks healthy", async () => {
  const report = await buildStagingReceiptReport({ expected, baseUrl, fixture: fixture({ crossOriginHealth: true }) });
  assert.equal(report.summary.status, "blocked");
  assert.equal(report.checks.find((check) => check.name === "health stayed on staging origin").ok, false);
});

test("Cloudflare staging authority binds the stable domain to the exact candidate deployment", () => {
  const deployments = [
    { id: "old", deployment_trigger: { metadata: { commit_hash: "aaa1111" } } },
    { id: "candidate", url: "https://candidate.pages.dev", deployment_trigger: { metadata: { commit_hash: "bbb2222" } } }
  ];
  const deployment = selectDeployment(deployments, "bbb2222");
  const receipt = buildStagingAuthorityReceipt({ sourceRevision: "bbb2222", artifactFingerprint: expected.artifactFingerprint, deployment, previousDeployment: deployments[0], domainState: { status: "active" }, provenanceReport: { checkedAt: "2026-08-03T00:00:00.000Z", summary: { status: "verified", checksPassed: 11, checksTotal: 11 } } });
  assert.equal(receipt.project, STAGING_PROJECT);
  assert.equal(receipt.stableUrl, `https://${STAGING_DOMAIN}`);
  assert.equal(receipt.exactRevision, true);
  assert.equal(receipt.independent, true);
  assert.equal(receipt.verified, true);
  assert.match(receipt.promotionIdentity, /^bbb2222:[a-f0-9]{64}$/);
  assert.equal(receipt.provenance.checksPassed, 11);
  assert.equal(receipt.rollback.previousDeploymentId, "old");
});

test("an active hostname cannot hide the wrong deployed candidate", () => {
  const receipt = buildStagingAuthorityReceipt({
    sourceRevision: "candidate",
    artifactFingerprint: expected.artifactFingerprint,
    deployment: { id: "wrong", deployment_trigger: { metadata: { commit_hash: "other" } } },
    domainState: { status: "active" },
    provenanceReport: { summary: { status: "verified", checksPassed: 11, checksTotal: 11 } }
  });
  assert.equal(receipt.exactRevision, false);
  assert.equal(receipt.verified, false);
});
test("staging DNS authority creates the exact proxied Pages CNAME and is idempotent", async () => {
  const calls = [];
  const createdRecord = { id: "dns-1", type: "CNAME", name: "staging.playfranchisearchitect.com", content: "franchise-architect-staging.pages.dev", proxied: true };
  const createDns = async (apiPath, init = {}) => {
    calls.push({ apiPath, init });
    if (init.method === "POST") return { ok: true, status: 200, body: { result: createdRecord } };
    return { ok: true, status: 200, body: { result: [] } };
  };
  assert.deepEqual(await ensureStagingDns(createDns, "zone-1"), createdRecord);
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    type: "CNAME",
    name: "staging.playfranchisearchitect.com",
    content: "franchise-architect-staging.pages.dev",
    proxied: true
  });

  const existingCalls = [];
  const existingDns = async (apiPath, init = {}) => {
    existingCalls.push({ apiPath, init });
    return { ok: true, status: 200, body: { result: [createdRecord] } };
  };
  assert.deepEqual(await ensureStagingDns(existingDns, "zone-1"), createdRecord);
  assert.equal(existingCalls.length, 1);
});
