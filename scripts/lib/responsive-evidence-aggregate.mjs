import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { RESPONSIVE_VIEWPORTS, RESPONSIVE_THEMES, RESPONSIVE_TABS, RESPONSIVE_CAPTURE_BOUND_MS, expectedResponsiveNames, responsiveCaptureFailures, stableResponsiveJson } from './responsive-evidence-contract.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const inside = (root, target) => { const rel = path.relative(root, target); return rel !== '' && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`); };
const same = (left, right) => stableResponsiveJson(left) === stableResponsiveJson(right);
const canonicalPath = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

async function assertOutputBoundary(guard) {
  const stat = await fs.lstat(guard.directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== guard.dev || stat.ino !== guard.ino
    || canonicalPath(await fs.realpath(guard.directory)) !== canonicalPath(guard.directory)) throw new Error('Aggregate output directory boundary changed.');
}

async function assertReportTarget(directory) {
  const target = path.join(directory, 'responsive-evidence.json');
  const prior = await fs.lstat(target).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
  if (prior && (!prior.isFile() || prior.isSymbolicLink())) throw new Error('Aggregate report target must be a regular file, never a symbolic link.');
  return target;
}

export async function prepareResponsiveOutputDirectory(outputDir) {
  const directory = path.resolve(outputDir);
  // Resolve the existing parent before recursive mkdir: a dangling output under
  // a linked parent must not create or publish files outside the named tree.
  let ancestor = directory;
  for (;;) {
    try {
      const stat = await fs.lstat(ancestor);
      if (!stat.isDirectory() || stat.isSymbolicLink() || canonicalPath(await fs.realpath(ancestor)) !== canonicalPath(ancestor)) throw new Error('Aggregate output parent boundary contains a symbolic link or non-directory.');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  await fs.mkdir(directory, { recursive: true });
  const stat = await fs.lstat(directory, { bigint: true });
  const guard = { directory, dev: stat.dev, ino: stat.ino };
  await assertOutputBoundary(guard);
  await assertReportTarget(directory);
  return guard;
}

export async function publishResponsiveAggregateReport(outputDir, report) {
  const guard = await prepareResponsiveOutputDirectory(outputDir);
  const target = await assertReportTarget(guard.directory);
  const temporary = path.join(guard.directory, `.responsive-evidence-${randomUUID()}.tmp`);
  let handle = null;
  let created = false;
  try {
    await assertOutputBoundary(guard);
    handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    created = true;
    await assertOutputBoundary(guard);
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await assertOutputBoundary(guard);
    await assertReportTarget(guard.directory);
    // Rename replaces a directory entry; it never opens/follows a report link.
    await fs.rename(temporary, target);
    created = false;
    await assertOutputBoundary(guard);
  } finally {
    if (handle) await handle.close();
    if (created) {
      await assertOutputBoundary(guard);
      await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
}

function timestamp(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

export function validResponsiveTiming(timing, viewport) {
  const start = timestamp(timing?.startedAt), end = timestamp(timing?.completedAt);
  const withinBound = (duration) => Number.isFinite(duration) && duration >= 0 && duration <= RESPONSIVE_CAPTURE_BOUND_MS;
  if (start === null || end === null || !withinBound(end - start) || !withinBound(timing.durationMs) || timing.durationMs !== end - start
    || !Array.isArray(timing.viewports) || timing.viewports.length !== 1) return false;
  const entry = timing.viewports[0];
  const viewportStart = timestamp(entry?.startedAt), viewportEnd = timestamp(entry?.completedAt);
  return entry?.name === viewport && entry.complete === true && viewportStart !== null && viewportEnd !== null
    && withinBound(entry.durationMs) && withinBound(viewportEnd - viewportStart) && entry.durationMs === viewportEnd - viewportStart
    && viewportStart >= start && viewportEnd <= end && entry.durationMs <= timing.durationMs;
}

async function findReports(root, current = root, found = []) {
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Responsive evidence inputs may not contain symbolic links.');
    if (entry.isDirectory()) await findReports(root, file, found);
    else if (entry.name === 'responsive-evidence.json') found.push(file);
  }
  return found.sort();
}

export async function aggregateResponsiveEvidence({ inputDir, expected, outputDir = null, now = new Date().toISOString() }) {
  if (!/^[a-f0-9]{40}$/i.test(expected?.sourceRevision || '') || expected?.artifactFingerprint?.algorithm !== 'sha256'
    || !/^[a-f0-9]{64}$/i.test(expected?.artifactFingerprint?.digest || '') || !Number.isInteger(expected?.artifactFingerprint?.files) || expected.artifactFingerprint.files < 1) {
    throw new Error('Aggregation requires the exact immutable candidate manifest and artifact fingerprint.');
  }
  const root = await fs.realpath(inputDir);
  const output = outputDir ? path.resolve(outputDir) : null;
  const realOutput = output ? await fs.realpath(output).catch((error) => { if (error.code !== 'ENOENT') throw error; return output; }) : null;
  if (realOutput && (realOutput === root || inside(root, realOutput))) throw new Error('Aggregate output must be separate from the shard input tree.');
  if (output) await prepareResponsiveOutputDirectory(output);
  const reportFiles = await findReports(root);
  const failures = [];
  const captures = [];
  const images = [];
  const profiles = new Set();
  const shards = [];
  if (reportFiles.length !== RESPONSIVE_VIEWPORTS.length) failures.push('Exactly three responsive shard reports are required.');
  for (const file of reportFiles) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    let shard;
    try { shard = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch { failures.push(`${relative}: malformed report`); continue; }
    const name = shard?.shard?.viewport;
    const profile = RESPONSIVE_VIEWPORTS.find((entry) => entry.name === name);
    if (!profile || profiles.has(name)) { failures.push(`${relative}: unknown or duplicate viewport shard`); continue; }
    profiles.add(name);
    const fail = (condition, reason) => { if (!condition) failures.push(`${name}: ${reason}`); };
    fail(shard.schemaVersion === '1.0' && shard.kind === 'immutable-rendered-evidence' && shard.status === 'passed' && shard.complete === true, 'shard is not complete immutable passing evidence');
    fail(shard.shard.expectedShards === 3 && same(shard.viewports, [profile]), 'viewport identity differs from the declared profile');
    fail(shard.sourceRevision === expected.sourceRevision && same(shard.artifactFingerprint, expected.artifactFingerprint), 'candidate source or artifact fingerprint differs');
    fail(shard.coverage?.scope === 'full' && same(shard.coverage?.themes, RESPONSIVE_THEMES)
      && same(shard.coverage?.tabs, RESPONSIVE_TABS), 'scope, themes or tabs are incomplete');
    const required = expectedResponsiveNames(name);
    fail(shard.coverage?.requiredCaptures === required.length && shard.coverage?.completedRequiredCaptures === required.length, 'declared capture coverage differs from the complete inventory');
    fail(Array.isArray(shard.failures) && shard.failures.length === 0 && Array.isArray(shard.runtimeErrors) && shard.runtimeErrors.length === 0, 'failure or runtime error evidence is nonempty or missing');
    fail(Array.isArray(shard.policyWitnesses) && shard.policyWitnesses.length >= 2 && shard.policyWitnesses.every((entry) => entry.ok === true), 'artifact policy witnesses are missing or failed');
    const timing = shard.timings;
    fail(validResponsiveTiming(timing, name), 'completed viewport timing evidence is missing, inconsistent or exceeds the eight-minute bound');
    const rows = Array.isArray(shard.captures) ? shard.captures : [];
    failures.push(...responsiveCaptureFailures(rows, required).map((reason) => `${name}: ${reason}`));
    fail(rows.length === required.length, 'capture count differs from the exact inventory');
    const seenFiles = new Set();
    for (const row of rows) {
      if (!row || typeof row.name !== 'string') continue;
      fail(row.viewport?.width === profile.width && row.viewport?.height === profile.height, `${row.name}: capture viewport differs`);
      if (row.name.endsWith('-sim-watch-authority')) { captures.push(row); continue; }
      if (typeof row.file !== 'string' || row.file !== `${row.name}.png` || seenFiles.has(row.file)) { failures.push(`${name}: unsafe or duplicate image filename`); continue; }
      seenFiles.add(row.file);
      const image = path.resolve(path.dirname(file), row.file);
      try {
        const real = await fs.realpath(image);
        if (!inside(path.dirname(file), real)) throw new Error('outside shard');
        const bytes = await fs.readFile(real);
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || row.sha256 !== digest || row.bytes !== bytes.length) throw new Error('image bytes differ');
        const target = `captures/${name}/${row.file}`;
        images.push({ source: real, target, sha256: digest, bytes: bytes.length });
        captures.push({ ...row, file: target });
      } catch { failures.push(`${row.name}: image missing, unsafe or hash/size/PNG signature mismatch`); }
    }
    shards.push({ viewport: name, report: relative, sourceRevision: shard.sourceRevision, captures: rows.length, timing, coverage: shard.coverage, policyWitnesses: shard.policyWitnesses, contentSecurityPolicy: shard.contentSecurityPolicy, runtimeErrors: shard.runtimeErrors, failures: shard.failures });
  }
  for (const profile of RESPONSIVE_VIEWPORTS) if (!profiles.has(profile.name)) failures.push(`${profile.name}: required viewport missing`);
  const required = RESPONSIVE_VIEWPORTS.flatMap((entry) => expectedResponsiveNames(entry.name));
  const names = captures.map((row) => row.name);
  if (names.length !== required.length || new Set(names).size !== required.length || !same([...names].sort(), [...required].sort())) failures.push('Aggregate capture-name union differs from the exact full inventory.');
  const report = {
    schemaVersion: '1.0', kind: 'aggregate-immutable-rendered-evidence', generatedAt: now,
    sourceRevision: expected.sourceRevision, artifactFingerprint: expected.artifactFingerprint,
    status: failures.length ? 'failed' : 'passed', complete: failures.length === 0,
    viewports: RESPONSIVE_VIEWPORTS, coverage: { scope: 'full', themes: RESPONSIVE_THEMES, tabs: RESPONSIVE_TABS, requiredCaptures: required.length, completedRequiredCaptures: captures.length },
    shards, captures, failures
  };
  if (outputDir && report.complete) {
    await fs.mkdir(output, { recursive: true });
    const outputRoot = await fs.realpath(output);
    for (const image of images) {
      const destination = path.join(output, image.target);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      if (!inside(outputRoot, await fs.realpath(path.dirname(destination)))) throw new Error('Aggregate image directory escaped the output tree.');
      const prior = await fs.lstat(destination).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
      if (prior?.isSymbolicLink()) throw new Error('Aggregate image output may not be a symbolic link.');
      const bytes = await fs.readFile(image.source);
      if (bytes.length !== image.bytes || createHash('sha256').update(bytes).digest('hex') !== image.sha256) {
        failures.push(`${image.target}: source image changed during aggregation`);
        report.status = 'failed'; report.complete = false; break;
      }
      await fs.writeFile(destination, bytes);
    }
  }
  return report;
}
