import assert from "node:assert/strict";
import test from "node:test";
import { buildStagingReceiptReport } from "../scripts/verify-staging-receipt.mjs";

const baseUrl = "https://staging.example.test/preview/";
const expected = {
  canonicalOrigin: "https://playfranchisearchitect.com",
  repository: "VaultSparkStudios/vaultspark-football-gm",
  sourceRevision: "session52",
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
