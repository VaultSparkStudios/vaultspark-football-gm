import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";

const root = resolve(new URL("..", import.meta.url).pathname.replace(
  /^\/(?:[A-Za-z]:)/,
  (match) => match.slice(1)
));

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "fa-capability-operations-"));
  const local = join(base, "local");
  const canonical = join(base, "canonical");
  const ledger = join(base, "receipts", "probe.ndjson");
  mkdirSync(local, { recursive: true });
  mkdirSync(canonical, { recursive: true });
  const map = JSON.stringify({
    capabilities: {
      "fixture.ready": { env: ["FIXTURE_TOKEN"] },
      "fixture.missing": { env: ["MISSING_TOKEN"] }
    }
  }, null, 2);
  writeFileSync(join(canonical, "CAPABILITY_MAP.json"), map);
  writeFileSync(join(canonical, "fixture.env"), "FIXTURE_TOKEN=fixture-value-never-print\n");
  return { base, local, canonical, ledger, map };
}

function run(script, args, dirs) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      VAULTSPARK_SECRETS_DIR_OVERRIDE: dirs.local,
      STUDIO_OPS_SECRETS_DIR: dirs.canonical,
      VAULTSPARK_CAPABILITY_PROBE_LEDGER: dirs.ledger
    }
  });
}

test("read-only probes use canonical definitions and never mutate the capability map", () => {
  const probe = readFileSync(resolve(root, "scripts/probe-capability.mjs"), "utf8");
  assert.doesNotMatch(probe, /api\.anthropic\.com|@anthropic-ai\/sdk/);
  assert.match(probe, /callAnthropicRaw/);

  const router = readFileSync(resolve(root, "scripts/lib/model-router.mjs"), "utf8");
  assert.match(router, /timeoutMs/);
  assert.match(router, /req\.setTimeout/);

  const dirs = fixture();
  const before = readFileSync(join(dirs.canonical, "CAPABILITY_MAP.json"), "utf8");
  const result = run("scripts/probe-capability.mjs", ["--for", "fixture.ready", "--json"], dirs);

  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(result.stdout);
  assert.equal(rows[0].status, "skipped");
  assert.equal(rows[0].detail, "no read-only probe implemented");
  assert.equal(rows[0].definitionSource, "canonical");
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-value-never-print/);
  assert.equal(readFileSync(join(dirs.canonical, "CAPABILITY_MAP.json"), "utf8"), before);
  assert.equal(existsSync(join(dirs.local, "CAPABILITY_MAP.json")), false);
  assert.match(readFileSync(dirs.ledger, "utf8"), /fixture\.ready/);
});

test("credential inventory is gateway-derived and redacted", () => {
  const dirs = fixture();
  const result = run("scripts/paste-credential.mjs", ["--list", "--json"], dirs);

  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(result.stdout);
  assert.deepEqual(rows, [{
    cap: "fixture.missing",
    ok: false,
    missing: ["MISSING_TOKEN"]
  }]);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-value-never-print/);
});

test("explicit intake dry-run targets the selected write authority without writes", () => {
  const dirs = fixture();
  writeFileSync(join(dirs.local, "CAPABILITY_MAP.json"), dirs.map);
  const source = join(dirs.local, "fixture-ready-paste.txt");
  writeFileSync(source, "fresh-fixture-token");
  const result = run(
    "scripts/paste-credential.mjs",
    ["fixture.ready", "--source", source, "--dry-run", "--json"],
    dirs
  );

  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.dryRun, true);
  assert.equal(receipt.writeAuthority, "local-override");
  assert.deepEqual(receipt.keysWritten, ["FIXTURE_TOKEN"]);
  assert.equal(existsSync(join(dirs.local, "fixture.env")), false);
  assert.doesNotMatch(result.stdout + result.stderr, /fresh-fixture-token/);
});
