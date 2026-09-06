import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalyticsReport, collectCloudflareWebAnalytics } from "../scripts/verify-cloudflare-web-analytics.mjs";

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("analytics proof performs a bounded account query and stores aggregate paths only", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/zones?")) {
      return response({ success: true, result: [{ account: { id: "account-secret-ish-id" } }] });
    }
    return response({
      data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [
        { count: 6, dimensions: { date: "2026-08-24", requestPath: "/" } },
        { count: 1, dimensions: { date: "2026-08-25", requestPath: "/landing" } }
      ] }] } }
    });
  };
  const report = await collectCloudflareWebAnalytics({
    token: "test-token-never-emit",
    host: "playfranchisearchitect.com",
    since: "2026-08-23",
    fetchImpl,
    now: new Date("2026-08-26T12:00:00Z")
  });
  assert.equal(report.aggregate.pageLoads, 7);
  assert.deepEqual(report.aggregate.paths, [
    { requestPath: "/", pageLoads: 6 },
    { requestPath: "/landing", pageLoads: 1 }
  ]);
  assert.equal(report.conclusions.reportingVerified, true);
  assert.equal(report.conclusions.engagementVerified, false);
  assert.equal(report.conclusions.retentionVerified, false);
  assert.equal(report.conclusions.cohortVerified, false);
  assert.doesNotMatch(JSON.stringify(report), /account-secret-ish-id|test-token-never-emit/);
  assert.equal(calls.length, 2);
  assert.match(calls[1].options.body, /datetime_geq/);
});

test("zero rows prove query reachability, not engagement", () => {
  const report = buildAnalyticsReport({ host: "example.com", since: "2026-08-01T00:00:00.000Z", rows: [] });
  assert.equal(report.aggregate.pageLoads, 0);
  assert.equal(report.conclusions.reportingVerified, false);
  assert.equal(report.conclusions.engagementVerified, false);
});

test("analytics authorization failures are loud", async () => {
  const fetchImpl = async () => response({ success: false, errors: [{ message: "not authorized for that account" }] }, 403);
  await assert.rejects(
    collectCloudflareWebAnalytics({ token: "narrow-token", host: "playfranchisearchitect.com", since: "2026-08-23", fetchImpl }),
    /not authorized for that account/
  );
});
