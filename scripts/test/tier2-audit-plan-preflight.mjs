import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test, run, assert } from './_harness.mjs';
import { spawnSync } from '../lib/safe-spawn.mjs';
import { CANONICAL_AUDIT_AXES, validateAuditContract } from '../lib/audit-sidecar.mjs';
import { deriveLifecycleFocus } from '../lib/lifecycle-skill-profile.mjs';
import { parseArgs } from '../check-audit-plan-preflight.mjs';

const cli = fileURLToPath(new URL('../check-audit-plan-preflight.mjs', import.meta.url));
const rel = { audit: 'docs/AUDIT_2026-10-22-S397.json', plan: 'docs/IMPLEMENT_PLAN.md', auditBrief: 'docs/audit-brief.json', planBrief: 'docs/plan-brief.json' };
const item = {
  id: 1, slug: 'preflight-proof', tier: '🔥', axis: 'speed-organization-efficiency',
  effortHours: 1, impact: 8, innovation: 7, priority: 20, title: 'Preflight proof',
  recipe: 'Validate the pending candidate before implementation.', status: 'pending', executionLog: [],
  premises: [{ claim: 'fixture file exists', adapter: 'file-exists', target: 'fixture.txt', operator: 'eq', expected: true }],
  ladder: Object.fromEntries(['L1', 'L2', 'L3'].map((level) => [level, { effortHours: 1, recipe: 'Validate the selected artifacts.' }])),
  readinessArea: 'core journeys and product correctness', stageRationale: 'Operator admission correctness.',
};
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-plan-preflight-'));
  fs.mkdirSync(path.join(root, 'docs'));
  const lifecycleFocus = deriveLifecycleFocus({ ladderStage: 'S0', audience: 'internal' }, { health: 'healthy' });
  const audit = {
    session: 397, project: { slug: 'fixture', type: 'infrastructure', name: 'Fixture' }, items: [structuredClone(item)],
    axes: Object.fromEntries(CANONICAL_AUDIT_AXES.map((axis) => [axis, 1])),
    axisCoverage: Object.fromEntries(CANONICAL_AUDIT_AXES.map((axis) => [axis, { surviving: axis === item.axis ? [item.slug] : [], rejectedOnVerify: [{ slug: `rejected-${axis}`, premise: 'Candidate requires verification.', evidence: 'Fixture rejects this candidate.' }] }])),
    totals: { count: 1, priority: 20, top3: [item.slug] }, lifecycleFocus,
    readinessAssessment: lifecycleFocus.areas.map((area) => ({ area, status: 'unknown', owner: 'agent', nextAcceptanceCheck: 'Run focused fixture.' })),
  };
  const brief = (kind) => ({ kind, session: 'S397', date: '2026-10-22', agent: 'test-runner', repo: 'fixture', headline: 'Validate the selected admission artifacts.', items: [{ id: 1, slug: item.slug, title: item.title, axis: item.axis, leftScore: 8, rightScore: 7, insight: 'The candidate receives an executable contract check. This catches malformed inputs before implementation starts.', evidence: 'Fixture artifacts.' }] });
  const write = (label, value) => fs.writeFileSync(path.join(root, rel[label]), typeof value === 'string' ? value : JSON.stringify(value));
  write('audit', audit);
  write('plan', `<!-- generated-at: 2026-10-22 · Session 397 · source: ${rel.audit} -->\n# Plan\n`);
  write('auditBrief', brief('audit')); write('planBrief', brief('plan'));
  return { root, audit, brief, write };
}
function snapshot(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix)).sort().flatMap((name) => {
    const relative = path.join(prefix, name), stat = fs.lstatSync(path.join(root, relative));
    if (stat.isSymbolicLink()) return [[relative, fs.readlinkSync(path.join(root, relative))]];
    if (stat.isDirectory()) return [[relative, 'directory'], ...snapshot(root, relative)];
    return [[relative, createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex')]];
  });
}
function invoke(f, overrides = {}, extra = []) {
  const args = { root: f.root, ...rel, ...overrides };
  const flags = { root: '--root', audit: '--audit', plan: '--plan', auditBrief: '--audit-brief', planBrief: '--plan-brief' };
  const before = snapshot(f.root);
  const result = spawnSync(process.execPath, [cli, ...Object.entries(args).flatMap(([key, value]) => [flags[key], value]), '--json', ...extra], { encoding: 'utf8', timeout: 30000 });
  assert.deepEqual(snapshot(f.root), before, 'CLI must not modify input artifacts or create files');
  assert.equal(result.error, undefined);
  return { ...result, payload: JSON.parse(result.stdout) };
}
function trial(change, expected, overrides) {
  const f = fixture();
  try {
    change(f);
    const result = invoke(f, overrides);
    assert.equal(result.status, 1);
    assert.equal(result.payload.ok, false);
    assert.ok(result.payload.errors.some((error) => error.check === expected), JSON.stringify(result.payload));
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

test('actual CLI accepts complete pending candidate and renders both canonical briefs without writes', () => {
  const f = fixture();
  try { const result = invoke(f); assert.equal(result.status, 0); assert.deepEqual(result.payload, { ok: true, errors: [] }); }
  finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('established Markdown title and audit source metadata pass; body cannot supply identity', () => {
  const f = fixture();
  try {
    f.write('plan', `# Implementation Plan — Session 397\n\nAudit source: ${rel.audit}\n\n## Work\n`);
    assert.equal(invoke(f).status, 0);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  trial((x) => x.write('plan', `# Implementation Plan — Session 397\n\n## Work\nAudit source: ${rel.audit}`), 'source-header-required');
});
test('readiness state typo fails admission', () => trial((f) => { f.audit.readinessAssessment[0].state = 'unknown'; delete f.audit.readinessAssessment[0].status; f.write('audit', f.audit); }, 'contract'));
test('missing axis coverage and wrong canonical axis fail admission', () => {
  trial((f) => { delete f.audit.axisCoverage; f.write('audit', f.audit); }, 'write-contract');
  trial((f) => { f.audit.items[0].axis = 'invented'; f.write('audit', f.audit); }, 'write-contract');
});
test('audit score scale and malformed typed premises fail admission', () => {
  trial((f) => { f.audit.items[0].impact = 80; f.write('audit', f.audit); }, 'contract');
  trial((f) => { f.audit.items[0].premises[0].adapter = 'invented'; f.write('audit', f.audit); }, 'premise-contract');
});
test('missing source or source in body cannot supply metadata header', () => {
  trial((f) => f.write('plan', '<!-- Session 397 -->\nsource: docs/AUDIT_2026-10-22-S397.json'), 'source-header-required');
  trial((f) => f.write('plan', `# Plan\n<!-- Session 397 source: ${rel.audit} -->`), 'source-header-required');
});
test('foreign source, session and duplicate identity are refused', () => {
  trial((f) => f.write('plan', '<!-- Session 397 source: docs/AUDIT_other.json -->'), 'source-mismatch');
  trial((f) => f.write('plan', '<!-- Session 397 source: ../AUDIT_private.json -->'), 'source-mismatch');
  trial((f) => f.write('plan', `<!-- Session 396 source: ${rel.audit} -->`), 'session-mismatch');
  trial((f) => f.write('plan', `<!-- Session 397 source: ${rel.audit} source: invalid -->`), 'source-header-required');
});
test('missing and malformed JSON artifacts fail with no artifact contents echoed', () => {
  trial((f) => fs.unlinkSync(path.join(f.root, rel.auditBrief)), 'unreadable-or-malformed');
  const f = fixture();
  try {
    f.write('audit', '{PRIVATE_ARTIFACT_SENTINEL');
    const result = invoke(f); assert.equal(result.status, 1);
    assert.ok(!result.stdout.includes('PRIVATE_ARTIFACT_SENTINEL')); assert.equal(result.stderr, '');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('malformed audit objects and validator exceptions fail closed', () => {
  trial((f) => f.write('audit', []), 'object-required');
  trial((f) => { f.audit.items[0].premises = [null]; f.write('audit', f.audit); }, 'premise-contract');
  trial((f) => { f.audit.readinessAssessment[0] = { area: f.audit.readinessAssessment[0].area, status: 'pass' }; f.write('audit', f.audit); }, 'contract');
});
test('skill brief scales and malformed types fail admission', () => {
  trial((f) => { const b = f.brief('audit'); b.items[0].leftScore = 80; f.write('auditBrief', b); }, 'schema-exception');
  trial((f) => { const b = f.brief('audit'); b.items[0].leftScore = '8'; f.write('auditBrief', b); }, 'numeric-scores-required');
  trial((f) => { const b = f.brief('plan'); b.headline = {}; f.write('planBrief', b); }, 'field-types');
  trial((f) => { const b = f.brief('plan'); b.items = [null]; f.write('planBrief', b); }, 'schema-exception');
  trial((f) => { const b = f.brief('plan'); b.items[0].slug = { toString: 5 }; f.write('planBrief', b); }, 'field-types');
});
test('brief kind, session, repo and exact unique item set bind to candidate', () => {
  for (const [field, value, check] of [['kind', 'plan', 'kind-mismatch'], ['session', 396, 'session-mismatch'], ['repo', 'other', 'repo-mismatch']]) {
    trial((f) => { const b = f.brief('audit'); b[field] = value; f.write('auditBrief', b); }, check);
  }
  trial((f) => { const b = f.brief('plan'); b.items[0].slug = 'other'; f.write('planBrief', b); }, 'items-mismatch');
  trial((f) => { const b = f.brief('plan'); b.items.push(b.items[0]); f.write('planBrief', b); }, 'items-mismatch');
});
test('lexical and realpath escapes are refused', () => {
  trial(() => {}, 'path-outside-root', { audit: '../outside.json' });
  const f = fixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-plan-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'brief.json'), JSON.stringify(f.brief('audit')));
    fs.symlinkSync(outside, path.join(f.root, 'external'), 'junction');
    const result = invoke(f, { auditBrief: 'external/brief.json' });
    assert.equal(result.status, 1); assert.ok(result.payload.errors.some((e) => e.check === 'path-outside-root'));
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});
test('historical shipped audit remains readable and is explicitly outside pending admission', () => {
  trial((f) => { f.audit.items[0].status = 'shipped'; assert.deepEqual(validateAuditContract(f.audit), []); f.write('audit', f.audit); }, 'pending-candidate-required');
});
test('strict flags reject unknown repeated and missing values before artifact IO', () => {
  for (const args of [[], ['--root'], ['--unknown'], ['--json', '--json'], ['--root', 'x', '--root', 'x'], ['--help', '--root', 'x']]) {
    assert.ok(parseArgs(args).error);
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 2); assert.ok(!result.stdout.includes('unreadable')); assert.equal(result.stderr, '');
  }
  const f = fixture();
  try { const result = invoke(f, { root: path.join(f.root, 'missing') }, ['--unknown']); assert.equal(result.status, 2); assert.equal(result.payload.errors[0].artifact, 'arguments'); }
  finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('help is inert and answers without a root or artifacts', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0); assert.match(result.stdout, /Read-only admission/); assert.equal(result.stderr, '');
});

await run('tier2-audit-plan-preflight');
