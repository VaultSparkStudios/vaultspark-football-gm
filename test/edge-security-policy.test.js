import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEdgeHeaders,
  inspectHtmlForEdgePolicy,
  auditDeliveredDocument,
  parseArtifactHeaderRules,
  resolveArtifactHeaders,
  EDGE_INJECTED_ORIGINS
} from "../scripts/lib/edge-security-policy.mjs";

test("browser evidence replays exact artifact CSP plus only matching route-cache rules", () => {
  const generated = buildEdgeHeaders({ inlineStyleHashes: ["'sha256-test='"] });
  const rules = parseArtifactHeaderRules(generated);
  const expectedCsp = generated.match(/Content-Security-Policy: (.*)/)[1];
  for (const route of ["/", "/game.html", "/lib/frontOfficeAdvisor.js", "/styles.a123.css", "/sw.js"]) {
    assert.equal(resolveArtifactHeaders(rules, route)["content-security-policy"], expectedCsp);
  }
  assert.equal(resolveArtifactHeaders(rules, "/sw.js")["cache-control"], "no-cache");
  assert.match(resolveArtifactHeaders(rules, "/styles.a123.css")["cache-control"], /immutable/);
  assert.equal(resolveArtifactHeaders(rules, "/stylesXa123Xcss")["cache-control"], undefined, "glob punctuation is literal");
  assert.equal(resolveArtifactHeaders(rules, "/lib/tutorialCampaign.js")["cache-control"], undefined);
  assert.throws(() => parseArtifactHeaderRules("/*\n  Cache-Control: no-cache\n"), /lack the global/);
  assert.throws(() => parseArtifactHeaderRules("/*\n  malformed\n"), /Invalid artifact/);
});

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

// ── Staging must not be indexed, and production must stay indexable ──────────
// Both hosts serve one artifact, so the rule is keyed by host inside _headers.

test("staging hosts get X-Robots-Tag: noindex from host-keyed rules, and no production path does", async () => {
  const { NOINDEX_HOSTS, hostMatchesNoindexRule, MAX_EDGE_HEADER_LINE } = await import("../scripts/lib/edge-security-policy.mjs");
  const { STAGING_DOMAIN, STAGING_PROJECT } = await import("../scripts/deploy-staging.mjs");
  assert.deepEqual([...NOINDEX_HOSTS], [STAGING_DOMAIN, `${STAGING_PROJECT}.pages.dev`, `:version.${STAGING_PROJECT}.pages.dev`]);

  const generated = buildEdgeHeaders({ inlineStyleHashes: ["'sha256-test='"] });
  const lines = generated.split("\n");
  for (const host of NOINDEX_HOSTS) {
    const at = lines.indexOf(`https://${host}/*`);
    assert.notEqual(at, -1, `_headers must declare a rule for ${host}`);
    assert.equal(lines[at + 1], "  X-Robots-Tag: noindex");
  }
  // The header appears only under absolute-URL rules: a path-only rule would
  // apply to production too and take the real site out of search.
  let route = null;
  for (const line of lines) {
    if (line && !/^\s/.test(line)) route = line;
    if (/x-robots-tag/i.test(line)) assert.match(route, /^https:\/\//, `X-Robots-Tag must never sit under the path rule ${route}`);
  }
  assert.ok(lines.filter((line) => line && !/^\s/.test(line)).length <= 100, "the host allows 100 rules");
  assert.ok(Math.max(...lines.map((line) => line.length)) <= MAX_EDGE_HEADER_LINE);

  const rules = parseArtifactHeaderRules(generated);
  const csp = generated.match(/Content-Security-Policy: (.*)/)[1];
  for (const pathname of ["/", "/game.html", "/sw.js", "/styles.a123.css", "/lib/appCore.js"]) {
    assert.equal(resolveArtifactHeaders(rules, pathname)["x-robots-tag"], undefined, "a replay that names no host is production");
    for (const production of ["playfranchisearchitect.com", "www.playfranchisearchitect.com", "franchise-architect.pages.dev", "notstaging.playfranchisearchitect.com", "staging.playfranchisearchitect.com.evil.example"]) {
      assert.equal(resolveArtifactHeaders(rules, pathname, { host: production })["x-robots-tag"], undefined, `${production}${pathname} must stay indexable`);
    }
    for (const staging of [STAGING_DOMAIN, `${STAGING_PROJECT}.pages.dev`, `a1b2c3d4.${STAGING_PROJECT}.pages.dev`, `staging.${STAGING_PROJECT}.pages.dev`, `${STAGING_DOMAIN}:443`]) {
      const resolved = resolveArtifactHeaders(rules, pathname, { host: staging });
      assert.equal(resolved["x-robots-tag"], "noindex", `${staging}${pathname} must be noindex`);
      assert.equal(resolved["content-security-policy"], csp, "the host rule adds to the security policy; it does not replace it");
    }
  }
  assert.equal(hostMatchesNoindexRule(STAGING_DOMAIN), true);
  assert.equal(hostMatchesNoindexRule(`a.b.${STAGING_PROJECT}.pages.dev`), false, "a placeholder matches exactly one label");
  assert.equal(hostMatchesNoindexRule("playfranchisearchitect.com"), false);
});

test("the header replay accepts absolute https rules and refuses other route shapes", () => {
  const base = "/*\n  Content-Security-Policy: default-src 'self'\n";
  const rules = parseArtifactHeaderRules(`${base}https://one.example/docs/*\n  X-Robots-Tag: noindex\n`);
  assert.equal(resolveArtifactHeaders(rules, "/docs/a", { host: "one.example" })["x-robots-tag"], "noindex");
  assert.equal(resolveArtifactHeaders(rules, "/other", { host: "one.example" })["x-robots-tag"], undefined);
  assert.equal(resolveArtifactHeaders(rules, "/docs/a", { host: "oneXexample" })["x-robots-tag"], undefined, "host punctuation is literal");
  assert.throws(() => parseArtifactHeaderRules(`${base}http://one.example/*\n  X-Robots-Tag: noindex\n`), /Unsupported artifact header route/);
  assert.throws(() => parseArtifactHeaderRules(`${base}https://one.example:8443/*\n  X-Robots-Tag: noindex\n`), /Unsupported artifact header route/);
  assert.throws(() => parseArtifactHeaderRules(`${base}one.example/*\n  X-Robots-Tag: noindex\n`), /Unsupported artifact header route/);
});

test("the receipt names the non-indexed hosts and its fingerprint covers the host rules", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { emitEdgeSecurityPolicy, NOINDEX_HOSTS } = await import("../scripts/lib/edge-security-policy.mjs");
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "fa-edge-noindex-"));
  try {
    await fs.writeFile(path.join(outDir, "index.html"), "<!doctype html><title>x</title>", "utf8");
    const receipt = await emitEdgeSecurityPolicy({ outDir, htmlPages: ["index.html"], sourceRevision: "abc123" });
    const written = await fs.readFile(path.join(outDir, "_headers"), "utf8");
    assert.deepEqual(receipt.noindexHosts, [...NOINDEX_HOSTS]);
    assert.equal(receipt.policyFingerprint, `sha256:${createHash("sha256").update(written).digest("hex")}`);
    assert.match(written, /^https:\/\/staging\.playfranchisearchitect\.com\/\*\n  X-Robots-Tag: noindex$/m);
    const without = written.replace(/https:\/\/[^\n]+\n  X-Robots-Tag: noindex\n\n?/g, "");
    assert.notEqual(`sha256:${createHash("sha256").update(without).digest("hex")}`, receipt.policyFingerprint, "dropping the host rules changes the fingerprint");
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(outDir, "edge-policy-receipt.json"), "utf8")).noindexHosts, [...NOINDEX_HOSTS]);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});