import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compose = readFileSync(new URL('../ops/deploy-backend.docker-compose.yml', import.meta.url), 'utf8');
const caddy = readFileSync(new URL('../ops/Caddyfile', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy-backend.yml', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('../Dockerfile.runtime', import.meta.url), 'utf8');

test('community deployment cannot seize shared-host public or database ports', () => {
  assert.doesNotMatch(compose, /(?:^|\s)["']?(?:80|443|5432):(?:80|443|5432)/m);
  assert.match(compose, /127\.0\.0\.1:8082:8082/);
  assert.match(compose, /community_internal:\s*\n\s+internal: true/);
  assert.match(compose, /community_edge:\s*\n\s+driver: bridge/);
  assert.match(compose, /POSTGRES_DB: community_stats/);
  assert.match(compose, /IMAGE_TAG:-latest/);
});

test('community API joins the guarded shared Caddy plane through localhost only', () => {
  assert.match(caddy, /api-franchise-architect-football\.vaultsparkstudios\.com/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:8082/);
  assert.doesNotMatch(caddy, /\{\s*email\s|franchise-architect-football-(?:play|api):/);
  assert.match(workflow, /\/etc\/caddy\/conf\.d\/franchise-architect-football\.caddy/);
  assert.match(workflow, /caddy validate --config \/etc\/caddy\/Caddyfile/);
  assert.match(workflow, /systemctl reload caddy/);
  assert.match(workflow, /openssl rand -hex 32/);
  assert.equal((workflow.match(/docker compose --env-file \.env/g) || []).length, 2);
  assert.match(workflow, /IMAGE_TAG="\$DEPLOY_SHA"/);
  assert.match(workflow, /docker login ghcr\.io .*--password-stdin/);
  assert.match(workflow, /trap 'docker logout ghcr\.io/);
});

test('backend promotion tests its runtime and attests the exact deployed revision', () => {
  assert.match(workflow, /npm run test:studio/);
  assert.match(workflow, /npm run test:runtime/);
  assert.match(workflow, /SOURCE_REVISION=\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /sourceRevision.*DEPLOY_SHA/);
  assert.match(workflow, /grep -F/);
  assert.match(dockerfile, /^FROM node:24\.14\.0-alpine/m);
  assert.match(dockerfile, /ARG SOURCE_REVISION=local-worktree/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision=\$SOURCE_REVISION/);
  assert.match(dockerfile, /ENV SOURCE_REVISION=\$SOURCE_REVISION/);
});
