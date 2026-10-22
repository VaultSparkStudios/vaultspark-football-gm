// argv-guard.mjs — fail-closed argument parsing for outward-facing scripts.
//
// D-S272.7. `ark-notary.mjs` accepts `--dry-run`. It was invoked as `--dry`,
// which it did not recognise, so the flag was silently ignored and the script
// took its REAL path: 54 canon-update cargo broadcast to every repo by an
// invocation whose author believed it was a preview.
//
// The bug is not the typo. The bug is that an unrecognised flag fell through to
// the destructive default. Any script whose no-flag behaviour reaches outside
// this process — broadcast, publish, deploy, dispatch, cross-repo write — must
// refuse to run on input it does not understand, rather than guessing.
//
// Usage:
//   import { parseArgvStrict } from './lib/argv-guard.mjs';
//   const { flags, values, dry, bad } = parseArgvStrict({
//     name: 'deploy-thing',
//     boolFlags: ['--force', '--json'],
//     valueFlags: ['--target'],
//   });
//   if (bad.length) process.exit(2);   // helper below prints + exits for you

/** Aliases every outward-facing script should accept for "show me, don't do it". */
export const DRY_ALIASES = ['--dry-run', '--dry', '-n', '--check'];

export const HELP_ALIASES = ['--help', '-h', '-?', '/?'];

/**
 * S282 [SIL S281 #1] — invert the default: the outward action requires an
 * explicit affirmative flag, so a bare run, a typo and a usage query are all
 * inert. The failure mode becomes "nothing happened" instead of "the fleet
 * changed".
 *
 * D-S281.2 is the reason this landed a session later than the help guard:
 * flipping a default silently disarms any caller that relied on the old one,
 * and a safety fix whose failure mode is silent inaction is worse than the
 * default it replaces. Every in-repo caller was updated in the same change.
 *
 * `--dry-run` and friends remain honoured so existing preview callers keep
 * working unchanged; they were already asking for the safe path.
 *
 * @returns {{ apply: boolean, dry: boolean }} dry is true unless --apply was
 *          given AND no dry alias was passed.
 */
export function affirmativeGate({ argv = process.argv.slice(2) } = {}) {
  const apply = argv.includes('--apply');
  const dry = !apply || argv.some((a) => DRY_ALIASES.includes(a));
  return { apply, dry };
}

/**
 * S281 — the sharpest form of the S273 dangerous-default class.
 *
 * A `--help` that FIRES the action is the worst possible default, because it is
 * the one flag a person reaches for precisely BECAUSE they do not yet know what
 * the script does. Ten outward-facing scripts in this repo handled no help flag
 * at all, so `node scripts/ark-harbormaster.mjs --help` broadcast cargo.
 *
 * Deliberately narrower than parseArgvStrict: this changes nothing about a
 * script's real invocation path, so it is safe to apply to scripts whose
 * defaults live automation already depends on. Inverting THOSE defaults is a
 * separate, caller-coordinated change.
 *
 * Call it as the first statement after argv is available:
 *   helpGuard({ name: 'ark-harbormaster', usage: '...', outward: 'ships cargo' });
 */
export function helpGuard({ name, usage = '', outward = '', argv = process.argv.slice(2), exit = true } = {}) {
  if (!argv.some((a) => HELP_ALIASES.includes(a))) return false;
  console.log(`${name} — ${outward || 'outward-facing script'}`);
  // "Usage:" is the label portfolio/CLI_NO_WRITE_CONTRACTS.json's no-write-help
  // contract asserts on, so the guard emits the shape the existing registry
  // already checks rather than inventing a second convention (CANON-039).
  if (usage) console.log(`\nUsage:\n  ${usage}`);
  console.log('\nNo action taken (--help is inert by design · D-S281.1).');
  if (exit) process.exit(0);
  return true;
}

/**
 * Strict parse. Unknown flags are RETURNED, never ignored — the caller decides,
 * but `reportAndExit` makes refusing the default.
 *
 * @param {string[]} argv        defaults to process.argv.slice(2)
 * @param {string[]} boolFlags   extra boolean flags this script accepts
 * @param {string[]} valueFlags  flags that consume the following token
 * @param {boolean}  allowDry    accept the DRY_ALIASES set (default true)
 */
export function parseArgvStrict({
  argv = process.argv.slice(2),
  boolFlags = [],
  valueFlags = [],
  allowDry = true,
  name = 'script',
} = {}) {
  const dryset = allowDry ? DRY_ALIASES : [];
  const known = new Set([...dryset, ...boolFlags, ...valueFlags]);

  const flags = new Set();
  const values = {};
  const bad = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('-')) continue;            // positional
    if (valueFlags.includes(argv[i - 1])) continue;  // this is a VALUE, not a flag

    // `--flag=value` form
    const eq = token.indexOf('=');
    const bare = eq > 0 ? token.slice(0, eq) : token;

    if (!known.has(bare)) { bad.push(token); continue; }
    if (valueFlags.includes(bare)) {
      values[bare] = eq > 0 ? token.slice(eq + 1) : argv[i + 1] ?? null;
    } else {
      // A declared boolean/dry alias has no value grammar. Callers must never
      // approve a spelling that their includes('--flag') readers ignore.
      if (eq > 0) { bad.push(token); continue; }
      flags.add(bare);
    }
  }

  const dry = dryset.some((a) => flags.has(a));
  return { flags, values, dry, bad, name };
}

/**
 * S369 review r2 — value flags that were given without a usable value.
 *
 * parseArgvStrict takes the NEXT token as the value whatever it is, so `--out --json`
 * yields `--out = "--json"` and a trailing `--out` yields null; both then fall through to
 * the script's default path (`--emit --emit-out` wrote the live artifact; `--emit --emit-out
 * --json` wrote a file named `--json`). A value that is missing, empty, or itself looks
 * like a flag is not a value.
 */
export function missingFlagValues(parsed, valueFlags = []) {
  return valueFlags.filter((flag) => {
    if (!Object.hasOwn(parsed.values, flag)) return false;
    const value = parsed.values[flag];
    return value === null || value === undefined || value === '' || String(value).startsWith('-');
  });
}

/** Tokens that are neither a flag nor the value of a value flag. */
export function strayPositionals(argv = process.argv.slice(2), valueFlags = []) {
  return argv.filter((token, i) => !token.startsWith('-') && !valueFlags.includes(argv[i - 1]));
}

/**
 * The whole point: print why, then exit 2. Exit 2 (not 1) so callers can tell
 * "you gave me nonsense" apart from "the work failed".
 */
export function reportAndExit(parsed, { usage = '' } = {}) {
  if (!parsed.bad.length) return false;
  console.error(`⛔ ${parsed.name}: unknown flag(s) ${parsed.bad.join(', ')} — refusing to run.`);
  console.error('   This script acts outside this repo by default. Unrecognised input fails closed rather than proceeding.');
  if (usage) console.error(`   Usage: ${usage}`);
  process.exit(2);
}

export default { parseArgvStrict, reportAndExit, DRY_ALIASES };
