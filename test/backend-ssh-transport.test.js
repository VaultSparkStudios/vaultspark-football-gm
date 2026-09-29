import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deployBackendViaSsh, validateBackendSshConfig, withTransportRetry } from "../scripts/deploy-backend-ssh.mjs";

const config = {
  host: "backend.example.test",
  user: "deployer",
  privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nfixture-only\n-----END OPENSSH PRIVATE KEY-----",
  hostKey: "backend.example.test ssh-ed25519 Zml4dHVyZS1ob3N0LWtleQ==",
  deployPath: "/srv/franchise-architect",
  sourceRevision: "a".repeat(40),
  registryUser: "fixture-user",
  registryToken: "fixture-token"
};

test("backend SSH transport retries one reset then succeeds with pinned host and stdin-only token", async () => {
  const calls = [];
  const waits = [];
  const result = await deployBackendViaSsh(config, {
    spawn(command, args, options) {
      calls.push({ command, args, options });
      if (calls.length === 1) return { status: 255, stdout: "", stderr: "pre-auth reset" };
      return { status: 0, stdout: command === "ssh" ? "exact source healthy" : "", stderr: "" };
    },
    delay: async (ms) => { waits.push(ms); },
    log: () => {}
  });
  assert.deepEqual(result, { copyAttempts: 2, deployAttempts: 1 });
  assert.deepEqual(calls.map(({ command }) => command), ["scp", "scp", "ssh"]);
  assert.deepEqual(waits, [3000]);
  for (const call of calls) {
    assert.ok(call.args.includes("StrictHostKeyChecking=yes"));
    assert.ok(call.args.some((arg) => arg.startsWith("UserKnownHostsFile=")));
    assert.ok(call.args.includes("BatchMode=yes"));
    assert.doesNotMatch(call.args.join(" "), /fixture-token/);
  }
  assert.equal(calls[2].options.input, "fixture-token\n");
});

test("backend SSH transport stops after three resets and does not begin deploy", async () => {
  const calls = [];
  await assert.rejects(deployBackendViaSsh(config, {
    spawn(command) {
      calls.push(command);
      return { status: 255, stdout: "", stderr: "pre-auth reset" };
    },
    delay: async () => {},
    log: () => {}
  }), /backend ops copy transport failure \(exit 255, attempt 3\/3\)/);
  assert.deepEqual(calls, ["scp", "scp", "scp"]);
});

test("backend SSH deploy retries a reset after copy then verifies success", async () => {
  const calls = [];
  const result = await deployBackendViaSsh(config, {
    spawn(command) {
      calls.push(command);
      return { status: calls.length === 2 ? 255 : 0, stdout: "", stderr: calls.length === 2 ? "EOF" : "" };
    },
    delay: async () => {},
    log: () => {}
  });
  assert.deepEqual(result, { copyAttempts: 1, deployAttempts: 2 });
  assert.deepEqual(calls, ["scp", "ssh", "ssh"]);
});

test("backend SSH transport does not retry a remote application failure", async () => {
  const calls = [];
  await assert.rejects(deployBackendViaSsh(config, {
    spawn(command) {
      calls.push(command);
      return { status: command === "scp" ? 0 : 1, stdout: "", stderr: "compose failed" };
    },
    delay: async () => {},
    log: () => {}
  }), /backend deploy remote failure \(exit 1, attempt 1\/3\)/);
  assert.deepEqual(calls, ["scp", "ssh"]);
});

test("backend SSH transport rejects absent or mismatched host identity before spawning", () => {
  assert.throws(() => validateBackendSshConfig({ ...config, hostKey: "" }), /Missing backend SSH configuration: hostKey/);
  assert.throws(() => validateBackendSshConfig({ ...config, hostKey: "other.example.test ssh-ed25519 Zml4dHVyZQ==" }), /pinned known_hosts line/);
  assert.throws(() => validateBackendSshConfig({ ...config, deployPath: "/srv/../escape" }), /absolute simple path/);
});

test("host-key mismatch fails immediately even though SSH returns transport exit 255", async () => {
  let attempts = 0;
  await assert.rejects(withTransportRetry("backend deploy", () => {
    attempts++;
    return { status: 255, stderr: "Host key verification failed." };
  }), /host identity\/auth failure.*attempt 1\/3/);
  assert.equal(attempts, 1);
});

test("manual backend workflow uses the bounded transport and requires a pinned host key", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-backend.yml", import.meta.url), "utf8");
  assert.match(workflow, /run: node scripts\/deploy-backend-ssh\.mjs/);
  assert.match(workflow, /BACKEND_SSH_HOST_KEY: \$\{\{ secrets\.BACKEND_SSH_HOST_KEY \}\}/);
  assert.doesNotMatch(workflow, /appleboy\/(?:scp|ssh)-action/);
});
