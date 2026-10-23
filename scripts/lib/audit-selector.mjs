/**
 * audit-selector.mjs — session-coherent audit selection (S240 audit #3 · S239 #9).
 *
 * Problem class: closeout surfaces each picked "the latest audit" independently,
 * so a nightly `-routine` sidecar (or yesterday's audit) could be narrated as the
 * human session's shipped work. This is the ONE selection contract all closeout
 * consumers share:
 *
 *   1. exact-session   — a sidecar whose `session` field equals the current session
 *   2. handoff-linked  — a sidecar filename referenced in context/LATEST_HANDOFF.md
 *   3. no-current-audit — nothing belongs to this session; `latest` is offered as
 *                         explicit HISTORICAL context, never as this session's work.
 *
 * Scans ALL docs/AUDIT_*.json variants (including `-routine` suffixes the
 * canonical date regexes skip) but a suffixed variant can only ever win by
 * exact-session match — routine audits carry no session and thus can never be
 * mistaken for session work.
 *
 * CLI: node scripts/lib/audit-selector.mjs --session 240 [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * S321 [audit #6] — ONE COERCION FOR THE FIELD THE WHOLE CONTRACT BINDS ON.
 *
 * This module's tier-1 answer — exact-session — is the only selection it calls
 * trustworthy, and it turned on `Number(audit.session)`. The field is written by
 * hand and the spelling drifted across sessions: `315`, `316`, `"S317"`, `318`,
 * `319`, `"S320"`. `Number("S320")` is NaN, NaN never equals 320, so the strongest
 * mode silently fell through to the weakest one. Proven cold before the fix:
 * `--session 320` answered `no-current-audit` with the reason "no sidecar carries
 * session=320" while `docs/AUDIT_2026-09-02-S320.json` was sitting in `docs/`.
 *
 * Two states, kept apart deliberately (the missing-third-state lesson this repo
 * keeps re-learning): a sidecar with NO session field is ABSENT — it never claimed
 * to belong to a session. A sidecar whose session field cannot be parsed is
 * MALFORMED — it claimed one and the claim is unreadable. Collapsing malformed onto
 * absent is exactly what produced a confident "no sidecar carries session=320".
 *
 * @param {*} raw the sidecar's `session` field, verbatim
 * @returns {{state:'absent'|'parsed'|'malformed', value:number|null, raw:*}}
 */
export function parseSessionId(raw) {
  if (raw === undefined || raw === null || raw === '') return { state: 'absent', value: null, raw };
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0
      ? { state: 'parsed', value: raw, raw }
      : { state: 'malformed', value: null, raw };
  }
  if (typeof raw === 'string') {
    const m = raw.trim().match(/^[Ss]?(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > 0) return { state: 'parsed', value: n, raw };
    }
    return { state: 'malformed', value: null, raw };
  }
  return { state: 'malformed', value: null, raw };
}

/** Parse every audit sidecar in docs/, tolerating corrupt files (skipped with note). */
function loadCandidates(repoRoot) {
  const dirs = [
    { absolute: path.join(repoRoot, 'docs'), relative: 'docs' },
    { absolute: path.join(repoRoot, 'docs', 'archive', 'audits'), relative: 'docs/archive/audits' },
  ].filter(dir => fs.existsSync(dir.absolute));
  if (!dirs.length) return { candidates: [], corrupt: [] };
  const candidates = [];
  const corrupt = [];
  for (const dir of dirs) for (const f of fs.readdirSync(dir.absolute).filter((x) => /^AUDIT_.*\.json$/.test(x))) {
    const p = path.join(dir.absolute, f);
    try {
      const audit = JSON.parse(fs.readFileSync(p, 'utf8'));
      const m = f.match(/(\d{4}-\d{2}-\d{2})/);
      const sid = parseSessionId(audit.session);
      candidates.push({
        file: f,
        relPath: `${dir.relative}/${f}`,
        date: m ? m[1] : null,
        session: sid.value,
        sessionState: sid.state,
        sessionRaw: sid.state === 'malformed' ? sid.raw : undefined,
        canonical: /^AUDIT_\d{4}-\d{2}-\d{2}\.json$/.test(f),
        audit,
      });
    } catch (e) {
      corrupt.push({ file: f, error: e.message });
    }
  }
  candidates.sort((a, b) => String(a.file).localeCompare(String(b.file)));
  return { candidates, corrupt };
}

/**
 * Newest sidecar of ANY variant (S312 audit #1).
 *
 * `latest` above is canonical-only by design — it exists to offer historical context
 * in the closeout narration path, where a `-routine` packet must never be mistaken for
 * session work. But consumers that ask "which audit is in play right now" need the
 * newest sidecar that EXISTS, whatever its suffix. Before S312 they each answered that
 * with a private `/^AUDIT_\d{4}-\d{2}-\d{2}\.json$/` readdir filter, which cannot match
 * `-S311` or `-routine` names, so both silently resolved a three-session-stale file.
 *
 * Order: newest date wins; within one date a sidecar carrying a `session` field (a human
 * plan) outranks one without (an automated evidence packet); filename breaks the last tie
 * so the result is deterministic.
 */
function newestOfAnyVariant(candidates) {
  return [...candidates].sort((a, b) =>
    String(a.date ?? '').localeCompare(String(b.date ?? ''))
    || (a.sessionState === 'absent' ? 0 : 1) - (b.sessionState === 'absent' ? 0 : 1)
    || String(a.file).localeCompare(String(b.file))
  ).pop() ?? null;
}

/**
 * Select the audit that belongs to `session`.
 * @returns {{ mode: 'exact-session'|'handoff-linked'|'no-current-audit',
 *             selected: object|null, latest: object|null, newest: object|null,
 *             reason: string, corrupt: Array }}
 */
export function selectSessionAudit({ repoRoot, session, handoffPath } = {}) {
  const { candidates, corrupt } = loadCandidates(repoRoot);
  const latest = [...candidates].filter((c) => c.canonical && c.relPath.startsWith('docs/AUDIT_')).pop()
    ?? [...candidates].filter((c) => c.canonical).pop() ?? null;
  const strip = (c) => c && {
    file: c.file, relPath: c.relPath, date: c.date, session: c.session,
    sessionState: c.sessionState, ...(c.sessionRaw !== undefined ? { sessionRaw: c.sessionRaw } : {}),
    canonical: c.canonical,
  };
  const newest = strip(newestOfAnyVariant(candidates));

  // The QUERY side gets the same coercion as the stored side — a caller asking for
  // "S321" and a sidecar storing 321 name the same session, and neither spelling may
  // decide the answer (S321 [audit #6]).
  const want = parseSessionId(session);
  const malformed = candidates.filter((c) => c.sessionState === 'malformed');
  // S321 [audit #6] — a malformed QUERY must never be silent, whichever tier ends up
  // answering. Handoff linkage is real evidence and still allowed to answer, but the
  // caller asked an unreadable question and has to be told so, or the collapse this
  // module just fixed reappears one tier down.
  const queryNote = want.state === 'malformed'
    ? ` · ⚠ the requested session id ${JSON.stringify(session)} is not a readable session number and matched nothing — this answer does not come from a session match`
    : '';

  // 1 · exact session match (only trustworthy claim of "this session's audit")
  if (want.state === 'parsed') {
    const exact = candidates.filter((c) => c.session === want.value);
    if (exact.length) {
      // Prefer the canonical (unsuffixed) sidecar when both exist for a session.
      const pick = exact.find((c) => c.canonical) ?? exact[exact.length - 1];
      return {
        mode: 'exact-session',
        selected: strip(pick),
        latest: strip(latest),
        newest,
        reason: `sidecar ${pick.file} carries session=${want.value}`,
        queryState: want.state,
        corrupt,
      };
    }
  }

  // 2 · handoff linkage — the handoff explicitly names an audit file
  const hp = handoffPath ?? path.join(repoRoot, 'context', 'LATEST_HANDOFF.md');
  if (fs.existsSync(hp)) {
    const handoff = fs.readFileSync(hp, 'utf8');
    const linked = candidates.filter((c) => handoff.includes(c.file));
    if (linked.length) {
      const pick = linked.find((c) => c.canonical) ?? linked[linked.length - 1];
      return {
        mode: 'handoff-linked',
        selected: strip(pick),
        latest: strip(latest),
        newest,
        reason: `LATEST_HANDOFF.md references ${pick.file}${queryNote}`,
        queryState: want.state,
        corrupt,
      };
    }
  }

  // 3 · honest default — nothing is THIS session's audit
  return {
    mode: 'no-current-audit',
    selected: null,
    latest: strip(latest),
    newest,
    // A malformed session id must never present as a confident absence. Before S321
    // this sentence was printed verbatim for S320 while that session's sidecar sat in
    // docs/ carrying `"session": "S320"` — the reader was told nothing existed.
    queryState: want.state,
    reason: want.state === 'malformed'
      ? `the requested session id ${JSON.stringify(session)} is not a readable session number — nothing was matched, and this is a malformed QUERY, not an absent audit`
      : want.state === 'parsed'
        ? `no sidecar carries session=${want.value} and none is handoff-linked — do not narrate ${latest ? latest.file : 'any audit'} as this session's work`
          + (malformed.length ? ` · ${malformed.length} sidecar(s) claim an UNREADABLE session id and could not be matched: ${malformed.map((c) => `${c.file} (${JSON.stringify(c.sessionRaw)})`).join(', ')}` : '')
        : 'no session number provided and no handoff linkage',
    malformedSessions: malformed.map((c) => ({ file: c.file, relPath: c.relPath, sessionRaw: c.sessionRaw })),
    corrupt,
  };
}

/**
 * S362 [audit #4 · SIL S326 #2] — an AUDIT_*.md that names `session` while no sidecar
 * resolves to it as `exact-session`. That is the S325 shape: the Markdown shipped, the
 * selector fell through to an older audit, and the disposition recorder wrote "0
 * recorded" against the WRONG session — a line that reads like a clean no-op.
 * A Markdown file names the session by its filename (`S<n>` token) or by its header
 * (first 15 lines: `Session <n>` / `S<n>` as a whole token). Pure; reads docs/ only.
 * @returns {{ unresolvable: boolean, files: string[], mode: string }}
 */
export function findUnresolvableSessionAudit({ repoRoot, session, handoffPath } = {}) {
  const want = parseSessionId(session);
  if (want.state !== 'parsed') return { unresolvable: false, files: [], mode: 'unparsed-session' };
  const sel = selectSessionAudit({ repoRoot, session: want.value, handoffPath });
  if (sel.mode === 'exact-session') return { unresolvable: false, files: [], mode: sel.mode };
  const docs = path.join(repoRoot, 'docs');
  let names = [];
  try { names = fs.readdirSync(docs).filter((f) => /^AUDIT_.*\.md$/.test(f)); } catch { names = []; }
  const token = new RegExp(`(^|[^0-9A-Za-z])S${want.value}([^0-9]|$)`);
  const header = new RegExp(`(Session ${want.value}([^0-9]|$))|((^|[^0-9A-Za-z])S${want.value}([^0-9]|$))`);
  const files = names.filter((f) => {
    if (token.test(f)) return true;
    try {
      const head = fs.readFileSync(path.join(docs, f), 'utf8').split(/\r?\n/).slice(0, 15).join('\n');
      return header.test(head);
    } catch { return false; }
  }).map((f) => `docs/${f}`);
  return { unresolvable: files.length > 0, files, mode: sel.mode };
}

export default { selectSessionAudit, findUnresolvableSessionAudit };

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const res = selectSessionAudit({
    repoRoot: path.resolve(flag('--root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')),
    session: flag('--session'),
  });
  if (argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`mode: ${res.mode}`);
    console.log(`selected: ${res.selected ? res.selected.file : '(none)'}`);
    console.log(`latest:   ${res.latest ? res.latest.file : '(none)'}`);
    console.log(`newest:   ${res.newest ? res.newest.file : '(none)'}`);
    console.log(`reason:   ${res.reason}`);
    if (res.corrupt.length) console.log(`corrupt:  ${res.corrupt.map((c) => c.file).join(', ')}`);
  }
}
