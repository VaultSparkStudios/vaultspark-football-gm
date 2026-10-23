// audit-premises.mjs — S239 audit #8 · typed premise contract for audits
//
// THE DEFECT
//   The 2026-07-15 routine audit asserted "ten scheduled workflows remain" and
//   "the closeout cluster needs hardening" when S238 had already removed every
//   schedule and the cluster was green (blockingFailing 0). Studio Oracle's
//   preverify gathers TEXT evidence, but nothing encodes a CHECKABLE claim, so a
//   stale finding still reads as authoritative prose and reaches founder
//   attention. S239 hit this live again: item #14 asserted a 4.8MB access ledger
//   demanding rotation, while the live ledger-growth probe reported pass:true.
//
// THE CONTRACT
//   A premise is a typed, machine-checkable claim: what is asserted, which
//   adapter resolves it, and what value would make it TRUE. Evaluation returns
//   exactly one of:
//     verified     — evidence supports the claim
//     contradicted — evidence disproves it (the stale-finding case)
//     unverified   — no evidence resolvable (STAYS unverified; never auto-passes)
//
//   `unverified` is deliberately NOT a pass. An audit that cannot prove its own
//   premise must say so; silently treating unresolvable claims as true is the
//   exact failure this module exists to prevent.
//
// Pure by construction: adapters resolve against INJECTED data, never by
// shelling out, so premises are provable in fixtures with no live host.

export const STATUS = Object.freeze({
  VERIFIED: 'verified',
  CONTRADICTED: 'contradicted',
  UNVERIFIED: 'unverified',
  // S321 [audit #5] — A PREMISE THAT CANNOT BE TRUE TWICE.
  //
  // S320 premise [1] expected the doctor probe `second-failure-domain` to CONTAIN
  // the literal "backup 19". That probe reports a monotonically increasing backup
  // age: it read 19.7h when the premise was written and 23.5h by the next session.
  // The premise was true exactly once and can never be true again — and its decay
  // was published as `evidence DISPROVES the claim`, counted into "this audit is
  // stale — re-verify before acting", indistinguishable from a premise that was
  // simply wrong about the world.
  //
  // This is its own state, not a fourth meaning crammed onto CONTRADICTED. A
  // disproof carries information; this carries none, and a verifier whose strongest
  // verdict can fire on no information spends the reader's trust for nothing.
  VOLATILE: 'volatile',
});

/**
 * Two ways an expectation binds itself to a number that moves on its own.
 *
 * (a) A DRIFTING TOKEN in the expected text: an ISO-8601 instant, or an age/duration
 *     quantity (`19.7h`, `1d`, `45s`). Deliberately narrow — a premise SHOULD be able
 *     to expect a plain count like `0` or `14`, which does not drift by itself.
 *
 * (b) A PINNED SUBSTRING OF FREE PROSE. The premise that motivated this used neither
 *     an ISO stamp nor a unit: it pinned `contains "backup 19"` against the `detail`
 *     field of a doctor probe. A probe's `detail` is a human sentence rebuilt on every
 *     run; pinning a substring of one that contains a digit is a bet on a measurement
 *     rendered inside prose, and it decays the moment the measurement moves. The rule
 *     is written from that exact text rather than from a tidier hypothetical, because
 *     a guard tested only on the case it was designed for is a guard tested on nothing.
 *
 * @returns {{token:string, operator:string, field:string, kind:'drifting-token'|'pinned-prose'}|null}
 */
const VOLATILE_TOKEN = /\d{4}-\d{2}-\d{2}T[\d:.]+Z|\b\d+(?:\.\d+)?\s*(?:ms|s|m|h|d)\b/;

/** Marks a problem raised solely by the volatility guard, so readers can separate it. */
export const VOLATILE_PROBLEM_PREFIX = 'volatile expectation: ';

/** Operators that pin an exact textual value, so a drifting token cannot survive them. */
const PINNING_OPERATORS = new Set(['eq', 'neq', 'contains', 'not-contains', 'matches']);

/** Probe/report fields that hold a human sentence rather than a stable value. */
const FREE_PROSE_METRICS = new Set(['detail', 'message', 'label', 'reason', 'summary']);

export function volatileExpectation(premise) {
  if (!premise || typeof premise !== 'object') return null;
  if (!PINNING_OPERATORS.has(premise.operator)) return null;
  for (const field of ['expected', 'pattern']) {
    const v = premise[field];
    if (typeof v !== 'string') continue;
    const m = v.match(VOLATILE_TOKEN);
    if (m) return { token: m[0], operator: premise.operator, field, kind: 'drifting-token' };
  }
  // (b) — a digit pinned inside a free-prose field.
  if (FREE_PROSE_METRICS.has(premise.metric)) {
    for (const field of ['expected', 'pattern']) {
      const v = premise[field];
      if (typeof v !== 'string') continue;
      const m = v.match(/\d+(?:\.\d+)?/);
      if (m) return { token: m[0], operator: premise.operator, field, kind: 'pinned-prose' };
    }
  }
  return null;
}

/** Comparison operators. Each returns a boolean; unknown operators are a hard error. */
export const OPERATORS = Object.freeze({
  eq:       (actual, expected) => actual === expected,
  neq:      (actual, expected) => actual !== expected,
  lt:       (actual, expected) => Number(actual) < Number(expected),
  lte:      (actual, expected) => Number(actual) <= Number(expected),
  gt:       (actual, expected) => Number(actual) > Number(expected),
  gte:      (actual, expected) => Number(actual) >= Number(expected),
  contains: (actual, expected) => String(actual ?? '').includes(String(expected)),
});

/**
 * Adapters map a premise `target` to an actual value drawn from injected evidence.
 * Each returns { found: boolean, actual: any }. `found:false` -> unverified.
 */
export const ADAPTERS = Object.freeze({
  /** Doctor probe field, e.g. target:'ledger-growth', metric:'pass'. */
  'doctor-probe': (premise, ev) => {
    const checks = ev?.doctor?.checks ?? ev?.doctor?.results ?? [];
    const probe = checks.find((c) => c.id === premise.target);
    if (!probe) return { found: false, actual: null };
    const metric = premise.metric ?? 'pass';
    if (!(metric in probe)) return { found: false, actual: null };
    return { found: true, actual: probe[metric] };
  },

  /**
   * S240 (second-order) — absence claims. "No probe with this id exists" was
   * previously unprovable (doctor-probe returns found:false for a missing id,
   * leaving the premise unverified forever). This adapter makes absence a
   * first-class, verifiable claim: actual=true when the id is NOT registered.
   * Requires doctor evidence to be present — no doctor run, no verdict.
   */
  'doctor-probe-absent': (premise, ev) => {
    const checks = ev?.doctor?.checks ?? ev?.doctor?.results ?? null;
    if (!Array.isArray(checks) || !checks.length) return { found: false, actual: null };
    return { found: true, actual: !checks.some((c) => c.id === premise.target) };
  },

  /** Count of doctor checks that block a closeout. */
  'doctor-blocking': (_premise, ev) => {
    const n = ev?.doctor?.blockingFailing;
    return n === undefined || n === null ? { found: false, actual: null } : { found: true, actual: n };
  },

  /** Number of workflow files carrying a top-level schedule trigger. */
  'workflow-schedules': (_premise, ev) => {
    const n = ev?.workflows?.scheduledCount;
    return n === undefined || n === null ? { found: false, actual: null } : { found: true, actual: n };
  },

  /** Test suite metrics, e.g. metric:'failures'. */
  'tests': (premise, ev) => {
    const t = ev?.tests;
    const metric = premise.metric ?? 'failures';
    if (!t || !(metric in t)) return { found: false, actual: null };
    return { found: true, actual: t[metric] };
  },

  /** Whether a repo path exists. target is the path. */
  'file-exists': (premise, ev) => {
    const files = ev?.files;
    if (!files || !(premise.target in files)) return { found: false, actual: null };
    return { found: true, actual: Boolean(files[premise.target]) };
  },

  /**
   * Live-deploy parity, resolved ONLY from a durable deploy receipt.
   *
   * The absence of a receipt is NOT evidence against parity -- it is the absence
   * of evidence, so this returns found:false and the premise stays UNVERIFIED.
   * Using file-exists here instead would report "contradicted", which falsely
   * claims we PROVED the live Worker diverges. We have proven nothing; the
   * probe is approval-gated. Unknown must read as unknown (CANON-031).
   */
  'deploy-receipt': (premise, ev) => {
    const receipt = ev?.deployReceipts?.[premise.target];
    if (!receipt) return { found: false, actual: null };
    const metric = premise.metric ?? 'fingerprintMatches';
    if (!(metric in receipt)) return { found: false, actual: null };
    return { found: true, actual: receipt[metric] };
  },

  /** Task Board row lifecycle, e.g. target:'#202', metric:'status'. */
  'task-lifecycle': (premise, ev) => {
    const rows = ev?.taskBoard ?? [];
    const row = rows.find((r) => String(r.id) === String(premise.target));
    if (!row) return { found: false, actual: null };
    const metric = premise.metric ?? 'status';
    if (!(metric in row)) return { found: false, actual: null };
    return { found: true, actual: row[metric] };
  },

  /**
   * S245 [audit R12] — literal-substring claim over a repo file's text.
   * `target` is the repo-relative path, `pattern` the literal substring, e.g.
   * { adapter:'file-content', target:'scripts/x.mjs', pattern:'appendExecution',
   *   operator:'eq', expected:true }. `actual` is whether the substring is present.
   * A file that is ABSENT resolves to actual:false (substring provably not present)
   * — so a decay premise ("file still contains marker", expected:true) correctly
   * flips to CONTRADICTED when the file/marker is deleted. Evidence is INJECTED via
   * ev.fileContents (the lib never touches the filesystem — purity preserved).
   */
  'file-content': (premise, ev) => {
    const contents = ev?.fileContents;
    if (!contents || !(premise.target in contents)) return { found: false, actual: null };
    const text = contents[premise.target];
    if (text == null) return { found: true, actual: false }; // file absent → substring not present
    const needle = premise.pattern ?? '';
    return { found: true, actual: String(text).includes(String(needle)) };
  },

  /**
   * S245 [audit R12] — regex claim over a repo file's text (the `grep` premise the
   * routine audits naturally express). Same injection + absent-file semantics as
   * file-content. An INVALID regex is unverifiable (found:false → UNVERIFIED),
   * never silently true.
   */
  'grep': (premise, ev) => {
    const contents = ev?.fileContents;
    if (!contents || !(premise.target in contents)) return { found: false, actual: null };
    const text = contents[premise.target];
    if (text == null) return { found: true, actual: false }; // file absent → pattern not present
    let re;
    try { re = new RegExp(premise.pattern ?? '', premise.flags ?? ''); }
    catch { return { found: false, actual: null }; } // malformed pattern → cannot verify
    return { found: true, actual: re.test(String(text)) };
  },

  /**
   * S284 [audit #1] — HOW MANY times a pattern occurs, so a premise can assert a
   * count ("4 raw call-sites remain", "no more than 2 uses survive") with the
   * numeric operators. `grep` can only ever say present/absent, so every counting
   * claim previously had to reach for an adapter that did not exist.
   *
   * Same injected-content purity and absent-file semantics as `grep`: a file that
   * is ABSENT counts 0 (the pattern is provably not present that many times), so a
   * burn-down premise (`lte 0`) correctly VERIFIES when the file is deleted rather
   * than hanging unverified forever. An INVALID regex is unverifiable (found:false),
   * never silently 0 — a malformed pattern must not read as a clean burn-down.
   *
   * The `g` flag is forced, because a non-global regex would match at most once and
   * silently cap every count at 1 — a counting adapter that cannot count past one is
   * exactly the kind of quietly-wrong instrument this audit was about.
   */
  'grep-count': (premise, ev) => {
    const contents = ev?.fileContents;
    if (!contents || !(premise.target in contents)) return { found: false, actual: null };
    const text = contents[premise.target];
    if (text == null) return { found: true, actual: 0 }; // absent file → zero occurrences
    let re;
    const flags = new Set(String(premise.flags ?? ''));
    flags.add('g'); // forced — see above
    try { re = new RegExp(premise.pattern ?? '', [...flags].join('')); }
    catch { return { found: false, actual: null }; } // malformed pattern → cannot verify
    return { found: true, actual: (String(text).match(re) ?? []).length };
  },
});

/**
 * S284 [audit #1] — adapters a premise author might reasonably reach for that are
 * excluded ON PURPOSE, mapped to the reason and the supported alternative.
 *
 * Without this, a deliberate exclusion and a typo produce the identical generic
 * "unknown adapter" message, so an author has no way to learn that running a
 * command from a sidecar is a refusal rather than a gap. A sidecar is data that
 * /implement executes against; letting it name a command for the verifier to run
 * would hand arbitrary execution to whatever wrote the JSON (CANON-024).
 */
export const REFUSED_ADAPTERS = Object.freeze({
  'exit-code': 'runs a command to read its exit status — a sidecar must never make the verifier execute arbitrary commands (CANON-024). Assert the observable state instead: doctor-probe for a probe verdict, or grep/grep-count/file-content for a claim about a file.',
  'cli-json': 'shells out and parses the output — same CANON-024 refusal as exit-code, and CLI output is not a stable contract. Use doctor-probe / doctor-blocking for probe state, or file-content / grep / grep-count for file claims.',
  // S317 [audit #2] — RENAMES of the two above, observed live. S316 wrote
  // `command-json` x5 and S314 wrote `cli-output`; both are cli-json wearing a
  // different name, and both produced a generic "unknown adapter" message that
  // taught the author nothing about WHY the shape is refused. A refusal that reads
  // as a gap gets worked around by renaming, which is exactly what happened.
  'command-json': 'is cli-json under another name — shelling out and parsing stdout is refused under CANON-024, and renaming the adapter does not change what it does. Use doctor-probe / doctor-blocking for probe state, or file-content / grep / grep-count for file claims.',
  'cli-output': 'is cli-json under another name — see cli-json. Command output is not a stable contract and a sidecar must not make the verifier run commands (CANON-024).',
});

/**
 * S317 [audit #2] — near-miss adapter and operator names, mapped to the real one.
 *
 * S316's audit named `grep-content` seventeen times, `command-json` five times and
 * `json-field` once, and every premise carried operator `present`. None exist. The
 * author did not ignore the vocabulary — the vocabulary is published nowhere the
 * author reads: the live audit skill copy says "adapter" zero times, and
 * SESSION_PROTOCOL's "PRE-VERIFY every premise against live code" names no adapter.
 * A grep for the real names outside scripts/ hits only other sidecars, so the
 * vocabulary is transmitted by copying a previous sidecar and mutates as it goes.
 *
 * A blend like `grep-content` is not a typo — it is a plausible name assembled from
 * two real ones. Listing the supported set is necessary and was not sufficient;
 * naming the intended one is.
 */
export const ADAPTER_NEAR_MISSES = Object.freeze({
  'grep-content': "is a blend of two real adapters. Use `grep` for a regex claim over a file's text, or `file-content` for a plain substring claim.",
  'json-field': 'names no adapter. For a probe verdict use `doctor-probe` with `metric`; for a claim about a JSON file\'s text use `file-content` or `grep`.',
  'file-absent': 'names no adapter. Use `file-exists` with `expected: false` — absence is a value of the presence question, not a separate adapter.',
  'grep-count-content': 'is a blend. Use `grep-count` for an occurrence count.',
});

/** Operators an author might reach for, mapped to the supported spelling. */
export const OPERATOR_NEAR_MISSES = Object.freeze({
  present: 'is not an operator — presence is the ADAPTER\'s job. Use `eq` with `expected: true` (grep/file-content already answer present/absent).',
  absent: 'is not an operator. Use `eq` with `expected: false`.',
  includes: 'is spelled `contains`.',
  matches: 'is not an operator. Use the `grep` adapter with `eq` and `expected: true`.',
  exists: 'is not an operator. Use `file-exists` with `eq` and `expected: true`.',
});

/** Adapters whose evidence is a file's text, injected via ev.fileContents. */
export const FILE_CONTENT_ADAPTERS = Object.freeze(['file-content', 'grep', 'grep-count']);

/**
 * S304 [audit #1] — A CLAIM MAY NOT ASSERT MORE THAN ITS ADAPTER CAN MEASURE.
 *
 * S303 closed the case where an adapter could not READ its target. This is the
 * other half: the adapter reads its target perfectly, and the CLAIM is simply
 * about something else. `file-exists` answers exactly one question — "is this
 * path present?" — so it can support "the ledger exists" and nothing more.
 *
 * Measured live: item 8 of AUDIT_2026-08-21.json claimed *"no **successful**
 * backup ledger has been produced"* with `file-exists` on
 * `portfolio/ops/pg-backups.ndjson`, expected:false. The file exists, so the
 * premise resolved CONTRADICTED — the verifier stating, with the authority of
 * evidence, that a successful backup ledger HAS been produced. The file holds
 * exactly one row: a 61-byte `r2-provider-smoke` object that was deleted again
 * (`deletedAfterProof: true`). Zero PostgreSQL backups have ever been written.
 * The thing falsely reported done is the disaster-recovery plane for seven
 * production databases, and a false "already fixed" is never revisited.
 *
 * The rule was already written down — in the `deploy-receipt` adapter comment
 * above, in the right words ("Using file-exists here instead would report
 * contradicted, which falsely claims we PROVED..."). Nothing made it binding,
 * so it held only for the one adapter whose author happened to think of it.
 */
/**
 * S305 [audit #5] · [SIL][S304 #2] — WHAT EACH ADAPTER CAN MEASURE, declared.
 *
 * S304 closed the claim/adapter gap with a token heuristic over the claim text
 * (OUTCOME_CLAIM_TOKENS below). That catches the outcome-on-existence shape it was
 * built for and, by its own admission, under-reports. This table is the other half:
 * a premise may carry an explicit `claims` kind, and then the check is a lookup —
 * the kind must be one the adapter measures — instead of a guess about English.
 * A new adapter ships guarded: the structural test refuses an adapter without a row.
 *
 *   presence  — the target exists / is registered
 *   content   — what the target contains (pattern / value)
 *   outcome   — the target worked / passed / is healthy
 *   count     — how many
 *   state     — a lifecycle state
 */
export const CLAIM_KINDS = Object.freeze(['presence', 'content', 'outcome', 'count', 'state']);
export const ADAPTER_MEASURES = Object.freeze({
  'doctor-probe':        Object.freeze(['presence', 'outcome']),
  'doctor-probe-absent': Object.freeze(['presence']),
  'doctor-blocking':     Object.freeze(['outcome', 'count']),
  'workflow-schedules':  Object.freeze(['count']),
  'tests':               Object.freeze(['outcome', 'count']),
  'file-exists':         Object.freeze(['presence']),
  'deploy-receipt':      Object.freeze(['presence', 'outcome']),
  'task-lifecycle':      Object.freeze(['state']),
  'file-content':        Object.freeze(['content']),
  'grep':                Object.freeze(['content']),
  'grep-count':          Object.freeze(['content', 'count']),
});
/** Adapters whose ONLY measure is presence — derived from the table, one source. */
export const EXISTENCE_ONLY_ADAPTERS = Object.freeze(
  Object.entries(ADAPTER_MEASURES).filter(([, m]) => m.length === 1 && m[0] === 'presence').map(([id]) => id),
);

/**
 * Tokens that assert an OUTCOME — that the subject worked, not that it is there.
 *
 * Calibrated against the live corpus (57 sidecars / 706 premises / 189 on an
 * existence-only adapter) rather than chosen by intuition. This list is
 * deliberately NARROW: it under-reports on purpose, and says so.
 */
export const OUTCOME_CLAIM_TOKENS = Object.freeze([
  'successful', 'succeeded', 'success',
  'passing', 'passed', 'green',
  'working', 'healthy', 'proven',
]);

/**
 * Tokens rejected from the vocabulary WITH THEIR EVIDENCE, so the next author
 * does not "improve" the lint by adding them back.
 *
 * `correct` was measured producing a false positive on a real premise —
 * "portfolio/ark/REVOCATIONS.ndjson exists (correct name)" is a genuine
 * existence claim, and `file-exists` measures it correctly. The rest are the
 * same grammatical class: adjectives that modify an IDENTITY ("the correct
 * file", "a valid path") at least as often as an outcome. A declared false
 * positive is better than a gated one.
 */
export const OUTCOME_TOKENS_EXCLUDED = Object.freeze({
  correct: 'measured false positive — "exists (correct name)" is an existence claim',
  valid: 'modifies identity ("a valid path") as often as outcome',
  verified: 'modifies identity ("the verified copy") as often as outcome',
  complete: 'ambiguous with "the complete set" — a cardinality claim, not an outcome',
  completed: 'ambiguous with "the completed list"',
  real: 'modifies identity ("the real file") as often as outcome',
});

/**
 * Does this premise's claim assert an outcome its adapter cannot measure?
 * Returns null when in scope, else { token, adapter, limit }.
 *
 * Whole-word matching, never substring: a substring rule would fire "success"
 * inside "successor" and "passed" inside "bypassed".
 */
export function claimScopeProblem(premise) {
  if (!premise) return null;
  // S305 — declared path: an explicit `claims` kind is a table lookup, no English involved.
  if (premise.claims != null) {
    const measures = ADAPTER_MEASURES[premise.adapter];
    if (!measures) return null; // unknown adapter is validatePremise's finding, not a scope finding
    if (!CLAIM_KINDS.includes(premise.claims)) {
      return { token: String(premise.claims), source: 'declared', adapter: premise.adapter, limit: `unknown claim kind — expected one of ${CLAIM_KINDS.join('/')}` };
    }
    if (!measures.includes(premise.claims)) {
      return { token: premise.claims, source: 'declared', adapter: premise.adapter, limit: `${premise.adapter} measures ${measures.join('/')} only` };
    }
    return null;
  }
  // derived path (S304): outcome words on an existence-only adapter.
  if (!EXISTENCE_ONLY_ADAPTERS.includes(premise.adapter)) return null;
  const words = new Set(String(premise.claim ?? '').toLowerCase().match(/[a-z]+/g) ?? []);
  const token = OUTCOME_CLAIM_TOKENS.find((t) => words.has(t));
  if (!token) return null;
  return {
    token,
    source: 'derived',
    adapter: premise.adapter,
    limit: premise.adapter === 'file-exists'
      ? 'file-exists can only answer whether the path is present'
      : 'doctor-probe-absent can only answer whether the probe id is registered',
  };
}

/** Validate a premise's shape. Returns an array of problems (empty = well-formed). */
export function validatePremise(premise) {
  const problems = [];
  if (!premise || typeof premise !== 'object') return ['premise is not an object'];
  if (!premise.claim) problems.push('missing claim');
  if (!premise.adapter) problems.push('missing adapter');
  // S284 [audit #1] — a deliberate refusal must not read like a typo.
  else if (premise.adapter in REFUSED_ADAPTERS) problems.push(`refused adapter: ${premise.adapter} — ${REFUSED_ADAPTERS[premise.adapter]}`);
  // S317 [audit #2] — name the INTENDED adapter, not just the legal set. Listing
  // eleven names told S316's author nothing about which of them `grep-content` was
  // trying to be, and the plan shipped with 23 unresolvable premises.
  else if (!(premise.adapter in ADAPTERS)) {
    const hint = ADAPTER_NEAR_MISSES[premise.adapter];
    problems.push(hint
      ? `unknown adapter: ${premise.adapter} — ${hint} (supported: ${Object.keys(ADAPTERS).join(', ')})`
      : `unknown adapter: ${premise.adapter} — supported: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  if (!premise.operator) problems.push('missing operator');
  else if (!(premise.operator in OPERATORS)) {
    const hint = OPERATOR_NEAR_MISSES[premise.operator];
    problems.push(hint
      ? `unknown operator: ${premise.operator} — ${hint} (supported: ${Object.keys(OPERATORS).join(', ')})`
      : `unknown operator: ${premise.operator} — supported: ${Object.keys(OPERATORS).join(', ')}`);
  }
  if (!('expected' in premise)) problems.push('missing expected');
  // S245 [audit R12] — file-content/grep premises are meaningless without a pattern.
  if (FILE_CONTENT_ADAPTERS.includes(premise.adapter) && !premise.pattern) problems.push(`missing pattern (required for ${FILE_CONTENT_ADAPTERS.join('/')})`);
  // S321 [audit #5] — refuse to WRITE a premise that cannot be true twice. Same
  // doctrine as S284's unreadable-adapter rejection: the author can still fix this,
  // and once committed the premise reads as verification while carrying none.
  const vol = volatileExpectation(premise);
  if (vol) {
    problems.push(VOLATILE_PROBLEM_PREFIX + (vol.kind === 'drifting-token'
      ? `\`${vol.field}\` pins the drifting measurement "${vol.token}" under \`${vol.operator}\` — it can be true once and never again; expect a stable field (pass/count/flag) or use a threshold operator`
      : `\`${vol.field}\` pins "${vol.token}" inside the free-prose \`${premise.metric}\` field under \`${vol.operator}\` — probe prose is rebuilt every run; assert a structured metric instead`));
  }
  return problems;
}

/**
 * Evaluate one premise against injected evidence.
 * @returns {{status:string, claim:string, actual:any, expected:any, reason:string}}
 */
export function evaluatePremise(premise, evidence = {}) {
  const allProblems = validatePremise(premise);
  // S321 [audit #5] — volatility is its OWN outcome, not a malformation and not a
  // disproof. Separate it before the malformed branch: a premise that is otherwise
  // well-formed and merely bound to a drifting number must resolve VOLATILE, while a
  // premise that is ALSO malformed stays UNVERIFIED (the stronger complaint wins).
  const volatileProblems = allProblems.filter((p) => p.startsWith(VOLATILE_PROBLEM_PREFIX));
  const problems = allProblems.filter((p) => !p.startsWith(VOLATILE_PROBLEM_PREFIX));
  if (!problems.length && volatileProblems.length) {
    return {
      status: STATUS.VOLATILE,
      claim: premise.claim,
      actual: null,
      expected: premise.expected,
      reason: volatileProblems[0].slice(VOLATILE_PROBLEM_PREFIX.length)
        + ' — carries no information either way, so it is neither verified nor disproven',
    };
  }
  if (problems.length) {
    // A malformed premise is unverifiable -- never silently true.
    return {
      status: STATUS.UNVERIFIED,
      claim: premise?.claim ?? '(malformed)',
      actual: null,
      expected: premise?.expected ?? null,
      reason: `malformed premise: ${problems.join('; ')}`,
    };
  }

  // S304 [audit #1] — the adapter can read its target; the CLAIM is about
  // something else. Resolve UNVERIFIED and NAME it, exactly as S303 did for a
  // target the adapter could not read. Coercing this to a verdict is how a
  // never-attempted backup plane came to read as proven-done.
  const scope = claimScopeProblem(premise);
  if (scope) {
    return {
      status: STATUS.UNVERIFIED,
      claim: premise.claim,
      actual: null,
      expected: premise.expected,
      scopeMismatch: scope,
      reason: scope.source === 'declared'
        ? `claim declares kind "${scope.token}" that ${scope.adapter} cannot measure — ${scope.limit}`
        : `claim asserts an outcome ("${scope.token}") that ${scope.adapter} cannot measure — ${scope.limit} (derived from claim text; declare \`claims\` to make this a lookup)`,
    };
  }

  const { found, actual } = ADAPTERS[premise.adapter](premise, evidence);
  if (!found) {
    return {
      status: STATUS.UNVERIFIED,
      claim: premise.claim,
      actual: null,
      expected: premise.expected,
      reason: `no evidence for ${premise.adapter}:${premise.target ?? '-'} — claim stays unproven`,
    };
  }

  const holds = OPERATORS[premise.operator](actual, premise.expected);
  return {
    status: holds ? STATUS.VERIFIED : STATUS.CONTRADICTED,
    claim: premise.claim,
    actual,
    expected: premise.expected,
    reason: holds
      ? `evidence supports the claim (${JSON.stringify(actual)} ${premise.operator} ${JSON.stringify(premise.expected)})`
      : `evidence DISPROVES the claim: actual ${JSON.stringify(actual)} fails ${premise.operator} ${JSON.stringify(premise.expected)}`,
  };
}

/** Evaluate every premise attached to audit items. */
export function evaluateAuditPremises(items = [], evidence = {}) {
  const results = [];
  for (const item of items) {
    for (const premise of item.premises ?? []) {
      results.push({ itemId: item.id, slug: item.slug, ...evaluatePremise(premise, evidence) });
    }
  }
  return results;
}

/**
 * Bounded, deterministic summary. Contradicted premises are the actionable signal —
 * but a contradiction on a SHIPPED item is the healthy case: the premise no longer
 * holds *because we fixed it*. Only an unshipped contradiction means the audit is stale.
 *
 * S263 — this read a shape the producer never emits. It looked for a PER-ITEM
 * `item.executionLog` whose entries carry `status: 'shipped'`; every real sidecar
 * puts `executionLog` at the TOP LEVEL with `shipped: true` (a boolean). So for
 * `AUDIT_2026-08-01.json` — all seven items shipped — every item resolved as
 * unshipped, both contradictions counted as OPEN, `trustworthy` went false, and the
 * startup brief rendered `⛔ Premises 4/6 · 2 OPEN-item decay` for a perfectly
 * healthy audit whose fixes had landed. Same paired-surface divergence as the rest
 * of this session: the consumer and the producer disagreed about the shape.
 * Accepts both shapes, and matches on id OR slug.
 */
export function auditItemResolved(item = {}, executionLog = null) {
  if (item.outcome || item.status === 'shipped') return true;
  const shipped = (entry) => entry?.shipped === true || entry?.status === 'shipped';
  if ((item.executionLog || []).some(shipped)) return true;
  if (!Array.isArray(executionLog)) return false;
  return executionLog.some((entry) =>
    shipped(entry) && ((entry.id && entry.id === item.id) || (entry.slug && entry.slug === item.slug)));
}

export function summarize(results = [], items = null, executionLog = null) {
  const by = (s) => results.filter((r) => r.status === s);
  const contradicted = by(STATUS.CONTRADICTED);
  const itemById = Array.isArray(items) ? new Map(items.map((item) => [item.id, item])) : null;
  const resolvedContradictions = itemById
    ? contradicted.filter((row) => auditItemResolved(itemById.get(row.itemId), executionLog))
    : [];
  const openContradictions = itemById
    ? contradicted.filter((row) => !auditItemResolved(itemById.get(row.itemId), executionLog))
    : contradicted;
  const unverified = by(STATUS.UNVERIFIED);
  // S368 [SIL][S368 #2] — an ABSENCE premise ("no X", expected false) on an item recorded as
  // SHIPPED that still verifies: shipping should have made the absence false. Either the premise
  // points at the wrong file (S368 #5/#8 grepped lib/ark.mjs; the code landed in new files) or
  // the work is not where the item says. Preconditions (expected true) are excluded — "the
  // capability map exists" is meant to stay true after shipping.
  const shippedAbsencePersists = itemById
    ? by(STATUS.VERIFIED)
      .filter((r) => r.expected === false && r.actual === false && auditItemResolved(itemById.get(r.itemId), executionLog))
      .map((r) => ({ itemId: r.itemId, slug: r.slug, claim: r.claim }))
    : [];
  // S284 [audit #1] — an audit nothing could READ used to be indistinguishable
  // from one nothing disproved: both reported trustworthy:true. Unverifiable
  // coverage is now a first-class number so "we checked and it held" cannot be
  // confused with "we could not check". It does NOT flip trustworthy — that word
  // means "nothing it asserts is disproven" and still does — but a caller can now
  // see, and a reader is now told, when the verdict rests on nothing.
  const unverifiableRate = results.length ? unverified.length / results.length : 0;
  return {
    total: results.length,
    verified: by(STATUS.VERIFIED).length,
    contradicted: contradicted.length,
    resolvedContradicted: resolvedContradictions.length,
    openContradicted: openContradictions.length,
    shippedAbsencePersists,
    unverified: unverified.length,
    // S321 [audit #5] — counted in its own column. Folding it into `unverified`
    // would say "we could not check this", which is wrong: we CAN check it, and the
    // check is worthless. The author is the one who has to act, so the count has to
    // reach them separately from the ones a missing file caused.
    volatile: by(STATUS.VOLATILE).length,
    volatilePremises: by(STATUS.VOLATILE).map((r) => ({
      itemId: r.itemId, slug: r.slug, claim: r.claim, reason: r.reason,
    })),
    unverifiableRate: +unverifiableRate.toFixed(3),
    // True when NO premise could be resolved at all: the audit proved nothing.
    unverifiable: results.length > 0 && unverified.length === results.length,
    // An audit is trustworthy only if nothing it asserts is disproven.
    trustworthy: openContradictions.length === 0,
    contradictions: contradicted.map((r) => ({
      itemId: r.itemId, slug: r.slug, claim: r.claim, reason: r.reason,
    })),
    openContradictions: openContradictions.map((r) => ({
      itemId: r.itemId, slug: r.slug, claim: r.claim, reason: r.reason,
    })),
  };
}

/**
 * S317 [audit #2] — name the DOMINANT reason premises did not resolve.
 *
 * "0 of 23 resolved" is a count, and a count motivates the wrong repair unless the
 * cause travels with it. The three causes need different fixes and must not be
 * collapsed: untyped prose needs the premises rewritten as objects; a phantom
 * adapter needs one rename per premise; an unreadable target needs the path fixed.
 * Returns null when everything resolved, so the caller can tell "no cause" from
 * "cause unknown".
 */
export function unresolvedCause(results = []) {
  const unresolved = results.filter((r) => r.status === 'unverified');
  if (!unresolved.length) return null;
  const reasons = unresolved.map((r) => String(r.reason ?? ''));
  const tally = {
    'phantom-adapter': reasons.filter((r) => /unknown adapter|refused adapter/i.test(r)).length,
    'untyped-prose': reasons.filter((r) => /not an object|missing adapter|missing claim/i.test(r)).length,
    'bad-operator': reasons.filter((r) => /unknown operator|missing operator|missing expected/i.test(r)).length,
    'unreadable-target': reasons.filter((r) => /no evidence|directory|could not read|not found/i.test(r)).length,
  };
  const [cause, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  if (!n) return { cause: 'unknown', count: unresolved.length, note: 'unresolved for a reason this summary does not classify — read the per-premise reasons' };
  const note = {
    'phantom-adapter': 'premises are typed but name adapters that do not exist — rename them, do not rewrite them',
    'untyped-prose': 'premises are prose, not typed claims',
    'bad-operator': 'premises are typed and aimed correctly but carry an unsupported operator or no expected value',
    'unreadable-target': 'premises are well-formed but their targets could not be read',
  }[cause];
  return { cause, count: n, ofUnresolved: unresolved.length, note };
}
