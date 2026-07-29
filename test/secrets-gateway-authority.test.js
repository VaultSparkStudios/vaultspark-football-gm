import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "fa-secrets-authority-"));
  const local = join(base, "local");
  const canonical = join(base, "canonical");
  mkdirSync(local, { recursive: true });
  mkdirSync(canonical, { recursive: true });
  writeFileSync(join(canonical, "CAPABILITY_MAP.json"), JSON.stringify({
    capabilities: { "canonical.ready": { env: ["CANONICAL_TOKEN"] } }
  }));
  writeFileSync(join(canonical, "canonical.env"), "CANONICAL_TOKEN=fixture-value-never-print\n");
  return { local, canonical };
}

function check(args, dirs) {
  return spawnSync(process.execPath, ["scripts/check-secrets.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      VAULTSPARK_SECRETS_DIR_OVERRIDE: dirs.local,
      STUDIO_OPS_SECRETS_DIR: dirs.canonical
    }
  });
}

test("project gateway falls back to the canonical capability map without exposing values", () => {
  const dirs = fixture();
  const result = check(["--audit"], dirs);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /canonical\.ready/);
  assert.match(result.stdout, /1\/1 capabilities ready/);
  assert.match(result.stdout, /Capability map authority: canonical/);
  assert.doesNotMatch(result.stdout, /fixture-value-never-print/);
});

test("a present local capability map is the explicit higher-precedence authority", () => {
  const dirs = fixture();
  writeFileSync(join(dirs.local, "CAPABILITY_MAP.json"), JSON.stringify({
    capabilities: { "local.ready": { env: ["LOCAL_TOKEN"] } }
  }));
  writeFileSync(join(dirs.local, "local.env"), "LOCAL_TOKEN=local-fixture-value\n");
  const result = check(["--audit"], dirs);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /local\.ready/);
  assert.doesNotMatch(result.stdout, /canonical\.ready/);
  assert.match(result.stdout, /Capability map authority: local/);
  assert.doesNotMatch(result.stdout, /local-fixture-value/);
});

test("a corrupt present local map fails loud instead of silently falling through", () => {
  const dirs = fixture();
  writeFileSync(join(dirs.local, "CAPABILITY_MAP.json"), "{not-json");
  const result = check(["--for", "canonical.ready", "--json"], dirs);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNPARSEABLE/);
  const rows = JSON.parse(result.stdout);
  assert.equal(rows[0].ok, false);
  assert.deepEqual(rows[0].required, []);
});
