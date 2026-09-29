#!/usr/bin/env node
// GitHub's backend deployment transport. The host key is pinned before the first
// connection; only SSH transport failures (exit 255) are retried. Remote deploy
// failures stop immediately so an application error cannot be mistaken for a
// transient connection reset.
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "./lib/safe-spawn.mjs";
import { fileURLToPath } from "node:url";

const REMOTE_SCRIPT = `set -euo pipefail
DEPLOY_PATH="$1"
DEPLOY_SHA="$2"
GHCR_USER="$3"
IFS= read -r GHCR_TOKEN
cd "$DEPLOY_PATH"
if [ ! -f .env ]; then
  umask 077
  printf 'POSTGRES_PASSWORD=%s\\n' "$(openssl rand -hex 32)" > .env
fi
export IMAGE_TAG="$DEPLOY_SHA"
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USER" --password-stdin
unset GHCR_TOKEN
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
docker compose --env-file .env -f ops/deploy-backend.docker-compose.yml pull
docker compose --env-file .env -f ops/deploy-backend.docker-compose.yml up -d
CADDY_FRAGMENT=/etc/caddy/conf.d/franchise-architect-football.caddy
if cmp -s ops/Caddyfile "$CADDY_FRAGMENT"; then
  echo 'Caddy route unchanged; reload not required.'
else
  install -m 0644 ops/Caddyfile "$CADDY_FRAGMENT"
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
fi
HEALTH_JSON="$(curl --fail --silent --show-error --retry 15 --retry-delay 2 --retry-all-errors http://127.0.0.1:8082/community/v1/health)"
printf '%s\\n' "$HEALTH_JSON"
printf '%s' "$HEALTH_JSON" | grep -F "\\\"sourceRevision\\\":\\\"$DEPLOY_SHA\\\"" >/dev/null`;

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function validateBackendSshConfig(config) {
  const required = ["host", "user", "privateKey", "hostKey", "deployPath", "sourceRevision", "registryUser", "registryToken"];
  for (const key of required) {
    if (typeof config[key] !== "string" || !config[key].trim()) throw new Error(`Missing backend SSH configuration: ${key}`);
  }
  if (!/^[A-Za-z0-9.-]+$/.test(config.host)) throw new Error("Invalid backend SSH host");
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(config.user)) throw new Error("Invalid backend SSH user");
  if (!/^\/[A-Za-z0-9_./-]+$/.test(config.deployPath) || config.deployPath.split("/").includes("..")) {
    throw new Error("Backend deployment path must be an absolute simple path");
  }
  if (!/^[a-f0-9]{40}$/i.test(config.sourceRevision)) throw new Error("Invalid backend source revision");
  if (!/^[A-Za-z0-9_-]+$/.test(config.registryUser)) throw new Error("Invalid registry user");
  const hostKey = config.hostKey.trim();
  const parts = hostKey.split(/\s+/);
  if (hostKey.includes("\n") || hostKey.includes("\r") || parts.length !== 3 || parts[0] !== config.host ||
      !/^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)$/.test(parts[1]) || !/^[A-Za-z0-9+/=]+$/.test(parts[2])) {
    throw new Error("Backend SSH host key must be one pinned known_hosts line for BACKEND_SSH_HOST");
  }
  return { ...config, hostKey };
}

export async function withTransportRetry(name, run, { attempts = 3, delay = async () => {} } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await run(attempt);
    if (result.status === 0) return { ...result, attempt };
    const identityOrAuthFailure = /host key verification failed|remote host identification has changed|permission denied \(publickey|could not resolve hostname/i.test(result.stderr || "");
    if (result.status !== 255 || identityOrAuthFailure || attempt === attempts) {
      const kind = identityOrAuthFailure ? "host identity/auth" : result.status === 255 ? "transport" : "remote";
      throw new Error(`${name} ${kind} failure (exit ${result.status ?? "unknown"}, attempt ${attempt}/${attempts})`);
    }
    await delay(attempt * 3000);
  }
}

export async function deployBackendViaSsh(rawConfig, {
  spawn = spawnSync,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log
} = {}) {
  const config = validateBackendSshConfig(rawConfig);
  const scratch = mkdtempSync(join(tmpdir(), "fa-backend-ssh-"));
  try {
    const keyPath = join(scratch, "identity");
    const hostsPath = join(scratch, "known_hosts");
    writeFileSync(keyPath, `${config.privateKey.trim()}\n`, { mode: 0o600 });
    writeFileSync(hostsPath, `${config.hostKey}\n`, { mode: 0o600 });
    chmodSync(keyPath, 0o600);
    chmodSync(hostsPath, 0o600);
    const opts = [
      "-i", keyPath, "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
      "-o", "StrictHostKeyChecking=yes", "-o", `UserKnownHostsFile=${hostsPath}`,
      "-o", "ConnectTimeout=15", "-o", "ConnectionAttempts=1"
    ];
    const target = `${config.user}@${config.host}`;
    const run = (command, args, input) => spawn(command, args, {
      encoding: "utf8", input, timeout: 4 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });
    const copy = await withTransportRetry("backend ops copy", () => run("scp", ["-r", ...opts, "ops", `${target}:${config.deployPath}`]), { delay });
    log("Backend ops files copied with pinned SSH host identity.");
    const remoteCommand = ["bash", "-c", shellQuote(REMOTE_SCRIPT), "backend-deploy",
      shellQuote(config.deployPath), shellQuote(config.sourceRevision), shellQuote(config.registryUser)].join(" ");
    const deployed = await withTransportRetry("backend deploy", () => run("ssh", [...opts, target, remoteCommand], `${config.registryToken}\n`), { delay });
    if (deployed.stdout) log(deployed.stdout.trim());
    return { copyAttempts: copy.attempt, deployAttempts: deployed.attempt };
  } finally {
    const resolvedScratch = resolve(scratch);
    if (dirname(resolvedScratch) !== resolve(tmpdir()) || !basename(resolvedScratch).startsWith("fa-backend-ssh-")) {
      throw new Error("Refusing to remove an SSH scratch directory outside the expected OS temp scope");
    }
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  deployBackendViaSsh({
    host: process.env.BACKEND_SSH_HOST,
    user: process.env.BACKEND_SSH_USER,
    privateKey: process.env.BACKEND_SSH_KEY,
    hostKey: process.env.BACKEND_SSH_HOST_KEY,
    deployPath: process.env.BACKEND_DEPLOY_PATH,
    sourceRevision: process.env.DEPLOY_SHA,
    registryUser: process.env.GHCR_USER,
    registryToken: process.env.GHCR_TOKEN
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
