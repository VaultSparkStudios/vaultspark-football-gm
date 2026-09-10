#!/usr/bin/env node
/**
 * Verify the latest audit sidecar's typed premises against live code.
 *
 * S104 — `scripts/lib/brief-preflight.mjs` has spawned this file since the
 * premise-decay step was propagated here, and **the file did not exist**. The
 * spawn sits inside `try { … } catch { /* non-fatal *\/ }`, so a missing script
 * and a clean run are the same observation from outside: no `.cache/audit-
 * premise-decay.json` was ever written, the brief's SIGNALS row never appeared,
 * and nothing said so. Counted before this session: **82 audit sidecars in
 * `docs/`, 340 ranked items, of which 7 declare typed `premises` — 18
 * assertions in total, and not one had ever been checked against the code it
 * describes.**
 *
 * The spawn could not have run in any case: that same preflight *statically*
 * imports `../check-last-session-summary.mjs`, a path this project's
 * `context/PROJECT_AUTHORITY_CONTRACT.json` names under `forbiddenFiles`. The
 * module is un-importable here **by design**, so this checker is written to
 * stand on its own — it runs from the CLI and from the studio shard, and does
 * not depend on that caller ever being revived.
 *
 * That is this project's own recurring failure with the sign flipped: a gate
 * that cannot fail is indistinguishable from a gate that passes. The step is
 * *correct* to be advisory — a stale audit must not block a brief render — but
 * advisory has to mean "reports a problem without blocking", not "reports
 * nothing".
 *
 * ## What a premise means, and why status decides the verdict
 *
 * A premise asserts the **problem state**: the condition that made the item
 * worth ranking. So once the item ships, its premises legitimately flip to
 * contradicted — that is confirmation the fix landed, not decay. Real decay is
 * a contradicted premise on an item **nobody has acted on yet**: the plan went
 * stale before anyone worked from it, and whoever picks it up next would
 * implement a fix for a defect that is already gone.
 *
 * `brief-preflight` already encodes exactly this reading (see its comment at
 * the spawn site) and consumes `openContradicted`. This emits it.
 *
 * ## Vocabulary
 *
 * Completion vocabulary is NOT redeclared here. `isAuditComplete` is the shared
 * normalizer S100 built precisely because three readers had drifted apart on
 * it, and a fourth copy would be the same defect a fourth time. The one thing
 * this file adds is deliberate and narrow: `deferred` and `rejected` are not
 * *completions*, but they are **outcomes** — somebody looked at the item and
 * decided. A premise that flips under a deferral is not a stale plan either.
 * That distinction is declared once, below, and named.
 *
 * Usage:
 *   node scripts/check-audit-premises.mjs [--json] [--input <path>] [--strict]
 *
 * Exits 0 by default even when premises are contradicted — the caller is a
 * brief renderer that must not be blocked. `--strict` exits 1 on open decay,
 * for a caller that wants it as a gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findAuditSidecar } from "./render-audit-md.mjs";
import { isAuditComplete } from "./lib/audit-completion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Statuses that mean "someone acted on this item", which is a wider set than
 * "someone completed it". Kept as an explicit delta on the shared vocabulary
 * rather than as a second list of completions.
 */
const DECIDED_WITHOUT_COMPLETING = new Set(["deferred", "rejected", "skipped", "withdrawn"]);

export function hasOutcome(status) {
  if (isAuditComplete(status)) return true;
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
  if (DECIDED_WITHOUT_COMPLETING.has(normalized)) return true;
  // `shipped-corrected`, `shipped-reduced`, `skipped-premise-corrected` — the
  // hyphenated statuses this project has actually used. The prefix carries the
  // decision; the suffix is commentary on it.
  const [head] = normalized.split("-");
  return isAuditComplete(head) || DECIDED_WITHOUT_COMPLETING.has(head);
}

function readTarget(root, target) {
  const resolved = path.resolve(root, String(target || ""));
  // A premise may only read inside the repo. A sidecar is a checked-in document
  // and this runs unattended from a brief render, so `../../..` is not a path
  // this should follow.
  if (!resolved.startsWith(root + path.sep)) return { ok: false, reason: "target escapes the repository" };
  if (!fs.existsSync(resolved)) return { ok: false, reason: "target does not exist", exists: false };
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return { ok: false, reason: "target is not a file", exists: true };
  return { ok: true, exists: true, content: fs.readFileSync(resolved, "utf8") };
}

/**
 * Evaluate one premise to a boolean observation, or to `null` when it cannot be
 * observed at all.
 *
 * `null` is a third outcome on purpose. A premise whose target was renamed is
 * neither verified nor contradicted — collapsing it into either one would let a
 * deleted file read as "the defect is fixed", which is the shape of false
 * confidence this whole file exists to remove.
 */
export function observePremise(premise, root = ROOT) {
  const adapter = String(premise?.adapter || "").trim().toLowerCase();
  if (adapter === "file-exists") {
    const resolved = path.resolve(root, String(premise?.target || ""));
    if (!resolved.startsWith(root + path.sep)) return { observed: null, reason: "target escapes the repository" };
    return { observed: fs.existsSync(resolved) };
  }
  if (adapter === "grep" || adapter === "file-content") {
    const read = readTarget(root, premise?.target);
    if (!read.ok) return { observed: null, reason: read.reason };
    const pattern = String(premise?.pattern ?? "");
    if (!pattern) return { observed: null, reason: "premise declares no pattern" };
    if (adapter === "file-content") return { observed: read.content.includes(pattern) };
    let expression;
    try {
      expression = new RegExp(pattern, "m");
    } catch (error) {
      return { observed: null, reason: `pattern is not a valid regular expression: ${error.message}` };
    }
    return { observed: expression.test(read.content) };
  }
  return { observed: null, reason: `unknown adapter "${premise?.adapter ?? ""}"` };
}

/**
 * `expected` is a boolean in every sidecar this project has written — the
 * historical shape is `{ adapter: "grep", operator: "eq", expected: true }`,
 * meaning "the pattern is present". S100's one `file-content`/`contains`
 * premise wrote the pattern itself into `expected`, so a string that equals the
 * pattern is read as `true` rather than rejected: the sidecars are checked-in
 * history and cannot be rewritten to suit a reader added afterwards.
 */
export function expectedBoolean(premise) {
  const expected = premise?.expected;
  if (typeof expected === "boolean") return expected;
  if (typeof expected === "string") {
    const normalized = expected.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    if (expected === premise?.pattern) return true;
  }
  return null;
}

export function checkAudit(audit, root = ROOT) {
  const results = [];
  for (const item of audit?.items || []) {
    const outcome = hasOutcome(item?.status);
    for (const premise of item?.premises || []) {
      const { observed, reason } = observePremise(premise, root);
      const expected = expectedBoolean(premise);
      // Every adapter reduces to a boolean observation, so the operator only
      // has to say whether the comparison is direct or inverted. `contains` is
      // accepted because S100 wrote one, and rejecting a premise this project
      // actually shipped would make its own history unverifiable.
      const operator = String(premise?.operator || "eq").trim().toLowerCase();
      const inverted = operator === "ne" || operator === "not-contains";
      const supported = inverted || operator === "eq" || operator === "contains";
      let verdict;
      if (observed === null) verdict = "unverified";
      else if (expected === null) verdict = "unverified";
      else if (!supported) verdict = "unverified";
      else verdict = observed === (inverted ? !expected : expected) ? "verified" : "contradicted";
      results.push({
        slug: item?.slug || null,
        status: item?.status || null,
        hasOutcome: outcome,
        claim: premise?.claim || null,
        target: premise?.target || null,
        adapter: premise?.adapter || null,
        expected,
        observed,
        verdict,
        reason: verdict === "unverified" ? reason || `unsupported operator "${premise?.operator ?? ""}"` : undefined
      });
    }
  }
  const count = (predicate) => results.filter(predicate).length;
  const contradicted = results.filter((row) => row.verdict === "contradicted");
  return {
    premises: results,
    verified: count((row) => row.verdict === "verified"),
    contradicted: contradicted.length,
    // A contradicted premise on an item somebody already decided is the fix
    // being confirmed. Only the other kind is decay.
    resolvedContradicted: contradicted.filter((row) => row.hasOutcome).length,
    openContradicted: contradicted.filter((row) => !row.hasOutcome).length,
    unverified: count((row) => row.verdict === "unverified")
  };
}

export function runCheck({ root = ROOT, input = null } = {}) {
  const file = findAuditSidecar(root, { input });
  const audit = JSON.parse(fs.readFileSync(file, "utf8"));
  return { audit: path.relative(root, file).split(path.sep).join("/"), session: audit?.session ?? null, ...checkAudit(audit, root) };
}

function main(argv) {
  const args = argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const report = runCheck({ input: inputIndex >= 0 ? args[inputIndex + 1] : null });
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${report.audit}: ${report.verified} verified · ${report.contradicted} contradicted ` +
        `(${report.resolvedContradicted} confirming a shipped fix, ${report.openContradicted} open decay) · ` +
        `${report.unverified} unverified\n`
    );
    for (const row of report.premises.filter((entry) => entry.verdict !== "verified")) {
      const note = row.verdict === "contradicted" && row.hasOutcome ? "resolved" : row.reason || "OPEN DECAY";
      process.stdout.write(`  ${row.verdict.padEnd(12)} ${String(row.slug)} — ${row.target} (${note})\n`);
    }
  }
  // Advisory by default: the caller is a brief render that must never be blocked
  // by a stale plan. `--strict` is for a caller that wants this as a gate.
  return args.includes("--strict") && report.openContradicted > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.exitCode = main(process.argv);
}
