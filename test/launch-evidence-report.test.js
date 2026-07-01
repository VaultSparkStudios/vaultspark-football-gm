import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchEvidenceReport } from "../scripts/launch-evidence-report.mjs";

const okRoutes = {
  "/": { ok: true, statusCode: 200, detail: "HTTP 200" },
  "/game.html": { ok: true, statusCode: 200, detail: "HTTP 200" },
  "/contact.html": { ok: true, statusCode: 200, detail: "HTTP 200" }
};

test("launch evidence stays blocked when email forwarding is not verified", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: Object.keys(okRoutes),
    fixture: { routes: okRoutes }
  });

  assert.equal(report.summary.routesOk, true);
  assert.equal(report.summary.emailForwardingVerified, false);
  assert.equal(report.summary.status, "blocked");
  assert.match(report.summary.blocker, /email forwarding/i);
});

test("launch evidence reports ready only when routes and email evidence are both present", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: Object.keys(okRoutes),
    fixture: { routes: okRoutes, emailEvidence: "Forwarding receipt copied to founder operations inbox." }
  });

  assert.equal(report.summary.routesOk, true);
  assert.equal(report.summary.emailForwardingVerified, true);
  assert.equal(report.summary.status, "ready");
});

test("launch evidence keeps route failures distinct from email evidence", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: ["/", "/terms.html"],
    fixture: {
      routes: {
        "/": { ok: true, statusCode: 200, detail: "HTTP 200" },
        "/terms.html": { ok: false, statusCode: 404, detail: "HTTP 404" }
      },
      emailEvidence: "Forwarding receipt copied to founder operations inbox."
    }
  });

  assert.equal(report.summary.routesOk, false);
  assert.equal(report.summary.emailForwardingVerified, true);
  assert.equal(report.summary.status, "blocked");
  assert.match(report.summary.blocker, /public routes/i);
});