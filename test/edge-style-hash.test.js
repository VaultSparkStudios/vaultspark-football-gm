import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEdgeHeaders,
  inspectInlineStyleHashes
} from "../scripts/lib/edge-security-policy.mjs";

test("inline style elements are exact-hashed while style attributes stay explicitly scoped", () => {
  const hashes = inspectInlineStyleHashes("<style>\n.hero { color: gold; }\n</style>");
  assert.equal(hashes.length, 1);
  const headers = buildEdgeHeaders({ inlineStyleHashes: hashes });
  assert.match(headers, new RegExp(`style-src-elem 'self' ${hashes[0]}`));
  assert.match(headers, /style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(headers, /style-src-elem[^;\n]*'unsafe-inline'/);
});
