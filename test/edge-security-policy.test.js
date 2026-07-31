import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEdgeHeaders,
  inspectHtmlForEdgePolicy
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
