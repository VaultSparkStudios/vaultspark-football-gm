// test-proof-reconciliation.mjs — turn one complete shard receipt into the
// canonical file-level test surface without executing the suite a second time.
import fs from 'node:fs';
import { NONPASSING_SUITE_BUCKETS } from './shared-policies.mjs';
import path from 'node:path';
import { stampProvenance } from './artifact-io.mjs';
import { updateProjectStatus } from './write-project-status.mjs';
import { discoverSuiteFiles, accountForSuite } from './test-discovery.mjs';
import {
  buildProofSourceManifest,
  diffProofSourceManifests,
  formatProofSourceDiff,
  proofSourceInventory,
  validateProofSourceManifest,
} from './proof-source-manifest.mjs';

function normalize(file) { return String(file || '').replace(/\\/g, '/'); }

export function newestProofRelevantMtime(root) {
  return proofSourceInventory(root).reduce((max, file) => Math.max(max, fs.statSync(file.absolute).mtimeMs), 0);
}

export function canonicalTierTestInventory(root) {
  const dir = path.join(root, 'scripts', 'test');
  let quarantineDetail = [];
  try { quarantineDetail = JSON.parse(fs.readFileSync(path.join(dir, 'quarantine.json'), 'utf8')).quarantined || []; }
  catch { /* absent quarantine is an empty set */ }
  const quarantined = new Set(quarantineDetail.map((entry) => entry.file));
  const names = discoverSuiteFiles(dir)
    .filter((name) => !quarantined.has(name))
    .sort();
  return {
    files: names.map((name) => path.join('scripts', 'test', name)),
    quarantineDetail,
    quarantinePath: path.join(dir, 'quarantine.json'),
  };
}

export function reconcileAggregateProof(root, aggregate, { proofPath = null } = {}) {
  const errors = [];
  const inventory = canonicalTierTestInventory(root);
  const generatedMs = Date.parse(aggregate?.generatedAt || '');
  if (aggregate?.mode !== 'sharded') errors.push('proof mode is not sharded');
  if (!Number.isFinite(generatedMs)) errors.push('proof generatedAt is missing or invalid');
  if (aggregate?.failures !== 0) errors.push(`proof has ${aggregate?.failures ?? '?'} failure(s)`);
  if (aggregate?.childParseFailed) errors.push('a shard wrapper failed to parse');
  if (aggregate?.budgetExhausted) errors.push('proof exhausted its budget');
  for (const field of NONPASSING_SUITE_BUCKETS) {
    if ((aggregate?.[field] || []).length) errors.push(`proof carries ${aggregate[field].length} ${field} file(s)`);
  }
  if (!aggregate?.proofShape || aggregate.proofShape.totalFiles !== aggregate?.results?.length || !aggregate.proofShape.filesHash) {
    errors.push('proof shape is missing or disagrees with result population');
  }
  const expectedSources = aggregate?.proofShape?.proofSources;
  const liveSources = buildProofSourceManifest(root);
  const expectedValidation = validateProofSourceManifest(expectedSources);
  if (!expectedValidation.ok) {
    errors.push(`proof source manifest is invalid: ${expectedValidation.errors.join('; ')}`);
  } else if (expectedSources.rootHash !== liveSources.rootHash) {
    const diff = diffProofSourceManifests(expectedSources, liveSources);
    errors.push(`proof source bytes differ: ${formatProofSourceDiff(diff)}`);
  }

  const byFile = new Map();
  for (const result of aggregate?.results || []) {
    const rel = normalize(result.file);
    if (byFile.has(rel)) errors.push(`duplicate result for ${rel}`);
    byFile.set(rel, result);
  }
  for (const rel of inventory.files) {
    const normalized = normalize(rel);
    const result = byFile.get(normalized);
    if (!result) {
      errors.push(`missing current test result: ${normalized}`);
      continue;
    }
    if (!['pass', 'covered-directly'].includes(result.status) || !(result.total > 0) || result.pass !== result.total) {
      errors.push(`non-clean result for ${normalized}: ${result.status} ${result.pass}/${result.total}`);
    }
  }
  // Freshness is content-addressed by proofShape.proofSources above. Filesystem
  // mtimes are not evidence of byte drift: git restore, formatters, antivirus,
  // and reproducible generators can rewrite identical bytes after a proof. The
  // manifest catches changed, added, and deleted proof-relevant bytes directly,
  // including test files and scripts/test/quarantine.json, without phantom reds.

  const passed = inventory.files.length;
  const suiteAccounting = accountForSuite({
    testDir: path.join(root, 'scripts', 'test'),
    executed: inventory.files.map((file) => path.basename(file)),
    quarantined: inventory.quarantineDetail.map((entry) => entry.file),
  });
  const payload = errors.length ? null : {
    generatedAt: aggregate.generatedAt,
    reconciledAt: new Date().toISOString(),
    sourceProof: proofPath ? normalize(path.relative(root, proofPath)) : null,
    sourceProofMode: aggregate.mode,
    sourceProofShape: aggregate.proofShape,
    proofSourcesHash: liveSources.rootHash,
    proofSourcesCount: liveSources.totalFiles,
    total: passed,
    passed,
    failed: 0,
    inconclusive: 0,
    envBlocked: 0,
    inconclusiveFiles: [],
    ratio: suiteAccounting.universe ? Math.round((passed / suiteAccounting.universe) * 1000) / 10 : 0,
    executedRatio: passed ? 100 : 0,
    suiteAccounting,
    failures: [],
    deferred: 0,
    deferredFiles: [],
    deferredBudgetFiles: [],
    quarantined: inventory.quarantineDetail.length,
    quarantineDetail: inventory.quarantineDetail,
    files: inventory.files,
    full: true,
    fastPath: false,
    reconciledFromAggregate: true,
    // S370 [audit #2] — the purity delta the sharded run measured rides into the cache the
    // probe reads. Absent stays absent: an aggregate that measured nothing must not be
    // promoted into a cache that reads as measured.
    ...(aggregate.treePurity ? { treePurity: aggregate.treePurity } : {}),
  };
  return { ok: errors.length === 0, errors, payload };
}

export function writeReconciledTestProof(root, reconciliation) {
  if (!reconciliation?.ok || !reconciliation.payload) throw new Error(`cannot write invalid proof: ${(reconciliation?.errors || []).join('; ')}`);
  const cachePath = path.join(root, '.cache', 'test-count.json');
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(stampProvenance(reconciliation.payload, { producer: 'test-proof-reconciliation', root }), null, 2));
  const statusPath = path.join(root, 'context', 'PROJECT_STATUS.json');
  if (fs.existsSync(statusPath)) {
    updateProjectStatus(root, status => {
      status.testsPassing = reconciliation.payload.passed;
      status.testsTotal = reconciliation.payload.total;
      status.testsInconclusive = 0;
      status.testsEnvBlocked = [];
      status.testsScope = {
        roots: ['scripts/test'],
        discovered: reconciliation.payload.suiteAccounting.universe,
        excludedLongRunning: [],
        excludedQuarantined: reconciliation.payload.quarantineDetail.map((entry) => entry.file),
        deferred: [],
        envBlocked: 0,
        quarantinedCount: reconciliation.payload.suiteAccounting.quarantined,
        undiscovered: reconciliation.payload.suiteAccounting.undiscovered,
        undiscoveredFiles: reconciliation.payload.suiteAccounting.undiscoveredFiles,
        mode: 'full',
        note: 'file-level count over scripts/test ONLY; aggregate additionally covers IGNIS and legacy tests',
      };
      status.testsDeferred = [];
      // S369 review — a promoted aggregate is COMPLETE by this module's own checks (it refuses
      // a proof that exhausted its budget or deferred a file). The signal library now reads
      // these two assertion-scoped fields as a bound, and nothing else clears them, so an
      // older budget-exhausted run would keep a newer complete proof reading "bounded" forever.
      status.testsBudgetExhausted = false;
      status.testsAssertionsDeferred = [];
      status.testsLastRun = reconciliation.payload.generatedAt.slice(0, 10);
      status.testsFileProofSource = reconciliation.payload.sourceProof;
      status.testsProofSourcesHash = reconciliation.payload.proofSourcesHash;
      status.testsProofSourcesCount = reconciliation.payload.proofSourcesCount;
    }, { touchLastUpdated: false });
  }
  return reconciliation.payload;
}

export default { canonicalTierTestInventory, newestProofRelevantMtime, reconcileAggregateProof, writeReconciledTestProof };
