import test from "node:test";
import assert from "node:assert/strict";
import { readServerSource } from "../scripts/lib/server-source.mjs";

test("server exposes both source roots required by client-runtime module imports", () => {
  const source = readServerSource();
  assert.match(source, /safePath\.startsWith\("\/src\/"\)/);
  assert.match(source, /safePath\.startsWith\("\/public\/"\)/);
  assert.match(source, /baseDir: PUBLIC_DIR, prefix: "\/public"/);
});
