import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchEvidenceReport, probeWithRedirects } from "../scripts/launch-evidence-report.mjs";

function fakeProber(responsesByUrl) {
  const seen = [];
  const probe = async (url) => {
    seen.push(url);
    const response = responsesByUrl[url];
    if (!response) return { error: `no fake response for ${url}` };
    return response;
  };
  probe.seen = seen;
  return probe;
}

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

test("canonical-origin evidence requires an honest health receipt and edge headers", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: ["/", "/_health"],
    fixture: {
      routes: {
        "/": {
          ok: true,
          statusCode: 200,
          detail: "HTTP 200",
          headers: { "strict-transport-security": "max-age=31536000" }
        },
        "/_health": {
          ok: true,
          statusCode: 200,
          detail: "HTTP 200",
          body: JSON.stringify({ status: "ok", launchReady: false, sourceRevision: "abc123" })
        }
      },
      emailEvidence: "Forwarding receipt copied to founder operations inbox."
    }
  });

  assert.equal(report.summary.routesOk, true);
  assert.equal(report.summary.originEvidenceVerified, false);
  assert.equal(report.originEvidence.healthReceiptValid, true);
  assert.equal(report.originEvidence.securityHeaders.strictTransportSecurity, true);
  assert.equal(report.originEvidence.securityHeaders.frameProtection, false);
  assert.equal(report.summary.status, "blocked");
  assert.match(report.summary.blocker, /edge security headers/i);
});

test("canonical-origin evidence passes only with receipt plus every required header", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: ["/", "/_health"],
    fixture: {
      routes: {
        "/": {
          ok: true,
          statusCode: 200,
          detail: "HTTP 200",
          headers: {
            "strict-transport-security": "max-age=31536000",
            "x-frame-options": "DENY",
            "content-security-policy": "default-src 'self'"
          }
        },
        "/_health": {
          ok: true,
          statusCode: 200,
          detail: "HTTP 200",
          body: JSON.stringify({ status: "ok", launchReady: false, sourceRevision: "abc123" })
        }
      },
      emailEvidence: "Forwarding receipt copied to founder operations inbox."
    }
  });

  assert.equal(report.summary.originEvidenceVerified, true);
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

test("fixture route representing redirect-to-404 yields ok:false and blocked status", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: ["/", "/game.html"],
    fixture: {
      routes: {
        "/": { ok: true, statusCode: 200, detail: "HTTP 200" },
        "/game.html": {
          ok: false,
          statusCode: 404,
          detail: "HTTP 308 → /game/ → HTTP 404",
          chain: [
            { url: "https://playfranchisearchitect.com/game.html", statusCode: 308 },
            { url: "https://playfranchisearchitect.com/game/", statusCode: 404 }
          ]
        }
      },
      emailEvidence: "Forwarding receipt copied to founder operations inbox."
    }
  });

  const gameCheck = report.routeChecks.find((check) => check.route === "/game.html");
  assert.equal(gameCheck.ok, false);
  assert.equal(gameCheck.statusCode, 404);
  assert.equal(gameCheck.chain.length, 2);
  assert.equal(gameCheck.chain[1].statusCode, 404);
  assert.equal(report.summary.routesOk, false);
  assert.equal(report.summary.status, "blocked");
  assert.match(report.summary.blocker, /public routes/i);
});

test("fixture route representing redirect-to-200 yields ok:true and preserves the chain", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: ["/game.html"],
    fixture: {
      routes: {
        "/game.html": {
          ok: true,
          statusCode: 200,
          detail: "HTTP 308 → /game/ → HTTP 200",
          chain: [
            { url: "https://playfranchisearchitect.com/game.html", statusCode: 308 },
            { url: "https://playfranchisearchitect.com/game/", statusCode: 200 }
          ]
        }
      },
      emailEvidence: "Forwarding receipt copied to founder operations inbox."
    }
  });

  const gameCheck = report.routeChecks[0];
  assert.equal(gameCheck.ok, true);
  assert.equal(gameCheck.statusCode, 200);
  assert.deepEqual(gameCheck.chain[0], {
    url: "https://playfranchisearchitect.com/game.html",
    statusCode: 308
  });
  assert.equal(report.summary.routesOk, true);
  assert.equal(report.summary.status, "ready");
});

test("email gate stays blocked without evidence even when redirect chains resolve ok", async () => {
  const report = await buildLaunchEvidenceReport({
    routes: ["/game.html"],
    fixture: {
      routes: {
        "/game.html": {
          ok: true,
          statusCode: 200,
          detail: "HTTP 308 → /game/ → HTTP 200",
          chain: [
            { url: "https://playfranchisearchitect.com/game.html", statusCode: 308 },
            { url: "https://playfranchisearchitect.com/game/", statusCode: 200 }
          ]
        }
      }
    }
  });

  assert.equal(report.summary.routesOk, true);
  assert.equal(report.summary.emailForwardingVerified, false);
  assert.equal(report.summary.status, "blocked");
  assert.match(report.summary.blocker, /email forwarding/i);
});

test("probeWithRedirects follows a relative-Location redirect to a 200", async () => {
  const probe = fakeProber({
    "https://example.com/game.html": { statusCode: 308, location: "/game/" },
    "https://example.com/game/": { statusCode: 200, location: null }
  });

  const result = await probeWithRedirects("https://example.com/game.html", 1000, probe);

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.detail, "HTTP 308 → /game/ → HTTP 200");
  assert.deepEqual(result.chain, [
    { url: "https://example.com/game.html", statusCode: 308 },
    { url: "https://example.com/game/", statusCode: 200 }
  ]);
});

test("probeWithRedirects marks a redirect-to-404 as not ok with the final status", async () => {
  const probe = fakeProber({
    "https://example.com/game.html": { statusCode: 308, location: "https://example.com/missing/" },
    "https://example.com/missing/": { statusCode: 404, location: null }
  });

  const result = await probeWithRedirects("https://example.com/game.html", 1000, probe);

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 404);
  assert.match(result.detail, /HTTP 308 → https:\/\/example\.com\/missing\/ → HTTP 404/);
  assert.equal(result.chain.length, 2);
});

test("probeWithRedirects refuses an insecure http downgrade", async () => {
  const probe = fakeProber({
    "https://example.com/game.html": { statusCode: 301, location: "http://example.com/game/" }
  });

  const result = await probeWithRedirects("https://example.com/game.html", 1000, probe);

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 301);
  assert.match(result.detail, /insecure redirect target/);
  assert.equal(probe.seen.length, 1);
});

test("probeWithRedirects treats a 3xx without Location as not ok", async () => {
  const probe = fakeProber({
    "https://example.com/game.html": { statusCode: 308, location: null }
  });

  const result = await probeWithRedirects("https://example.com/game.html", 1000, probe);

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 308);
  assert.match(result.detail, /missing Location header/);
});

test("probeWithRedirects stops after 5 hops with redirect limit exceeded", async () => {
  const probe = fakeProber({
    "https://example.com/loop": { statusCode: 308, location: "/loop" }
  });

  const result = await probeWithRedirects("https://example.com/loop", 1000, probe);

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 308);
  assert.match(result.detail, /redirect limit exceeded/);
  assert.equal(result.chain.length, 6);
  assert.ok(result.chain.every((hop) => hop.statusCode === 308));
});

test("probeWithRedirects surfaces a network failure mid-chain", async () => {
  const probe = fakeProber({
    "https://example.com/game.html": { statusCode: 308, location: "/game/" },
    "https://example.com/game/": { error: "socket hang up" }
  });

  const result = await probeWithRedirects("https://example.com/game.html", 1000, probe);

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, null);
  assert.match(result.detail, /HTTP 308 → \/game\/ → socket hang up/);
  assert.deepEqual(result.chain[1], { url: "https://example.com/game/", statusCode: null });
});
