#!/usr/bin/env node
/**
 * S94: bound the visual-QA capture archive.
 *
 * Measured at S94: 821 PNGs, 104.9 MB, every one tracked, in a PUBLIC
 * repository whose entire pack was 43.8 MB. It grows every session that touches
 * a visual surface — S87 through S93 contributed 84 captures each — so every
 * clone and every CI checkout pays, forever, for ninety sessions of
 * attachments.
 *
 * The distinction that makes this safe: the RECEIPT is the audit trail and the
 * PNG is its human-readable attachment. `write-visual-qa-receipt.mjs` already
 * records a sha256 per capture, and PROJECT_STATUS.releaseAuthority binds a
 * visual receipt digest to an exact source revision. What proves what was
 * reviewed is the hash; the image is what a person looks at while reviewing.
 * Hashes are tiny and are kept forever. Images are large and are kept for the
 * window in which someone might actually re-open one.
 *
 * History is deliberately NOT rewritten. Rewriting a public repository's history
 * is a separate, explicitly-approved operation; the recurring cost stops the
 * moment new captures stop accumulating, which is what this enforces.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captureDir = path.join(rootDir, "docs", "visual-qa");

// Sessions of captures kept in the working tree. Three covers the current
// candidate plus the two it would be compared against in a regression review.
export const RETAINED_CAPTURE_SESSIONS = 3;

const SESSION_PREFIX = /^s(\d+)-/i;

export function groupCapturesBySession(names) {
  const bySession = new Map();
  const unversioned = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".png")) continue;
    const match = name.match(SESSION_PREFIX);
    if (!match) {
      unversioned.push(name);
      continue;
    }
    const session = Number(match[1]);
    if (!bySession.has(session)) bySession.set(session, []);
    bySession.get(session).push(name);
  }
  return { bySession, unversioned };
}

export function planRetention(names, retain = RETAINED_CAPTURE_SESSIONS) {
  const { bySession, unversioned } = groupCapturesBySession(names);
  const sessions = [...bySession.keys()].sort((a, b) => b - a);
  const keptSessions = sessions.slice(0, retain);
  const prunedSessions = sessions.slice(retain);
  return {
    sessions,
    keptSessions,
    prunedSessions,
    keep: keptSessions.flatMap((session) => bySession.get(session)),
    // An unversioned capture cannot be aged, so it is never pruned by a rule
    // that does not understand it. Silent removal of something the rule cannot
    // classify is how retention policies eat evidence.
    unversioned,
    prune: prunedSessions.flatMap((session) => bySession.get(session))
  };
}

export function inspectRetention({ root = rootDir, retain = RETAINED_CAPTURE_SESSIONS } = {}) {
  const dir = path.join(root, "docs", "visual-qa");
  if (!fs.existsSync(dir)) return { ok: true, problems: [], plan: null };
  const names = fs.readdirSync(dir);
  const plan = planRetention(names, retain);
  const problems = plan.prune.length
    ? [
        `docs/visual-qa retains captures from ${plan.sessions.length} sessions; the window is ${retain}. ` +
        `${plan.prune.length} capture(s) from session(s) ${plan.prunedSessions.join(", ")} are past it — ` +
        "run `node scripts/visual-qa-retention.mjs --apply`. Their receipt hashes are unaffected."
      ]
    : [];
  return { ok: problems.length === 0, problems, plan };
}

export const CAPTURE_LEDGER = "CAPTURE_LEDGER.json";

/**
 * Write the hash ledger that makes pruning safe.
 *
 * This existed only in intention. `docs/visual-qa/LATEST.json` carries a
 * sha256 per capture for the CURRENT session and nothing else — checked at S94:
 * 84 capture names, all from session 93, out of 821 files on disk. So the
 * "receipts are the audit trail, images are the attachment" argument was true
 * of one session and false of the other twenty-three, and pruning without
 * fixing that would have destroyed the only record those reviews ever had.
 *
 * The ledger is append-only and idempotent: a capture already recorded keeps
 * its original entry, so re-running after a prune never loses a hash.
 */
export function writeCaptureLedger({ root = rootDir } = {}) {
  const dir = path.join(root, "docs", "visual-qa");
  const ledgerPath = path.join(dir, CAPTURE_LEDGER);
  const existing = fs.existsSync(ledgerPath)
    ? JSON.parse(fs.readFileSync(ledgerPath, "utf8"))
    : { schemaVersion: "1.0", note: "", captures: {} };
  existing.note =
    "sha256 per visual-QA capture. The hash is the durable audit trail; the PNG is its " +
    "human-readable attachment and is retained only for a bounded window " +
    "(scripts/visual-qa-retention.mjs). Append-only: an entry is never rewritten or removed, " +
    "so a capture pruned from the working tree remains provable.";
  let added = 0;
  let revised = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".png")) continue;
    const buffer = fs.readFileSync(path.join(dir, name));
    const digest = crypto.createHash("sha256").update(buffer).digest("hex");
    const prior = existing.captures[name];
    // Keying on filename alone would let a capture regenerated under the SAME
    // name keep a stale digest forever, which quietly voids the "every capture
    // remains provable" guarantee this whole prune rests on. The unversioned
    // captures are both the ones re-baselined in place and the ones the policy
    // never prunes, so they are exactly where it would bite. Verify on match;
    // when the bytes have genuinely changed, keep the superseded digest rather
    // than overwriting the record of what was reviewed before.
    if (prior?.sha256 === digest) continue;
    const session = name.match(SESSION_PREFIX);
    existing.captures[name] = {
      sha256: digest,
      bytes: buffer.length,
      session: session ? Number(session[1]) : null,
      ...(prior && prior.sha256 !== digest
        ? { supersededSha256: [...(prior.supersededSha256 || []), prior.sha256] }
        : {})
    };
    if (prior) revised += 1;
    else added += 1;
  }
  const ordered = Object.fromEntries(Object.entries(existing.captures).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(ledgerPath, `${JSON.stringify({ ...existing, captures: ordered }, null, 2)}
`, "utf8");
  return { added, revised, total: Object.keys(ordered).length, ledgerPath: path.relative(root, ledgerPath) };
}

function bytesOf(dir, names) {
  return names.reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0);
}

function main(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const report = inspectRetention();
  if (!report.plan) {
    console.log("docs/visual-qa is absent; nothing to do.");
    return;
  }
  const { plan } = report;
  const before = bytesOf(captureDir, [...plan.keep, ...plan.prune, ...plan.unversioned]);
  const freed = bytesOf(captureDir, plan.prune);

  console.log(`Visual QA retention · keeping ${RETAINED_CAPTURE_SESSIONS} session(s): ${plan.keptSessions.join(", ") || "none"}`);
  console.log(`  captures: ${plan.keep.length} kept · ${plan.prune.length} past the window · ${plan.unversioned.length} unversioned (never auto-pruned)`);
  console.log(`  bytes:    ${(before / 1024 / 1024).toFixed(1)} MB → ${((before - freed) / 1024 / 1024).toFixed(1)} MB`);
  if (plan.prunedSessions.length) {
    console.log(`  sessions past the window: ${plan.prunedSessions.join(", ")}`);
  }
  if (!apply) {
    console.log("Dry run. Pass --apply to record hashes and remove the captures past the window.");
    process.exitCode = plan.prune.length ? 1 : 0;
    return;
  }
  // Hashes first, always. A capture may only leave the working tree after its
  // hash is durable — otherwise retention is deletion wearing a policy.
  const ledger = writeCaptureLedger();
  console.log(`  ledger:   ${ledger.total} capture hashes recorded (${ledger.added} new, ${ledger.revised} re-baselined) in ${ledger.ledgerPath}`);
  for (const name of plan.prune) {
    if (!ledger.total) throw new Error("refusing to prune without a capture ledger");
    fs.rmSync(path.join(captureDir, name));
  }
  console.log(`Removed ${plan.prune.length} capture(s); every one remains provable by hash.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
