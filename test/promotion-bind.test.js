import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diffArtifactEntries, evaluatePromotionBind } from "../scripts/verify-promotion-bind.mjs";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";

const revision = "a".repeat(40);
const digest = "b".repeat(64);

test("promotion bind reports both exact identities", () => {
  const pass = evaluatePromotionBind({
    expectedRevision: revision,
    expectedDigest: digest,
    observedManifest: { sourceRevision: revision, artifactFingerprint: { digest } }
  });
  assert.equal(pass.ok, true);
  assert.equal(pass.observedRevision, revision);
  assert.equal(pass.observedDigest, digest);

  const fail = evaluatePromotionBind({
    expectedRevision: revision,
    expectedDigest: digest,
    observedManifest: { sourceRevision: "c".repeat(40), artifactFingerprint: { digest: "d".repeat(64) } }
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.checks.revision, false);
  assert.equal(fail.checks.digest, false);
});

test("per-file ledger names added, removed, and changed paths deterministically", () => {
  const changes = diffArtifactEntries(
    [
      { path: "a.txt", bytes: 1, sha256: "a" },
      { path: "b.txt", bytes: 1, sha256: "b" },
      { path: "same.txt", bytes: 1, sha256: "s" }
    ],
    [
      { path: "a.txt", bytes: 2, sha256: "z" },
      { path: "c.txt", bytes: 1, sha256: "c" },
      { path: "same.txt", bytes: 1, sha256: "s" }
    ]
  );
  assert.deepEqual(changes.map(({ path, change }) => ({ path, change })), [
    { path: "a.txt", change: "changed" },
    { path: "b.txt", change: "removed" },
    { path: "c.txt", change: "added" }
  ]);
});

test("CLI mismatch output names expected and observed identities before exit 2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fa-promotion-bind-"));
  const manifest = path.join(dir, "deploy-manifest.json");
  try {
    fs.writeFileSync(manifest, JSON.stringify({
      sourceRevision: "c".repeat(40),
      artifactFingerprint: { digest: "d".repeat(64) }
    }));
    const result = spawnSync(process.execPath, [
      "scripts/verify-promotion-bind.mjs",
      "--manifest", manifest,
      "--revision", revision,
      "--digest", digest
    ], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stdout, /promotion bind: BLOCKED/);
    assert.match(result.stdout, new RegExp(`revision expected=${revision} observed=${"c".repeat(40)}`));
    assert.match(result.stdout, new RegExp(`digest   expected=${digest} observed=${"d".repeat(64)}`));
    assert.match(result.stdout, /per-file diff unavailable/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
