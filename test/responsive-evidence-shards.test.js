import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { RESPONSIVE_VIEWPORTS, RESPONSIVE_THEMES, RESPONSIVE_TABS, expectedResponsiveNames, selectResponsiveViewports, selectResponsiveScope } from '../scripts/lib/responsive-evidence-contract.mjs';
import { aggregateResponsiveEvidence, publishResponsiveAggregateReport, validResponsiveTiming } from '../scripts/lib/responsive-evidence-aggregate.mjs';
import { main as aggregateCli } from '../scripts/aggregate-responsive-evidence.mjs';
import { spawnSync } from '../scripts/lib/safe-spawn.mjs';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1cAAAAASUVORK5CYII=', 'base64');
const imageHash = createHash('sha256').update(image).digest('hex');
const expected = { sourceRevision: 'a'.repeat(40), artifactFingerprint: { algorithm: 'sha256', digest: 'b'.repeat(64), files: 369, entries: [{ path: 'game.html', sha256: 'c'.repeat(64), bytes: 20 }] } };

async function fixture(t) {
  const fixtureRoot = path.resolve('.cache/s130-responsive-test-fixtures');
  await fs.mkdir(fixtureRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(fixtureRoot, 'case-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), fixtureRoot, 'cleanup stays within the intended fixture root');
    return fs.rm(directory, { recursive: true, force: true });
  });
  const inputDir = path.join(directory, 'input');
  const reports = new Map();
  for (const profile of RESPONSIVE_VIEWPORTS) {
    const directory = path.join(inputDir, profile.name);
    await fs.mkdir(directory, { recursive: true });
    const names = expectedResponsiveNames(profile.name);
    const captures = [];
    const imageWrites = [];
    for (const name of names) {
      const row = { name, viewport: { width: profile.width, height: profile.height }, overflowX: false, bodyContrast: 7, undersizedControls: [], policyViolations: [], styleFailures: [] };
      if (name.endsWith('-sim-watch-authority')) row.visualGameReceipt = { schemaVersion: '1.0', kind: 'deterministic-visual-game-receipt', gameId: 'real-fixture-game', attempts: [{ attempt: 1 }], terminal: { gameId: 'real-fixture-game', accepted: true, playCount: 120, impactCount: 9 } };
      else { row.file = `${name}.png`; row.sha256 = imageHash; row.bytes = image.length; imageWrites.push(fs.writeFile(path.join(directory, row.file), image)); }
      captures.push(row);
    }
    await Promise.all(imageWrites);
    const report = {
      schemaVersion: '1.0', kind: 'immutable-rendered-evidence', sourceRevision: expected.sourceRevision, artifactFingerprint: structuredClone(expected.artifactFingerprint),
      shard: { viewport: profile.name, expectedShards: 3 }, viewports: [profile], status: 'passed', complete: true,
      coverage: { scope: 'full', themes: RESPONSIVE_THEMES, tabs: RESPONSIVE_TABS, requiredCaptures: names.length, completedRequiredCaptures: names.length },
      policyWitnesses: [{ pathname: '/game.html', ok: true }, { pathname: '/sw.js', ok: true }], runtimeErrors: [], failures: [], captures,
      timings: { startedAt: '2026-11-13T00:00:00.000Z', completedAt: '2026-11-13T00:03:00.000Z', durationMs: 180000, viewports: [{ name: profile.name, startedAt: '2026-11-13T00:00:01.000Z', completedAt: '2026-11-13T00:02:59.000Z', complete: true, durationMs: 178000 }] }
    };
    reports.set(profile.name, { report, file: path.join(directory, 'responsive-evidence.json') });
  }
  const save = async () => { for (const { report, file } of reports.values()) await fs.writeFile(file, JSON.stringify(report)); };
  await save();
  return { directory, inputDir, reports, save, aggregate: (options = {}) => aggregateResponsiveEvidence({ inputDir, expected, ...options }) };
}

test('full inventory preserves every baseline state, theme and previously unrequired fixture', () => {
  assert.deepEqual(RESPONSIVE_VIEWPORTS.map((profile) => expectedResponsiveNames(profile.name).length), [111, 109, 107]);
  for (const { name } of RESPONSIVE_VIEWPORTS) {
    const names = expectedResponsiveNames(name);
    assert.equal(new Set(names).size, names.length);
    for (const theme of RESPONSIVE_THEMES) for (const surface of ['facility-capital', 'gist-authentication', 'tutorial-receipt', 'first-debrief', 'draft-trade-review']) assert.ok(names.includes(`${name}-${surface}-${theme}`));
    assert.ok(names.includes(`${name}-sim-watch-authority`));
    const lazy = expectedResponsiveNames(name, { scope: 'lazy-style' });
    assert.equal(lazy.length, 24);
    assert.ok(lazy.includes(`${name}-setup-dark`));
    assert.ok(lazy.includes(`${name}-game-dialog-light`));
  }
});

test('an invalid or explicitly empty viewport cannot produce an empty passing shard', () => {
  assert.equal(selectResponsiveViewports(undefined).length, 3);
  assert.equal(selectResponsiveViewports('tablet')[0].width, 768);
  for (const invalid of ['', 'phone', 'desktop,mobile', 'Desktop', null, 0]) assert.throws(() => selectResponsiveViewports(invalid), /EVIDENCE_VIEWPORT/);
});

test('the actual capture CLI refuses an unknown viewport before browser or artifact work', () => {
  const result = spawnSync(process.execPath, ['scripts/responsive-evidence.mjs'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, EVIDENCE_VIEWPORT: 'unknown-profile' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EVIDENCE_VIEWPORT must be mobile, tablet or desktop/);
  assert.equal(result.stdout, '');
});

test('raw scope admits only full or lazy-style and never treats an unknown or empty value as full', () => {
  for (const [input, expected] of [[undefined, 'full'], ['full', 'full'], ['lazy-style', 'lazy-style']]) assert.equal(selectResponsiveScope(input), expected);
  for (const invalid of ['', 'unknown-scope', 'FULL', null, false, 0]) assert.throws(() => selectResponsiveScope(invalid), /EVIDENCE_SCOPE/);
});

test('the actual capture CLI rejects unknown and empty raw scope before artifact or browser effects', () => {
  for (const scope of ['unknown-scope', '']) {
    const result = spawnSync(process.execPath, ['scripts/responsive-evidence.mjs'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, EVIDENCE_VIEWPORT: 'mobile', EVIDENCE_SCOPE: scope } });
    assert.equal(result.status, 1); assert.match(result.stderr, /EVIDENCE_SCOPE must be full or lazy-style/); assert.equal(result.stdout, '');
  }
});

test('three complete source-bound shards verify actual image hashes and copy the full image inventory', async (t) => {
  const f = await fixture(t);
  const outputDir = path.join(f.directory, 'aggregate');
  const result = await f.aggregate({ outputDir });
  assert.equal(result.status, 'passed'); assert.equal(result.complete, true);
  assert.equal(result.captures.length, 327);
  assert.equal(result.captures.filter((row) => row.file).length, 324);
  const copied = result.captures.find((row) => row.file);
  assert.deepEqual(await fs.readFile(path.join(outputDir, copied.file)), image);
});

for (const [label, mutate] of [
  ['missing viewport', async (f) => { const target = path.resolve(path.dirname(f.reports.get('tablet').file)); assert.equal(path.dirname(target), path.resolve(f.inputDir)); await fs.rm(target, { recursive: true }); }],
  ['duplicate profile', async (f) => { const { report } = f.reports.get('tablet'); report.shard.viewport = 'mobile'; await f.save(); }],
  ['missing ordinary capture', async (f) => { f.reports.get('mobile').report.captures.shift(); await f.save(); }],
  ['missing previously unrequired fixture', async (f) => { const report = f.reports.get('desktop').report; report.captures = report.captures.filter((row) => row.name !== 'desktop-facility-capital-dark'); await f.save(); }],
  ['duplicate capture', async (f) => { const report = f.reports.get('desktop').report; report.captures.push(report.captures[0]); await f.save(); }],
  ['unexpected capture', async (f) => { f.reports.get('mobile').report.captures[0].name = 'mobile-unapproved-dark'; await f.save(); }],
  ['wrong source', async (f) => { f.reports.get('mobile').report.sourceRevision = 'd'.repeat(40); await f.save(); }],
  ['wrong fingerprint', async (f) => { f.reports.get('mobile').report.artifactFingerprint.digest = 'd'.repeat(64); await f.save(); }],
  ['fingerprint body differs despite same digest', async (f) => { f.reports.get('mobile').report.artifactFingerprint.files++; await f.save(); }],
  ['failed shard', async (f) => { f.reports.get('mobile').report.status = 'failed'; await f.save(); }],
  ['running partial checkpoint', async (f) => { f.reports.get('mobile').report.complete = false; await f.save(); }],
  ['iteration evidence', async (f) => { f.reports.get('mobile').report.kind = 'provisional-rendered-evidence'; await f.save(); }],
  ['lazy-style scope', async (f) => { f.reports.get('mobile').report.coverage.scope = 'lazy-style'; await f.save(); }],
  ['missing theme', async (f) => { f.reports.get('mobile').report.coverage.themes = ['dark']; await f.save(); }],
  ['forged viewport dimensions', async (f) => { f.reports.get('mobile').report.viewports = [{ name: 'mobile', width: 1440, height: 1000 }]; await f.save(); }],
  ['capture assertion failure hidden by passed status', async (f) => { f.reports.get('mobile').report.captures[0].styleFailures = ['occluded']; await f.save(); }],
  ['missing runtime game authority', async (f) => { const row = f.reports.get('mobile').report.captures.find((row) => row.name.endsWith('-sim-watch-authority')); row.visualGameReceipt.terminal.accepted = false; await f.save(); }],
  ['missing completed timings', async (f) => { delete f.reports.get('mobile').report.timings; await f.save(); }],
  ['capture exceeding the unchanged eight-minute bound', async (f) => { f.reports.get('mobile').report.timings.durationMs = 480001; await f.save(); }],
  ['elapsed nine-minute shard disguised by duration one', async (f) => { const timing = f.reports.get('mobile').report.timings; timing.completedAt = '2026-11-13T00:09:00.000Z'; timing.durationMs = 1; await f.save(); }],
  ['negative viewport duration', async (f) => { f.reports.get('mobile').report.timings.viewports[0].durationMs = -1; await f.save(); }],
  ['oversized viewport duration', async (f) => { f.reports.get('mobile').report.timings.viewports[0].durationMs = 480001; await f.save(); }],
  ['viewport elapsed work disguised by a shorter duration', async (f) => { f.reports.get('mobile').report.timings.viewports[0].durationMs = 1; await f.save(); }],
  ['viewport dates outside the shard interval', async (f) => { const timing = f.reports.get('mobile').report.timings.viewports[0]; timing.startedAt = '2026-11-12T23:59:59.000Z'; timing.durationMs = 180000; await f.save(); }],
  ['runtime error hidden by passed status', async (f) => { f.reports.get('mobile').report.runtimeErrors = [{ message: 'failed' }]; await f.save(); }],
  ['modified actual image', async (f) => { const { report, file } = f.reports.get('mobile'); await fs.appendFile(path.join(path.dirname(file), report.captures[0].file), 'changed'); }],
  ['missing actual image', async (f) => { const { report, file } = f.reports.get('mobile'); await fs.unlink(path.join(path.dirname(file), report.captures[0].file)); }],
  ['image traversal', async (f) => { f.reports.get('mobile').report.captures[0].file = '../other.png'; await f.save(); }]
]) test(`aggregate refuses ${label}`, async (t) => { const f = await fixture(t); await mutate(f); const result = await f.aggregate(); assert.equal(result.complete, false); assert.equal(result.status, 'failed'); assert.ok(result.failures.length); });

test('timing evidence binds both declared durations to ordered timestamps and the same eight-minute interval', () => {
  const valid = { startedAt: '2026-11-13T00:00:00.000Z', completedAt: '2026-11-13T00:08:00.000Z', durationMs: 480000,
    viewports: [{ name: 'mobile', startedAt: '2026-11-13T00:00:01.000Z', completedAt: '2026-11-13T00:07:59.000Z', durationMs: 478000, complete: true }] };
  assert.equal(validResponsiveTiming(valid, 'mobile'), true);
  for (const durationMs of [NaN, Infinity, -1, 480001, '478000', null]) assert.equal(validResponsiveTiming({ ...valid, viewports: [{ ...valid.viewports[0], durationMs }] }, 'mobile'), false);
  assert.equal(validResponsiveTiming({ ...valid, durationMs: 479999 }, 'mobile'), false);
  assert.equal(validResponsiveTiming({ ...valid, startedAt: valid.completedAt, completedAt: valid.startedAt }, 'mobile'), false);
  assert.equal(validResponsiveTiming({ ...valid, viewports: [{ ...valid.viewports[0], completedAt: '2026-11-13T00:09:00.000Z', durationMs: 1 }] }, 'mobile'), false);
});

// Windows file symlinks require an external OS privilege. Exercise its native
// directory reparse point plus the real hard-link overwrite control below;
// Unix/hosted runners exercise the exact file-symlink regression, without skips.
for (const failingShard of [false, true]) test(`actual CLI refuses a pre-existing report ${process.platform === 'win32' ? 'junction' : 'file symlink'} for ${failingShard ? 'failed' : 'passing'} aggregation without altering its external target`, async (t) => {
  const f = await fixture(t);
  if (failingShard) { f.reports.get('mobile').report.status = 'failed'; await f.save(); }
  const output = path.join(f.directory, 'aggregate'); await fs.mkdir(output);
  const externalDirectory = path.join(f.directory, 'external-directory'); await fs.mkdir(externalDirectory);
  const external = path.join(externalDirectory, 'external-report.json');
  const sentinel = 'Unrelated output target must not be overwritten.';
  await fs.writeFile(external, sentinel);
  const reportPath = path.join(output, 'responsive-evidence.json');
  await fs.symlink(process.platform === 'win32' ? externalDirectory : external, reportPath, process.platform === 'win32' ? 'junction' : 'file');
  const manifest = path.join(f.directory, 'deploy-manifest.json'); await fs.writeFile(manifest, JSON.stringify(expected));
  await assert.rejects(aggregateCli(['--input', f.inputDir, '--expected', manifest, '--output', output]), /regular file.*symbolic link/);
  assert.equal(await fs.readFile(external, 'utf8'), sentinel);
  assert.equal((await fs.lstat(reportPath)).isSymbolicLink(), true);
});

test('an existing linked output parent cannot create directories or publish reports outside the named boundary', async (t) => {
  const f = await fixture(t);
  const external = path.join(f.directory, 'external-directory'); await fs.mkdir(external);
  const link = path.join(f.directory, 'linked-parent'); await fs.symlink(external, link, 'junction');
  const manifest = path.join(f.directory, 'deploy-manifest.json'); await fs.writeFile(manifest, JSON.stringify(expected));
  await assert.rejects(aggregateCli(['--input', f.inputDir, '--expected', manifest, '--output', path.join(link, 'aggregate')]), /parent boundary.*symbolic link/);
  await assert.rejects(fs.stat(path.join(external, 'aggregate')), { code: 'ENOENT' });
});

test('atomic failed-report publication replaces a regular entry without changing a hard-linked external file', async (t) => {
  const f = await fixture(t);
  const output = path.join(f.directory, 'aggregate'); await fs.mkdir(output);
  const external = path.join(f.directory, 'external-report.json');
  const sentinel = JSON.stringify({ status: 'passed', unrelated: true });
  await fs.writeFile(external, sentinel);
  const reportPath = path.join(output, 'responsive-evidence.json'); await fs.link(external, reportPath);
  const failure = { status: 'failed', complete: false, failures: ['Interrupted evidence is not accepted.'] };
  await publishResponsiveAggregateReport(output, failure);
  assert.equal(await fs.readFile(external, 'utf8'), sentinel);
  assert.deepEqual(JSON.parse(await fs.readFile(reportPath, 'utf8')), failure);
  assert.deepEqual((await fs.readdir(output)).filter((name) => name.endsWith('.tmp')), []);
});

test('aggregator rejects arbitrary paths/flags and nonimmutable candidate manifests', async (t) => {
  await assert.rejects(aggregateCli(['--input', 'anything', '--output', 'elsewhere', '--unknown', 'x']), /Explicit unique/);
  const f = await fixture(t);
  await assert.rejects(f.aggregate({ expected: { ...expected, sourceRevision: 'local-worktree' } }), /immutable candidate/);
  await assert.rejects(f.aggregate({ outputDir: path.join(f.inputDir, 'overwrite') }), /separate/);
});

test('publication depends on all capture profiles and aggregate coverage while each capture retains its eight-minute bound', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
  const capture = workflow.match(/\n  responsive-capture:[\s\S]*?(?=\n  publish:)/)?.[0] || '';
  const publish = workflow.match(/\n  publish:[\s\S]*?(?=\n  deploy:)/)?.[0] || '';
  assert.match(capture, /viewport: \[mobile, tablet, desktop\]/);
  assert.match(capture, /fail-fast: false/);
  assert.match(capture, /name: Capture responsive artifact evidence\s+timeout-minutes: 8/);
  assert.match(capture, /Preserve responsive shard evidence and partial diagnostics\s+if: \$\{\{ always\(\) \}\}/);
  assert.match(publish, /needs: \[build, responsive-capture\]/);
  assert.ok(publish.indexOf('node scripts/aggregate-responsive-evidence.mjs') < publish.indexOf('- name: Upload Pages artifact'));
  assert.ok(publish.indexOf('node scripts/aggregate-responsive-evidence.mjs') < publish.indexOf('- name: Publish to Cloudflare Pages'));
  assert.match(workflow, /include-hidden-files: true/);
});
