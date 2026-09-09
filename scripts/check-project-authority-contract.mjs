import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Behavioral probes for `contract.behavioralAssertions`.
 *
 * Each probe exercises the real module and returns the assertion ids it
 * genuinely satisfied. A probe must fail if the behaviour is removed, which a
 * source-text match cannot promise.
 */
const BEHAVIORAL_PROBES = {
  "scripts/check-brief-staleness.mjs": async () => {
    const { evaluateBriefFreshness } = await import("./check-brief-staleness.mjs");
    const satisfied = [];
    const briefText = [
      "<!-- generated-at: 2026-01-01 (Session 5 closeout) -->",
      "<!-- brief-coherent: true -->",
      "<!-- lifecycle-authority-fingerprint: aaaa -->",
      "<!-- genius-authority-fingerprint: bbbb -->",
      "║  Session 6 · brief"
    ].join("\n");
    const base = { briefText, status: { currentSession: 5 }, now: new Date("2026-01-01T12:00:00Z") };

    const lifecycleDrift = evaluateBriefFreshness({ ...base, lifecycleFingerprint: "zzzz", geniusFingerprint: "bbbb" });
    if (lifecycleDrift.reasons.some((reason) => /lifecycle authority/i.test(reason))) {
      satisfied.push("lifecycle-fingerprint-drift-detected");
    }

    const geniusDrift = evaluateBriefFreshness({ ...base, lifecycleFingerprint: "aaaa", geniusFingerprint: "zzzz" });
    if (geniusDrift.reasons.some((reason) => /genius authority/i.test(reason))) {
      satisfied.push("genius-fingerprint-drift-detected");
    }

    return satisfied;
  }
};

export async function checkProjectAuthorityContract(root = process.cwd()) {
  const contractPath = path.join(root, "context", "PROJECT_AUTHORITY_CONTRACT.json");
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const errors = [];

  for (const [relativePath, exports] of Object.entries(contract.requiredExports || {})) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`${relativePath}: missing`);
      continue;
    }
    try {
      const moduleUrl = `${pathToFileURL(absolutePath).href}?authority-check=${Date.now()}`;
      const loaded = await import(moduleUrl);
      for (const name of exports) {
        if (typeof loaded[name] !== "function") errors.push(`${relativePath}: missing export ${name}`);
      }
    } catch (error) {
      errors.push(`${relativePath}: import failed (${error.message})`);
    }
  }

  for (const relativePath of contract.statusMutators || []) {
    const absolutePath = path.join(root, relativePath);
    const source = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
    if (!source) {
      errors.push(`${relativePath}: missing`);
      continue;
    }
    if (!/updateProjectStatus/.test(source)) errors.push(`${relativePath}: bypasses updateProjectStatus`);
    if (/writeFileSync\((?:STATUS|statusPath),/.test(source)) errors.push(`${relativePath}: writes PROJECT_STATUS directly`);
  }

  for (const [relativePath, tokens] of Object.entries(contract.requiredSourceTokens || {})) {
    const absolutePath = path.join(root, relativePath);
    const source = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
    for (const token of tokens) {
      if (!source.includes(token)) errors.push(`${relativePath}: missing authority token ${token}`);
    }
  }

  // S101 — `requiredSourceTokens` for check-brief-staleness listed the two
  // English message strings its reasons are pushed with, checked by a bare
  // `source.includes(token)`. Deleting the detection entirely and leaving
  // `// lifecycle authority changed` in a comment satisfied it. A contract that
  // enforces prose does not enforce behaviour: these probes call the module and
  // require it to actually report the drift.
  for (const [relativePath, assertions] of Object.entries(contract.behavioralAssertions || {})) {
    const probe = BEHAVIORAL_PROBES[relativePath];
    if (!probe) {
      errors.push(`${relativePath}: contract declares behavioral assertions with no registered probe`);
      continue;
    }
    let observed = [];
    try {
      observed = await probe(root);
    } catch (error) {
      errors.push(`${relativePath}: behavioral probe threw: ${error?.message || error}`);
      continue;
    }
    for (const assertion of assertions) {
      if (!observed.includes(assertion)) errors.push(`${relativePath}: behavioral assertion not satisfied: ${assertion}`);
    }
  }

  for (const relativePath of contract.forbiddenFiles || []) {
    if (fs.existsSync(path.join(root, relativePath))) errors.push(`${relativePath}: forbidden generic authority present`);
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (packageJson.scripts?.test !== contract.canonicalTestCommand) {
    errors.push(`package.json: canonical test command drift (${packageJson.scripts?.test || "missing"})`);
  }

  return {
    schemaVersion: contract.schemaVersion,
    project: contract.project,
    ok: errors.length === 0,
    errors
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)))) {
  const result = await checkProjectAuthorityContract();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
