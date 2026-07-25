import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("server exposes both source roots required by client-runtime module imports", () => {
  const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /safePath\.startsWith\("\/src\/"\)/);
  assert.match(source, /safePath\.startsWith\("\/public\/"\)/);
  assert.match(source, /baseDir: PUBLIC_DIR, prefix: "\/public"/);
});
