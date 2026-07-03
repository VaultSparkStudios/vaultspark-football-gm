import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchReadinessRows, resolveContactEmailReadiness, resolvePublicDomainReadiness } from "../public/lib/tabSettings.js";

test("launch readiness rows expose static beta launch posture", () => {
  const rows = buildLaunchReadinessRows({
    dashboard: { phase: "regular-season" },
    saves: [{ slot: "alpha" }],
    persistence: { kind: "browser" },
    observability: { server: { requests: 7 } },
    speedrunChallenge: { active: true }
  });

  assert.equal(rows.length, 6);
  assert.equal(rows.find((row) => row.area === "Runtime").status, "Ready");
  assert.equal(rows.find((row) => row.area === "Challenge Codes").status, "Active");
  assert.equal(rows.find((row) => row.area === "Public Domain").status, "Blocked");
  assert.equal(rows.find((row) => row.area === "Contact Email").status, "Unverified");
});

test("public domain readiness can represent fixed and stale-check states", () => {
  assert.deepEqual(resolvePublicDomainReadiness({ ok: true, checkedAt: "2026-06-08" }), {
    status: "Ready",
    detail: "Public game URL is reachable. Checked 2026-06-08."
  });

  assert.equal(
    resolvePublicDomainReadiness({ status: "needs-check", checkedAt: "2026-06-08" }).status,
    "Needs check"
  );

  const rows = buildLaunchReadinessRows({
    publicDomainStatus: { status: "ready", detail: "Pages smoke passed from the public URL." },
    contactEmailStatus: { status: "verified", checkedAt: "2026-07-03" }
  });
  assert.equal(rows.find((row) => row.area === "Public Domain").status, "Ready");
  assert.equal(rows.find((row) => row.area === "Contact Email").status, "Verified");
});

test("null optional launch readiness inputs do not block browser initialization", () => {
  const rows = buildLaunchReadinessRows({
    dashboard: { phase: "regular-season" },
    persistence: null,
    observability: null,
    publicDomainStatus: null
  });

  assert.equal(rows.find((row) => row.area === "Runtime").status, "Ready");
  assert.equal(rows.find((row) => row.area === "Runtime").detail.includes("regular-season"), true);
  assert.equal(rows.find((row) => row.area === "Public Domain").status, "Blocked");
  assert.equal(rows.find((row) => row.area === "Contact Email").status, "Unverified");
});

test("contact email readiness is evidence-driven", () => {
  assert.deepEqual(resolveContactEmailReadiness({ ok: true, checkedAt: "2026-07-03" }), {
    status: "Verified",
    detail: "football@playfranchisearchitect.com forwarding/copying is verified. Checked 2026-07-03."
  });

  assert.equal(resolveContactEmailReadiness({ status: "needs-check" }).status, "Needs check");
  assert.match(resolveContactEmailReadiness().detail, /football@playfranchisearchitect\.com/);
});
