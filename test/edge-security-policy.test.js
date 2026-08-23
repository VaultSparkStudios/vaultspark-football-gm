import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEdgeHeaders,
  inspectHtmlForEdgePolicy,
  auditDeliveredDocument,
  EDGE_INJECTED_ORIGINS
} from "../scripts/lib/edge-security-policy.mjs";

test("edge policy hashes exact inline script bodies and keeps self modules hash-free", () => {
  const html = `<script type="application/ld+json">\n{"name":"Architect"}\n</script>
<script type="module" src="./app.js"></script>`;
  const hashes = inspectHtmlForEdgePolicy(html, "fixture.html");
  assert.equal(hashes.length, 1);
  assert.match(hashes[0], /^'sha256-[A-Za-z0-9+/]+=*'$/);
  const headers = buildEdgeHeaders({ inlineScriptHashes: hashes });
  assert.match(headers, new RegExp(hashes[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Strict-Transport-Security/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.doesNotMatch(headers, /script-src[^;\n]*'unsafe-inline'/);
});

test("edge policy refuses inline handlers, javascript URLs, and remote script sources", () => {
  assert.throws(
    () => inspectHtmlForEdgePolicy(`<button onclick="go()">Go</button>`, "handler.html"),
    /inline event handler/
  );
  assert.throws(
    () => inspectHtmlForEdgePolicy(`<a href="javascript:go()">Go</a>`, "url.html"),
    /javascript: URL/
  );
  assert.throws(
    () => inspectHtmlForEdgePolicy(`<script src="https://example.com/a.js"></script>`, "remote.html"),
    /non-self script source/
  );
});

// ── S94: the delivered document, not the artifact ────────────────────────────
// The three tests above all reason about the artifact this build produces. They
// were green for the entire period in which every real page load violated the
// policy, because the violating tag is injected by the edge after the build.
// These tests exercise the other question: does the SERVED policy admit what the
// SERVED document asks for?

const LIVE_CSP_BEFORE_S94 =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
  "form-action 'self' mailto:; script-src 'self' 'sha256-abc='; style-src-elem 'self'; " +
  "img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self' https://api.github.com https://gist.githubusercontent.com " +
  "https://api-franchise-architect-football.vaultsparkstudios.com; upgrade-insecure-requests";

const DELIVERED_WITH_BEACON =
  `<!doctype html><html><head><script type="module" src="./app.js"></script>` +
  `<script src="https://static.cloudflareinsights.com/beacon.min.js/v451" ` +
  `data-cf-beacon='{"token":"x"}' crossorigin="anonymous"></script></head><body></body></html>`;

test("NEGATIVE CONTROL: the pre-S94 policy is proved to REFUSE the beacon the edge injects", () => {
  const audit = auditDeliveredDocument(DELIVERED_WITH_BEACON, LIVE_CSP_BEFORE_S94);
  assert.equal(audit.ok, false, "a gate that cannot go red on the real defect is not a gate");
  const directives = audit.violations.map((violation) => violation.directive).sort();
  assert.deepEqual(directives, ["connect-src", "script-src"]);
  assert.equal(
    audit.violations.find((violation) => violation.directive === "script-src").origin,
    "https://static.cloudflareinsights.com"
  );
  // The beacon is mute without its reporting endpoint, so admitting the script
  // alone must not read as healthy.
  assert.equal(
    audit.violations.find((violation) => violation.directive === "connect-src").origin,
    "https://cloudflareinsights.com"
  );
});

test("the S94 policy admits the injected beacon and its reporting endpoint", () => {
  const csp = buildEdgeHeaders({ inlineScriptHashes: [] }).match(/Content-Security-Policy: (.*)/)[1];
  assert.equal(auditDeliveredDocument(DELIVERED_WITH_BEACON, csp).ok, true);
  for (const entry of EDGE_INJECTED_ORIGINS) {
    assert.ok(csp.includes(entry.origin), `${entry.directive} must admit ${entry.origin}`);
  }
});

test("admitting edge-injected origins does not widen the policy for anything else", () => {
  const csp = buildEdgeHeaders({ inlineScriptHashes: [] }).match(/Content-Security-Policy: (.*)/)[1];
  const rogue = `<script src="https://evil.example.com/x.js"></script>`;
  const audit = auditDeliveredDocument(rogue, csp);
  assert.equal(audit.ok, false);
  assert.equal(audit.violations[0].origin, "https://evil.example.com");
  assert.doesNotMatch(csp, /script-src[^;]*\*/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test("a document with no external references is admitted, and same-origin scripts are never flagged", () => {
  const csp = buildEdgeHeaders({ inlineScriptHashes: [] }).match(/Content-Security-Policy: (.*)/)[1];
  const local = `<script type="module" src="./app.js"></script><script src="/lib/themeBoot.js"></script>`;
  assert.deepEqual(auditDeliveredDocument(local, csp).violations, []);
});

// ── S94: cache policy ────────────────────────────────────────────────────────

test("the update channel is never cached and hashed assets are immutable", () => {
  const headers = buildEdgeHeaders({ inlineScriptHashes: [] });
  const blockFor = (path) => {
    const lines = headers.split("\n");
    const start = lines.indexOf(path);
    assert.notEqual(start, -1, `_headers must declare a rule for ${path}`);
    return lines.slice(start + 1, start + 2).join("");
  };
  // A cache-first service worker serves its previous precache for as long as the
  // worker lives, so a cacheable sw.js makes a deploy invisible AND serves stale
  // bytes meanwhile. This is the one asset where caching is never acceptable.
  assert.match(blockFor("/sw.js"), /Cache-Control:\s*no-cache/);
  assert.doesNotMatch(blockFor("/sw.js"), /max-age=[1-9]/);

  for (const hashed of ["/styles.*.css", "/community-stats.*.js"]) {
    assert.match(blockFor(hashed), /immutable/, `${hashed} is content-hashed and must be immutable`);
    assert.match(blockFor(hashed), /max-age=31536000/);
  }

  // The security block must not have acquired a Cache-Control of its own: the
  // host default is correct for the unhashed module graph and overriding it
  // globally would regress the ~110 stable-URL modules.
  const securityBlock = headers.slice(headers.indexOf("/*"), headers.indexOf("/sw.js"));
  assert.doesNotMatch(securityBlock, /Cache-Control/);
});
