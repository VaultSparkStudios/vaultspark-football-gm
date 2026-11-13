// rotate-ledger.mjs — shared lifecycle policy for append-only ledgers (S220 audit #14).
//
// VERIFIED S220: 57MB of unbounded append logs — secrets/.access.log 25.1MB,
// .cache/twin-history.jsonl 25.4MB (read/written by the twin hook on EVERY tool
// call), portfolio/ark/PROPAGATOR_LOG.ndjson 4.2MB, BLOCKER_DISCIPLINE_LOG 2.1MB.
// The S219 Ark inbox prune fixed one instance; this closes the CLASS: one
// registry, one rotation helper, one doctor probe (ledger-growth).
//
// Policy: size-triggered, BYTE-BOUNDED retention (format-agnostic — no timestamp
// parsing). When a ledger exceeds maxBytes, the head is gzipped to
// <archiveDir>/<base>.<YYYY-MM-DD>.gz and the newest lines that fit within
// keepBytes remain hot. Consumers that mine history (twin mining, blocker
// enforcement) read the hot tail by default and may opt into archives explicitly.
//
// S334 [audit #1] — RETENTION MUST BE MEASURED IN THE UNIT THE GATE IS MEASURED IN.
//
// From S220 to S334 retention was expressed in LINES while the gate that triggers
// it was expressed in BYTES, and the two never had to agree. Measured live on
// .cache/twin-history.jsonl: 5,521,281 B over 10,166 lines (~543 B/line) against
// { maxBytes: 5_000_000, keepLines: 10_000 }. The newest 10,000 lines are
// 5,416,427 B — ABOVE the 5,000,000 B gate. So rotation archived ~166 lines, exited
// 0, and left the file over cap; the probe went straight back to red. S333's
// executor had already run it and recorded the outcome as "5.2MB -> 5.1MB, still
// red". The remedy was not weak, it was INERT BY CONSTRUCTION: whenever
// keepLines x bytes-per-line > maxBytes, no number of runs can ever clear the gate.
//
// Two consequences of the unit mismatch, both fixed here:
//   1. keepBytes is now the primary bound (default half of maxBytes, so a rotation
//      buys real headroom instead of landing a byte under the cap). keepLines
//      survives as an UPPER bound on history, never as the only bound.
//   2. `ok-lines` — over maxBytes but under keepLines — used to return an action the
//      CLI printed as "within threshold", a FALSE GREEN on the exact file the doctor
//      probe was calling red. Byte retention removes the case; where a single line
//      is itself larger than keepBytes the result is `line-floor`, reported honestly
//      as still-over-cap rather than as a pass.
//
// checkRetentionBounds() closes the class for good: it fails a registry row whose
// declared bounds cannot satisfy its own gate, so the next inert entry is caught at
// declaration time instead of after N sessions of red.
//
// Rollback: archives are plain gzipped line files next to the ledger — cat them
// back on top of the hot file to restore the original (gunzip -c X.gz + hot).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

function repoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const p = path.dirname(dir);
    if (p === dir) break;
    dir = p;
  }
  return process.cwd();
}

/**
 * Fraction of maxBytes the hot tail is trimmed to when a ledger rotates.
 *
 * Deliberately not 1.0. Retaining right up to the cap means the very next appended
 * line puts the file back over it, so the probe would be red again within minutes of
 * a successful rotation — a remedy that clears its gate for one instant is barely
 * better than one that never clears it. Half the cap buys a real interval.
 */
export const RETAIN_FRACTION = 0.5;

/** Byte budget for the hot tail of an entry. Explicit keepBytes wins. */
export function keepBytesFor(entry) {
  const explicit = Number(entry?.keepBytes);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  return Math.floor(Number(entry?.maxBytes || 0) * RETAIN_FRACTION);
}

/**
 * Registered ledgers.
 *
 * maxBytes triggers rotation. keepBytes is the byte budget the hot tail is trimmed
 * to (defaults to RETAIN_FRACTION x maxBytes). keepLines is an UPPER bound on how
 * much history stays hot — it may only ever remove more lines, never force the file
 * to stay above maxBytes. See checkRetentionBounds().
 */
export function ledgerRegistry(root = repoRoot()) {
  return [
    { id: 'secrets-access-log', file: path.join(root, 'secrets', '.access.log'), maxBytes: 5_000_000, keepLines: 5_000, archiveDir: path.join(root, 'secrets', '.archive') },
    { id: 'twin-history', file: path.join(root, '.cache', 'twin-history.jsonl'), maxBytes: 5_000_000, keepLines: 10_000, archiveDir: path.join(root, '.cache', 'archive') },
    { id: 'ark-propagator-log', file: path.join(root, 'portfolio', 'ark', 'PROPAGATOR_LOG.ndjson'), maxBytes: 2_000_000, keepLines: 4_000, archiveDir: path.join(root, 'portfolio', 'archive', 'ledgers') },
    { id: 'blocker-discipline-log', file: path.join(root, 'portfolio', 'BLOCKER_DISCIPLINE_LOG.ndjson'), maxBytes: 2_000_000, keepLines: 4_000, archiveDir: path.join(root, 'portfolio', 'archive', 'ledgers') },
    // S349 — one row per doctor run; the tail kept is what dates an outage.
    { id: 'supabase-service-health', file: path.join(root, 'portfolio', 'ops', 'supabase-service-health.ndjson'), maxBytes: 1_000_000, keepLines: 4_000, archiveDir: path.join(root, 'portfolio', 'archive', 'ledgers') },
    // S410 [audit #2] — 42.99MB / ~131k rows, read whole by every Console and feed build.
    // Rows are individually HMAC-signed (no chain), and no reader mines history beyond a
    // tail window, so archiving the head loses nothing. All-time counts must go through
    // countLedgerRowsAllTime() — the hot file alone is no longer the whole ledger.
    { id: 'obelisk-receipts', file: path.join(root, 'portfolio', 'ops', 'obelisk-receipts.ndjson'), maxBytes: 4_000_000, keepLines: 10_000, archiveDir: path.join(root, 'portfolio', 'archive', 'ledgers') },
  ];
}

/** Append-only index of every archive rotateLedger writes (one row per archive). */
export const ARCHIVE_INDEX_NAME = 'LEDGER_ARCHIVE_INDEX.ndjson';

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches `<ledger basename>.<YYYY-MM-DD>[.<n>].gz` — the names rotateLedger writes. */
export function archiveNamePattern(ledgerBase) {
  return new RegExp(`^${escapeRe(ledgerBase)}\\.(\\d{4}-\\d{2}-\\d{2})(?:\\.(\\d+))?\\.gz$`);
}

/** Rotation order of archive names for one ledger: by date, then suffix (none = 1). */
export function sortArchiveNames(names, ledgerBase) {
  const re = archiveNamePattern(ledgerBase);
  const key = (n) => { const m = re.exec(n); return m ? [m[1], Number(m[2] || 1)] : ['', 0]; };
  return [...names].sort((a, b) => {
    const [da, na] = key(a); const [db, nb] = key(b);
    return da < db ? -1 : da > db ? 1 : na - nb;
  });
}

/**
 * Registered ledgers as repo-relative forward-slash paths. Root-independent, so the
 * residue classifier (which works on git's relative paths) can use the registry.
 */
export function rotationLedgerSpecs() {
  const base = path.resolve('/__ledger_root__');
  const rel = (p) => path.relative(base, p).split(path.sep).join('/');
  return ledgerRegistry(base).map((e) => ({ id: e.id, ledger: rel(e.file), archiveDir: rel(e.archiveDir) }));
}

/** Non-empty line count — the row semantics both Console and feed readers use. */
function countRows(text) {
  let n = 0;
  for (const line of text.split(/\r?\n/)) if (line.trim()) n++;
  return n;
}

/**
 * S410 [audit #2] — prove a rotated ledger lost nothing since `beforeText`.
 *
 * A rotation turns HEAD = archivedHead + kept into working = kept + newAppends, and
 * writes archivedHead to the archive. So the exact proof is
 *   (archive_1 + … + archive_n + working).startsWith(HEAD)
 * Nothing weaker (line counts, sizes) is accepted. The claim is exactly "no COMMITTED
 * row was lost" — rows appended after HEAD are, as for any append-only receipt, not
 * covered by a committed revision. When the archives alone already contain HEAD (two
 * rotations since the commit) the hot file carries none of HEAD and the claim still
 * holds; requiring the hot file to overlap HEAD would turn that legitimate tree into a
 * false STOP (review r1 #3, considered and declined).
 *
 * @param {{beforeText:string, afterText:string, archiveBuffers:Buffer[]}} o archives in rotation order
 */
export function proveRotation({ beforeText, afterText, archiveBuffers }) {
  if (typeof beforeText !== 'string' || typeof afterText !== 'string' || !archiveBuffers?.length) {
    return { proven: false, detail: 'missing revision or archive' };
  }
  let archived = '';
  try {
    for (const b of archiveBuffers) archived += zlib.gunzipSync(b).toString('utf8');
  } catch (e) {
    return { proven: false, detail: `archive unreadable (${e.message})` };
  }
  const combined = archived + afterText;
  if (!combined.startsWith(beforeText)) return { proven: false, detail: 'archive + hot file does not contain the committed ledger' };
  return {
    proven: true,
    archivedRows: countRows(archived),
    appendedRows: countRows(combined.slice(beforeText.length)),
    detail: `rotated: ${countRows(archived)} row(s) archived · proven archive + hot ⊇ committed ledger (no committed row lost)`,
  };
}

/**
 * All-time row count of a ledger: hot rows + every archive rotateLedger wrote for it.
 *
 * Indexed archives use their recorded row count; an archive with no index row (written
 * before S410) is MEASURED by gunzip, never assumed. Any unreadable part makes the total
 * null — an unreadable ledger has no size, it does not have size zero (S271).
 *
 * @returns {{total:number|null, hot:number|null, archived:number, archives:number, unindexed:number, registered:boolean, error?:string}}
 */
export function countLedgerRowsAllTime(file, { root = repoRoot() } = {}) {
  const abs = path.resolve(root, file);
  let hot = null;
  try { hot = countRows(fs.readFileSync(abs, 'utf8')); } catch { hot = null; }
  const entry = ledgerRegistry(root).find((e) => path.resolve(e.file).toLowerCase() === abs.toLowerCase());
  if (!entry) return { total: hot, hot, archived: 0, archives: 0, unindexed: 0, registered: false };
  const base = path.basename(entry.file);
  const re = archiveNamePattern(base);
  let names = [];
  try { names = fs.readdirSync(entry.archiveDir).filter((n) => re.test(n)); } catch { names = []; }
  const indexed = new Map();
  try {
    for (const line of fs.readFileSync(path.join(entry.archiveDir, ARCHIVE_INDEX_NAME), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); if (r.ledger === base && Number.isFinite(r.rows)) indexed.set(r.archive, r.rows); } catch { /* malformed row: archive is measured instead */ }
    }
  } catch { /* no index yet */ }
  let archived = 0;
  let unindexed = 0;
  for (const n of names) {
    if (indexed.has(n)) { archived += indexed.get(n); continue; }
    try { archived += countRows(zlib.gunzipSync(fs.readFileSync(path.join(entry.archiveDir, n))).toString('utf8')); unindexed++; }
    catch (e) { return { total: null, hot, archived, archives: names.length, unindexed, registered: true, error: `archive ${n} unreadable (${e.message})` }; }
  }
  return { total: hot == null ? null : hot + archived, hot, archived, archives: names.length, unindexed, registered: true };
}

/**
 * Select the newest lines that fit the byte budget, capped by keepLines.
 *
 * Walks from the newest line backwards accumulating byte cost (line + its newline),
 * so the retained tail is bounded in the SAME unit as the gate. Returns at least one
 * line even when that single line exceeds the budget — erasing a ledger is never the
 * right answer to it being too big, and `line-floor` reports that state honestly
 * instead of dressing it as a pass.
 *
 * @param {string[]} lines newest-last
 * @returns {{tail:string[], bytes:number, lineFloor:boolean}}
 */
export function selectHotTail(lines, { keepBytes, keepLines }) {
  const maxLines = Number.isFinite(keepLines) && keepLines > 0 ? keepLines : lines.length;
  const budget = Number.isFinite(keepBytes) && keepBytes > 0 ? keepBytes : Infinity;
  let bytes = 0;
  let take = 0;
  for (let i = lines.length - 1; i >= 0 && take < maxLines; i--) {
    const cost = Buffer.byteLength(lines[i], 'utf8') + 1;
    if (take > 0 && bytes + cost > budget) break;
    bytes += cost;
    take += 1;
  }
  if (take === 0) take = Math.min(1, lines.length);
  const tail = lines.slice(lines.length - take);
  return { tail, bytes, lineFloor: take === 1 && bytes > budget };
}

/**
 * Is every registry row's declared retention capable of satisfying its own gate?
 *
 * MEASURE THE BOUND THAT ACTUALLY BINDS. `selectHotTail` applies keepBytes and
 * keepLines together and stops at whichever is reached first, so the bound that
 * decides whether the gate can ever clear is keepBytes. A row is `inert-bound` only
 * when its own declared byte budget exceeds the cap that triggers rotation — that is
 * a promise no run can keep, whatever the line count says.
 *
 * An over-large keepLines is NOT inert once bytes govern; it is simply not the
 * binding constraint, and it is reported as `slack-bound` (advisory). Calling it
 * inert would be this checker asserting more than it measures — and would leave a
 * permanently-red row describing a mechanism that no longer decides anything.
 * It stays measured because it is the latent hazard: revert to line-only retention
 * and every `slack-bound` row becomes inert again.
 *
 * Live line size is read from the file so the report is measured, not assumed. A row
 * whose file is absent or empty still gets its byte bound judged (that check is
 * declaration-only) and its line note marked unmeasured.
 *
 * @returns {{ok:boolean, rows:{id:string,status:string,detail:string}[]}}
 */
export function checkRetentionBounds(root = repoRoot(), { registry = null } = {}) {
  const rows = [];
  for (const e of (registry || ledgerRegistry(root))) {
    const keepBytes = keepBytesFor(e);

    // The binding constraint, judged first and without needing the file at all.
    if (!(keepBytes > 0) || keepBytes > e.maxBytes) {
      rows.push({
        id: e.id,
        status: 'inert-bound',
        detail: `keepBytes ${keepBytes}B does not fit maxBytes ${e.maxBytes}B — no rotation under this declaration can clear the gate`,
      });
      continue;
    }

    let size = 0;
    let lineCount = 0;
    try {
      size = fs.statSync(e.file).size;
      if (size > 0) lineCount = fs.readFileSync(e.file, 'utf8').split('\n').filter((l) => l !== '').length;
    } catch { /* absent — line note is unmeasured, byte bound already passed */ }

    if (!lineCount) {
      rows.push({
        id: e.id,
        status: 'enforceable',
        detail: `keepBytes ${keepBytes}B fits maxBytes ${e.maxBytes}B · keepLines ${e.keepLines} UNMEASURED (ledger absent or empty)`,
      });
      continue;
    }

    const avg = size / lineCount;
    const lineWorst = Math.round(avg * e.keepLines);
    if (lineWorst > e.maxBytes) {
      rows.push({
        id: e.id,
        status: 'slack-bound',
        detail: `keepBytes ${keepBytes}B governs and fits maxBytes ${e.maxBytes}B · keepLines ${e.keepLines} (~${lineWorst}B at ~${Math.round(avg)}B/line) cannot bind — it would be inert on its own`,
      });
      continue;
    }
    rows.push({
      id: e.id,
      status: 'enforceable',
      detail: `keepBytes ${keepBytes}B and keepLines ${e.keepLines} (~${lineWorst}B at ~${Math.round(avg)}B/line) both fit maxBytes ${e.maxBytes}B`,
    });
  }
  return { ok: rows.every((r) => r.status !== 'inert-bound'), rows };
}

/**
 * S410 review r1 #2 — replace a file without an in-place truncate. writeFileSync
 * truncates first, so a crash mid-write lost the kept tail AND the carried rows (the
 * archive holds only the head). Write a sibling temp file and rename over the target;
 * Windows can refuse a rename while another process holds the file, so retry briefly
 * and fall back to the in-place write rather than leave the rotation half done.
 */
//
// `build()` re-reads the ledger and returns the replacement bytes, or null when the file
// changed in a way that is not a pure extension (caller backs out). It is called before
// EVERY attempt and before the fallback (review r2 #1): a back-off spent waiting on a
// held file would otherwise widen the documented append window to the whole retry span.
// Returns true when replaced, false when build() asked to back out.
function replaceFile(file, build) {
  const tmp = `${file}.rotate-${process.pid}.tmp`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const buf = build();
    if (!buf) { fs.rmSync(tmp, { force: true }); return false; }
    fs.writeFileSync(tmp, buf);
    try { fs.renameSync(tmp, file); return true; }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { fs.rmSync(tmp, { force: true }); throw e; }
      const until = Date.now() + 20 * (attempt + 1);
      while (Date.now() < until) { /* brief synchronous back-off */ }
    }
  }
  fs.rmSync(tmp, { force: true });
  const buf = build();
  if (!buf) return false;
  fs.writeFileSync(file, buf);
  return true;
}

/** Rotate one ledger if it exceeds its threshold. Returns a result row. */
export function rotateLedger(entry, { apply = false, onBeforeRewrite = null } = {}) {
  const { id, file, maxBytes, keepLines, archiveDir } = entry;
  const keepBytes = keepBytesFor(entry);
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return { id, file, size: 0, action: 'absent' }; }
  if (size <= maxBytes) return { id, file, size, action: 'ok' };

  if (!apply) return { id, file, size, action: 'would-rotate' };

  const rawBuf = fs.readFileSync(file);
  const raw = rawBuf.toString('utf8');
  // The split/join below is exact only for valid UTF-8; a lossy decode would rewrite
  // bytes nobody appended. Refuse rather than "repair" a ledger.
  if (!Buffer.from(raw, 'utf8').equals(rawBuf)) return { id, file, size, action: 'non-utf8' };
  const lines = raw.split('\n');
  // Preserve a trailing empty segment from a final newline.
  const trailingNL = lines[lines.length - 1] === '' ? (lines.pop(), true) : false;

  // Retention is bounded in BYTES — the unit the gate above is measured in. keepLines
  // only ever trims further. Selecting by line count alone is what made this function
  // unable to clear its own gate for 114 sessions (see the header note).
  const sel = selectHotTail(lines, { keepBytes, keepLines });
  const tail = sel.tail;
  if (tail.length >= lines.length) {
    // A single line larger than the whole budget. Truncating it would destroy the only
    // record there is, so say so plainly rather than returning a pass.
    return { id, file, size, keepBytes, action: 'line-floor' };
  }
  const head = lines.slice(0, lines.length - tail.length);
  fs.mkdirSync(archiveDir, { recursive: true });
  const stampDate = new Date().toISOString().slice(0, 10);
  const headText = head.join('\n') + '\n';
  const gz = zlib.gzipSync(headText);
  // Never clobber an existing archive from the same day — suffix it. S410 review r1 #1:
  // create EXCLUSIVELY ('wx'). With an existsSync check two concurrent rotations could
  // both pick X.gz; the back-out below would then delete the OTHER run's archive and its
  // head rows would be in neither file. Exclusive creation means this run only ever
  // removes a file it created itself.
  let archive = null;
  for (let n = 1; !archive; n++) {
    const candidate = path.join(archiveDir, `${path.basename(file)}.${stampDate}${n === 1 ? '' : `.${n}`}.gz`);
    try { fs.writeFileSync(candidate, gz, { flag: 'wx' }); archive = candidate; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  // S410 [audit #2] — carry concurrent appends. Writers (the Obelisk broker, doctor,
  // drains) append while this runs; rewriting from the earlier read silently dropped any
  // row that landed in between. Re-read immediately before the rewrite: an extension of
  // what was read is carried into the hot tail; anything else means another process
  // rewrote the file, so this rotation backs out and changes nothing. A residual window
  // remains between this read and the write below (one synchronous write of ≤keepBytes).
  // Test seam only: lets a test append exactly inside the window being defended.
  if (typeof onBeforeRewrite === 'function') onBeforeRewrite();
  const tailBuf = Buffer.from(tail.join('\n') + (trailingNL ? '\n' : ''), 'utf8');
  let carried = Buffer.alloc(0);
  const build = () => {
    const nowBuf = fs.readFileSync(file);
    if (nowBuf.length < rawBuf.length || !nowBuf.subarray(0, rawBuf.length).equals(rawBuf)) return null;
    carried = nowBuf.subarray(rawBuf.length);
    return Buffer.concat([tailBuf, carried]);
  };
  if (!replaceFile(file, build)) {
    fs.rmSync(archive, { force: true });
    return { id, file, size, action: 'changed-during-rotation' };
  }
  // Index row is written only after the hot file is replaced. A crash between the
  // archive write and here leaves an unindexed archive whose head is still in the hot
  // file: all-time counts read high (measured by gunzip) until the next rotation — the
  // failure direction is duplication, never loss. Accepted and documented (review r1 #6).
  const index = {
    schema: 'ledger-archive-index/v1',
    ledger: path.basename(file),
    archive: path.basename(archive),
    rows: countRows(headText),
    bytes: Buffer.byteLength(headText),
    sha256: crypto.createHash('sha256').update(headText).digest('hex'),
    rotatedAt: new Date().toISOString(),
  };
  fs.appendFileSync(path.join(archiveDir, ARCHIVE_INDEX_NAME), JSON.stringify(index) + '\n');
  const newSize = fs.statSync(file).size;
  // The claim a caller actually needs: did this rotation clear the gate it was
  // triggered by? Reporting only the before/after size let 5.2MB -> 5.1MB read as
  // progress for four sessions while the probe stayed red.
  return {
    id, file, size, newSize, keepBytes,
    archived: head.length, kept: tail.length, carriedBytes: carried.length, archive,
    clearedGate: newSize <= maxBytes,
    action: 'rotated',
  };
}

export function rotateAll({ apply = false, root = repoRoot() } = {}) {
  return ledgerRegistry(root).map(e => rotateLedger(e, { apply }));
}

/** Size over which an unregistered append ledger is a finding. */
export const UNREGISTERED_LEDGER_BYTES = 5_000_000;

/**
 * S410 [audit #1] — every .ndjson/.jsonl the unregistered scan must see.
 *
 * The scan used to be four FIXED directories (portfolio, portfolio/ark,
 * portfolio/ark/log, .cache). portfolio/ops was not one of them, so the 42.99MB
 * portfolio/ops/obelisk-receipts.ndjson (the only tracked file over 5MB) sat beside
 * a probe reporting "no unregistered >5MB" — a false green. A fixed list re-creates
 * that hole for every new subdirectory, so portfolio/ is now walked recursively
 * (bounded depth, archives excluded: rotated history is gzipped and owned by the
 * rotation itself). .cache stays top-level only — its nested trees are test/proof
 * scratch, and the S403 scratch remedy already names top-level scratch honestly.
 */
export function ledgerCandidateFiles(root = repoRoot(), { maxDepth = 6 } = {}) {
  const out = [];
  const isLedger = (n) => /\.(ndjson|jsonl)$/.test(n);
  const archive = path.resolve(root, 'portfolio', 'archive').toLowerCase();
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth >= maxDepth || e.name === 'node_modules' || e.name === '.git') continue;
        if (path.resolve(f).toLowerCase() === archive) continue;
        walk(f, depth + 1);
      } else if (e.isFile() && isLedger(e.name)) {
        out.push(f);
      }
    }
  };
  walk(path.join(root, 'portfolio'), 0);
  let cache = [];
  try { cache = fs.readdirSync(path.join(root, '.cache'), { withFileTypes: true }); } catch { /* absent */ }
  for (const e of cache) if (e.isFile() && isLedger(e.name)) out.push(path.join(root, '.cache', e.name));
  return out;
}

/**
 * Doctor-probe view: any registered ledger over threshold, plus any UNREGISTERED
 * .ndjson/.jsonl over 5MB in the common ledger dirs (the class must not regrow
 * silently under a new name).
 */
export function checkLedgers(root = repoRoot()) {
  const reg = ledgerRegistry(root);
  const over = rotateAll({ root }).filter(r => r.action === 'would-rotate');
  const known = new Set(reg.map(r => path.resolve(r.file).toLowerCase()));
  const unregistered = [];
  for (const f of ledgerCandidateFiles(root)) {
    if (known.has(path.resolve(f).toLowerCase())) continue;
    let s = 0;
    try { s = fs.statSync(f).size; } catch { continue; }
    if (s > UNREGISTERED_LEDGER_BYTES) unregistered.push({ file: f, size: s });
  }
  // A row whose declared bounds cannot satisfy its own gate is a finding in its own
  // right, and a louder one than being over cap: over-cap is a state a run can fix,
  // an inert bound is a promise no run can keep.
  const bounds = checkRetentionBounds(root);
  const inertBounds = bounds.rows.filter((r) => r.status === 'inert-bound');
  // Advisory: the byte budget governs, so these rows CAN clear their gate. Surfaced,
  // never counted against `ok` — a green that depends on nobody noticing is worse
  // than a warning, and a red nothing can fix is worse than both.
  const slackBounds = bounds.rows.filter((r) => r.status === 'slack-bound');
  return {
    over,
    unregistered,
    inertBounds,
    slackBounds,
    ok: over.length === 0 && unregistered.length === 0 && inertBounds.length === 0,
  };
}

/**
 * S403 [audit #3] — one remedy per finding class. The probe used to append
 * "run: rotate-ledgers --apply" to every finding, but rotateAll only touches
 * registered rows, so for an UNREGISTERED file the advice could never clear the
 * warning (live case: a 32.9MB S400 scratch copy in ignored .cache/).
 */
export function ledgerRemedies(chk, root = repoRoot()) {
  const out = [];
  // Keep the `run: node scripts/…` form: remedy-drift extracts it (lib/test-declared-remedies DETAIL_CUE).
  // The other classes deliberately carry no runnable cue — there is no command that clears them.
  if (chk.over?.length) out.push('run: node scripts/rotate-ledgers.mjs --apply');
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const scratch = (chk.unregistered || []).filter((u) => rel(u.file).startsWith('.cache/'));
  const durable = (chk.unregistered || []).filter((u) => !rel(u.file).startsWith('.cache/'));
  if (scratch.length) out.push(`scratch under ignored .cache/ (${scratch.map((u) => path.basename(u.file)).join(', ')}): delete it if no live writer owns it, else add it to ledgerRegistry`);
  if (durable.length) out.push(`unregistered (${durable.map((u) => rel(u.file)).join(', ')}): add to ledgerRegistry in scripts/lib/rotate-ledger.mjs — rotate-ledgers cannot rotate it until then`);
  if (chk.inertBounds?.length) out.push('inert bound: widen keepBytes/maxBytes so the row can satisfy its own gate');
  return out;
}
