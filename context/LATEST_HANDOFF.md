# Latest Handoff — Session 105 → Session 106

> **Keep this heading shape.** Since S105 it is committed session authority: `parseHandoffCloseoutAuthority` reads the left-hand session, and `test/session-authority.test.js` fails if the live handoff and the newest SIL entry disagree.

## Where We Left Off

S105 was a clean start, not a recovery. F7 flagged `ccf68c2` as write-back debt; that commit is S104's own post-closeout handoff edit, the known closeout-order false positive, and every core surface was current through S104.

**The finding: the startup brief was reading three surfaces nothing writes.** S104 found one instance of the shape — `lastSessionSummary` had a detector and no writer. S105 read every derived row of the rendered brief and found three more.

1. **The handoff was never a session authority.** `resolveSessionAuthority` takes the monotonic maximum of SIL, status and handoff and reports divergence when they disagree. Its handoff parser knew only `# Session N Closeout`, and `brief-semantic-fingerprint` carried its own literal for `Where We Left Off (Session N)`. This project has headed every handoff `# Latest Handoff — Session N → Session N+1` since at least S96; **none of twelve committed handoffs matched either pattern**, so the brief rendered `handoff=S?` for the project's whole recorded history and a handoff lagging SIL could never have been detected.
2. **The SIL rolling-status header had no writer.** It read `Last session: 100` through S104 and had never carried `Intent rate:`, so the brief showed `Intent: ?%` beside five consecutive `Achieved` entries.
3. **The PROJECT PROFILE row reads a 30-minute TTL cache** that only studio-ops' `project-profile.mjs` writes. The brief is rendered at closeout, so the row is structurally `refresh required`, and nothing in this repo can refresh it.

## What shipped

- **Handoff authority.** The shared parser reads this project's heading (left-hand session only — the right side is the next session's intent and never counts), the fingerprint routes through the same parser so the heading is declared once, and a test binds the *live* handoff to the newest SIL entry with a negative control reproducing the pre-S105 pattern. Brief: `session-authority: committed=S104 · SIL=S104 · status=S104 · handoff=S104; divergent=false`.
- **`scripts/render-sil-rolling-status.mjs`** derives the rolling-status block from the live SIL and its archive: last session, total, delta, 3/5/10/25/all averages, sparkline on a fixed 900–1000 scale, and intent rate (denominator = entries that record an outcome). `Velocity` and `Debt` are not derivable and are carried, labelled as carried. **The derived figures differ from the hand-written ones and ship as derived:** Avg3 959.7 against 974.7, and 58 unique `/1000` sessions against a claimed 87 the entries cannot reproduce. The block names the count it read.
- **Open premise decay across the whole audit history now fails the studio shard.** `test/session105-brief-authority-writers.test.js` walks every `docs/AUDIT_*.json` through `checkAudit` with a fixture negative control. **On its first run it went red on this session's own sidecar**, whose shipped items were still marked `planned` — resolved by recording the evidence, not by exempting the current audit.
- **The `brief-preflight` importer question is closed** (DECISIONS S105-4): the renderer cannot import it by contract. Do not re-open it.
- **PROJECT PROFILE row** shipped to studio-ops as Ark `pattern-share` cargo `01K291HHVU080E58C015E99770`, with the handoff-parser fix flagged for upstreaming so propagation does not revert it.

## Elite density, re-derived under the S104 roster shape

S104 asked for this before anyone proposed a cost. Canonical seed 20260306, ten seasons, `runRealismVerification` (the path `realism-career-regression` asserts on):

```
active-roster 90+ share   0.4% -> 2.8%    watch   (ceiling 1.53 · watch line 5.19)
  S103, pre-S104 shape              3.3%
dispersion drift          0.095/season    watch   (S104 measured 0.095)
parity mean drift         +0.043/season   on-target (S104 measured +0.044)
```

The two reproduced readings match S104 to the third decimal, so the run is trustworthy. Removing the composition driver took about half a point off the elite share and did not close it.

**Where the residual elite cohort actually sits** — a probe reproducing `runRealismVerification`'s clone path exactly (its end share, 2.79%, equals the gated 2.8%, which is the check that it measured the same league):

```
active roster, end of window    47 elite of 1,685
  QB room        11 of  95   11.6%
  offensive line 19 of 311    6.1%
  every other room combined  17 of 1,279   1.3%
QB + OL: 24% of the active roster, 64% of its elite
```

- **S104 fixed how many quarterbacks a club carries, not how highly a quarterback rates.** The QB room's 90+ share is 11.6% — the same 11.3% S103 measured before S104 bounded the room. The room is 95 players instead of 195, so the *count* halved; the *rate* did not move.
- **The measured mechanism candidate is at generation, not in development.** A generated league's offensive line has mean overall **82.1 against mean potential 79.8**, and its quarterbacks **82.7 against 80.9** — the only two rooms generated *above* their own potential; every other room starts below it. All nine elite players in a freshly generated league are already above their own potential (mean gap −9.2). So the position-blind 90+ cut is dominated by the two rooms whose overall scale starts highest, from season zero.
- **And the anchor it is compared against is allocated per position.** First-Team All-Pro seats are a fixed per-position roster; a position-blind share compared with a per-position honor is the same "population a gate declares" question S102–S104 settled for the parity gate, in a new place.

**Neither the statistic nor the generator was changed this session**, deliberately: changing either is its own decision with the question stated first (S103's discipline), and this reading is one seed. Next session: take this decomposition across two more seeds, then decide between (a) the OL/QB overall scale being generated above its own potential — a generator defect with a measurable signature — and (b) a per-position elite reading against a per-position anchor. Do not do (b) as a way to turn the gate green.

## Next work

- **Run `node scripts/render-sil-rolling-status.mjs --write` after appending every SIL entry.** The studio shard fails otherwise — that is the point.
- **Elite density: do not ship a cost without a measured mechanism.** S102's age-indexed decline was already built and refused on a matched control in S103. What is known now is in the section above; take the next step from there, not from an inherited diagnosis.
- **Do not close the dispersion arm by widening `stdDevDrift*`.** It reads the S91 random walk it was built to find (S104 DECISIONS 3).
- **Do not re-point the parity population** (S104 handoff; unchanged).
- **`render-startup-brief.mjs` prints its session-authority line from the status it read *before* self-healing it.** At S105 closeout the first render healed `currentSession` 104 → 105 (line 1136) and, in the same run, emitted `status=S104 … divergent=true`; a second render read the healed value and emitted `divergent=false`. The value on disk was right both times; only the rendered line lagged by one render. Harmless today because the brief is always re-rendered, but it is the renderer contradicting itself — recompute `resolveSessionAuthority` after the heal. Not fixed at S105 because the canonical suite was already running against the committed code. It was only visible because the handoff is now a third authority: before S105 a status lag against SIL alone could not produce this line.
- **This session's `context/.session-lock` was deleted mid-session by something outside this repo — cause unexplained.** It was written at `/start` and found missing about forty minutes later, just after the canonical suite launched. Nothing in this repo deletes it: every hit under `scripts/` is a reader or `write-session-lock.mjs` itself, and the two tests that write a lock do so only in temp fixtures. The only studio-ops code that unlinks a lock is `closeout-autopilot.mjs:1839`, which resolves `LOCK_PATH` from `--project` relative to its working directory — so it reaches this repo only when something runs it with `--project` pointing here. A second Claude session was live on this machine at the time; its arguments could not be recovered after the fact, so this is recorded as unexplained rather than attributed. The lock was rewritten with the same writer. **Side effect worth knowing:** the rewrite reads `session_id: 106`, because the writer derives the id from committed authority and S105's record had already closed; the lock is transient and gitignored, and closeout clears it.
- **`doctor-remedies.mjs` maps `last-session-summary` to `check-last-session-summary.mjs --fix`, a file this project forbids.** A remedy that names a forbidden writer is wrong here; not changed this session because `doctor-remedies` is propagated — raise it with studio-ops alongside the S105 cargo if it matters.
- The authoritative registry still reads `sparked` against a local contract of FORGE; do **not** flip the local contract (three lifecycle checks would become silent auto-passes).
- Delivered/reply-capable project-domain email, candidate-bound public-launch approval, and authoritative lifecycle reconciliation remain independent launch evidence. Public launch remains **HOLD**.

## Verification boundaries

The elite, dispersion and parity figures are one seed over ten seasons. Cross-seed readings were not taken this session. SIL scores are engineering assessments, not measured player outcomes; no real-cohort evidence exists and none was manufactured.

## Receipts

**Canonical Node receipt: 1,457/1,457 across six shards** — core 245, runtime 817, sim-contract 83, sim-realism 1, long 5, studio 306 (up from 1,446/1,446 in S104, +11 tests).

**The studio shard is an explicit re-run, and here is exactly why.** The full `npm test` finished 1,450/1,452: every behaviour shard green on its first pass, and **two self-caused studio reds**, both in this session's own record-keeping. Both were fixed at source and the shard re-run green at 306/306. Neither was flaky, sibling drift, or force-greened. Nothing under `src/` or `public/` changed after the full run — the later commits are scripts, tests and context — so the behaviour shards' counts stand against the shipped source.

1. **`the committed SIL rolling-status block is a current projection of the committed entries`** — this session's own new gate, red on **byte-identical text**. The SIL is CRLF in this working copy and LF once git normalises it, so an editor re-saving the file after `--write` flipped the block's line endings and a terminator-sensitive comparison went red locally while it would have stayed green in CI. Fixed at source: the comparison normalises line endings, with a CRLF regression test and a negative control reproducing the pre-fix comparison. Re-running `--write` would have masked it until the next save.
2. **`no live context ledger has grown back into an archive`** — `DECISIONS.md` reached the 96 KB ceiling with this session's entries. **Running the gate's own prescribed remedy (`ledger-roll.mjs --apply`) then caused a far worse problem, and finding it is the most valuable thing this session did.**

### The ledger roll moved the wrong end, and took this session's record with it

`ledger-roll.mjs` declared *"Ledgers are newest-first here, so the retained window is a prefix"* and kept the first ten matching entries. That is true of `CURRENT_STATE.md` only. `DECISIONS.md`, `TRUTH_AUDIT.md` and `SELF_IMPROVEMENT_LOOP.md` are append-only with the **newest entry last**. Applied, it archived the newest sections and kept the oldest: the live SIL was left holding sessions **85–98 with zero intent lines**, and S105's own decisions, truth-audit section and SIL entry were all moved into archives.

A second, independent defect made it much wider than "ten entries": the `DECISIONS`/`TRUTH_AUDIT` patterns required `— Session N`, while every heading since S100 reads `— S105 —`. Those never matched, so the cut landed at the eleventh *old-style* entry and **every modern section below it moved as one contiguous block**.

- **Reversal was exact, not reconstructed.** The archives had not been edited this session, so their committed copies are the pre-roll state; the moved block is the current archive minus its committed body, asserted rather than assumed (the script refuses to write if the current body does not end with the committed one). `git checkout` was **not** used on the live ledgers — that would have discarded this session's own uncommitted work.
- **Both defects fixed at source:** each ledger declares its `order`, the retained window is a prefix for newest-first and a suffix for newest-last, the file header stays live, the archived block is appended at the correct end, the pointer stays at EOF (a pointer written mid-file would make the next roll delete everything beneath it), and the patterns match both heading eras.
- **Guarded by three tests with a negative control** reproducing the inversion exactly, plus a direct invariant: every live ledger still holds this session's own entry after any roll. The re-roll then archived the **oldest** 38/12/12 entries and took the ledgers 286 KB → 147 KB with S105 intact in all three.

Other gates green at the final tree: `check-audit-premises` 6 verified · 0 open decay across the sidecar corpus · `validate-brief-format` conformant · `session-authority` binding the live handoff to the newest SIL entry · SIL rolling-status current.
