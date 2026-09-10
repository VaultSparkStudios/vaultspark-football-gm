import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Never `node:child_process` directly — `scripts/check-windows-hide.mjs` enforces
// that every spawn in this repo goes through the wrapper that forces
// `windowsHide: true`, because a burst of un-hidden children floods the screen
// with console windows on Windows. A test file is not an exception.
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { checkAudit, expectedBoolean, hasOutcome, observePremise, runCheck } from "../scripts/check-audit-premises.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * The defect this file exists for.
 *
 * `scripts/lib/brief-preflight.mjs` spawned `scripts/check-audit-premises.mjs`
 * inside a `try { … } catch { }`, and the script was not in the repository. A
 * missing script and a clean run produced the same observation — no cache, no
 * SIGNALS row, no error — so every typed premise in `docs/AUDIT_*.json` went
 * unchecked for the project's whole history without anything saying so.
 *
 * Asserting the file exists is not enough: it would pass against an empty file.
 * The contract is that the checker actually produces the fields the preflight
 * destructures.
 *
 * Note what this does *not* claim. `brief-preflight.mjs` cannot be imported in
 * this repo — it statically imports a file the project authority contract
 * forbids — so the spawn has never executed here and this test does not pretend
 * otherwise. The checker is asserted on its own terms, because it is useful on
 * its own terms: it runs from the CLI and from this shard, and it is the only
 * thing that has ever verified the audit history's typed premises.
 */
test("the premise checker the brief preflight spawns exists and emits the fields it reads", () => {
  const preflight = fs.readFileSync(path.join(ROOT, "scripts", "lib", "brief-preflight.mjs"), "utf8");
  const spawned = preflight.match(/'(check-audit-premises\.mjs)'/);
  assert.ok(spawned, "brief-preflight must still spawn the premise checker by name");
  assert.ok(fs.existsSync(path.join(ROOT, "scripts", spawned[1])), `${spawned[1]} must exist to be spawned`);

  const report = runCheck({ root: ROOT });
  // Exactly the fields brief-preflight destructures off the parsed stdout.
  for (const field of ["verified", "contradicted", "resolvedContradicted", "openContradicted", "unverified"]) {
    assert.equal(typeof report[field], "number", `${field} must be a number: ${JSON.stringify(report)}`);
  }
  assert.ok(report.audit?.startsWith("docs/AUDIT_"), report.audit);
});

/**
 * The general form of this session's finding, and the invariant that turned out
 * to be the real one.
 *
 * Two propagated scripts were referenced and absent, and each hid differently.
 * `check-audit-premises.mjs` was **spawned** inside a silent catch, so its
 * absence produced no cache, no signal and no error — that one was simply
 * missing, and this session wrote it.
 *
 * `check-last-session-summary.mjs` is a different animal, and writing it was
 * **wrong**. `scripts/lib/brief-preflight.mjs` imports it *statically*, so its
 * absence makes that whole module un-importable — but the file is named in
 * `context/PROJECT_AUTHORITY_CONTRACT.json` under `forbiddenFiles`, whose
 * declared purpose is to *"fail closed when generic Studio propagation erases
 * project-specific authority contracts"*. It is a generic studio mutator of
 * `PROJECT_STATUS.json`, and this project declares exactly three permitted
 * `statusMutators`, none of them it. So the honest state is not "a dependency
 * is missing" — it is **"a propagated module depends on a file this project
 * forbids, and is therefore inert here by design."**
 *
 * That makes the naive rule ("every static relative import must resolve") the
 * wrong gate: satisfying it would require creating a forbidden file. The rule
 * that is actually true, and that this asserts:
 *
 *   - every static relative import under `scripts/` resolves, **unless** its
 *     target is contractually forbidden; and
 *   - a module that imports a forbidden target must have **no importer**, so
 *     the forbidden dependency can never be exercised.
 *
 * The second clause is the load-bearing one: it means wiring `brief-preflight`
 * into anything trips this test instead of failing at runtime.
 *
 * Only line-anchored `import … from "…"` statements with a relative specifier
 * are read, and comments are stripped first — usage examples in docstrings name
 * modules relative to the *caller*, not to the file they are written in, and
 * before stripping they produced 37 hits against 1 real one. Dynamic and
 * computed specifiers are deliberately out of scope rather than approximated.
 */
function scriptModules() {
  const found = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".mjs")) found.push(full);
    }
  })(path.join(ROOT, "scripts"));
  return found;
}

function staticRelativeImports(file) {
  const source = fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  const statements = /^\s*import\s[^;\n]*?\sfrom\s*["'](\.[^"']+)["']/gm;
  const specifiers = [];
  let match;
  while ((match = statements.exec(source))) specifiers.push(match[1]);
  return specifiers;
}

test("every static relative import under scripts/ resolves, unless its target is contractually forbidden", () => {
  const contract = JSON.parse(
    fs.readFileSync(path.join(ROOT, "context", "PROJECT_AUTHORITY_CONTRACT.json"), "utf8")
  );
  const forbidden = new Set(
    (contract.forbiddenFiles || []).map((relative) => path.resolve(ROOT, relative))
  );
  assert.ok(forbidden.size > 0, "the authority contract must still declare forbidden generic authorities");

  const modules = scriptModules();
  assert.ok(modules.length > 100, `expected the studio script surface, found ${modules.length}`);

  const unresolved = [];
  const dependsOnForbidden = new Set();
  for (const file of modules) {
    for (const specifier of staticRelativeImports(file)) {
      const target = path.resolve(path.dirname(file), specifier);
      if (fs.existsSync(target)) continue;
      const relative = path.relative(ROOT, file).split(path.sep).join("/");
      if (forbidden.has(target)) dependsOnForbidden.add(relative);
      else unresolved.push(`${relative} -> ${specifier}`);
    }
  }
  assert.deepEqual(unresolved, [], `unresolvable static imports:\n${unresolved.join("\n")}`);

  // A module that depends on a forbidden file must be unreachable. If anything
  // imports it, the forbidden dependency becomes live and the contract is
  // defeated at runtime instead of here.
  for (const relative of dependsOnForbidden) {
    const basename = path.basename(relative);
    const importers = modules
      .filter((file) => path.relative(ROOT, file).split(path.sep).join("/") !== relative)
      .filter((file) => staticRelativeImports(file).some((specifier) => specifier.endsWith(basename)));
    assert.deepEqual(
      importers.map((file) => path.relative(ROOT, file).split(path.sep).join("/")),
      [],
      `${relative} imports a contractually forbidden file, so nothing may import it — ` +
        `wiring it up would require creating that file`
    );
  }
});

/**
 * The module this session actually wrote, asserted by contract rather than by
 * existence — an empty file would satisfy existence.
 *
 * `check-last-session-summary.mjs` is deliberately NOT here: it is forbidden,
 * and `test/project-authority-contract.test.js` already fails if it reappears.
 */
test("the premise checker carries the contract its caller destructures", async () => {
  const checker = await import("../scripts/check-audit-premises.mjs");
  for (const name of ["runCheck", "checkAudit", "observePremise", "expectedBoolean", "hasOutcome"]) {
    assert.equal(typeof checker[name], "function", `${name} must be exported`);
  }
});

/**
 * Every sidecar this project has ever written must be checkable.
 *
 * An `unverified` premise is not a neutral outcome — it means the checker could
 * not read the claim at all (renamed target, unsupported operator, invalid
 * pattern), and a checker that quietly cannot read its inputs is the same
 * silent-pass this session removed. The S100 sidecar shipped the project's only
 * `file-content`/`contains` premise, which an `eq`-only reader would have
 * declared unreadable rather than checked.
 */
test("every committed audit sidecar's premises are readable", () => {
  const sidecars = fs
    .readdirSync(path.join(ROOT, "docs"))
    .filter((name) => /^AUDIT_\d{4}-\d{2}-\d{2}(_SESSION\d+)?\.json$/i.test(name));
  assert.ok(sidecars.length >= 8, `expected the project's audit history, found ${sidecars.length}`);

  for (const name of sidecars) {
    const audit = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", name), "utf8"));
    const report = checkAudit(audit, ROOT);
    assert.equal(
      report.unverified,
      0,
      `${name} has premises the checker cannot read: ${JSON.stringify(report.premises.filter((row) => row.verdict === "unverified"), null, 2)}`
    );
    assert.equal(
      report.openContradicted,
      0,
      `${name} carries decayed premises on items nobody acted on: ${JSON.stringify(report.premises.filter((row) => row.verdict === "contradicted" && !row.hasOutcome), null, 2)}`
    );
  }
});

/**
 * Negative control — the gate has to go red on the real defect, in the shape
 * the defect would actually appear.
 *
 * A green across a healthy history proves nothing about whether this can *ever*
 * report decay. The shape that matters is the asymmetry the whole design turns
 * on: an identical contradicted premise is CONFIRMATION under a shipped item
 * and DECAY under one nobody has touched. Both halves are asserted, because a
 * checker that called everything decay would also be useless.
 */
test("a contradicted premise is decay only on an item nobody acted on", () => {
  // The premise asserts a problem state that is no longer true: this very file
  // exists, so "it does not exist" is contradicted.
  const premise = {
    claim: "the premise checker is missing",
    adapter: "file-exists",
    target: "scripts/check-audit-premises.mjs",
    operator: "eq",
    expected: false
  };

  const open = checkAudit({ items: [{ slug: "still-open", status: "open", premises: [premise] }] }, ROOT);
  assert.equal(open.contradicted, 1);
  assert.equal(open.openContradicted, 1, "an untouched item with a false premise is exactly what decay means");
  assert.equal(open.resolvedContradicted, 0);

  const shipped = checkAudit({ items: [{ slug: "already-shipped", status: "shipped", premises: [premise] }] }, ROOT);
  assert.equal(shipped.contradicted, 1);
  assert.equal(shipped.openContradicted, 0, "a shipped item's premise flipping is the fix being confirmed, not decay");
  assert.equal(shipped.resolvedContradicted, 1);
});

/**
 * A premise whose target has been renamed is neither verified nor contradicted.
 *
 * Collapsing it into either would let a deleted file read as "the defect is
 * fixed" — false confidence in the direction this project keeps paying for.
 */
test("an unobservable premise is unverified, never quietly verified", () => {
  const cases = [
    { adapter: "grep", target: "src/this-file-was-renamed.js", pattern: "anything", operator: "eq", expected: true },
    { adapter: "grep", target: "src/config.js", pattern: "([unclosed", operator: "eq", expected: true },
    { adapter: "telepathy", target: "src/config.js", pattern: "x", operator: "eq", expected: true },
    { adapter: "grep", target: "src/config.js", pattern: "ROSTER_TEMPLATE", operator: "sorcery", expected: true }
  ];
  for (const premise of cases) {
    const report = checkAudit({ items: [{ slug: "s", status: "open", premises: [premise] }] }, ROOT);
    assert.equal(report.unverified, 1, JSON.stringify({ premise, report }));
    assert.equal(report.verified, 0);
    assert.equal(report.contradicted, 0);
  }

  // And a premise may not read outside the repository, since this runs
  // unattended from a brief render against a checked-in document.
  assert.equal(observePremise({ adapter: "file-exists", target: "../../../etc/hosts" }, ROOT).observed, null);
  assert.equal(observePremise({ adapter: "grep", target: "../../../etc/hosts", pattern: "x" }, ROOT).observed, null);
});

test("the shared completion vocabulary decides an outcome, plus a named delta for decisions that are not completions", () => {
  for (const status of ["shipped", "implemented", "done", "complete", "completed"]) {
    assert.equal(hasOutcome(status), true, status);
  }
  // Not completions, but somebody decided — a premise flipping under these is
  // not a stale plan either.
  for (const status of ["deferred", "rejected", "skipped"]) assert.equal(hasOutcome(status), true, status);
  // The hyphenated statuses this project has actually written.
  for (const status of ["shipped-corrected", "shipped-reduced", "shipped-with-correction", "skipped-premise-corrected"]) {
    assert.equal(hasOutcome(status), true, status);
  }
  for (const status of ["open", "ranked", "", null, undefined, "in-progress"]) {
    assert.equal(hasOutcome(status), false, String(status));
  }
});

test("expected is read as a boolean, including the one sidecar that wrote its pattern there", () => {
  assert.equal(expectedBoolean({ expected: true }), true);
  assert.equal(expectedBoolean({ expected: false }), false);
  assert.equal(expectedBoolean({ expected: "true" }), true);
  // S100's `file-content`/`contains` shape: the pattern repeated into expected.
  assert.equal(expectedBoolean({ expected: 'const x = 1', pattern: 'const x = 1' }), true);
  assert.equal(expectedBoolean({ expected: "something else", pattern: "const x = 1" }), null);
});

test("--strict is the only mode that fails, and only on open decay", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "premise-decay-"));
  try {
    const decayed = {
      schemaVersion: "1.1",
      date: "2026-09-10",
      session: 999,
      project: "fixture",
      items: [
        {
          rank: 1,
          tier: "HIGH",
          category: "fixture",
          effortHours: 1,
          impact: 1,
          innovation: 1,
          priority: 1,
          slug: "fixture-decay",
          title: "fixture",
          status: "open",
          premise: "the checker does not exist",
          premises: [
            { claim: "missing", adapter: "file-exists", target: "scripts/check-audit-premises.mjs", operator: "eq", expected: false }
          ],
          ladder: { L2: { effortHours: 1, recipe: "fixture" } }
        }
      ]
    };
    const file = path.join(dir, "AUDIT_2026-09-10_SESSION999.json");
    fs.writeFileSync(file, JSON.stringify(decayed));

    const script = path.join(ROOT, "scripts", "check-audit-premises.mjs");
    const advisory = spawnSync(process.execPath, [script, "--input", file, "--json"], { encoding: "utf8", windowsHide: true });
    assert.equal(advisory.status, 0, "the default mode must never block a brief render");
    assert.equal(JSON.parse(advisory.stdout).openContradicted, 1);

    const strict = spawnSync(process.execPath, [script, "--input", file, "--strict"], { encoding: "utf8", windowsHide: true });
    assert.equal(strict.status, 1, `--strict must fail on open decay: ${strict.stdout}${strict.stderr}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
